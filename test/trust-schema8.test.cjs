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
  `);
  const state = { meta: { schemaVersion: 7, serverId: "server-trust-test" } };
  return {
    db,
    filePath,
    state,
    queue: Promise.resolve(),
    read(selector = (value) => value) { return selector(this.state); },
    async flush() { await this.queue; this.db.exec("PRAGMA wal_checkpoint(PASSIVE)"); },
    persistState(nextState = this.state) {
      this.state = structuredClone(nextState);
      this.state.meta.schemaVersion = 7;
      this.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version','7') ON CONFLICT(key) DO UPDATE SET value='7'").run();
    },
    stats() { return { schemaVersion: 7 }; },
    async restore() {},
  };
}

test("schema 7 migrates to schema 8 with verified backup and trust tables", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-schema8-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createSchema7Store(filePath);
  try {
    const result = await applySchema8Migration({ store, databaseFile: filePath });
    assert.equal(result.from, 7);
    assert.equal(result.to, TRUST_SCHEMA_VERSION);
    assert.ok(result.backupPath);
    assert.equal(readSchemaVersion(store.db), TRUST_SCHEMA_VERSION);
    for (const table of [
      "trust_devices",
      "trust_key_packages",
      "trust_groups",
      "trust_group_members",
      "trust_welcomes",
      "trust_envelopes",
      "trust_transparency_entries",
    ]) {
      assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?").get(table).count, 1);
    }
  } finally {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("schema 8 is idempotent and persist/restore cannot downgrade it", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-schema8-idempotent-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createSchema7Store(filePath);
  try {
    await upgradeStoreToSchema8(store, { databaseFile: filePath });
    await applySchema8Migration({ store, databaseFile: filePath });
    store.persistState(store.state);
    assert.equal(readSchemaVersion(store.db), TRUST_SCHEMA_VERSION);
    assert.equal(store.state.meta.schemaVersion, TRUST_SCHEMA_VERSION);
    assert.equal(store.stats().schemaVersion, TRUST_SCHEMA_VERSION);
    await store.restore();
    assert.equal(readSchemaVersion(store.db), TRUST_SCHEMA_VERSION);
  } finally {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
