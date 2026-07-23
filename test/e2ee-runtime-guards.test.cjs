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
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args)
          .set("X-Nexora-Client-Version", "3.4.0")
          .set("X-Nexora-Device-ID", "legacy-runtime-regression-device")
          .set("X-Nexora-Device-Name", "Legacy runtime regression")
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

function activateLegacyGroup(instance, conversationId) {
  const now = new Date().toISOString();
  const groupRecordId = crypto.randomUUID();
  instance.store.db.prepare(`INSERT INTO mls_groups(
    id,conversation_id,group_id,ciphersuite,epoch,status,creator_device_id,public_state_hash,created_at,updated_at
  ) VALUES(?,?,?,?,?,'active',?,?,?,?)`).run(
    groupRecordId,
    conversationId,
    crypto.randomBytes(24).toString("base64url"),
    1,
    0,
    crypto.randomUUID(),
    crypto.createHash("sha256").update(`group:${conversationId}`).digest("hex"),
    now,
    now,
  );
  return groupRecordId;
}

function assertLegacyReadOnly(response) {
  assert.equal(response.body.ok, false);
  assert.equal(response.body.code, "LEGACY_READ_ONLY");
  assert.match(response.body.requestId, /^[A-Za-z0-9_.:-]{8,128}$/);
}

test("every exercised legacy secure write path is terminal read-only and stores no plaintext", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-legacy-runtime-guards-"));
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
  let csrf = "";
  const rawAgent = request.agent(instance.app);
  const agent = browserAgent(rawAgent, () => csrf);
  let socket = null;

  context.after(async () => {
    socket?.disconnect();
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const registered = await agent.post("/api/auth/register").send({
    displayName: "Legacy Runtime Guard",
    username: `legacy_guard_${crypto.randomBytes(4).toString("hex")}`,
    password: "LegacyRuntimeGuard123!",
  }).expect(201);
  csrf = registered.body.csrfToken;
  const cookie = cookieFrom(registered);

  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  assert.ok(general?.conversationId);
  const conversationId = general.conversationId;

  const bot = await agent.post(`/api/rooms/${general.id}/bots`).send({
    displayName: "Legacy Guard Bot",
    username: `legacy_bot_${crypto.randomBytes(3).toString("hex")}`,
    description: "Direct API retirement regression bot",
  }).expect(201);
  const token = await agent.post(`/api/bots/${bot.body.bot.id}/tokens`).send({
    name: "Legacy guard token",
    scopes: ["messages:write"],
  }).expect(201);
  const botToken = token.body.token.value;

  const resumable = await agent.post(`/api/conversations/${conversationId}/uploads`).send({
    name: "queued.txt",
    mimeType: "text/plain",
    kind: "file",
    size: 4,
  }).expect(201);
  const uploadId = resumable.body.upload.id;

  socket = createSocket(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
    auth: { clientVersion: "3.4.0" },
  });
  await once(socket, "connect");

  const source = await emitAck(socket, "message:send", {
    conversationId,
    text: "ordinary source before legacy activation",
    clientId: `source_${crypto.randomBytes(8).toString("hex")}`,
  });
  assert.equal(source.ok, true);
  activateLegacyGroup(instance, conversationId);

  const blockedSend = await emitAck(socket, "message:send", {
    conversationId,
    text: "plaintext downgrade attempt",
    clientId: `blocked_${crypto.randomBytes(8).toString("hex")}`,
  });
  assert.equal(blockedSend.ok, false);
  assert.equal(blockedSend.code, "LEGACY_READ_ONLY");

  const blockedForward = await emitAck(socket, "message:forward", {
    messageId: source.message.id,
    conversationId,
    clientId: `forward_${crypto.randomBytes(8).toString("hex")}`,
  });
  assert.equal(blockedForward.ok, false);
  assert.equal(blockedForward.code, "LEGACY_READ_ONLY");

  assertLegacyReadOnly(await agent.put(`/api/v3/drafts/${conversationId}`).send({ text: "server plaintext draft" }).expect(410));
  assertLegacyReadOnly(await agent.post("/api/messages/scheduled").send({
    conversationId,
    text: "scheduled plaintext",
    scheduledAt: new Date(Date.now() + 60_000).toISOString(),
  }).expect(410));
  assertLegacyReadOnly(await agent.post(`/api/conversations/${conversationId}/polls`).send({
    question: "Plaintext poll?",
    options: ["No", "Never"],
  }).expect(410));

  const incomingDir = path.join(directory, "uploads", ".incoming");
  const beforeMultipart = (await fs.readdir(incomingDir)).sort();
  const multipart = await agent.post(`/api/conversations/${conversationId}/upload`)
    .field("kind", "file")
    .attach("file", Buffer.from("blocked"), { filename: "blocked.txt", contentType: "text/plain" })
    .expect(410);
  assertLegacyReadOnly(multipart);
  assert.deepEqual((await fs.readdir(incomingDir)).sort(), beforeMultipart, "rejected multipart upload must remove temporary data");

  assertLegacyReadOnly(await agent.post(`/api/conversations/${conversationId}/uploads`).send({
    name: "blocked.bin",
    mimeType: "application/octet-stream",
    kind: "file",
    size: 4,
  }).expect(410));

  const chunk = Buffer.from("test");
  assertLegacyReadOnly(await agent.put(`/api/uploads/${uploadId}/chunks/0`)
    .set("Content-Type", "application/octet-stream")
    .set("X-Chunk-SHA256", crypto.createHash("sha256").update(chunk).digest("hex"))
    .send(chunk)
    .expect(410));
  assertLegacyReadOnly(await agent.post(`/api/uploads/${uploadId}/complete`).send({ caption: "plaintext caption" }).expect(410));
  const cancelledUpload = await agent.get(`/api/uploads/${uploadId}`).expect(200);
  assert.equal(cancelledUpload.body.upload.status, "cancelled");

  const blockedBot = await request(instance.app).post("/api/v3/bot/messages")
    .set("Authorization", `Bearer ${botToken}`)
    .set("X-Nexora-Client-Version", "3.4.0")
    .send({ conversationId, text: "bot plaintext downgrade", clientId: `bot_${crypto.randomBytes(8).toString("hex")}` })
    .expect(410);
  assertLegacyReadOnly(blockedBot);

  const leaked = instance.store.read((state) => state.messages.filter((message) =>
    message.conversationId === conversationId
    && ["plaintext downgrade attempt", "server plaintext draft", "scheduled plaintext", "Plaintext poll?", "bot plaintext downgrade"].includes(message.text),
  ));
  assert.deepEqual(leaked, [], "rejected plaintext content must never reach persistent messages");
});
