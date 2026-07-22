"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const request = require("supertest");
const { io: createSocket } = require("socket.io-client");
const { createNexoraServer } = require("../server/create-server-v31.cjs");
const { canonical, hash, proofPayload } = require("../server/trust-core.cjs");

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (["post", "put", "patch", "delete"].includes(property)) {
        return (...args) => {
          const builder = target[property](...args).set("X-Nexora-Client-Version", "3.2.0");
          const token = csrf();
          return token ? builder.set("X-Nexora-CSRF", token) : builder;
        };
      }
      if (typeof target[property] === "function") return (...args) => target[property](...args).set("X-Nexora-Client-Version", "3.2.0");
      return target[property];
    },
  });
}

function cookieFrom(response) {
  return response.headers["set-cookie"][0].split(";")[0];
}

function once(socket, event, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args.length > 1 ? args : args[0]);
    });
  });
}

function emitAck(socket, event, payload, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event} acknowledgement`)), timeoutMs);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function registerTrustDevice(core, userId, displayName) {
  const keys = keyMaterial();
  const deviceId = crypto.randomUUID();
  const credential = Buffer.from(JSON.stringify({ version: 1, userId, deviceId }), "utf8").toString("base64");
  const fingerprint = hash(canonical({ userId, identityKey: keys.identityPublic, signatureKey: keys.signaturePublic, credential }));
  const context = { deviceId, fingerprint };
  const challenge = core.createChallenge({ userId, purpose: "register_device", context });
  const values = {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    userId,
    purpose: "register_device",
    targetDeviceId: null,
    context,
  };
  const result = core.registerDevice({
    userId,
    challengeId: challenge.id,
    deviceId,
    displayName,
    identityKey: keys.identityPublic,
    signatureKey: keys.signaturePublic,
    credential,
    capabilities: ["mls-rfc9420"],
    proofSignature: sign(keys.identityPrivate, "register_device", values),
  });
  return { ...result, keys };
}

function connectSocket(baseUrl, cookie, deviceId = null) {
  return createSocket(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
    auth: { ...(deviceId ? { deviceId } : {}), clientVersion: "3.2.0" },
  });
}

test("secure realtime is scoped to verified MLS devices and revocation disconnects the target", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-trust-socket-"));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });
  const status = await instance.listen();
  const baseUrl = `http://127.0.0.1:${status.port}`;
  const sockets = [];
  context.after(async () => {
    for (const socket of sockets) socket.disconnect();
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({
    displayName: "Trust Socket User",
    username: `trust_socket_${crypto.randomBytes(4).toString("hex")}`,
    password: "TrustSocketPass123!",
  }).expect(201);
  csrf = registered.body.csrfToken;
  const userId = registered.body.user.id;
  const cookie = cookieFrom(registered);
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const conversationId = bootstrap.body.rooms.find((room) => room.slug === "general")?.conversationId;
  assert.ok(conversationId);

  const primary = registerTrustDevice(instance.trustCore, userId, "Primary");
  const pending = registerTrustDevice(instance.trustCore, userId, "Pending");
  assert.equal(primary.device.trustState, "verified");
  assert.equal(pending.device.trustState, "unverified");

  const group = instance.trustCore.createGroup({
    conversationId,
    creatorUserId: userId,
    creatorDeviceId: primary.device.id,
    groupId: crypto.randomBytes(32).toString("base64"),
    publicStateHash: crypto.randomBytes(32).toString("hex"),
    leafIndex: 0,
  }).group;
  const now = new Date().toISOString();
  instance.store.db.prepare(`INSERT INTO mls_group_members(
    group_id,user_id,device_id,leaf_index,status,joined_epoch,removed_epoch,created_at,updated_at
  ) VALUES(?,?,?,1,'active',0,NULL,?,?)`).run(group.id, userId, pending.device.id, now, now);

  const verifiedSocket = connectSocket(baseUrl, cookie, primary.device.id);
  const unverifiedSocket = connectSocket(baseUrl, cookie, pending.device.id);
  const legacySocket = connectSocket(baseUrl, cookie);
  sockets.push(verifiedSocket, unverifiedSocket, legacySocket);
  await Promise.all([
    once(verifiedSocket, "connect"),
    once(unverifiedSocket, "connect"),
    once(legacySocket, "connect"),
  ]);

  const received = { verified: 0, unverified: 0, legacy: 0 };
  verifiedSocket.on("message:new", () => { received.verified += 1; });
  unverifiedSocket.on("message:new", () => { received.unverified += 1; });
  legacySocket.on("message:new", () => { received.legacy += 1; });

  const basePayload = {
    conversationId,
    groupRecordId: group.id,
    epoch: 0,
    generation: 0,
    contentType: "text",
  };

  const legacyAttempt = await emitAck(legacySocket, "mls:message", {
    ...basePayload,
    clientId: `legacy_${crypto.randomBytes(8).toString("hex")}`,
    deviceId: primary.device.id,
    message: crypto.randomBytes(96).toString("base64"),
  });
  assert.equal(legacyAttempt.ok, false);
  assert.equal(legacyAttempt.code, "TRUST_SOCKET_DEVICE_MISMATCH");

  const unverifiedAttempt = await emitAck(unverifiedSocket, "mls:message", {
    ...basePayload,
    clientId: `unverified_${crypto.randomBytes(8).toString("hex")}`,
    deviceId: pending.device.id,
    message: crypto.randomBytes(96).toString("base64"),
  });
  assert.equal(unverifiedAttempt.ok, false);
  assert.equal(unverifiedAttempt.code, "TRUST_SOCKET_DEVICE_MISMATCH");

  const mismatchAttempt = await emitAck(verifiedSocket, "mls:message", {
    ...basePayload,
    clientId: `mismatch_${crypto.randomBytes(8).toString("hex")}`,
    deviceId: pending.device.id,
    message: crypto.randomBytes(96).toString("base64"),
  });
  assert.equal(mismatchAttempt.ok, false);
  assert.equal(mismatchAttempt.code, "TRUST_SOCKET_DEVICE_MISMATCH");

  const created = await emitAck(verifiedSocket, "mls:message", {
    ...basePayload,
    clientId: `verified_${crypto.randomBytes(8).toString("hex")}`,
    deviceId: primary.device.id,
    message: crypto.randomBytes(96).toString("base64"),
  });
  assert.equal(created.ok, true);
  await delay(100);
  assert.deepEqual(received, { verified: 1, unverified: 0, legacy: 0 });

  const revokeContext = {
    actorDeviceId: primary.device.id,
    targetDeviceId: primary.device.id,
    targetFingerprint: primary.device.fingerprint,
  };
  const challenge = instance.trustCore.createChallenge({
    userId,
    purpose: "revoke_device",
    targetDeviceId: primary.device.id,
    context: revokeContext,
  });
  const revokeValues = {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    userId,
    purpose: "revoke_device",
    targetDeviceId: primary.device.id,
    context: revokeContext,
  };
  const disconnected = once(verifiedSocket, "disconnect");
  await agent.delete(`/api/v4/trust/devices/${primary.device.id}`)
    .set("X-Nexora-Device-ID", primary.device.id)
    .send({
      challengeId: challenge.id,
      proofSignature: sign(primary.keys.identityPrivate, "revoke_device", revokeValues),
    })
    .expect(200);
  await disconnected;
  assert.equal(verifiedSocket.connected, false);
  assert.equal(unverifiedSocket.connected, true);
  assert.equal(legacySocket.connected, true);
  assert.equal(instance.trustCore.getDevice(primary.device.id).status, "revoked");
});
