"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const request = require("supertest");

const { BillingDatabase } = require("../cloud/billing-core.cjs");
const { createEntitlementSigner, createResponseSigner } = require("../cloud/entitlements.cjs");
const { mountBillingManagementRoutes } = require("../cloud/billing-management-routes.cjs");

function decode(envelope) {
  return JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-management-"));
  const keys = crypto.generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const signer = createEntitlementSigner({ keyId: "management-key", privateKey });
  const responseSigner = createResponseSigner({ keyId: "management-key", privateKey });
  const database = new BillingDatabase(path.join(root, "cloud.sqlite"), { entitlementSigner: signer });
  const account = database.createCloudAccount({ id: "account-management", country: "FI" });
  database.linkLocalAccount({ id: "link-management", accountId: account.id, serverId: "server-management", localUserId: "user-management" });
  database.activatePlusPeriod({ accountId: account.id, serverId: "server-management", providerSubscriptionId: "sub_management01", periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-08-01T00:00:00.000Z" });
  const calls = [];
  const provider = {
    async request(route, params, options) { calls.push({ route, params, options }); return { id: "sub_management01", status: "active", cancel_at_period_end: true, current_period_start: 1782864000, current_period_end: 1785542400 }; },
    async retrieveSubscription() { return { id: "sub_management01", customer: "cus_management01" }; },
    async createBillingPortalSession(input) { calls.push({ portal: input }); return { url: "https://billing.example.test/session/portal" }; },
  };
  const app = express();
  app.use((req, res, next) => { res.setHeader("X-Request-ID", crypto.randomUUID()); next(); });
  mountBillingManagementRoutes({ app, database, provider, responseSigner, serverApiKey: "server-api-key-management-123456", configuredServerId: "server-management", publicUrl: "https://pulse.example.test" });
  t.after(() => { database.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { app, database, calls };
}

function service(agent) {
  return agent.set("Authorization", "Bearer server-api-key-management-123456").set("X-Nexora-Server-ID", "server-management");
}

test("subscription cancellation is scoped and idempotent", async (t) => {
  const { app, database, calls } = fixture(t);
  const first = await service(request(app).post("/v1/servers/server-management/users/user-management/subscription/cancel"))
    .set("Idempotency-Key", "cancel-management-001").send({}).expect(200);
  assert.equal(decode(first.body).cancelledAtPeriodEnd, true);
  const second = await service(request(app).post("/v1/servers/server-management/users/user-management/subscription/cancel"))
    .set("Idempotency-Key", "cancel-management-001").send({}).expect(200);
  assert.equal(decode(second.body).cancelledAtPeriodEnd, true);
  assert.equal(calls.filter((call) => call.route).length, 1);
  assert.equal(database.db.prepare("SELECT cancel_at_period_end FROM subscriptions WHERE provider_subscription_id='sub_management01'").get().cancel_at_period_end, 1);
  await service(request(app).post("/v1/servers/other/users/user-management/subscription/cancel"))
    .set("Idempotency-Key", "cancel-management-002").send({}).expect(403);
});

test("billing portal and event delta return signed scoped payloads", async (t) => {
  const { app, database } = fixture(t);
  const portal = await service(request(app).post("/v1/servers/server-management/users/user-management/subscription/portal"))
    .set("Idempotency-Key", "portal-management-001").send({ returnUrl: "https://app.example.test/pulse" }).expect(201);
  assert.equal(decode(portal.body).url, "https://billing.example.test/session/portal");
  database.enqueueEvent("billing.wallet_updated", "wallet", "account-management", { accountId: "account-management", balance: 400 });
  const events = await service(request(app).get("/v1/servers/server-management/events")).expect(200);
  const payload = decode(events.body);
  assert.equal(payload.serverId, "server-management");
  assert.ok(payload.events.some((event) => event.type === "billing.wallet_updated"));
  assert.ok(payload.cursor);
});
