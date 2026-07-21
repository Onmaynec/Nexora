"use strict";

const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const test = require("node:test");
const { PulseSyncWorker } = require("../server/pulse-sync-worker.cjs");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE pulse_sync_state(local_user_id TEXT PRIMARY KEY,cursor TEXT,last_success_at TEXT,last_attempt_at TEXT,last_error_code TEXT,overview_json TEXT,overview_hash TEXT,updated_at TEXT NOT NULL);
    CREATE TABLE cloud_account_links(local_user_id TEXT PRIMARY KEY,cloud_account_id TEXT NOT NULL,link_status TEXT NOT NULL);
    CREATE TABLE pulse_event_inbox(event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,received_at TEXT NOT NULL,processed_at TEXT,status TEXT NOT NULL,attempt_count INTEGER NOT NULL DEFAULT 0,payload_hash TEXT NOT NULL,last_error_code TEXT);
    CREATE TABLE billing_entitlement_cache(jti TEXT PRIMARY KEY,status TEXT NOT NULL,revoked_at TEXT,verified_at TEXT NOT NULL);
    CREATE TABLE room_product_state(room_id TEXT,product_code TEXT,entitlement_jti TEXT,status TEXT,updated_at TEXT,PRIMARY KEY(room_id,product_code));
  `);
  db.prepare("INSERT INTO cloud_account_links(local_user_id,cloud_account_id,link_status) VALUES ('user-sync','account-sync','linked')").run();
  const emitted = [];
  const io = { to(room) { return { emit(type, payload) { emitted.push({ room, type, payload }); } }; } };
  const repository = { db };
  const store = { read() { return { conversations: [{ id: "conversation-sync", roomId: "room-sync" }] }; } };
  let calls = 0;
  const client = { mode: "production", async request() { calls += 1; return { payload: { cursor: "cursor-1", hasMore: false, events: [{ eventId: "event-sync-1", type: "billing.wallet_updated", aggregateType: "wallet", aggregateId: "account-sync", payload: { accountId: "account-sync", balance: 50 }, createdAt: "2026-07-21T00:00:00.000Z" }] } }; } };
  return { db, emitted, worker: new PulseSyncWorker({ client, repository, store, io, serverId: "server-sync" }), calls: () => calls };
}

test("event delta is idempotent and user scoped", async () => {
  const { db, emitted, worker, calls } = fixture();
  const first = await worker.runOnce();
  const second = await worker.runOnce();
  assert.equal(first.processed, 1);
  assert.equal(second.processed, 0);
  assert.equal(calls(), 2);
  assert.equal(db.prepare("SELECT status FROM pulse_event_inbox WHERE event_id='event-sync-1'").get().status, "processed");
  assert.ok(emitted.some((event) => event.room === "user:user-sync" && event.type === "billing.wallet_updated"));
  db.close();
});
