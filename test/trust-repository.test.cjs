"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { createSchema8 } = require("../server/trust-schema8.cjs");
const {
  TrustRepository,
  verifyInclusion,
} = require("../server/trust-repository.cjs");

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function deviceCredential(accountId, deviceId) {
  return b64(JSON.stringify({ accountId, deviceId }));
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('schema_version','8');");
  createSchema8(db);
  const state = { meta: { schemaVersion: 8 } };
  const store = {
    db,
    state,
    read(selector = (value) => value) { return selector(this.state); },
  };
  const repository = new TrustRepository({ store, clock: () => new Date("2026-07-21T21:00:00.000Z") });
  return { db, repository };
}

function register(repository, userId, deviceId) {
  return repository.registerDevice({
    id: deviceId,
    userId,
    label: deviceId,
    credentialIdentity: deviceCredential(userId, deviceId),
    signatureKey: crypto.randomBytes(32).toString("base64url"),
  });
}

test("key package is claimed atomically and commit exposes Welcome only after epoch advance", () => {
  const { db, repository } = fixture();
  try {
    register(repository, "user-alice", "device-alice-desktop");
    register(repository, "user-bob", "device-bob-phone");
    repository.publishKeyPackage({
      id: "key-package-bob-0001",
      userId: "user-bob",
      deviceId: "device-bob-phone",
      packageData: b64(crypto.randomBytes(96)),
      expiresAt: "2026-08-21T21:00:00.000Z",
    });
    repository.createGroup({
      id: "group-general-0001",
      conversationId: "conversation-general-0001",
      userId: "user-alice",
      creatorDeviceId: "device-alice-desktop",
    });
    const claimed = repository.claimKeyPackage({
      targetUserId: "user-bob",
      groupId: "group-general-0001",
      requesterDeviceId: "device-alice-desktop",
      requesterUserId: "user-alice",
    });
    assert.equal(claimed.status, "claimed");
    assert.throws(() => repository.claimKeyPackage({
      targetUserId: "user-bob",
      groupId: "group-general-0001",
      requesterDeviceId: "device-alice-desktop",
      requesterUserId: "user-alice",
    }), (error) => error.code === "TRUST_KEY_PACKAGE_UNAVAILABLE");

    const result = repository.submitCommit({
      id: "commit-add-bob-0001",
      groupId: "group-general-0001",
      senderDeviceId: "device-alice-desktop",
      senderUserId: "user-alice",
      targetEpoch: 1,
      idempotencyKey: "commit-add-bob-idempotency-0001",
      payloadData: b64(crypto.randomBytes(180)),
      mutations: [{
        type: "add",
        deviceId: "device-bob-phone",
        keyPackageId: claimed.id,
        welcomeData: b64(crypto.randomBytes(128)),
        ratchetTreeData: b64(crypto.randomBytes(256)),
      }],
    });
    assert.equal(result.group.epoch, 1);
    assert.equal(result.envelope.type, "commit");
    assert.equal(repository.listWelcomes("device-bob-phone", "user-bob").length, 1);
    assert.equal(repository.groupStatus("group-general-0001", "device-bob-phone", "user-bob").epoch, 1);
  } finally {
    db.close();
  }
});

test("application envelopes are monotonic, idempotent and scoped to the current epoch", () => {
  const { db, repository } = fixture();
  try {
    register(repository, "user-alice", "device-alice-desktop");
    repository.createGroup({
      id: "group-general-0002",
      conversationId: "conversation-general-0002",
      userId: "user-alice",
      creatorDeviceId: "device-alice-desktop",
    });
    const payload = b64(crypto.randomBytes(80));
    const first = repository.submitEnvelope({
      id: "envelope-alice-0001",
      groupId: "group-general-0002",
      senderDeviceId: "device-alice-desktop",
      senderUserId: "user-alice",
      epoch: 0,
      idempotencyKey: "envelope-idempotency-0001",
      payloadData: payload,
    });
    const duplicate = repository.submitEnvelope({
      id: "envelope-alice-0002",
      groupId: "group-general-0002",
      senderDeviceId: "device-alice-desktop",
      senderUserId: "user-alice",
      epoch: 0,
      idempotencyKey: "envelope-idempotency-0001",
      payloadData: payload,
    });
    assert.equal(first.id, duplicate.id);
    assert.equal(first.sequence, 1);
    assert.throws(() => repository.submitEnvelope({
      id: "envelope-alice-0003",
      groupId: "group-general-0002",
      senderDeviceId: "device-alice-desktop",
      senderUserId: "user-alice",
      epoch: 0,
      idempotencyKey: "envelope-idempotency-0001",
      payloadData: b64(crypto.randomBytes(80)),
    }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
    assert.throws(() => repository.submitEnvelope({
      id: "envelope-alice-0004",
      groupId: "group-general-0002",
      senderDeviceId: "device-alice-desktop",
      senderUserId: "user-alice",
      epoch: 3,
      idempotencyKey: "envelope-idempotency-0004",
      payloadData: payload,
    }), (error) => error.code === "TRUST_EPOCH_CONFLICT");
  } finally {
    db.close();
  }
});

test("device revocation immediately denies Delivery Service access", () => {
  const { db, repository } = fixture();
  try {
    register(repository, "user-alice", "device-alice-desktop");
    repository.createGroup({
      id: "group-general-0003",
      conversationId: "conversation-general-0003",
      userId: "user-alice",
      creatorDeviceId: "device-alice-desktop",
    });
    repository.revokeDevice("device-alice-desktop", "user-alice", "device-alice-desktop");
    assert.throws(() => repository.listEnvelopes({
      groupId: "group-general-0003",
      deviceId: "device-alice-desktop",
      userId: "user-alice",
    }), (error) => error.code === "TRUST_DEVICE_REVOKED");
  } finally {
    db.close();
  }
});

test("transparency log returns a verifiable Merkle inclusion proof", () => {
  const { db, repository } = fixture();
  try {
    register(repository, "user-alice", "device-alice-desktop");
    register(repository, "user-bob", "device-bob-phone");
    const root = repository.transparencyRoot();
    const proof = repository.transparencyProof(1);
    assert.equal(root.size, 2);
    assert.equal(proof.root, root.root);
    assert.equal(proof.verified, true);
    assert.equal(verifyInclusion({ leafHash: proof.entry.entryHash, proof: proof.proof, root: proof.root }), true);
  } finally {
    db.close();
  }
});
