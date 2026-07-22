"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { TrustCore, CHALLENGE_TTL_MS } = require("../server/trust-core.cjs");
const { applySchema8Migration } = require("../server/trust-schema8.cjs");

function createStore(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta(key,value) VALUES('schema_version','7');
    INSERT INTO meta(key,value) VALUES('state_meta','{"schemaVersion":7,"serverId":"server-clock"}');
  `);
  return {
    db,
    filePath,
    state: { meta: { schemaVersion: 7, serverId: "server-clock" } },
    queue: Promise.resolve(),
    read(selector = (value) => value) { return selector(this.state); },
    async flush() { await this.queue; this.db.exec("PRAGMA wal_checkpoint(PASSIVE)"); },
    persistState(next = this.state) { this.state = structuredClone(next); },
    stats() { return { schemaVersion: this.state.meta.schemaVersion }; },
  };
}

test("Trust Core accepts a functional clock and derives TTLs from its returned Date", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-trust-clock-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createStore(filePath);
  await applySchema8Migration({ store, databaseFile: filePath });
  const fixed = new Date("2026-07-21T12:01:00.000Z");
  const core = new TrustCore({ store, clock: () => new Date(fixed) });

  t.after(async () => {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  assert.doesNotThrow(() => core.cleanup());
  const challenge = core.createChallenge({
    userId: "clock-user",
    purpose: "register_device",
    context: { deviceId: "00000000-0000-4000-8000-000000000001", fingerprint: "clock" },
  });
  assert.equal(challenge.createdAt, fixed.toISOString());
  assert.equal(challenge.expiresAt, new Date(fixed.getTime() + CHALLENGE_TTL_MS).toISOString());
});
