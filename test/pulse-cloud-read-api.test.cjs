"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");
const { createCloudAppV11 } = require("../cloud/create-cloud-server-v11.cjs");
const { verifySignedEnvelope } = require("../cloud/entitlements.cjs");

function fixtureOptions(databaseFile) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    databaseFile,
    publicUrl: "https://pulse.example.test",
    serverId: "server-1",
    serverApiKey: "s".repeat(32),
    adminApiKey: "o".repeat(32),
    entitlementKeyId: "key-1",
    entitlementPrivateKey: privateKeyPem,
    entitlementPublicKey: publicKeyPem,
    plusPriceId: "price_plus_1",
    plusPriceMinor: 499,
    impulse500PriceId: "price_impulse_1",
    impulse500PriceMinor: 299,
    provider: {
      async createCheckoutSession() { return { id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1", expires_at: 1_900_000_000 }; },
      verifyWebhook() { throw new Error("unused"); },
    },
    keyRegistry: new Map([["key-1", publicKeyPem]]),
  };
}

function serviceRequest(app, method, url, body = null, idempotencyKey = null) {
  let builder = request(app)[method](url)
    .set("Authorization", `Bearer ${"s".repeat(32)}`)
    .set("X-Nexora-Server-ID", "server-1")
    .set("X-Request-ID", "request-123456");
  if (idempotencyKey) builder = builder.set("Idempotency-Key", idempotencyKey);
  if (body) builder = builder.send(body);
  return builder;
}

test("Cloud v1.1 read API scopes transactions and checkout envelopes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-cloud-read-"));
  const databaseFile = path.join(directory, "pulse.sqlite");
  const options = fixtureOptions(databaseFile);
  const { app, database } = createCloudAppV11(options);
  try {
    database.createCloudAccount({ id: "account-1", country: "FI" });
    database.linkLocalAccount({ accountId: "account-1", serverId: "server-1", localUserId: "user-1" });
    database.grantImpulses("account-1", 400, { operationType: "plus_monthly_grant", idempotencyKey: "grant-1" });

    const transactions = await serviceRequest(app, "get", "/v1/servers/server-1/users/user-1/transactions").expect(200);
    const transactionPayload = verifySignedEnvelope(transactions.body, options.keyRegistry, { serverId: "server-1", now: new Date() });
    assert.equal(transactionPayload.userId, "user-1");
    assert.equal(transactionPayload.transactions[0].amount, 400);
    assert.equal(transactionPayload.transactions[0].balanceAfter, 400);

    const checkout = await serviceRequest(app, "post", "/v1/checkout/sessions", {
      serverId: "server-1",
      userId: "user-1",
      productCode: "nexora_plus",
      currency: "EUR",
      region: "*",
    }, "checkout-idempotency-1").expect(201);
    const checkoutPayload = verifySignedEnvelope(checkout.body, options.keyRegistry, { serverId: "server-1", now: new Date() });
    assert.equal(checkoutPayload.userId, "user-1");
    assert.ok(checkoutPayload.checkoutId);
    assert.match(checkoutPayload.url, /^https:\/\//);
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
