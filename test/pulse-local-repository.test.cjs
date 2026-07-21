"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createSchema7 } = require("../server/pulse-schema7.cjs");
const { PulseLocalRepository } = require("../server/pulse-local-repository.cjs");

async function fixture(clock = () => new Date("2026-07-21T12:00:00.000Z")) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-pulse-repo-"));
  const filePath = path.join(directory, "db.sqlite");
  const db = new DatabaseSync(filePath);
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  createSchema7(db);
  const store = { db };
  return {
    directory,
    db,
    repo: new PulseLocalRepository(store, { clock }),
    async close() { db.close(); await fs.rm(directory, { recursive: true, force: true }); },
  };
}

test("link session is one-time and replay protected", async () => {
  const fx = await fixture();
  try {
    const session = fx.repo.createLinkSession("user-1");
    const link = fx.repo.completeLinkSession({
      linkId: session.id,
      localUserId: "user-1",
      nonce: session.nonce,
      cloudAccountId: "cloud-1",
      cloudSubject: "subject-1",
    });
    assert.equal(link.status, "linked");
    assert.equal(fx.repo.requireLinked("user-1").cloudAccountId, "cloud-1");
    assert.throws(() => fx.repo.completeLinkSession({
      linkId: session.id,
      localUserId: "user-1",
      nonce: session.nonce,
      cloudAccountId: "cloud-1",
      cloudSubject: "subject-1",
    }), (error) => error.code === "LINK_ATTESTATION_REPLAYED");
  } finally {
    await fx.close();
  }
});

test("key registry rejects key-id substitution", async () => {
  const fx = await fixture();
  const crypto = require("node:crypto");
  try {
    const first = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
    const second = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
    fx.repo.trustPublicKey({ keyId: "key-1", publicKey: first });
    assert.equal(fx.repo.keyRegistry().get("key-1"), String(first).trim());
    assert.throws(() => fx.repo.trustPublicKey({ keyId: "key-1", publicKey: second }), (error) => error.code === "PULSE_KEY_CONFLICT");
  } finally {
    await fx.close();
  }
});

test("inbox event is idempotent but rejects payload conflict", async () => {
  const fx = await fixture();
  try {
    assert.equal(fx.repo.recordInboxEvent({ eventId: "event-1", eventType: "billing.wallet_updated", payload: { balance: 10 } }).duplicate, false);
    assert.equal(fx.repo.recordInboxEvent({ eventId: "event-1", eventType: "billing.wallet_updated", payload: { balance: 10 } }).duplicate, true);
    assert.throws(() => fx.repo.recordInboxEvent({ eventId: "event-1", eventType: "billing.wallet_updated", payload: { balance: 11 } }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
  } finally {
    await fx.close();
  }
});
