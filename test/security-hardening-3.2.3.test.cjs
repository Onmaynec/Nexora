"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const request = require("supertest");

const { createNexoraServer } = require("../server/create-server-v31.cjs");
const { MaintenanceService } = require("../server/maintenance.cjs");
const { canAccessConversation } = require("../server/model.cjs");
const { applySchema8Migration } = require("../server/trust-schema8.cjs");
const {
  MAX_ACTIVE_DEVICES_PER_USER,
  MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE,
  MAX_ACTIVE_KEY_PACKAGES_PER_USER,
  MAX_KEY_PACKAGES_PER_UPLOAD,
  TrustCore,
  canonical,
  hash,
  proofPayload,
} = require("../server/trust-core.cjs");

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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

function registrationInput(core, userId, options = {}) {
  const keys = keyMaterial({ reuse: Boolean(options.reuseKeys) });
  const deviceId = options.candidateDeviceId || crypto.randomUUID();
  const credentialUserId = options.credentialUserId ?? userId;
  const credentialDeviceId = options.credentialDeviceId ?? deviceId;
  const credential = Buffer.from(JSON.stringify({ version: 1, userId: credentialUserId, deviceId: credentialDeviceId }), "utf8").toString("base64");
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

function renewRegistrationChallenge(core, prepared) {
  const { input, keys } = prepared;
  const fingerprint = hash(canonical({
    userId: input.userId,
    identityKey: input.identityKey,
    signatureKey: input.signatureKey,
    credential: input.credential,
  }));
  const context = { deviceId: input.deviceId, fingerprint };
  const challenge = core.createChallenge({ userId: input.userId, purpose: "register_device", context });
  const values = {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    userId: input.userId,
    purpose: "register_device",
    targetDeviceId: null,
    context,
  };
  return {
    ...input,
    challengeId: challenge.id,
    proofSignature: sign(keys.identityPrivate, "register_device", values),
  };
}

function register(core, userId, options) {
  const prepared = registrationInput(core, userId, options);
  return { ...core.registerDevice(prepared.input), keys: prepared.keys, prepared };
}

function keyPackage(expiresAt, bytes = crypto.randomBytes(128)) {
  return { ciphersuite: 1, keyPackage: bytes.toString("base64"), expiresAt };
}

function insertVerifiedDevice(core, userId, now, index) {
  const id = crypto.randomUUID();
  core.db.prepare(`INSERT INTO trust_devices(
    id,user_id,display_name,identity_key,signature_key,credential,fingerprint,status,trust_state,
    created_at,updated_at,last_seen_at,verified_at,revoked_at,data
  ) VALUES(?,?,?,?,?,?,?,'active','verified',?,?,?,?,NULL,'{}')`).run(
    id,
    String(userId),
    `Inserted device ${index}`,
    crypto.randomBytes(32).toString("base64"),
    crypto.randomBytes(32).toString("base64"),
    Buffer.from(`credential-${index}`).toString("base64"),
    crypto.randomBytes(32).toString("hex"),
    now,
    now,
    now,
    now,
  );
  return id;
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

test("Trust registration binds the MLS credential to the authenticated user and candidate device", async (t) => {
  const { core } = await fixture(t);
  const wrongUser = registrationInput(core, "user-1", { credentialUserId: "user-2" });
  assert.throws(() => core.registerDevice(wrongUser.input), (error) => error.code === "TRUST_CREDENTIAL_SCOPE_INVALID");

  const wrongDevice = registrationInput(core, "user-1", { credentialDeviceId: crypto.randomUUID() });
  assert.throws(() => core.registerDevice(wrongDevice.input), (error) => error.code === "TRUST_CREDENTIAL_SCOPE_INVALID");

  const reused = registrationInput(core, "user-1", { reuseKeys: true });
  assert.throws(() => core.registerDevice(reused.input), (error) => error.code === "TRUST_KEY_REUSE_FORBIDDEN");
});

test("Trust device limit is atomic, keeps duplicate registration idempotent and releases revoked capacity", async (t) => {
  const { core } = await fixture(t);
  assert.equal(MAX_ACTIVE_DEVICES_PER_USER, 16);
  const prepared = registrationInput(core, "device-limit-user");
  const initial = core.registerDevice(prepared.input);
  assert.equal(initial.duplicate, false);

  const now = new Date().toISOString();
  const insertedIds = [];
  for (let index = 1; index < MAX_ACTIVE_DEVICES_PER_USER; index += 1) {
    insertedIds.push(insertVerifiedDevice(core, "device-limit-user", now, index));
  }

  const duplicate = core.registerDevice(renewRegistrationChallenge(core, prepared));
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.device.id, initial.device.id);

  const overLimit = registrationInput(core, "device-limit-user");
  assert.throws(() => core.registerDevice(overLimit.input), (error) => error.code === "TRUST_DEVICE_LIMIT_REACHED");

  core.db.prepare("UPDATE trust_devices SET status='revoked',trust_state='blocked',revoked_at=?,updated_at=? WHERE id=?")
    .run(now, now, insertedIds[0]);
  const replacement = registrationInput(core, "device-limit-user");
  assert.equal(core.registerDevice(replacement.input).duplicate, false);
});

test("Trust caps KeyPackage batches and rolls back an overflowing per-device batch", async (t) => {
  const { core } = await fixture(t);
  assert.equal(MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE, 32);
  assert.equal(MAX_KEY_PACKAGES_PER_UPLOAD, 25);
  const device = register(core, "key-package-user").device;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  let firstPackage = null;

  for (let index = 0; index < MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE - 1; index += 1) {
    const item = keyPackage(expiresAt);
    firstPackage ||= item;
    core.uploadKeyPackages({ userId: "key-package-user", deviceId: device.id, packages: [item] });
  }

  assert.throws(() => core.uploadKeyPackages({
    userId: "key-package-user",
    deviceId: device.id,
    packages: [keyPackage(expiresAt), keyPackage(expiresAt)],
  }), (error) => error.code === "MLS_KEY_PACKAGE_LIMIT_REACHED");
  assert.equal(Number(core.db.prepare("SELECT COUNT(*) AS count FROM mls_key_packages WHERE device_id=? AND claimed_at IS NULL").get(device.id).count), 31);

  core.uploadKeyPackages({ userId: "key-package-user", deviceId: device.id, packages: [keyPackage(expiresAt)] });
  const duplicate = core.uploadKeyPackages({ userId: "key-package-user", deviceId: device.id, packages: [firstPackage] });
  assert.equal(duplicate[0].duplicate, true);

  assert.throws(() => core.uploadKeyPackages({
    userId: "key-package-user",
    deviceId: device.id,
    packages: [keyPackage(expiresAt)],
  }), (error) => error.code === "MLS_KEY_PACKAGE_LIMIT_REACHED");

  assert.throws(() => core.uploadKeyPackages({
    userId: "key-package-user",
    deviceId: device.id,
    packages: Array.from({ length: MAX_KEY_PACKAGES_PER_UPLOAD + 1 }, () => keyPackage(expiresAt)),
  }), (error) => error.code === "MLS_KEY_PACKAGE_BATCH_TOO_LARGE");
});

test("Trust caps total unclaimed KeyPackages per user independently of the candidate device", async (t) => {
  const { core } = await fixture(t);
  assert.equal(MAX_ACTIVE_KEY_PACKAGES_PER_USER, 256);
  const userId = "key-package-account-limit";
  const candidate = register(core, userId).device;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const insert = core.db.prepare(`INSERT INTO mls_key_packages(
    id,user_id,device_id,ciphersuite,package_hash,package_data,created_at,expires_at,claimed_at,claimed_by_user_id,claimed_by_device_id
  ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,NULL)`);

  for (let deviceIndex = 0; deviceIndex < 8; deviceIndex += 1) {
    const deviceId = insertVerifiedDevice(core, userId, now, deviceIndex + 100);
    for (let packageIndex = 0; packageIndex < 32; packageIndex += 1) {
      const bytes = crypto.randomBytes(128);
      insert.run(
        crypto.randomUUID(),
        userId,
        deviceId,
        1,
        digest(bytes),
        bytes.toString("base64"),
        now,
        expiresAt,
      );
    }
  }

  assert.equal(Number(core.db.prepare("SELECT COUNT(*) AS count FROM mls_key_packages WHERE user_id=? AND claimed_at IS NULL").get(userId).count), MAX_ACTIVE_KEY_PACKAGES_PER_USER);
  assert.equal(Number(core.db.prepare("SELECT COUNT(*) AS count FROM mls_key_packages WHERE device_id=? AND claimed_at IS NULL").get(candidate.id).count), 0);
  assert.throws(() => core.uploadKeyPackages({
    userId,
    deviceId: candidate.id,
    packages: [keyPackage(expiresAt)],
  }), (error) => error.code === "MLS_KEY_PACKAGE_LIMIT_REACHED" && error.details.userLimit === MAX_ACTIVE_KEY_PACKAGES_PER_USER);
});

test("Trust audit metadata uses an action allowlist and drops nested or arbitrary values", async (t) => {
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

test("Trust device enrollment API returns stable RATE_LIMITED with Retry-After", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-security-api-"));
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
  const agent = request.agent(instance.app);
  t.after(async () => {
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const registered = await agent.post("/api/auth/register")
    .set("X-Nexora-Client-Version", "3.2.3")
    .send({
      displayName: "Security API",
      username: `security_api_${crypto.randomBytes(4).toString("hex")}`,
      password: "SecurityApiPass123!",
    })
    .expect(201);
  const csrf = registered.body.csrfToken;

  for (let index = 0; index < 10; index += 1) {
    const response = await agent.post("/api/v4/trust/devices")
      .set("X-Nexora-Client-Version", "3.2.3")
      .set("X-Nexora-CSRF", csrf)
      .send({})
      .expect(400);
    assert.notEqual(response.body.code, "RATE_LIMITED");
  }

  const limited = await agent.post("/api/v4/trust/devices")
    .set("X-Nexora-Client-Version", "3.2.3")
    .set("X-Nexora-CSRF", csrf)
    .send({})
    .expect(429);
  assert.equal(limited.body.code, "RATE_LIMITED");
  assert.match(String(limited.headers["retry-after"] || ""), /^\d+$/);
  assert.ok(Number(limited.body.details.retryAfter) >= 1);
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

test("missed MLS commit recovery accepts a complete log and rejects scope, replay, hash and sequence violations", async () => {
  const moduleUrl = pathToFileURL(path.join(__dirname, "..", "client", "src", "crypto", "mls-recovery.mjs")).href;
  const { replayMissedCommits } = await import(moduleUrl);
  const stateHash = (epoch) => digest(`state-${epoch}`);
  const commitHash = (value) => digest(Buffer.from(value));
  const local = { epoch: 2, state: { epoch: 2 }, publicStateHash: stateHash(2) };
  const remote = { id: "group-1", conversationId: "conversation-1", epoch: 4, publicStateHash: stateHash(4) };
  const base = {
    local,
    remote,
    decodeCommit: (value) => Buffer.from(value),
    hashCommit: async (value) => digest(value),
    processCommit: async ({ state, commitBytes }) => ({
      state: { epoch: state.epoch + 1 },
      epoch: state.epoch + 1,
      publicStateHash: stateHash(state.epoch + 1),
      commitBytes,
    }),
    resolveDevice: async () => null,
  };
  const validCommits = [
    { previousEpoch: 2, epoch: 3, commit: "one", commitHash: commitHash("one"), publicStateHash: stateHash(3) },
    { previousEpoch: 3, epoch: 4, commit: "two", commitHash: commitHash("two"), publicStateHash: stateHash(4) },
  ];

  const recovered = await replayMissedCommits({ ...base, result: { group: remote, commits: validCommits } });
  assert.equal(recovered.epoch, 4);
  assert.deepEqual(recovered.state, { epoch: 4 });
  assert.equal(recovered.publicStateHash, stateHash(4));

  await assert.rejects(() => replayMissedCommits({
    ...base,
    result: { commits: validCommits },
  }), (error) => error.code === "MLS_COMMIT_SCOPE_INVALID");

  await assert.rejects(() => replayMissedCommits({
    ...base,
    result: {
      group: remote,
      commits: [
        validCommits[0],
        { previousEpoch: 3, epoch: 4, commit: "one", commitHash: commitHash("one"), publicStateHash: stateHash(4) },
      ],
    },
  }), (error) => error.code === "MLS_COMMIT_REPLAY");

  await assert.rejects(() => replayMissedCommits({
    ...base,
    result: {
      group: remote,
      commits: [{ previousEpoch: 3, epoch: 4, commit: "two", commitHash: commitHash("two"), publicStateHash: stateHash(4) }],
    },
  }), (error) => error.code === "MLS_COMMIT_SEQUENCE_INVALID");

  await assert.rejects(() => replayMissedCommits({
    ...base,
    result: {
      group: remote,
      commits: [
        { ...validCommits[0], commitHash: digest("tampered") },
        validCommits[1],
      ],
    },
  }), (error) => error.code === "MLS_COMMIT_HASH_MISMATCH");
});
