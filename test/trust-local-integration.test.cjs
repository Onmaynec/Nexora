"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const request = require("supertest");
const { createNexoraServerV32 } = require("../server/create-server-v32.cjs");
const { version } = require("../package.json");

let instance;
let directory;
let aliceAgent;
let bobAgent;
let aliceCsrf = "";
let bobCsrf = "";
let alice;
let bob;
const conversationId = "conversation-trust-integration-0001";
const groupId = "group-trust-integration-0001";
const aliceDeviceId = "device-alice-integration-0001";
const bobDeviceId = "device-bob-integration-0001";

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function browserAgent(raw, csrf) {
  return new Proxy(raw, {
    get(target, property) {
      if (["post", "put", "patch", "delete"].includes(property)) {
        return (...args) => target[property](...args)
          .set("X-Nexora-Client-Version", version)
          .set("X-Nexora-CSRF", csrf());
      }
      if (typeof target[property] === "function") {
        return (...args) => target[property](...args).set("X-Nexora-Client-Version", version);
      }
      return target[property];
    },
  });
}

function devicePayload(userId, deviceId) {
  return {
    id: deviceId,
    label: deviceId,
    credentialIdentity: b64(JSON.stringify({ accountId: userId, deviceId })),
    signatureKey: crypto.randomBytes(32).toString("base64url"),
  };
}

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-trust-api-"));
  instance = await createNexoraServerV32({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pulseMode: "disabled",
  });
  await instance.listen();
  aliceAgent = browserAgent(request.agent(instance.app), () => aliceCsrf);
  bobAgent = browserAgent(request.agent(instance.app), () => bobCsrf);
  const aliceRegistration = await aliceAgent.post("/api/auth/register").send({
    displayName: "Alice Trust",
    username: "alice-trust",
    password: "StrongPass123!",
  }).expect(201);
  aliceCsrf = aliceRegistration.body.csrfToken;
  alice = aliceRegistration.body.user;
  const bobRegistration = await bobAgent.post("/api/auth/register").send({
    displayName: "Bob Trust",
    username: "bob-trust",
    password: "StrongPass123!",
  }).expect(201);
  bobCsrf = bobRegistration.body.csrfToken;
  bob = bobRegistration.body.user;
  await instance.store.mutate((state) => {
    state.conversations.push({
      id: conversationId,
      type: "dm",
      userIds: [alice.id, bob.id],
      createdAt: "2026-07-21T21:00:00.000Z",
    });
  });
});

after(async () => {
  await instance.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("schema 8 and Trust status are active while unauthenticated requests are denied", async () => {
  assert.equal(instance.store.stats().schemaVersion, 8);
  assert.equal(instance.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value, "8");
  await request(instance.app).get("/api/v4/trust/status").expect(401)
    .expect((response) => assert.equal(response.body.code, "AUTH_REQUIRED"));
  const status = await aliceAgent.get("/api/v4/trust/status").expect(200);
  assert.equal(status.body.protocol, "MLS_1_0");
  assert.equal(status.body.serverDecrypts, false);
  assert.equal(status.body.plaintextAccepted, false);
});

test("device registration and atomic key-package claim are scoped to Local Accounts", async () => {
  await aliceAgent.post("/api/v4/trust/devices").send(devicePayload(alice.id, aliceDeviceId)).expect(201);
  await bobAgent.post("/api/v4/trust/devices").send(devicePayload(bob.id, bobDeviceId)).expect(201);
  await bobAgent.post("/api/v4/trust/key-packages").send({
    id: "key-package-bob-integration-0001",
    deviceId: bobDeviceId,
    packageData: b64(crypto.randomBytes(96)),
    expiresAt: "2026-08-21T21:00:00.000Z",
  }).expect(201);
  await aliceAgent.post("/api/v4/trust/groups").send({
    id: groupId,
    conversationId,
    creatorDeviceId: aliceDeviceId,
  }).expect(201);
  const claimed = await aliceAgent.post("/api/v4/trust/key-packages/claim").send({
    targetUserId: bob.id,
    groupId,
    requesterDeviceId: aliceDeviceId,
  }).expect(200);
  assert.equal(claimed.body.keyPackage.deviceId, bobDeviceId);
  await aliceAgent.post("/api/v4/trust/key-packages/claim").send({
    targetUserId: bob.id,
    groupId,
    requesterDeviceId: aliceDeviceId,
  }).expect(409).expect((response) => assert.equal(response.body.code, "TRUST_KEY_PACKAGE_UNAVAILABLE"));
});

test("commit advances one epoch before Bob can fetch Welcome", async () => {
  const commit = await aliceAgent.post(`/api/v4/trust/groups/${groupId}/commits`)
    .set("Idempotency-Key", "commit-integration-idempotency-0001")
    .send({
      id: "commit-integration-0001",
      senderDeviceId: aliceDeviceId,
      targetEpoch: 1,
      payloadData: b64(crypto.randomBytes(160)),
      mutations: [{
        type: "add",
        deviceId: bobDeviceId,
        keyPackageId: "key-package-bob-integration-0001",
        welcomeData: b64(crypto.randomBytes(120)),
        ratchetTreeData: b64(crypto.randomBytes(220)),
      }],
    }).expect(201);
  assert.equal(commit.body.group.epoch, 1);
  const welcomes = await bobAgent.get(`/api/v4/trust/devices/${bobDeviceId}/welcomes`).expect(200);
  assert.equal(welcomes.body.welcomes.length, 1);
  assert.equal(welcomes.body.welcomes[0].commitId, "commit-integration-0001");
});

test("opaque envelope delivery rejects plaintext and enforces epoch/idempotency", async () => {
  await aliceAgent.post(`/api/v4/trust/groups/${groupId}/envelopes`)
    .set("Idempotency-Key", "envelope-plaintext-attempt-0001")
    .send({
      id: "envelope-plaintext-attempt-0001",
      senderDeviceId: aliceDeviceId,
      epoch: 1,
      type: "application",
      plaintext: "server must never see this",
      payloadData: b64(crypto.randomBytes(96)),
    }).expect(400).expect((response) => assert.equal(response.body.code, "TRUST_PLAINTEXT_REJECTED"));

  const payloadData = b64(crypto.randomBytes(96));
  const created = await aliceAgent.post(`/api/v4/trust/groups/${groupId}/envelopes`)
    .set("Idempotency-Key", "envelope-integration-idempotency-0001")
    .send({
      id: "envelope-integration-0001",
      senderDeviceId: aliceDeviceId,
      epoch: 1,
      type: "application",
      payloadData,
    }).expect(201);
  assert.equal(created.body.envelope.sequence, 2);
  const duplicate = await aliceAgent.post(`/api/v4/trust/groups/${groupId}/envelopes`)
    .set("Idempotency-Key", "envelope-integration-idempotency-0001")
    .send({
      id: "envelope-integration-0002",
      senderDeviceId: aliceDeviceId,
      epoch: 1,
      type: "application",
      payloadData,
    }).expect(201);
  assert.equal(duplicate.body.envelope.id, "envelope-integration-0001");
  const received = await bobAgent.get(`/api/v4/trust/groups/${groupId}/envelopes?deviceId=${encodeURIComponent(bobDeviceId)}&after=0`).expect(200);
  assert.equal(received.body.envelopes.some((item) => item.id === "envelope-integration-0001"), true);
});

test("device revoke blocks further delivery and transparency proof remains verifiable", async () => {
  await bobAgent.delete(`/api/v4/trust/devices/${bobDeviceId}`).send({}).expect(200);
  await bobAgent.get(`/api/v4/trust/groups/${groupId}/envelopes?deviceId=${encodeURIComponent(bobDeviceId)}&after=0`)
    .expect(403).expect((response) => assert.equal(response.body.code, "TRUST_DEVICE_REVOKED"));
  const root = await aliceAgent.get("/api/v4/trust/transparency/root").expect(200);
  assert.ok(root.body.root.size >= 5);
  const proof = await aliceAgent.get("/api/v4/trust/transparency/proof/1").expect(200);
  assert.equal(proof.body.verified, true);
  assert.equal(proof.body.root, root.body.root.root);
});
