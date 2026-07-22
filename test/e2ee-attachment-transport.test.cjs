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

function cookieFrom(response) {
  return response.headers["set-cookie"][0].split(";")[0];
}

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

function encryptedFixture(plaintext = crypto.randomBytes(64)) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    plaintext,
    ciphertext,
    sha256: crypto.createHash("sha256").update(ciphertext).digest("hex"),
  };
}

function installVerifiedDeviceAndGroup(instance, { userId, conversationId }) {
  const now = new Date().toISOString();
  const deviceId = crypto.randomUUID();
  const groupRecordId = crypto.randomUUID();
  instance.store.db.prepare(`INSERT INTO trust_devices(
    id,user_id,display_name,identity_key,signature_key,credential,fingerprint,status,trust_state,
    created_at,updated_at,last_seen_at,verified_at,revoked_at,data
  ) VALUES(?,?,?,?,?,?,?,'active','verified',?,?,?,?,NULL,?)`).run(
    deviceId,
    userId,
    "Transport Test Device",
    crypto.randomBytes(32).toString("base64"),
    crypto.randomBytes(32).toString("base64"),
    Buffer.from(JSON.stringify({ version: 1, userId, deviceId })).toString("base64"),
    crypto.randomBytes(32).toString("hex"),
    now,
    now,
    now,
    now,
    JSON.stringify({ capabilities: ["mls-rfc9420"] }),
  );
  instance.store.db.prepare(`INSERT INTO mls_groups(
    id,conversation_id,group_id,ciphersuite,epoch,status,creator_device_id,public_state_hash,created_at,updated_at
  ) VALUES(?,?,?,?,0,'active',?,?,?,?)`).run(
    groupRecordId,
    conversationId,
    crypto.randomBytes(32).toString("base64"),
    1,
    deviceId,
    crypto.randomBytes(32).toString("hex"),
    now,
    now,
  );
  instance.store.db.prepare(`INSERT INTO mls_group_members(
    group_id,user_id,device_id,leaf_index,status,joined_epoch,removed_epoch,created_at,updated_at
  ) VALUES(?,?,?,0,'active',0,NULL,?,?)`).run(groupRecordId, userId, deviceId, now, now);
  return { deviceId, groupRecordId };
}

test("mls:message atomically claims an opaque attachment and releases failed reservations", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-e2ee-attachment-transport-"));
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
  let socket = null;
  context.after(async () => {
    socket?.disconnect();
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({
    displayName: "MLS Attachment Sender",
    username: `mls_attachment_${crypto.randomBytes(4).toString("hex")}`,
    password: "MlsAttachmentPass123!",
  }).expect(201);
  csrf = registered.body.csrfToken;
  const userId = registered.body.user.id;
  const cookie = cookieFrom(registered);
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  assert.ok(general?.conversationId);
  const { deviceId, groupRecordId } = installVerifiedDeviceAndGroup(instance, { userId, conversationId: general.conversationId });

  const attachmentId = crypto.randomUUID();
  const fixture = encryptedFixture();
  await agent.post(`/api/v4/e2ee/conversations/${general.conversationId}/attachments`)
    .set("Content-Type", "application/octet-stream")
    .set("X-Nexora-Attachment-ID", attachmentId)
    .set("X-Nexora-Ciphertext-SHA256", fixture.sha256)
    .set("X-Nexora-Plaintext-Size", String(fixture.plaintext.length))
    .send(fixture.ciphertext)
    .expect(201);

  socket = createSocket(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
    auth: { deviceId, clientVersion: "3.2.0" },
  });
  await once(socket, "connect");

  const firstCiphertext = crypto.randomBytes(96);
  const firstPayload = {
    conversationId: general.conversationId,
    clientId: `attachment_${crypto.randomBytes(8).toString("hex")}`,
    deviceId,
    groupRecordId,
    epoch: 0,
    generation: 0,
    contentType: "attachment",
    attachmentId,
    message: firstCiphertext.toString("base64"),
  };
  const created = await emitAck(socket, "mls:message", firstPayload);
  assert.equal(created.ok, true);
  assert.equal(created.duplicate, false);
  assert.equal(created.message.file.id, attachmentId);
  assert.equal(created.message.file.kind, "encrypted");
  assert.equal(created.message.file.ciphertextSha256, fixture.sha256);
  assert.equal(created.message.text, "");

  const snapshot = instance.store.read();
  const file = snapshot.files.find((item) => item.id === attachmentId);
  const message = snapshot.messages.find((item) => item.id === created.message.id);
  assert.equal(file.pendingE2ee, false);
  assert.equal(file.messageId, message.id);
  assert.ok(file.claimedAt);
  assert.equal(message.fileId, attachmentId);
  assert.equal(message.type, "encrypted");
  assert.equal(message.text, "");

  const downloaded = await agent.get(`/api/files/${attachmentId}`).expect(200);
  assert.deepEqual(downloaded.body, fixture.ciphertext);

  const duplicate = await emitAck(socket, "mls:message", firstPayload);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.message.id, created.message.id);

  const rejectedCiphertext = crypto.randomBytes(96);
  const rejectedHash = crypto.createHash("sha256").update(rejectedCiphertext).digest("hex");
  const rejected = await emitAck(socket, "mls:message", {
    ...firstPayload,
    clientId: `reuse_${crypto.randomBytes(8).toString("hex")}`,
    message: rejectedCiphertext.toString("base64"),
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "E2EE_ATTACHMENT_ALREADY_CLAIMED");
  assert.equal(Number(instance.store.db.prepare("SELECT COUNT(*) AS count FROM mls_replay_cache WHERE message_hash=?").get(rejectedHash).count), 0);
  assert.equal(instance.store.read((state) => state.messages.filter((item) => item.fileId === attachmentId).length), 1);
});
