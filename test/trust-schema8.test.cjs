"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  TRUST_SCHEMA_VERSION,
  applySchema8Migration,
  readSchemaVersion,
  upgradeStoreToSchema8,
} = require("../server/trust-schema8.cjs");

function createSchema7Store(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta(key,value) VALUES('schema_version','7');
    INSERT INTO meta(key,value) VALUES('state_meta','{"schemaVersion":7,"serverId":"server-1"}');
  `);
  const store = {
    db,
    filePath,
    state: { meta: { schemaVersion: 7, serverId: "server-1" } },
    queue: Promise.resolve(),
    read(selector = (value) => value) { return selector(this.state); },
    async flush() { await this.queue; this.db.exec("PRAGMA wal_checkpoint(PASSIVE)"); },
    persistState(nextState = this.state) {
      this.state = structuredClone(nextState);
      this.state.meta.schemaVersion = 7;
      this.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version','7') ON CONFLICT(key) DO UPDATE SET value='7'").run();
    },
    stats() { return { schemaVersion: 7 }; },
    async replaceDatabase() {},
  };
  return store;
}

test("schema 7 migrates atomically to schema 8 with Trust Core tables", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-schema8-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createSchema7Store(filePath);
  try {
    const result = await applySchema8Migration({ store, databaseFile: filePath });
    assert.equal(result.from, 7);
    assert.equal(result.to, TRUST_SCHEMA_VERSION);
    assert.ok(result.backupPath);
    assert.equal(readSchemaVersion(store.db), 8);
    const tables = new Set(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
    for (const table of [
      "trust_devices", "trust_challenges", "trust_device_verifications", "mls_key_packages",
      "mls_groups", "mls_group_members", "mls_welcome_queue", "mls_commit_log", "mls_replay_cache", "trust_audit",
    ]) assert.ok(tables.has(table), `${table} must exist`);
  } finally {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("schema 8 migration is idempotent and cannot be downgraded by legacy persistence", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-schema8-idempotent-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createSchema7Store(filePath);
  try {
    await upgradeStoreToSchema8(store, { databaseFile: filePath });
    const second = await applySchema8Migration({ store, databaseFile: filePath });
    assert.equal(second.from, 8);
    assert.equal(second.backupPath, null);
    store.persistState(store.state);
    assert.equal(readSchemaVersion(store.db), 8);
    assert.equal(store.state.meta.schemaVersion, 8);
    assert.equal(store.stats().schemaVersion, 8);
  } finally {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
