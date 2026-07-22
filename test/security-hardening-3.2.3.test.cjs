"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const { MaintenanceService } = require("../server/maintenance.cjs");
const { canAccessConversation } = require("../server/model.cjs");
const { applySchema8Migration } = require("../server/trust-schema8.cjs");
const {
  MAX_ACTIVE_DEVICES_PER_USER,
  MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE,
  TrustCore,
  canonical,
  hash,
  proofPayload,
} = require("../server/trust-core.cjs");

function createStore(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta(key,value) VALUES('schema_version','7');
    INSERT INTO meta(key,value) VALUES('state_meta','{"schemaVersion":7,"serverId":"server-1"}');
  `);
  return {
    db,
    filePath,
    state: { meta: { schemaVersion: 7, serverId: "server-1" } },
    queue: Promise.resolve(),
    read(selector = (value) => value) { return selector(this.state); },
    async flush() { await this.queue; this.db.exec("PRAGMA wal_checkpoint(PASSIVE)"); },
    persistState(next = this.state) { this.state = structuredClone(next); },
    stats() { return { schemaVersion: this.state.meta.schemaVersion }; },
  };
}

function keyMaterial({ reuse = false } = {}) {
  const identity = crypto.generateKeyPairSync("ed25519");
  const signature = reuse ? identity : crypto.generateKeyPairSync("ed25519");
  return {
    identityPrivate: identity.privateKey,
    identityPublic: identity.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
    signaturePublic: signature.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
  };
}

function sign(privateKey, purpose, values) {
  return crypto.sign(null, proofPayload(purpose, values), privateKey).toString("base64");
}

function registrationInput(core, userId, { credentialUserId = userId, credentialDeviceId, reuseKeys = false } = {}) {
  const keys = keyMaterial({ reuse: reuseKeys });
  const deviceId = credentialDeviceId || crypto.randomUUID();
  const credential = Buffer.from(JSON.stringify({ version: 1, userId: credentialUserId, deviceId }), "utf8").toString("base64");
  const fingerprint = hash(canonical({ userId, identityKey: keys.identityPublic, signatureKey: keys.signaturePublic, credential }));
  const context = { deviceId, fingerprint };
  const challenge = core.createChallenge({ userId, purpose: "register_device", context });
  const values = { challengeId: challenge.id, nonce: challenge.nonce, userId, purpose: "register_device", targetDeviceId: null, context };
  return {
    keys,
    input: {
      userId,
      challengeId: challenge.id,
      deviceId,
      displayName: "Security test device",
      identityKey: keys.identityPublic,
      signatureKey: keys.signaturePublic,
      credential,
      capabilities: ["mls-rfc9420"],
      proofSignature: sign(keys.identityPrivate, "register_device", values),
    },
  };
}

function register(core, userId, options) {
  const prepared = registrationInput(core, userId, options);
  return { ...core.registerDevice(prepared.input), keys: prepared.keys };
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-security-3.2.3-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createStore(filePath);
  await applySchema8Migration({ store, databaseFile: filePath });
  const core = new TrustCore({ store });
  t.after(async () => {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { store, core };
}

test("Trust registration binds the MLS credential to the authenticated user and device", async (t) => {
  const { core } = await fixture(t);
  const prepared = registrationInput(core, "user-1", { credentialUserId: "user-2" });
  assert.throws(() => core.registerDevice(prepared.input), (error) => error.code === "TRUST_CREDENTIAL_SCOPE_INVALID");

  const reused = registrationInput(core, "user-1", { reuseKeys: true });
  assert.throws(() => core.registerDevice(reused.input), (error) => error.code === "TRUST_KEY_REUSE_FORBIDDEN");
});

test("Trust limits active devices per user without breaking duplicate registration", async (t) => {
  const { core } = await fixture(t);
  assert.equal(MAX_ACTIVE_DEVICES_PER_USER, 16);
  const now = new Date().toISOString();
  const insert = core.db.prepare(`INSERT INTO trust_devices(
    id,user_id,display_name,identity_key,signature_key,credential,fingerprint,status,trust_state,
    created_at,updated_at,last_seen_at,verified_at,revoked_at,data
  ) VALUES(?,?,?,?,?,?,?,'active','verified',?,?,?,?,NULL,'{}')`);
  for (let index = 0; index < MAX_ACTIVE_DEVICES_PER_USER; index += 1) {
    insert.run(
      crypto.randomUUID(), "device-limit-user", `Device ${index}`,
      crypto.randomBytes(32).toString("base64"), crypto.randomBytes(32).toString("base64"),
      Buffer.from(`credential-${index}`).toString("base64"), crypto.randomBytes(32).toString("hex"),
      now, now, now, now,
    );
  }
  const prepared = registrationInput(core, "device-limit-user");
  assert.throws(() => core.registerDevice(prepared.input), (error) => error.code === "TRUST_DEVICE_LIMIT_REACHED");
});

test("Trust caps unclaimed KeyPackages per device", async (t) => {
  const { core } = await fixture(t);
  assert.equal(MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE, 32);
  const device = register(core, "key-package-user").device;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  for (let index = 0; index < MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE; index += 1) {
    core.uploadKeyPackages({
      userId: "key-package-user",
      deviceId: device.id,
      packages: [{ ciphersuite: 1, keyPackage: crypto.randomBytes(128).toString("base64"), expiresAt }],
    });
  }
  assert.throws(() => core.uploadKeyPackages({
    userId: "key-package-user",
    deviceId: device.id,
    packages: [{ ciphersuite: 1, keyPackage: crypto.randomBytes(128).toString("base64"), expiresAt }],
  }), (error) => error.code === "MLS_KEY_PACKAGE_LIMIT_REACHED");
});

test("Trust audit metadata uses an action allowlist and drops nested secrets", async (t) => {
  const { core } = await fixture(t);
  core.audit({
    userId: "audit-user",
    action: "device.registered",
    targetType: "device",
    targetId: "device-1",
    metadata: {
      trustState: "verified",
      proofHash: "safe-proof-hash",
      context: { identityKey: "private-material" },
      arbitrary: "must-not-survive",
    },
  });
  assert.deepEqual(core.listAudit("audit-user")[0].metadata, { trustState: "verified", proofHash: "safe-proof-hash" });
});

test("conversation access fails closed when a room member is actively banned", () => {
  const conversation = { id: "conversation-1", type: "room", roomId: "room-1", userIds: [] };
  const state = {
    users: [{ id: "user-1", role: "user" }],
    roomMembers: [{ roomId: "room-1", userId: "user-1", role: "member" }],
    roomBans: [{ id: "ban-1", roomId: "room-1", userId: "user-1", expiresAt: null }],
  };
  assert.equal(canAccessConversation(state, conversation, "user-1"), false);
});

test("shared sliding-window limiter reports retry timing and bounds memory", () => {
  const { createSlidingWindowRateLimiter } = require("../server/rate-limit.cjs");
  let now = 1_000;
  const limiter = createSlidingWindowRateLimiter({ windowMs: 1_000, limit: 2, maxBuckets: 2, clock: () => now });
  assert.equal(limiter.consume("first").allowed, true);
  assert.equal(limiter.consume("first").allowed, true);
  const rejected = limiter.consume("first");
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterMs, 1_000);
  limiter.consume("second");
  limiter.consume("third");
  assert.ok(limiter.size() <= 2);
  now += 1_001;
  assert.equal(limiter.consume("first").allowed, true);
});

test("maintenance removes expired sessions and 90-day security history", async () => {
  const now = Date.now();
  const state = {
    sessions: [
      { id: "expired", expiresAt: new Date(now - 1).toISOString() },
      { id: "active", expiresAt: new Date(now + 60_000).toISOString() },
    ],
    loginAttempts: [
      { id: "old", createdAt: new Date(now - 91 * 24 * 60 * 60_000).toISOString() },
      { id: "recent", createdAt: new Date(now - 10_000).toISOString() },
    ],
    rateLimits: [
      { key: "old", windowStartedAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString(), hits: 1 },
      { key: "recent", windowStartedAt: new Date(now - 10_000).toISOString(), hits: 1 },
    ],
  };
  const store = {
    read(selector = (value) => value) { return selector(state); },
    async mutate(operation) { return operation(state); },
  };
  const maintenance = new MaintenanceService({ store, dataDir: os.tmpdir(), uploadsDir: os.tmpdir(), appVersion: "3.2.3" });
  const result = await maintenance.cleanupSecurityState({ now });
  assert.deepEqual(state.sessions.map((item) => item.id), ["active"]);
  assert.deepEqual(state.loginAttempts.map((item) => item.id), ["recent"]);
  assert.deepEqual(state.rateLimits.map((item) => item.key), ["recent"]);
  assert.deepEqual(result, { sessions: 1, loginAttempts: 1, rateLimits: 1 });
});

test("missed MLS commit recovery rejects duplicate and non-contiguous envelopes before persistence", async () => {
  const moduleUrl = pathToFileURL(path.join(__dirname, "..", "client", "src", "crypto", "mls-recovery.mjs")).href;
  const { replayMissedCommits } = await import(moduleUrl);
  const local = { epoch: 2, state: { epoch: 2 }, publicStateHash: "state-2" };
  const remote = { id: "group-1", conversationId: "conversation-1", epoch: 4, publicStateHash: "state-4" };
  const base = {
    local,
    remote,
    decodeCommit: (value) => Buffer.from(value),
    hashCommit: async (value) => `hash-${value.toString()}`,
    processCommit: async ({ state, commitBytes }) => ({
      state: { epoch: state.epoch + 1 },
      epoch: state.epoch + 1,
      publicStateHash: `state-${state.epoch + 1}`,
      commitBytes,
    }),
    resolveDevice: async () => null,
  };
  await assert.rejects(() => replayMissedCommits({
    ...base,
    result: {
      group: remote,
      commits: [
        { previousEpoch: 2, epoch: 3, commit: "one", commitHash: "hash-one", publicStateHash: "state-3" },
        { previousEpoch: 3, epoch: 4, commit: "one", commitHash: "hash-one", publicStateHash: "state-4" },
      ],
    },
  }), (error) => error.code === "MLS_COMMIT_REPLAY");

  await assert.rejects(() => replayMissedCommits({
    ...base,
    result: {
      group: remote,
      commits: [{ previousEpoch: 3, epoch: 4, commit: "two", commitHash: "hash-two", publicStateHash: "state-4" }],
    },
  }), (error) => error.code === "MLS_COMMIT_SEQUENCE_INVALID");
});
