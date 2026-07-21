"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { BillingDatabase } = require("../cloud/billing-core.cjs");
const { createResponseSigner } = require("../cloud/entitlements.cjs");
const { IdentityService } = require("../cloud/identity-service.cjs");
const { BillingWorkers } = require("../cloud/workers.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-workers-"));
  const keys = crypto.generateKeyPairSync("ed25519");
  const signer = createResponseSigner({ keyId: "worker-key", privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }) });
  const database = new BillingDatabase(path.join(directory, "cloud.sqlite"), { entitlementSigner: signer });
  const identity = new IdentityService(database, { encryptionKey: crypto.randomBytes(32).toString("base64url"), responseSigner: signer, exposeVerificationTokens: true });
  t.after(() => { database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { database, identity };
}

test("email outbox delivery is claimed once and marked sent", async (t) => {
  const { database, identity } = fixture(t);
  identity.register({ email: "worker@example.com", displayName: "Worker", password: "Strong-Cloud-Pass-123!" });
  const deliveries = [];
  const workers = new BillingWorkers({ database, emailSender: { async deliver(message) { deliveries.push(message); } } });
  const first = await workers.processEmailOutbox();
  const second = await workers.processEmailOutbox();
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(deliveries.length, 1);
  assert.equal(workers.status().pendingEmail, 0);
});

test("failed email delivery is retried later without losing the challenge", async (t) => {
  const { database, identity } = fixture(t);
  identity.register({ email: "retry@example.com", displayName: "Retry", password: "Strong-Cloud-Pass-123!" });
  const workers = new BillingWorkers({ database, emailSender: { async deliver() { throw Object.assign(new Error("provider down"), { code: "EMAIL_DOWN" }); } } });
  const result = await workers.processEmailOutbox();
  assert.equal(result.failed, 1);
  const row = database.db.prepare("SELECT * FROM identity_email_outbox").get();
  assert.equal(row.status, "failed");
  assert.equal(row.last_error_code, "EMAIL_DOWN");
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM identity_email_challenges").get().count, 1);
});

test("event outbox publishes each event idempotently", async (t) => {
  const { database } = fixture(t);
  database.enqueueEvent("billing.test", "test", "aggregate-1", { value: 1 });
  const published = [];
  const workers = new BillingWorkers({ database, eventPublisher: { async publish(event) { published.push(event); } } });
  assert.equal((await workers.processEventOutbox()).published, 1);
  assert.equal((await workers.processEventOutbox()).published, 0);
  assert.equal(published.length, 1);
});

test("worker lease prevents concurrent processing", async (t) => {
  const { database } = fixture(t);
  const first = new BillingWorkers({ database, ownerId: "worker-one" });
  const second = new BillingWorkers({ database, ownerId: "worker-two" });
  assert.equal(first.acquireLease("billing-workers"), true);
  assert.equal(second.acquireLease("billing-workers"), false);
  first.releaseLease("billing-workers");
  assert.equal(second.acquireLease("billing-workers"), true);
});
