"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");
const { io: createSocket } = require("socket.io-client");
const { createNexoraServer } = require("../server/create-server.cjs");
const { SESSION_COOKIE, SESSION_DURATION_MS, createCsrfToken, createSessionToken, hashToken } = require("../server/security.cjs");
const crypto = require("node:crypto");

function once(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout: ${event}`)), 8_000);
    socket.once(event, (...args) => { clearTimeout(timeout); resolve(...args); });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

test("нагрузка общей комнаты: 20 клиентов одновременно отправляют 120 сообщений", { timeout: 30_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-load-"));
  const instance = await createNexoraServer({ dataDir: directory, tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true, clientDir: path.join(__dirname, "..", "client", "dist") });
  const status = await instance.listen();
  const baseUrl = `http://127.0.0.1:${status.port}`;
  const cookies = [];
  const sockets = [];
  try {
    const first = await request(instance.app).post("/api/auth/register").send({ displayName: "Load 0", username: "load-0", password: "LoadStrongPass0!" }).expect(201);
    cookies.push(first.headers["set-cookie"][0].split(";")[0]);
    const generalRoomId = instance.store.read((state) => state.rooms.find((room) => room.slug === "general").id);
    const createdAt = new Date().toISOString();
    const seeded = [];
    for (let index = 1; index < 20; index += 1) {
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
    for (const cookie of cookies) {
      const socket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: cookie }, auth: { clientVersion: "3.0.0" } });
      sockets.push(socket);
      await once(socket, "connect");
    }
    const conversationId = instance.store.read((state) => state.conversations.find((item) => item.roomId === state.rooms.find((room) => room.slug === "general").id).id);
    const started = Date.now();
    const acknowledgements = await Promise.all(sockets.flatMap((socket, socketIndex) => Array.from({ length: 6 }, (_, messageIndex) => emitAck(socket, "message:send", {
      conversationId,
      text: `load ${socketIndex}/${messageIndex}`,
      clientId: `load-${socketIndex}-${messageIndex}`,
    }))));
    assert.equal(acknowledgements.filter((item) => item?.ok).length, 120);
    assert.equal(instance.store.read((state) => state.messages.filter((message) => message.conversationId === conversationId && message.type === "text").length), 120);
    assert.equal(instance.store.integrityCheck().ok, true);
    assert.ok(Date.now() - started < 20_000, "120 сообщений должны обработаться менее чем за 20 секунд на тестовом стенде");
  } finally {
    for (const socket of sockets) socket.disconnect();
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
