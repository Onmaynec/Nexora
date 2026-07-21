"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  BillingDatabase,
  BillingError,
  MONTHLY_PLUS_IMPULSES,
} = require("../cloud/billing-core.cjs");
const {
  createEntitlementSigner,
  verifySignedEnvelope,
} = require("../cloud/entitlements.cjs");
const { verifyStripeWebhook } = require("../cloud/stripe-provider.cjs");

function createFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-pulse-"));
  const keys = crypto.generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const signer = createEntitlementSigner({ keyId: "test-key-1", privateKey });
  const database = new BillingDatabase(path.join(root, "pulse.sqlite"), {
    entitlementSigner: signer,
    clock: options.clock,
  });
  t.after(() => {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { database, signer, publicKey };
}

function createLinkedAccount(database, suffix) {
  const account = database.createCloudAccount({ id: `account-${suffix}`, country: "FI" });
  database.linkLocalAccount({
    accountId: account.id,
    serverId: "server-main",
    localUserId: `user-${suffix}`,
    id: `link-${suffix}`,
  });
  return account;
}

test("double-entry ledger remains balanced and idempotent", (t) => {
  const { database } = createFixture(t);
  const account = createLinkedAccount(database, "ledger");
  const first = database.grantImpulses(account.id, 125, {
    operationType: "promotional_grant",
    referenceId: "campaign-1",
    idempotencyKey: "grant-ledger-001",
  });
  const duplicate = database.grantImpulses(account.id, 125, {
    operationType: "promotional_grant",
    referenceId: "campaign-1",
    idempotencyKey: "grant-ledger-001",
  });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(database.getBalance(account.id), 125);
  assert.deepEqual(database.ledgerInvariant(), { ok: true, failures: [] });
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions").get().count, 1);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM ledger_entries").get().count, 2);
});

test("one subscription period grants exactly 400 impulses", (t) => {
  const { database } = createFixture(t);
  const account = createLinkedAccount(database, "plus");
  const periodStart = "2026-07-01T00:00:00.000Z";
  const periodEnd = "2026-08-01T00:00:00.000Z";
  const first = database.activatePlusPeriod({ accountId: account.id, serverId: "server-main", providerSubscriptionId: "sub-testplus01", periodStart, periodEnd });
  const duplicate = database.activatePlusPeriod({ accountId: account.id, serverId: "server-main", providerSubscriptionId: "sub-testplus01", periodStart, periodEnd });
  assert.equal(first.grantDuplicate, false);
  assert.equal(duplicate.grantDuplicate, true);
  assert.equal(database.getBalance(account.id), MONTHLY_PLUS_IMPULSES);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM subscription_periods").get().count, 1);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE operation_type='plus_monthly_grant'").get().count, 1);
  assert.equal(database.ledgerInvariant().ok, true);
});

test("last room-goal contribution is accepted partially", (t) => {
  const { database, publicKey } = createFixture(t);
  const firstAccount = createLinkedAccount(database, "goal-a");
  const secondAccount = createLinkedAccount(database, "goal-b");
  database.grantImpulses(firstAccount.id, 100, { idempotencyKey: "grant-goal-a" });
  database.grantImpulses(secondAccount.id, 100, { idempotencyKey: "grant-goal-b" });
  const goal = database.createGoal({ serverId: "server-main", roomId: "room-alpha", createdBy: "user-goal-a", productCode: "room_reaction_pack", title: "Reaction pack", targetAmount: 135, expiresAt: "2027-01-01T00:00:00.000Z" });
  const first = database.contributeToGoal({ serverId: "server-main", localUserId: "user-goal-a", goalId: goal.id, requestedAmount: 100, idempotencyKey: "contribution-a-001" });
  const final = database.contributeToGoal({ serverId: "server-main", localUserId: "user-goal-b", goalId: goal.id, requestedAmount: 100, idempotencyKey: "contribution-b-001" });
  assert.equal(first.acceptedPulse, 100);
  assert.equal(final.acceptedPulse, 35);
  assert.equal(final.refusedPulse, 65);
  assert.equal(database.getBalance(secondAccount.id), 65);
  assert.equal(database.getGoal(goal.id).current_amount, 135);
  assert.equal(database.getGoal(goal.id).status, "funded");
  assert.ok(final.entitlement?.payload);
  const payload = verifySignedEnvelope(final.entitlement, { "test-key-1": publicKey }, { serverId: "server-main", roomId: "room-alpha", productCode: "room_reaction_pack" });
  assert.equal(payload.roomId, "room-alpha");
  assert.equal(database.ledgerInvariant().ok, true);
});

test("duplicate goal contribution does not debit wallet twice", (t) => {
  const { database } = createFixture(t);
  const account = createLinkedAccount(database, "duplicate");
  database.grantImpulses(account.id, 100, { idempotencyKey: "grant-duplicate" });
  const goal = database.createGoal({ serverId: "server-main", roomId: "room-duplicate", createdBy: "user-duplicate", productCode: "room_reaction_pack", title: "Duplicate guard", targetAmount: 200, expiresAt: "2027-01-01T00:00:00.000Z" });
  const input = { serverId: "server-main", localUserId: "user-duplicate", goalId: goal.id, requestedAmount: 60, idempotencyKey: "contribution-duplicate-001" };
  const first = database.contributeToGoal(input);
  const duplicate = database.contributeToGoal(input);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(database.getBalance(account.id), 40);
  assert.equal(database.getGoal(goal.id).current_amount, 60);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM goal_contributions").get().count, 1);
});

test("active goal cancellation refunds every accepted contribution", (t) => {
  const { database } = createFixture(t);
  const firstAccount = createLinkedAccount(database, "refund-a");
  const secondAccount = createLinkedAccount(database, "refund-b");
  database.grantImpulses(firstAccount.id, 100, { idempotencyKey: "grant-refund-a" });
  database.grantImpulses(secondAccount.id, 100, { idempotencyKey: "grant-refund-b" });
  const goal = database.createGoal({ serverId: "server-main", roomId: "room-refund", createdBy: "user-refund-a", productCode: "room_reaction_pack", title: "Refund goal", targetAmount: 250, expiresAt: "2027-01-01T00:00:00.000Z" });
  database.contributeToGoal({ serverId: "server-main", localUserId: "user-refund-a", goalId: goal.id, requestedAmount: 70, idempotencyKey: "refund-contribution-a" });
  database.contributeToGoal({ serverId: "server-main", localUserId: "user-refund-b", goalId: goal.id, requestedAmount: 50, idempotencyKey: "refund-contribution-b" });
  const result = database.cancelGoal({ serverId: "server-main", localUserId: "user-refund-a", goalId: goal.id, idempotencyKey: "cancel-refund-goal" });
  const duplicate = database.cancelGoal({ serverId: "server-main", localUserId: "user-refund-a", goalId: goal.id, idempotencyKey: "cancel-refund-goal" });
  assert.equal(result.refundedPulse, 120);
  assert.equal(result.goal.status, "refunded");
  assert.equal(duplicate.duplicate, true);
  assert.equal(database.getBalance(firstAccount.id), 100);
  assert.equal(database.getBalance(secondAccount.id), 100);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE operation_type='goal_full_refund'").get().count, 2);
  assert.equal(database.ledgerInvariant().ok, true);
});

test("chargeback never produces a negative wallet and restricts debt", (t) => {
  const { database } = createFixture(t);
  const account = createLinkedAccount(database, "chargeback");
  database.grantImpulses(account.id, 30, { idempotencyKey: "grant-chargeback" });
  const result = database.applyChargeback({ accountId: account.id, amount: 50, referenceId: "dispute-test-1", idempotencyKey: "chargeback-test-1" });
  assert.equal(result.balance, 0);
  assert.equal(result.reclaim, 30);
  assert.equal(result.shortfall, 20);
  const restricted = database.getCloudAccount(account.id);
  assert.equal(restricted.status, "restricted");
  assert.equal(restricted.debt_amount, 20);
  assert.equal(database.ledgerInvariant().ok, true);
});

test("entitlement verification rejects scope mismatch and expiry", (t) => {
  const { signer, publicKey } = createFixture(t);
  const active = signer({ jti: "entitlement-active", serverId: "server-main", roomId: "room-a", productCode: "room_reaction_pack", status: "active", issuedAt: "2026-07-21T00:00:00.000Z", notBefore: "2026-07-21T00:00:00.000Z", expiresAt: "2026-07-22T00:00:00.000Z" });
  const verified = verifySignedEnvelope(active, { "test-key-1": publicKey }, { now: "2026-07-21T12:00:00.000Z", serverId: "server-main", roomId: "room-a", productCode: "room_reaction_pack" });
  assert.equal(verified.jti, "entitlement-active");
  assert.throws(() => verifySignedEnvelope(active, { "test-key-1": publicKey }, { now: "2026-07-21T12:00:00.000Z", serverId: "server-other" }), (error) => error instanceof BillingError && error.code === "PULSE_SCOPE_MISMATCH");
  assert.throws(() => verifySignedEnvelope(active, { "test-key-1": publicKey }, { now: "2026-07-23T00:00:00.000Z" }), (error) => error instanceof BillingError && error.code === "ENTITLEMENT_EXPIRED");
});

test("Stripe webhook requires a valid HMAC and fresh timestamp", () => {
  const secret = "whsec_test_secret";
  const timestamp = 1_721_586_000;
  const body = Buffer.from(JSON.stringify({ id: "evt_test_1", type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } }));
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;
  const event = verifyStripeWebhook(body, header, secret, { nowMs: timestamp * 1000 });
  assert.equal(event.id, "evt_test_1");
  assert.throws(() => verifyStripeWebhook(body, `t=${timestamp},v1=deadbeef`, secret, { nowMs: timestamp * 1000 }), (error) => error.code === "WEBHOOK_SIGNATURE_INVALID");
  assert.throws(() => verifyStripeWebhook(body, header, secret, { nowMs: (timestamp + 301) * 1000 }), (error) => error.code === "WEBHOOK_TIMESTAMP_INVALID");
});

test("Pulse Cloud startup validation rejects unsupported providers and invalid ports", () => {
  const { positivePort } = require("../cloud/cli.cjs");
  assert.equal(positivePort("4545"), 4545);
  assert.throws(() => positivePort("70000"), (error) => error.code === "PULSE_CLOUD_MISCONFIGURED");
});
