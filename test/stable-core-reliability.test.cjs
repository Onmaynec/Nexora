"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { MaintenanceService } = require("../server/maintenance.cjs");
const { upgradeStoreToSchema7 } = require("../server/pulse-schema7.cjs");
const { applySchema8Migration, readSchemaVersion } = require("../server/trust-schema8.cjs");
const { SqliteStore, initialState } = require("../server/store.cjs");

async function createFixture(prefix) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const uploadsDir = path.join(dataDir, "uploads");
  const store = new SqliteStore(path.join(dataDir, "nexora.sqlite"), {
    legacyJsonPath: path.join(dataDir, "nexora.json"),
  });
  await store.init();
  const createdAt = "2026-07-24T00:00:00.000Z";
  await store.mutate((state) => {
    Object.assign(state, initialState());
    state.users.push({
      id: "user-1",
      username: "stable-core",
      displayName: "Stable Core",
      status: "",
      avatarFileId: null,
      notificationSound: "subtle",
      passwordSalt: "salt",
      passwordHash: "hash",
      role: "server_admin",
      createdAt,
      disabledAt: null,
    });
  });
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, "state.txt"), "original", "utf8");
  const maintenance = new MaintenanceService({ store, dataDir, uploadsDir, appVersion: "3.4.0" });
  await fs.mkdir(maintenance.backupsDir, { recursive: true });
  return { dataDir, uploadsDir, store, maintenance };
}

async function cleanupFixture(fixture) {
  fixture.maintenance.stop();
  await fixture.store.close().catch(() => {});
  await fs.rm(fixture.dataDir, { recursive: true, force: true });
}

test("verifyBackup performs integrity checks without mutating the live database or file store", async (context) => {
  const fixture = await createFixture("nexora-backup-verify-");
  context.after(() => cleanupFixture(fixture));

  const backup = await fixture.maintenance.createBackup({ automatic: false, reason: "verification" });
  await fixture.store.mutate((state) => { state.users[0].displayName = "Live state"; });
  await fs.writeFile(path.join(fixture.uploadsDir, "state.txt"), "live", "utf8");

  const result = await fixture.maintenance.verifyBackup(backup.directory);
  assert.equal(result.backupId, path.basename(backup.directory));
  assert.equal(result.databaseIntegrity, "ok");
  assert.equal(result.uploadsPresent, true);
  assert.equal(result.schemaVersion, 6);
  assert.equal(fixture.store.read((state) => state.users[0].displayName), "Live state");
  assert.equal(await fs.readFile(path.join(fixture.uploadsDir, "state.txt"), "utf8"), "live");
});

test("encrypted backup verification removes materialized temporary data on success and failure", async (context) => {
  const fixture = await createFixture("nexora-backup-encrypted-verify-");
  context.after(() => cleanupFixture(fixture));

  const backup = await fixture.maintenance.createBackup({
    automatic: false,
    reason: "encrypted-verification",
    passphrase: "StrongBackupPassword123!",
  });
  const before = (await fs.readdir(fixture.dataDir)).filter((name) => name.startsWith(".backup-decrypt-"));
  assert.deepEqual(before, []);

  const verified = await fixture.maintenance.verifyBackup(backup.directory, { passphrase: "StrongBackupPassword123!" });
  assert.equal(verified.encrypted, true);
  assert.deepEqual((await fs.readdir(fixture.dataDir)).filter((name) => name.startsWith(".backup-decrypt-")), []);

  await assert.rejects(
    fixture.maintenance.verifyBackup(backup.directory, { passphrase: "WrongBackupPassword123!" }),
    /расшифровать/i,
  );
  assert.deepEqual((await fs.readdir(fixture.dataDir)).filter((name) => name.startsWith(".backup-decrypt-")), []);
});

test("restore failure never leaves a mixed database and uploads state", async (context) => {
  const fixture = await createFixture("nexora-restore-rollback-");
  context.after(() => cleanupFixture(fixture));

  const backup = await fixture.maintenance.createBackup({ automatic: false, reason: "rollback-source" });
  await fixture.store.mutate((state) => { state.users[0].displayName = "Current database"; });
  await fs.writeFile(path.join(fixture.uploadsDir, "state.txt"), "current uploads", "utf8");

  const originalReplaceDatabase = fixture.store.replaceDatabase.bind(fixture.store);
  fixture.store.replaceDatabase = async () => {
    throw Object.assign(new Error("Injected restore database failure"), { code: "RESTORE_FAILPOINT" });
  };
  await assert.rejects(fixture.maintenance.restoreBackup(backup.directory), /Injected restore database failure/);
  fixture.store.replaceDatabase = originalReplaceDatabase;

  assert.equal(fixture.store.read((state) => state.users[0].displayName), "Current database");
  assert.equal(await fs.readFile(path.join(fixture.uploadsDir, "state.txt"), "utf8"), "current uploads");
  assert.equal(fixture.store.integrityCheck().ok, true);
  assert.deepEqual((await fs.readdir(fixture.dataDir)).filter((name) => name.startsWith(".uploads-restore-")), []);
});

test("schema 8 migration blocks future schemas before mutation", async (context) => {
  const fixture = await createFixture("nexora-future-schema-");
  context.after(() => cleanupFixture(fixture));
  await upgradeStoreToSchema7(fixture.store, { databaseFile: fixture.store.filePath });
  fixture.store.db.prepare("UPDATE meta SET value=? WHERE key='schema_version'").run("999");

  await assert.rejects(
    applySchema8Migration({ store: fixture.store, databaseFile: fixture.store.filePath }),
    (error) => error?.code === "DATABASE_SCHEMA_NEWER" && error?.details?.current === 999,
  );
  assert.equal(readSchemaVersion(fixture.store.db), 999);
});

test("schema 8 migration fails before transaction when free space is insufficient", async (context) => {
  const fixture = await createFixture("nexora-disk-full-migration-");
  context.after(() => cleanupFixture(fixture));
  await upgradeStoreToSchema7(fixture.store, { databaseFile: fixture.store.filePath });

  const originalStatfs = fs.statfs;
  fs.statfs = async () => ({ bavail: 1, bfree: 1, bsize: 1 });
  try {
    await assert.rejects(
      applySchema8Migration({ store: fixture.store, databaseFile: fixture.store.filePath }),
      (error) => error?.code === "MIGRATION_DISK_SPACE_LOW" && error?.details?.required > error?.details?.available,
    );
  } finally {
    fs.statfs = originalStatfs;
  }
  assert.equal(readSchemaVersion(fixture.store.db), 7);
  assert.equal(fixture.store.integrityCheck().ok, true);
});
