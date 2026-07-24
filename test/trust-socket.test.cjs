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

function browserAgent(agent, csrf, device) {
  return new Proxy(agent, {
    get(target, property) {
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args)
          .set("X-Nexora-Client-Version", "3.4.0")
          .set("X-Nexora-Device-ID", device.id)
          .set("X-Nexora-Device-Name", device.name)
          .set("X-Nexora-Platform", device.platform);
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

function connectSocket(baseUrl, cookie) {
  return createSocket(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { Cookie: cookie },
    auth: { clientVersion: "3.4.0" },
  });
}

test("revoking a server-owned device session immediately disconnects only the target socket", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-device-session-socket-"));
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

  const primaryDevice = { id: `desktop-${crypto.randomUUID()}`, name: "Primary desktop", platform: "windows" };
  const secondaryDevice = { id: `phone-${crypto.randomUUID()}`, name: "Secondary phone", platform: "android" };
  let primaryCsrf = "";
  let secondaryCsrf = "";
  const primary = browserAgent(request.agent(instance.app), () => primaryCsrf, primaryDevice);
  const secondary = browserAgent(request.agent(instance.app), () => secondaryCsrf, secondaryDevice);
  const username = `session_${crypto.randomBytes(4).toString("hex")}`;
  const password = "SessionLifecyclePass123!";

  const registered = await primary.post("/api/auth/register").send({ displayName: "Session Owner", username, password }).expect(201);
  primaryCsrf = registered.body.csrfToken;
  const primaryCookie = cookieFrom(registered);
  const loggedIn = await secondary.post("/api/auth/login").send({ username, password }).expect(200);
  secondaryCsrf = loggedIn.body.csrfToken;
  const secondaryCookie = cookieFrom(loggedIn);

  const primarySocket = connectSocket(baseUrl, primaryCookie);
  const secondarySocket = connectSocket(baseUrl, secondaryCookie);
  sockets.push(primarySocket, secondarySocket);
  await Promise.all([once(primarySocket, "connect"), once(secondarySocket, "connect")]);

  const inventory = await primary.get("/api/v3/devices").expect(200);
  assert.equal(inventory.body.ok, true);
  assert.equal(inventory.body.currentDeviceId, primaryDevice.id);
  assert.deepEqual(new Set(inventory.body.devices.map((item) => item.deviceId)), new Set([primaryDevice.id, secondaryDevice.id]));
  assert.equal(inventory.body.devices.find((item) => item.deviceId === primaryDevice.id).current, true);

  const revokedEvent = once(secondarySocket, "session.revoked");
  const disconnected = once(secondarySocket, "disconnect");
  const revoked = await primary.delete(`/api/v3/devices/${encodeURIComponent(secondaryDevice.id)}/sessions`).expect(200);
  assert.equal(revoked.body.revokedSessions, 1);
  assert.equal((await revokedEvent).deviceId, secondaryDevice.id);
  await disconnected;
  assert.equal(secondarySocket.connected, false);
  assert.equal(primarySocket.connected, true);

  const after = await primary.get("/api/v3/devices").expect(200);
  assert.deepEqual(after.body.devices.map((item) => item.deviceId), [primaryDevice.id]);

  const legacyWrite = await emitAck(primarySocket, "mls:message", {
    conversationId: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    message: crypto.randomBytes(96).toString("base64"),
  });
  assert.equal(legacyWrite.ok, false);
  assert.equal(legacyWrite.code, "LEGACY_READ_ONLY");
});
