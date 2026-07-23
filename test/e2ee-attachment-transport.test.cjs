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

test("retired MLS transport rejects ciphertext writes without reserving files, messages or replay records", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-retired-mls-transport-"));
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

  const deviceId = `transport-${crypto.randomUUID()}`;
  const agent = request.agent(instance.app);
  const registered = await agent.post("/api/auth/register")
    .set("X-Nexora-Client-Version", "3.4.0")
    .set("X-Nexora-Device-ID", deviceId)
    .set("X-Nexora-Device-Name", "Transport retirement test")
    .set("X-Nexora-Platform", "web")
    .send({
      displayName: "Retired MLS",
      username: `retired_mls_${crypto.randomBytes(4).toString("hex")}`,
      password: "RetiredMlsPass123!",
    })
    .expect(201);
  const cookie = cookieFrom(registered);
  const bootstrap = await agent.get("/api/bootstrap").set("X-Nexora-Client-Version", "3.4.0").expect(200);
  const conversationId = bootstrap.body.rooms.find((room) => room.slug === "general")?.conversationId;
  assert.ok(conversationId);

  socket = createSocket(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
    auth: { clientVersion: "3.4.0" },
  });
  await once(socket, "connect");

  const before = {
    messages: instance.store.read((state) => state.messages.length),
    files: instance.store.read((state) => state.files.length),
    replay: Number(instance.store.db.prepare("SELECT COUNT(*) AS count FROM mls_replay_cache").get().count),
  };
  const payload = {
    conversationId,
    clientId: crypto.randomUUID(),
    deviceId,
    groupRecordId: crypto.randomUUID(),
    epoch: 0,
    generation: 0,
    contentType: "attachment",
    attachmentId: crypto.randomUUID(),
    message: crypto.randomBytes(96).toString("base64"),
  };

  const created = await emitAck(socket, "mls:message", payload);
  assert.equal(created.ok, false);
  assert.equal(created.code, "LEGACY_READ_ONLY");
  const edited = await emitAck(socket, "mls:message-edit", { ...payload, messageId: crypto.randomUUID() });
  assert.equal(edited.ok, false);
  assert.equal(edited.code, "LEGACY_READ_ONLY");

  assert.equal(instance.store.read((state) => state.messages.length), before.messages);
  assert.equal(instance.store.read((state) => state.files.length), before.files);
  assert.equal(Number(instance.store.db.prepare("SELECT COUNT(*) AS count FROM mls_replay_cache").get().count), before.replay);
  assert.deepEqual(instance.status().trust, {
    runtime: "retired",
    legacyHistory: "read_only",
    encryptedAttachments: false,
    deviceScopedRealtime: false,
  });
});
