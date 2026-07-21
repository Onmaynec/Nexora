"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const {
  PulseCloudClient,
  verifySignedEnvelope,
} = require("../server/pulse-cloud-client.cjs");

function signer() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  return {
    publicKeyPem,
    sign(payload, keyId = "key-1") {
      const complete = { ...payload, keyId };
      const bytes = Buffer.from(JSON.stringify(complete));
      return {
        payload: bytes.toString("base64url"),
        signature: crypto.sign(null, bytes, privateKey).toString("base64url"),
        keyId,
      };
    },
  };
}

function response(envelope, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    async json() { return envelope; },
  };
}

test("signed envelope validates Ed25519, expiry and server scope", () => {
  const keys = signer();
  const registry = new Map([["key-1", keys.publicKeyPem]]);
  const envelope = keys.sign({
    serverId: "server-1",
    userId: "user-1",
    issuedAt: "2026-07-21T12:00:00.000Z",
    expiresAt: "2026-07-21T12:05:00.000Z",
  });
  assert.equal(verifySignedEnvelope(envelope, registry, { serverId: "server-1", userId: "user-1", now: "2026-07-21T12:01:00.000Z" }).userId, "user-1");
  assert.throws(() => verifySignedEnvelope(envelope, registry, { serverId: "server-2", now: "2026-07-21T12:01:00.000Z" }), (error) => error.code === "PULSE_SCOPE_MISMATCH");
  assert.throws(() => verifySignedEnvelope(envelope, registry, { serverId: "server-1", now: "2026-07-21T12:10:00.000Z" }), (error) => error.code === "PULSE_PAYLOAD_EXPIRED");
});

test("client sends scoped replay headers and verifies overview entitlements", async () => {
  const keys = signer();
  const registry = new Map([["key-1", keys.publicKeyPem]]);
  let captured;
  const entitlement = keys.sign({
    jti: "ent-1",
    serverId: "server-1",
    cloudAccountId: "account-1",
    roomId: null,
    productCode: "nexora_plus",
    status: "active",
    issuedAt: "2026-07-21T12:00:00.000Z",
    notBefore: "2026-07-21T12:00:00.000Z",
    expiresAt: "2026-08-21T12:00:00.000Z",
  });
  const overviewEnvelope = keys.sign({
    cloudAccountId: "account-1",
    serverId: "server-1",
    userId: "user-1",
    wallet: { currency: "IMPULSE", balance: 400 },
    entitlements: [{ jti: "ent-1", productCode: "nexora_plus", envelope: entitlement }],
    issuedAt: "2026-07-21T12:00:00.000Z",
    expiresAt: "2026-07-21T12:05:00.000Z",
  });
  const client = new PulseCloudClient({
    mode: "production",
    cloudUrl: "https://pulse.example.test",
    apiKey: "a".repeat(32),
    serverId: "server-1",
    repository: { keyRegistry: () => registry },
    clock: () => new Date("2026-07-21T12:01:00.000Z"),
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response(overviewEnvelope, 200, { "x-request-id": "request-123456" });
    },
  });
  const result = await client.overview("user-1", "request-123456");
  assert.equal(result.overview.wallet.balance, 400);
  assert.equal(result.overview.entitlements[0].verifiedPayload.jti, "ent-1");
  assert.equal(captured.options.headers["X-Nexora-Server-ID"], "server-1");
  assert.match(captured.options.headers["X-Nexora-Nonce"], /^[A-Za-z0-9_-]+$/);
  assert.equal(captured.options.headers["X-Nexora-Timestamp"], "2026-07-21T12:01:00.000Z");
});

test("link attestation is bound to local session", () => {
  const keys = signer();
  const registry = new Map([["key-1", keys.publicKeyPem]]);
  const client = new PulseCloudClient({
    mode: "production",
    cloudUrl: "https://pulse.example.test",
    apiKey: "a".repeat(32),
    serverId: "server-1",
    repository: { keyRegistry: () => registry },
    clock: () => new Date("2026-07-21T12:01:00.000Z"),
    fetchImpl: async () => { throw new Error("unused"); },
  });
  const envelope = keys.sign({
    type: "local_account_link",
    serverId: "server-1",
    localUserId: "user-1",
    linkId: "link-1",
    nonce: "nonce-1",
    cloudAccountId: "account-1",
    subject: "subject-1",
    issuedAt: "2026-07-21T12:00:00.000Z",
    expiresAt: "2026-07-21T12:05:00.000Z",
  });
  assert.equal(client.verifyLinkAttestation(envelope, { linkId: "link-1", nonce: "nonce-1", localUserId: "user-1" }).cloudAccountId, "account-1");
  assert.throws(() => client.verifyLinkAttestation(envelope, { linkId: "link-1", nonce: "wrong", localUserId: "user-1" }), (error) => error.code === "LINK_ATTESTATION_INVALID");
});
