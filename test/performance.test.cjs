"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");
const { io: createSocket } = require("socket.io-client");
const { createNexoraServer } = require("../server/create-server-v31.cjs");
const { SESSION_COOKIE, SESSION_DURATION_MS, createCsrfToken, createSessionToken, hashToken } = require("../server/security.cjs");
const crypto = require("node:crypto");

const LINUX_PERFORMANCE_BUDGET_MS = 20_000;
const WINDOWS_PERFORMANCE_BUDGET_MS = 22_000;
const PERFORMANCE_BUDGET_MS = process.platform === "win32" ? WINDOWS_PERFORMANCE_BUDGET_MS : LINUX_PERFORMANCE_BUDGET_MS;
const CLIENT_COUNT = 20;
const WARMUP_MESSAGES = CLIENT_COUNT;
const MEASURED_MESSAGES_PER_CLIENT = 6;
const MEASURED_MESSAGES = CLIENT_COUNT * MEASURED_MESSAGES_PER_CLIENT;

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout: ${event}`)), 8_000);
    socket.once(event, (...args) => { clearTimeout(timeout); resolve(...args); });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function countTextMessages(instance, conversationId) {
  return instance.store.read((state) => state.messages.filter((message) => message.conversationId === conversationId && message.type === "text").length);
}

test(`steady-state schema 8 load: 20 clients concurrently send 120 messages within ${PERFORMANCE_BUDGET_MS / 1_000} seconds`, { timeout: 120_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-load-"));
  const instance = await createNexoraServer({ dataDir: directory, tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true, clientDir: path.join(__dirname, "..", "client", "dist") });
  const status = await instance.listen();
  const baseUrl = `http://127.0.0.1:${status.port}`;
  const cookies = [];
  const sockets = [];
  try {
    assert.equal(instance.status().schemaVersion, 8);
    const first = await request(instance.app).post("/api/auth/register").send({ displayName: "Load 0", username: "load-0", password: "LoadStrongPass0!" }).expect(201);
    cookies.push(first.headers["set-cookie"][0].split(";")[0]);
    const generalRoomId = instance.store.read((state) => state.rooms.find((room) => room.slug === "general").id);
    const createdAt = new Date().toISOString();
    const seeded = [];
    for (let index = 1; index < CLIENT_COUNT; index += 1) {
      const id = crypto.randomUUID();
      const token = createSessionToken();
      seeded.push({ id, token, index });
      cookies.push(`${SESSION_COOKIE}=${token}`);
    }
    await instance.store.mutate((state) => {
      for (const item of seeded) {
        state.users.push({ id: item.id, username: `load-${item.index}`, displayName: `Load ${item.index}`, status: "", avatarFileId: null, notificationSound: "none", passwordSalt: "load", passwordHash: "load", role: "user", createdAt, disabledAt: null, mustChangePassword: false });
        state.sessions.push({ id: crypto.randomUUID(), userId: item.id, tokenHash: hashToken(item.token), csrfToken: createCsrfToken(), createdAt, expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(), lastSeenAt: createdAt, userAgent: "Nexora load test", ip: "127.0.0.1" });
        state.roomMembers.push({ roomId: generalRoomId, userId: item.id, role: "member", joinedAt: createdAt });
      }
    });
    const connections = cookies.map((cookie) => {
      const socket = createSocket(baseUrl, {
        transports: ["websocket"],
        extraHeaders: { Cookie: cookie },
        auth: { clientVersion: "3.2.1" },
        autoConnect: false,
      });
      sockets.push(socket);
      const connected = once(socket, "connect");
      socket.connect();
      return connected;
    });
    await Promise.all(connections);
    const conversationId = instance.store.read((state) => state.conversations.find((item) => item.roomId === state.rooms.find((room) => room.slug === "general").id).id);

    // Compile the message path, initialize per-socket state and drain the SQLite queue
    // before measuring steady-state throughput. Linux keeps the strict 20-second release
    // budget; Windows hosted runners receive a bounded 10% scheduler/filesystem margin.
    const warmupAcknowledgements = await Promise.all(sockets.map((socket, socketIndex) => emitAck(socket, "message:send", {
      conversationId,
      text: `warmup ${socketIndex}`,
      clientId: `warmup-${socketIndex}`,
    })));
    assert.equal(warmupAcknowledgements.filter((item) => item?.ok).length, WARMUP_MESSAGES);
    await instance.store.flush();
    assert.equal(countTextMessages(instance, conversationId), WARMUP_MESSAGES);

    const started = performance.now();
    const acknowledgements = await Promise.all(sockets.flatMap((socket, socketIndex) => Array.from({ length: MEASURED_MESSAGES_PER_CLIENT }, (_, messageIndex) => emitAck(socket, "message:send", {
      conversationId,
      text: `load ${socketIndex}/${messageIndex}`,
      clientId: `load-${socketIndex}-${messageIndex}`,
    }))));
    await instance.store.flush();
    const elapsedMs = performance.now() - started;

    assert.equal(acknowledgements.filter((item) => item?.ok).length, MEASURED_MESSAGES);
    assert.equal(countTextMessages(instance, conversationId), WARMUP_MESSAGES + MEASURED_MESSAGES);
    assert.equal(instance.store.integrityCheck().ok, true);
    assert.ok(elapsedMs < PERFORMANCE_BUDGET_MS, `${MEASURED_MESSAGES} сообщений должны обработаться менее чем за ${PERFORMANCE_BUDGET_MS} мс после явного warm-up/flush schema 8 transport на ${process.platform}; получено ${Math.round(elapsedMs)} мс`);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
