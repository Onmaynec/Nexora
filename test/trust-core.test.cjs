"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { applySchema8Migration } = require("../server/trust-schema8.cjs");
const { TrustCore, TrustCoreError, canonical, hash, proofPayload } = require("../server/trust-core.cjs");

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

function keyMaterial() {
  const identity = crypto.generateKeyPairSync("ed25519");
  const signature = crypto.generateKeyPairSync("ed25519");
  return {
    identityPrivate: identity.privateKey,
    identityPublic: identity.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
    signaturePublic: signature.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64"),
  };
}

function sign(privateKey, purpose, values) {
  return crypto.sign(null, proofPayload(purpose, values), privateKey).toString("base64");
}

function registration(core, userId, label = "Device") {
  const keys = keyMaterial();
  const deviceId = crypto.randomUUID();
  const credential = Buffer.from(JSON.stringify({ version: 1, userId, deviceId }), "utf8").toString("base64");
  const fingerprint = hash(canonical({ userId, identityKey: keys.identityPublic, signatureKey: keys.signaturePublic, credential }));
  const context = { deviceId, fingerprint };
  const challenge = core.createChallenge({ userId, purpose: "register_device", context });
  const values = { challengeId: challenge.id, nonce: challenge.nonce, userId, purpose: "register_device", targetDeviceId: null, context };
  const result = core.registerDevice({
    userId,
    challengeId: challenge.id,
    deviceId,
    displayName: label,
    identityKey: keys.identityPublic,
    signatureKey: keys.signaturePublic,
    credential,
    capabilities: ["mls-rfc9420"],
    proofSignature: sign(keys.identityPrivate, "register_device", values),
  });
  return { ...result, keys };
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-trust-core-"));
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

test("device registration proves key possession and subsequent devices require verification", async (t) => {
  const { core } = await fixture(t);
  const first = registration(core, "user-1", "Primary");
  const second = registration(core, "user-1", "Laptop");
  assert.equal(first.device.trustState, "verified");
  assert.equal(second.device.trustState, "unverified");

  assert.throws(() => core.requireDevice("user-1", second.device.id, { verified: true }), (error) => error.code === "TRUST_DEVICE_UNVERIFIED");
  const context = {
    actorDeviceId: first.device.id,
    targetDeviceId: second.device.id,
    targetFingerprint: second.device.fingerprint,
  };
  const challenge = core.createChallenge({ userId: "user-1", purpose: "verify_device", targetDeviceId: second.device.id, context });
  const values = {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    userId: "user-1",
    purpose: "verify_device",
    targetDeviceId: second.device.id,
    context,
  };
  const verified = core.verifyDevice({
    userId: "user-1",
    actorDeviceId: first.device.id,
    targetDeviceId: second.device.id,
    challengeId: challenge.id,
    proofSignature: sign(first.keys.identityPrivate, "verify_device", values),
  });
  assert.equal(verified.trustState, "verified");
  assert.equal(core.listAudit("user-1").some((entry) => entry.action === "device.verified"), true);
});

test("a Trust challenge is single-use and scoped to the exact operation", async (t) => {
  const { core } = await fixture(t);
  const keys = keyMaterial();
  const deviceId = crypto.randomUUID();
  const credential = Buffer.from(JSON.stringify({ version: 1, userId: "user-1", deviceId })).toString("base64");
  const fingerprint = hash(canonical({ userId: "user-1", identityKey: keys.identityPublic, signatureKey: keys.signaturePublic, credential }));
  const context = { deviceId, fingerprint };
  const challenge = core.createChallenge({ userId: "user-1", purpose: "register_device", context });
  const values = { challengeId: challenge.id, nonce: challenge.nonce, userId: "user-1", purpose: "register_device", targetDeviceId: null, context };
  const input = {
    userId: "user-1", challengeId: challenge.id, deviceId, displayName: "Primary", identityKey: keys.identityPublic,
    signatureKey: keys.signaturePublic, credential, capabilities: [], proofSignature: sign(keys.identityPrivate, "register_device", values),
  };
  core.registerDevice(input);
  assert.throws(() => core.registerDevice(input), (error) => error.code === "TRUST_CHALLENGE_INVALID");
});

test("MLS KeyPackage claims are atomic and one-time", async (t) => {
  const { core } = await fixture(t);
  const target = registration(core, "user-1", "Target");
  const requester = registration(core, "user-2", "Requester");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const keyPackage = crypto.randomBytes(128).toString("base64");
  const uploaded = core.uploadKeyPackages({ userId: "user-1", deviceId: target.device.id, packages: [{ ciphersuite: 1, keyPackage, expiresAt }] });
  assert.equal(uploaded.length, 1);
  const claimed = core.claimKeyPackage({ targetUserId: "user-1", requesterUserId: "user-2", requesterDeviceId: requester.device.id });
  assert.equal(claimed.deviceId, target.device.id);
  assert.equal(claimed.keyPackage, keyPackage);
  assert.throws(
    () => core.claimKeyPackage({ targetUserId: "user-1", requesterUserId: "user-2", requesterDeviceId: requester.device.id }),
    (error) => error.code === "MLS_KEY_PACKAGE_UNAVAILABLE",
  );
});

test("MLS group enforces monotonic epochs, signed commits and ciphertext replay protection", async (t) => {
  const { core } = await fixture(t);
  const alice = registration(core, "alice", "Alice");
  const bob = registration(core, "bob", "Bob");
  const created = core.createGroup({
    conversationId: "conversation-1",
    creatorUserId: "alice",
    creatorDeviceId: alice.device.id,
    groupId: crypto.randomBytes(32).toString("base64"),
    publicStateHash: crypto.randomBytes(32).toString("hex"),
    leafIndex: 0,
  });
  assert.equal(created.group.epoch, 0);

  const commit = crypto.randomBytes(128);
  const commitHash = hash(commit);
  const publicStateHash = crypto.randomBytes(32).toString("hex");
  const addedDevices = [{ userId: "bob", deviceId: bob.device.id, leafIndex: 1 }];
  const proofValues = {
    groupRecordId: created.group.id,
    actorDeviceId: alice.device.id,
    previousEpoch: 0,
    epoch: 1,
    commitHash,
    publicStateHash,
    addedDevices,
    removedDeviceIds: [],
  };
  const result = core.recordCommit({
    groupRecordId: created.group.id,
    actorUserId: "alice",
    actorDeviceId: alice.device.id,
    previousEpoch: 0,
    epoch: 1,
    commit: commit.toString("base64"),
    publicStateHash,
    addedDevices,
    removedDeviceIds: [],
    welcomes: [{ targetDeviceId: bob.device.id, welcome: crypto.randomBytes(128).toString("base64") }],
    proofSignature: sign(alice.keys.identityPrivate, "mls_commit", proofValues),
  });
  assert.equal(result.group.epoch, 1);
  const welcome = core.claimWelcome({ userId: "bob", deviceId: bob.device.id });
  assert.equal(welcome.epoch, 1);
  assert.equal(core.claimWelcome({ userId: "bob", deviceId: bob.device.id }), null);

  const ciphertext = crypto.randomBytes(128).toString("base64");
  const reserved = core.reserveMessage({
    groupRecordId: created.group.id,
    conversationId: "conversation-1",
    epoch: 1,
    senderUserId: "bob",
    senderDeviceId: bob.device.id,
    message: ciphertext,
  });
  assert.equal(reserved.ciphertext, ciphertext);
  assert.throws(() => core.reserveMessage({
    groupRecordId: created.group.id,
    conversationId: "conversation-1",
    epoch: 1,
    senderUserId: "bob",
    senderDeviceId: bob.device.id,
    message: ciphertext,
  }), (error) => error.code === "MLS_MESSAGE_REPLAY");

  assert.throws(() => core.recordCommit({
    groupRecordId: created.group.id,
    actorUserId: "alice",
    actorDeviceId: alice.device.id,
    previousEpoch: 0,
    epoch: 1,
    commit: crypto.randomBytes(128).toString("base64"),
    publicStateHash: crypto.randomBytes(32).toString("hex"),
    addedDevices: [], removedDeviceIds: [], welcomes: [], proofSignature: crypto.randomBytes(64).toString("base64"),
  }), (error) => ["MLS_COMMIT_PROOF_INVALID", "MLS_EPOCH_CONFLICT"].includes(error.code));
});

test("revoked devices immediately lose MLS delivery rights", async (t) => {
  const { core } = await fixture(t);
  const device = registration(core, "user-1", "Primary");
  const group = core.createGroup({
    conversationId: "conversation-1", creatorUserId: "user-1", creatorDeviceId: device.device.id,
    groupId: crypto.randomBytes(32).toString("base64"), publicStateHash: crypto.randomBytes(32).toString("hex"),
  }).group;
  const context = { actorDeviceId: device.device.id, targetDeviceId: device.device.id, targetFingerprint: device.device.fingerprint };
  const challenge = core.createChallenge({ userId: "user-1", purpose: "revoke_device", targetDeviceId: device.device.id, context });
  const values = { challengeId: challenge.id, nonce: challenge.nonce, userId: "user-1", purpose: "revoke_device", targetDeviceId: device.device.id, context };
  core.revokeDevice({
    userId: "user-1", actorDeviceId: device.device.id, targetDeviceId: device.device.id,
    challengeId: challenge.id, proofSignature: sign(device.keys.identityPrivate, "revoke_device", values),
  });
  assert.throws(() => core.reserveMessage({
    groupRecordId: group.id, conversationId: "conversation-1", epoch: 0,
    senderUserId: "user-1", senderDeviceId: device.device.id, message: crypto.randomBytes(128).toString("base64"),
  }), (error) => error.code === "TRUST_DEVICE_REQUIRED");
});
