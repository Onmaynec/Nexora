"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");

const { createNexoraServer } = require("../server/create-server-v31.cjs");
const { createSlidingWindowRateLimiter } = require("../server/rate-limit.cjs");
const { canAccessConversation } = require("../server/model.cjs");

function browserAgent(agent, csrf, deviceId = "stable-core-security-device") {
  return new Proxy(agent, {
    get(target, property) {
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args)
          .set("X-Nexora-Client-Version", "3.4.0")
          .set("X-Nexora-Device-ID", deviceId)
          .set("X-Nexora-Device-Name", "Stable Core security test")
          .set("X-Nexora-Platform", "web");
        if (["post", "put", "patch", "delete"].includes(property)) {
          const token = csrf();
          if (token) builder.set("X-Nexora-CSRF", token);
        }
        return builder;
      };
    },
  });
}

async function serverFixture(prefix) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });
  await instance.listen();
  return { directory, instance };
}

async function closeFixture(fixture) {
  await fixture.instance.close();
  await fs.rm(fixture.directory, { recursive: true, force: true });
}

test("bounded sliding-window limiter evicts stale buckets and returns Retry-After", () => {
  let now = 1_000;
  const limiter = createSlidingWindowRateLimiter({ windowMs: 1_000, max: 2, maxBuckets: 2, clock: () => now });
  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("a").allowed, true);
  const blocked = limiter.consume("a");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  limiter.consume("b");
  limiter.consume("c");
  assert.ok(limiter.size() <= 2);
  now += 2_000;
  assert.equal(limiter.consume("a").allowed, true);
});

test("active room ban overrides stale membership access", () => {
  const state = {
    rooms: [{ id: "room-1" }],
    roomMembers: [{ roomId: "room-1", userId: "user-1", role: "member" }],
    roomBans: [{ roomId: "room-1", userId: "user-1", revokedAt: null }],
  };
  assert.equal(canAccessConversation(state, { id: "conversation-1", type: "room", roomId: "room-1" }, "user-1"), false);
});

test("retired Trust and E2EE APIs are terminal, stable and never consume legacy enrollment quotas", async (context) => {
  const fixture = await serverFixture("nexora-retired-security-api-");
  context.after(() => closeFixture(fixture));
  let csrf = "";
  const agent = browserAgent(request.agent(fixture.instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({
    displayName: "Security API",
    username: `security_api_${crypto.randomBytes(4).toString("hex")}`,
    password: "SecurityApiPass123!",
  }).expect(201);
  csrf = registered.body.csrfToken;

  for (const target of ["/api/v4/trust/devices", "/api/v4/trust/key-packages", "/api/v4/e2ee/attachments"]) {
    const response = await agent.post(target).send({}).expect(410);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.code, "LEGACY_READ_ONLY");
    assert.equal(response.body.message, response.body.error);
    assert.match(response.body.requestId, /^[A-Za-z0-9_.:-]{8,128}$/);
    assert.deepEqual(typeof response.body.details, "object");
    assert.equal(response.headers["retry-after"], undefined);
  }
  assert.equal(fixture.instance.status().stableCore.trustRuntime, "retired");
});

test("browser mutation without CSRF is rejected before device revocation logic", async (context) => {
  const fixture = await serverFixture("nexora-device-csrf-");
  context.after(() => closeFixture(fixture));
  const raw = request.agent(fixture.instance.app);
  const registered = await raw.post("/api/auth/register")
    .set("X-Nexora-Client-Version", "3.4.0")
    .set("X-Nexora-Device-ID", "csrf-primary-device")
    .send({
      displayName: "CSRF Owner",
      username: `csrf_owner_${crypto.randomBytes(4).toString("hex")}`,
      password: "CsrfOwnerPass123!",
    }).expect(201);
  assert.ok(registered.body.csrfToken);

  const response = await raw.delete("/api/v3/devices/sessions/others")
    .set("X-Nexora-Client-Version", "3.4.0")
    .expect(403);
  assert.equal(response.body.code, "CSRF_INVALID");
  assert.match(response.body.requestId, /^[A-Za-z0-9_.:-]{8,128}$/);
});

test("security maintenance removes expired sessions and bounded history", async (context) => {
  const fixture = await serverFixture("nexora-security-maintenance-");
  context.after(() => closeFixture(fixture));
  const old = new Date("2020-01-01T00:00:00.000Z").toISOString();
  await fixture.instance.store.mutate((state) => {
    state.sessions.push({ id: "expired", userId: "missing", tokenHash: "x", csrfToken: "x", createdAt: old, lastSeenAt: old, expiresAt: old });
    state.loginAttempts.push({ id: "old-login", username: "old", ip: "127.0.0.1", success: false, createdAt: old });
    state.rateLimits.push({ key: "old-limit", windowStartedAt: old, hits: 10 });
  });
  const removed = await fixture.instance.maintenance.cleanupSecurityState({ now: Date.parse("2026-07-24T00:00:00.000Z") });
  assert.ok(removed.sessions >= 1);
  assert.ok(removed.loginAttempts >= 1);
  assert.ok(removed.rateLimits >= 1);
  assert.equal(fixture.instance.store.read((state) => state.sessions.some((item) => item.id === "expired")), false);
});

test("signing status is admin-only and never exposes certificate material", async (context) => {
  const fixture = await serverFixture("nexora-signing-status-");
  context.after(() => closeFixture(fixture));
  let csrf = "";
  const agent = browserAgent(request.agent(fixture.instance.app), () => csrf, "signing-admin-device");
  const registered = await agent.post("/api/auth/register").send({
    displayName: "Signing Admin",
    username: `signing_admin_${crypto.randomBytes(4).toString("hex")}`,
    password: "SigningAdminPass123!",
  }).expect(201);
  csrf = registered.body.csrfToken;

  const response = await agent.get("/api/admin/release/signing-status").expect(200);
  assert.equal(response.body.signing.secretsExposed, false);
  assert.equal(Object.hasOwn(response.body.signing, "password"), false);
  assert.equal(Object.hasOwn(response.body.signing, "certificate"), false);
  assert.equal(JSON.stringify(response.body).includes(String(process.env.CSC_KEY_PASSWORD || "__not_set__")), false);
});
