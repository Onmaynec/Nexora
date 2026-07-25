"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const request = require("supertest");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

let instance;
let directory;
let agent;
let csrf;
let user;
let serverId;
let offline = false;
const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });

function sign(payload, keyId = "test-key") {
  const complete = { ...payload, keyId };
  const bytes = Buffer.from(JSON.stringify(complete));
  return {
    payload: bytes.toString("base64url"),
    signature: crypto.sign(null, bytes, privateKey).toString("base64url"),
    keyId,
  };
}

function cloudResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => String(name).toLowerCase() === "x-request-id" ? "cloud-request-123" : null },
    async json() { return status >= 400 ? payload : sign(payload); },
  };
}

function browserAgent(raw) {
  return new Proxy(raw, {
    get(target, property) {
      if (["post", "put", "patch", "delete"].includes(property)) {
        return (...args) => target[property](...args)
          .set("X-Nexora-Client-Version", "3.0.0")
          .set("X-Nexora-CSRF", csrf || "");
      }
      if (typeof target[property] === "function") return (...args) => target[property](...args).set("X-Nexora-Client-Version", "3.0.0");
      return target[property];
    },
  });
}

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-pulse-local-"));
  instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pulseMode: "production",
    pulseCloudUrl: "https://pulse.example.test",
    pulseApiKey: "a".repeat(32),
    pulsePublicKeyId: "test-key",
    pulsePublicKey: publicKeyPem,
    pulseFetch: async (url, options) => {
      if (offline) throw Object.assign(new Error("offline"), { name: "FetchError" });
      const parsed = new URL(url);
      const requestBody = options.body ? JSON.parse(options.body) : {};
      const now = "2026-07-21T12:00:00.000Z";
      const expiry = "2030-07-21T12:00:00.000Z";
      if (parsed.pathname.endsWith("/overview")) {
        const entitlement = sign({
          jti: "ent-plus-1", serverId, cloudAccountId: "cloud-account-1", roomId: null,
          productCode: "nexora_plus", status: "active", issuedAt: now, notBefore: now, expiresAt: expiry,
        });
        return cloudResponse({
          cloudAccountId: "cloud-account-1", serverId, userId: user.id, accountStatus: "active",
          wallet: { currency: "IMPULSE", balance: 400 },
          subscription: { status: "active", current_period_end: expiry },
          entitlements: [{ id: "ent-row-1", jti: "ent-plus-1", productCode: "nexora_plus", status: "active", startsAt: now, expiresAt: expiry, keyId: "test-key", envelope: entitlement }],
          issuedAt: now, expiresAt: "2026-07-21T12:05:00.000Z",
        });
      }
      if (parsed.pathname.endsWith("/transactions")) {
        return cloudResponse({ serverId, userId: user.id, transactions: [{ id: "tx-1", operationType: "plus_monthly_grant", amount: 400, currency: "IMPULSE", status: "completed", balanceBefore: 0, balanceAfter: 400, createdAt: now }], issuedAt: now, expiresAt: "2026-07-21T12:05:00.000Z" });
      }
      if (parsed.pathname.includes("/transactions/")) {
        return cloudResponse({ serverId, userId: user.id, transaction: { id: "tx-1", operationType: "plus_monthly_grant", amount: 400, currency: "IMPULSE", status: "completed", balanceBefore: 0, balanceAfter: 400, createdAt: now }, issuedAt: now, expiresAt: "2026-07-21T12:05:00.000Z" });
      }
      if (parsed.pathname === "/v1/checkout/sessions") {
        return cloudResponse({ serverId, userId: user.id, checkoutId: "checkout-1", orderId: "order-1", url: "https://checkout.stripe.test/session", expiresAt: expiry, issuedAt: now });
      }
      if (parsed.pathname === "/v1/checkout/checkout-1") {
        return cloudResponse({ serverId, userId: user.id, checkoutId: "checkout-1", orderId: "order-1", status: "pending", expiresAt: expiry, issuedAt: now });
      }
      if (parsed.pathname === "/v1/goals") {
        return cloudResponse({ serverId, userId: user.id, roomId: requestBody.roomId, goal: { id: "goal-1", roomId: requestBody.roomId, serverId, productCode: requestBody.productCode, title: requestBody.title, description: requestBody.description || "", targetAmount: 140, currentAmount: 0, status: "active", createdBy: user.id, createdAt: now, expiresAt: expiry }, issuedAt: now, expiresAt: "2026-07-21T12:05:00.000Z" }, 201);
      }
      throw new Error(`Unexpected Cloud request: ${parsed.pathname}`);
    },
    clock: () => new Date("2026-07-21T12:01:00.000Z"),
  });
  await instance.listen();
  serverId = instance.status().serverId;
  agent = browserAgent(request.agent(instance.app));
  const registered = await agent.post("/api/auth/register").send({ displayName: "Pulse User", username: "pulse-user", password: "StrongPass123!" }).expect(201);
  csrf = registered.body.csrfToken;
  user = registered.body.user;
});

after(async () => {
  await instance.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("schema 9 is active and Pulse API requires authentication", async () => {
  assert.equal(instance.store.stats().schemaVersion, 9);
  assert.equal(instance.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value, "9");
  await request(instance.app).get("/api/v3/pulse/status").expect(401).expect((response) => assert.equal(response.body.code, "AUTH_REQUIRED"));
  const status = await agent.get("/api/v3/pulse/status").expect(200);
  assert.equal(status.body.schemaVersion, 9);
  assert.equal(status.body.cloud.productionReady, true);
});

test("Cloud Account link attestation is scoped and one-time", async () => {
  const started = await agent.post("/api/v3/cloud-account/link/start").send({}).expect(201);
  const authorization = new URL(started.body.authorizationUrl);
  const attestation = sign({
    type: "local_account_link",
    serverId,
    localUserId: user.id,
    linkId: started.body.linkId,
    nonce: authorization.searchParams.get("nonce"),
    cloudAccountId: "cloud-account-1",
    subject: "cloud-subject-1",
    issuedAt: "2026-07-21T12:00:00.000Z",
    expiresAt: "2026-07-21T12:05:00.000Z",
  });
  const completed = await agent.post("/api/v3/cloud-account/link/complete").send({ linkId: started.body.linkId, attestation }).expect(201);
  assert.equal(completed.body.account.cloudAccountId, "cloud-account-1");
  await agent.post("/api/v3/cloud-account/link/complete").send({ linkId: started.body.linkId, attestation }).expect(409)
    .expect((response) => assert.equal(response.body.code, "LINK_ATTESTATION_REPLAYED"));
});

test("overview, wallet and transactions sync into schema 9 cache", async () => {
  const overview = await agent.get("/api/v3/pulse/overview").expect(200);
  assert.equal(overview.body.cached, false);
  assert.equal(overview.body.wallet.balance, 400);
  assert.equal(overview.body.entitlements[0].jti, "ent-plus-1");
  const transactions = await agent.get("/api/v3/pulse/transactions").expect(200);
  assert.equal(transactions.body.transactions[0].id, "tx-1");
  assert.equal(instance.store.db.prepare("SELECT COUNT(*) AS count FROM billing_entitlement_cache").get().count, 1);
  assert.equal(instance.store.db.prepare("SELECT COUNT(*) AS count FROM billing_transaction_cache").get().count, 1);
});

test("Cloud outage returns verified cached overview without blocking Local Server", async () => {
  offline = true;
  const overview = await agent.get("/api/v3/pulse/overview").expect(200);
  assert.equal(overview.body.cached, true);
  assert.equal(overview.body.wallet.balance, 400);
  assert.equal(overview.body.warning.code, "PULSE_CLOUD_OFFLINE");
  await agent.get("/api/bootstrap").expect(200);
  offline = false;
});

test("checkout is server-priced and idempotency key is required", async () => {
  await agent.post("/api/v3/pulse/checkout/subscription").send({ currency: "EUR" }).expect(400)
    .expect((response) => assert.equal(response.body.code, "IDEMPOTENCY_KEY_REQUIRED"));
  const checkout = await agent.post("/api/v3/pulse/checkout/subscription")
    .set("Idempotency-Key", "checkout-key-123456")
    .send({ currency: "EUR" })
    .expect(201);
  assert.equal(checkout.body.checkout.productCode, "nexora_plus");
  assert.match(checkout.body.checkout.url, /^https:\/\//);
});
