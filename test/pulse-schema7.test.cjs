"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  PULSE_SCHEMA_VERSION,
  applySchema7Migration,
  readSchemaVersion,
  upgradeStoreToSchema7,
} = require("../server/pulse-schema7.cjs");

function createLegacyStore(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta(key,value) VALUES('schema_version','6');
  `);
  const state = {
    meta: { schemaVersion: 6, serverId: "server-1" },
    billingLinks: [{ id: "link-1", userId: "user-1", cloudAccountId: "account-1", status: "linked", syncedAt: "2026-07-21T00:00:00.000Z" }],
    billingEntitlements: [{ id: "ent-1", scopeType: "room", scopeId: "room-1", productCode: "room_reaction_pack", status: "active", startsAt: "2026-07-21T00:00:00.000Z", expiresAt: "2026-08-21T00:00:00.000Z", source: "sandbox" }],
    pulseLedger: [{ id: "tx-1", userId: "user-1", type: "plus_monthly_grant", amount: 400, balanceAfter: 400, createdAt: "2026-07-21T00:00:00.000Z" }],
  };
  const store = {
    db,
    filePath,
    state,
    queue: Promise.resolve(),
    read(selector = (value) => value) { return selector(this.state); },
    async flush() { await this.queue; this.db.exec("PRAGMA wal_checkpoint(PASSIVE)"); },
    persistState(nextState = this.state) {
      this.state = structuredClone(nextState);
      this.state.meta.schemaVersion = 6;
      this.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version','6') ON CONFLICT(key) DO UPDATE SET value='6'").run();
    },
    stats() { return { schemaVersion: 6 }; },
    async replaceDatabase() {},
  };
  return store;
}

test("schema 6 migrates to schema 7 with legacy Pulse data", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-schema7-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createLegacyStore(filePath);
  try {
    const result = await applySchema7Migration({ store, databaseFile: filePath });
    assert.equal(result.from, 6);
    assert.equal(result.to, 7);
    assert.ok(result.backupPath);
    assert.equal(readSchemaVersion(store.db), 7);
    assert.equal(store.db.prepare("SELECT cloud_account_id FROM cloud_account_links WHERE local_user_id='user-1'").get().cloud_account_id, "account-1");
    assert.equal(store.db.prepare("SELECT product_code FROM billing_entitlement_cache WHERE jti='ent-1'").get().product_code, "room_reaction_pack");
    assert.equal(store.db.prepare("SELECT amount FROM billing_transaction_cache WHERE transaction_id='tx-1'").get().amount, 400);
  } finally {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("schema 7 migration is idempotent and persistState cannot downgrade it", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-schema7-idempotent-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createLegacyStore(filePath);
  try {
    await upgradeStoreToSchema7(store, { databaseFile: filePath });
    await applySchema7Migration({ store, databaseFile: filePath });
    assert.equal(readSchemaVersion(store.db), PULSE_SCHEMA_VERSION);
    store.persistState(store.state);
    assert.equal(readSchemaVersion(store.db), PULSE_SCHEMA_VERSION);
    assert.equal(store.state.meta.schemaVersion, PULSE_SCHEMA_VERSION);
    assert.equal(store.stats().schemaVersion, PULSE_SCHEMA_VERSION);
  } finally {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
