"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const request = require("supertest");
const { io: createSocket } = require("socket.io-client");
const { createNexoraServer } = require("../server/create-server-v31.cjs");
const { MAX_SIGNAL_BYTES, MAX_SIGNAL_HISTORY, SlidingWindowLimiter, validateSignalPayload } = require("../server/connect.cjs");

let instance;
let directory;
let baseUrl;
const accounts = new Map();

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args)
          .set("X-Nexora-Client-Version", "3.6.0")
          .set("X-Nexora-Device-ID", `connect-test-${String(property).padEnd(8, "0")}`)
          .set("X-Nexora-Device-Name", "Connect Test")
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

function cookieFrom(response) {
  return response.headers["set-cookie"][0].split(";")[0];
}

async function register(label, usernameOverride = null) {
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const response = await agent.post("/api/auth/register").send({
    displayName: label,
    username: usernameOverride || `${label.toLowerCase().replace(/[^a-z0-9]/g, "")}_${crypto.randomBytes(3).toString("hex")}`,
    password: "ConnectTest123!",
  }).expect(201);
  csrf = response.body.csrfToken;
  const account = { agent, user: response.body.user, cookie: cookieFrom(response), csrf: () => csrf };
  accounts.set(label, account);
  return account;
}

async function loginSession(account) {
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const response = await agent.post("/api/auth/login").send({ username: account.user.username, password: "ConnectTest123!" }).expect(200);
  csrf = response.body.csrfToken;
  return { agent, user: response.body.user, cookie: cookieFrom(response), csrf: () => csrf };
}

function socketFor(account) {
  return createSocket(baseUrl, {
    transports: ["websocket"],
    auth: { clientVersion: "3.6.0" },
    extraHeaders: {
      Cookie: account.cookie,
      "X-Nexora-Client-Version": "3.6.0",
      "X-Nexora-Device-ID": `socket-${account.user.id}`,
    },
  });
}

function once(socket, event, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(event, handler);
  });
}

function emitAck(socket, event, payload, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout acknowledging ${event}`)), timeoutMs);
    socket.emit(event, payload, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function connectContacts(from, to) {
  const created = await from.agent.post("/api/v3/contacts/requests")
    .set("Idempotency-Key", `request-${crypto.randomUUID()}`)
    .send({ userId: to.user.id })
    .expect(201);
  await to.agent.patch(`/api/v3/contacts/requests/${created.body.contactRequest.id}`)
    .set("Idempotency-Key", `accept-${crypto.randomUUID()}`)
    .send({ action: "accept" })
    .expect(200);
}

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-connect-"));
  const clientDir = path.join(directory, "client-dist");
  await fs.mkdir(clientDir, { recursive: true });
  await fs.writeFile(path.join(clientDir, "index.html"), "<!doctype html><div id=\"root\"></div>");
  instance = await createNexoraServer({
    dataDir: directory,
    clientDir,
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pushTokenKey: "connect-test-push-token-key-that-is-long-enough",
    turnSecret: "connect-test-turn-secret-that-is-long-enough",
    turnUrls: ["stun:stun.example.test:3478", "turn:turn.example.test:3478?transport=udp"],
    turnTtlSeconds: 120,
  });
  const status = await instance.listen();
  baseUrl = `http://127.0.0.1:${status.port}`;
});

after(async () => {
  await instance.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("Connect signal validation and bounded limiter fail closed", () => {
  assert.deepEqual(validateSignalPayload({ callId: "call-12345678", sequence: 1, kind: "ice", data: null }), {
    callId: "call-12345678", sequence: 1, kind: "ice", data: null,
  });
  assert.throws(() => validateSignalPayload({ callId: "call-12345678", sequence: 1, kind: "offer", data: { type: "offer", sdp: "" } }), /SDP/i);
  assert.throws(() => validateSignalPayload({ callId: "call-12345678", sequence: 1, kind: "ice", data: { candidate: "x".repeat(MAX_SIGNAL_BYTES) } }), /size|размер/i);
  assert.equal(MAX_SIGNAL_HISTORY, 128);
  const limiter = new SlidingWindowLimiter();
  assert.equal(limiter.consume("user", 2, 1_000, 1).ok, true);
  assert.equal(limiter.consume("user", 2, 1_000, 2).ok, true);
  assert.equal(limiter.consume("user", 2, 1_000, 3).ok, false);
});

test("schema 10 migration and Connect status are active", async () => {
  const status = instance.status();
  assert.equal(status.schemaVersion, 10);
  assert.equal(status.connect.contacts, true);
  assert.equal(status.connect.privacyPresence, true);
  assert.equal(status.connect.directCalls, true);
  assert.equal(instance.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value, "10");
  for (const table of ["connect_privacy", "connect_call_history", "connect_idempotency", "connect_audit"]) {
    assert.equal(instance.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table).name, table);
  }
});

test("Connect user search cursor uses the same collation as sorted results", async () => {
  const viewer = await register("Search Cursor Viewer");
  const usernames = ["cursorproof_aa", "cursorproof-aa", "cursorproof.aa", "cursorproof0aa"];
  for (const [index, username] of usernames.entries()) {
    await register(`Search Cursor Target ${index}`, username);
  }
  const expected = [...usernames].sort((a, b) => a.localeCompare(b));
  const found = [];
  let cursor = null;
  for (let index = 0; index < usernames.length + 1; index += 1) {
    const query = { q: "cursorproof", limit: 1 };
    if (cursor) query.cursor = cursor;
    const response = await viewer.agent.get("/api/v3/users/search").query(query).expect(200);
    found.push(...response.body.users.map((user) => user.username));
    cursor = response.body.nextCursor;
    if (!cursor) break;
  }
  assert.deepEqual(found, expected);
  assert.equal(cursor, null);

  const malformed = Buffer.from(JSON.stringify({ username: [], id: {} })).toString("base64url");
  const invalid = await viewer.agent.get("/api/v3/users/search")
    .query({ q: "cursorproof", limit: 1, cursor: malformed }).expect(400);
  assert.equal(invalid.body.code, "VALIDATION_FAILED");
});

test("contact mutations require CSRF and idempotency", async () => {
  const alice = await register("Alice");
  const bob = await register("Bob");
  await request(instance.app).post("/api/v3/contacts/requests")
    .set("Cookie", alice.cookie)
    .set("X-Nexora-Client-Version", "3.6.0")
    .set("Idempotency-Key", "csrf-bypass-test-1234")
    .send({ userId: bob.user.id })
    .expect(403)
    .expect((response) => assert.equal(response.body.code, "CSRF_INVALID"));

  const key = `contact-${crypto.randomUUID()}`;
  const first = await alice.agent.post("/api/v3/contacts/requests").set("Idempotency-Key", key).send({ userId: bob.user.id }).expect(201);
  const duplicate = await alice.agent.post("/api/v3/contacts/requests").set("Idempotency-Key", key).send({ userId: bob.user.id }).expect(201);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.contactRequest.id, first.body.contactRequest.id);
});

test("concurrent accept and cancel resolve deterministically", async () => {
  const alice = accounts.get("Alice");
  const bob = accounts.get("Bob");
  const bootstrap = await bob.agent.get("/api/bootstrap").expect(200);
  const pending = bootstrap.body.contactRequests.find((item) => item.direction === "incoming");
  assert.ok(pending);
  const results = await Promise.all([
    bob.agent.patch(`/api/v3/contacts/requests/${pending.id}`).set("Idempotency-Key", `accept-${crypto.randomUUID()}`).send({ action: "accept" }),
    alice.agent.patch(`/api/v3/contacts/requests/${pending.id}`).set("Idempotency-Key", `cancel-${crypto.randomUUID()}`).send({ action: "cancel" }),
  ]);
  assert.deepEqual(results.map((value) => value.status).sort(), [200, 409]);
  const state = instance.store.read();
  const requestItem = state.contactRequests.find((item) => item.id === pending.id);
  assert.ok(["accepted", "cancelled"].includes(requestItem.status));
  if (requestItem.status === "accepted") assert.equal(state.contacts.some((item) => [item.userAId, item.userBId].includes(alice.user.id) && [item.userAId, item.userBId].includes(bob.user.id)), true);
  else await connectContacts(alice, bob);
});

test("privacy changes apply without reconnect and exact lastSeen stays scoped", async () => {
  const alice = accounts.get("Alice");
  const bob = accounts.get("Bob");
  const aliceSocket = socketFor(alice);
  const bobSocket = socketFor(bob);
  await Promise.all([once(aliceSocket, "connect"), once(bobSocket, "connect")]);
  const changed = once(aliceSocket, "presence.changed");
  await bob.agent.patch("/api/v3/privacy").send({ presenceVisibility: "nobody", lastSeenVisibility: "hidden", readReceiptsVisibility: "nobody" }).expect(200);
  const payload = await changed;
  assert.equal(payload.states.some((item) => item.userId === bob.user.id), false);
  const stored = instance.store.db.prepare("SELECT * FROM connect_privacy WHERE user_id=?").get(bob.user.id);
  assert.equal(stored.presence_visibility, "nobody");
  assert.equal(stored.last_seen_visibility, "hidden");
  aliceSocket.disconnect();
  bobSocket.disconnect();
});

test("read receipts are filtered at serialization and realtime emission", async () => {
  const alice = accounts.get("Alice");
  const bob = accounts.get("Bob");
  const bootstrap = await alice.agent.get("/api/bootstrap").expect(200);
  const conversation = bootstrap.body.conversations.find((item) => item.type === "dm" && item.peer?.id === bob.user.id);
  assert.ok(conversation);
  const aliceSocket = socketFor(alice);
  const bobSocket = socketFor(bob);
  await Promise.all([once(aliceSocket, "connect"), once(bobSocket, "connect")]);

  await bob.agent.patch("/api/v3/privacy").send({ presenceVisibility: "contacts", lastSeenVisibility: "approximate", readReceiptsVisibility: "nobody" }).expect(200);
  const hiddenMessage = await emitAck(aliceSocket, "message:send", { conversationId: conversation.id, text: "hidden receipt", clientId: `hidden-${crypto.randomUUID()}` });
  assert.equal(hiddenMessage.ok, true);
  let leaked = false;
  aliceSocket.once("conversation:read", () => { leaked = true; });
  assert.equal((await emitAck(bobSocket, "conversation:read", { conversationId: conversation.id })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(leaked, false);
  const hiddenHistory = await alice.agent.get(`/api/conversations/${conversation.id}/messages`).expect(200);
  assert.equal(hiddenHistory.body.messages.find((item) => item.id === hiddenMessage.message.id).readCount, 0);

  await bob.agent.patch("/api/v3/privacy").send({ presenceVisibility: "contacts", lastSeenVisibility: "approximate", readReceiptsVisibility: "contacts" }).expect(200);
  const visibleMessage = await emitAck(aliceSocket, "message:send", { conversationId: conversation.id, text: "visible receipt", clientId: `visible-${crypto.randomUUID()}` });
  assert.equal(visibleMessage.ok, true);
  const visibleEvent = once(aliceSocket, "conversation:read");
  assert.equal((await emitAck(bobSocket, "conversation:read", { conversationId: conversation.id })).ok, true);
  assert.equal((await visibleEvent).userId, bob.user.id);
  const visibleHistory = await alice.agent.get(`/api/conversations/${conversation.id}/messages`).expect(200);
  assert.equal(visibleHistory.body.messages.find((item) => item.id === visibleMessage.message.id).readCount, 1);
  aliceSocket.disconnect();
  bobSocket.disconnect();
});

test("call signaling is participant-bound, sequenced and uses short-lived TURN credentials", async () => {
  const alice = accounts.get("Alice");
  const bob = accounts.get("Bob");
  const mallory = await register("Mallory");
  const aliceSocket = socketFor(alice);
  const bobSocket = socketFor(bob);
  const mallorySocket = socketFor(mallory);
  await Promise.all([once(aliceSocket, "connect"), once(bobSocket, "connect"), once(mallorySocket, "connect")]);

  const callId = crypto.randomUUID();
  const incoming = once(bobSocket, "call.incoming");
  const started = await emitAck(aliceSocket, "call:start", { callId, targetUserId: bob.user.id });
  assert.equal(started.ok, true);
  assert.equal((await incoming).call.callId, callId);

  const thirdParty = await emitAck(mallorySocket, "call.signal", { callId, sequence: 1, kind: "ice", data: null });
  assert.equal(thirdParty.ok, false);
  assert.equal(thirdParty.code, "RESOURCE_NOT_FOUND");

  const secondaryAlice = await loginSession(alice);
  await secondaryAlice.agent.post(`/api/v3/calls/${callId}/turn-credentials`).send({}).expect(403)
    .expect((response) => assert.equal(response.body.code, "FORBIDDEN"));
  const credentials = await alice.agent.post(`/api/v3/calls/${callId}/turn-credentials`).send({}).expect(200);
  assert.equal(credentials.body.iceServers.length, 2);
  assert.ok(Date.parse(credentials.body.expiresAt) > Date.now());
  assert.equal(JSON.stringify(credentials.body).includes("connect-test-turn-secret"), false);

  const answer = await emitAck(bobSocket, "call:answer", { callId });
  assert.equal(answer.ok, true);
  const malformed = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "" } });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, "VALIDATION_FAILED");

  const accepted = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "v=0\r\n" } });
  assert.equal(accepted.ok, true);
  const duplicate = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "v=0\r\n" } });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  const conflictingReplay = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "v=0\r\no=changed" } });
  assert.equal(conflictingReplay.ok, false);
  assert.equal(conflictingReplay.code, "CALL_STATE_CONFLICT");

  let rateLimited = null;
  for (let sequence = 2; sequence <= 90; sequence += 1) {
    const result = await emitAck(aliceSocket, "call.signal", { callId, sequence, kind: "ice", data: null });
    if (!result.ok) {
      rateLimited = result;
      break;
    }
  }
  assert.equal(rateLimited?.code, "RATE_LIMITED");
  assert.ok(Number(rateLimited.details?.retryAfter) >= 1);

  await emitAck(aliceSocket, "call:end", { callId, reason: "test_complete" });
  aliceSocket.disconnect();
  bobSocket.disconnect();
  mallorySocket.disconnect();
});

test("block immediately terminates calls and prevents REST or stale-socket bypass", async () => {
  const alice = accounts.get("Alice");
  const bob = accounts.get("Bob");
  await bob.agent.patch("/api/v3/privacy").send({ presenceVisibility: "contacts", lastSeenVisibility: "approximate", readReceiptsVisibility: "contacts" }).expect(200);
  const aliceSocket = socketFor(alice);
  const bobSocket = socketFor(bob);
  await Promise.all([once(aliceSocket, "connect"), once(bobSocket, "connect")]);
  const callId = crypto.randomUUID();
  await emitAck(aliceSocket, "call:start", { callId, targetUserId: bob.user.id });
  const terminal = once(aliceSocket, "call.state_changed");
  await bob.agent.post(`/api/v3/blocks/${alice.user.id}`).send({}).expect(201);
  let event = await terminal;
  if (event.call.state === "ringing") event = await once(aliceSocket, "call.state_changed");
  assert.equal(event.call.state, "failed");
  assert.equal(event.call.reason, "blocked");

  const bypass = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "ice", data: null });
  assert.equal(bypass.ok, false);
  assert.ok(["CONTACT_BLOCKED", "RESOURCE_NOT_FOUND"].includes(bypass.code));
  await alice.agent.post("/api/v3/contacts/requests").set("Idempotency-Key", `blocked-${crypto.randomUUID()}`).send({ userId: bob.user.id }).expect(403)
    .expect((response) => assert.equal(response.body.code, "CONTACT_BLOCKED"));

  const legacySearch = await alice.agent.get("/api/users/search")
    .query({ q: bob.user.username }).expect(200);
  const modernSearch = await alice.agent.get("/api/v3/users/search")
    .query({ q: bob.user.username }).expect(200);
  assert.equal(legacySearch.body.users.some((user) => user.id === bob.user.id), false);
  assert.equal(modernSearch.body.users.some((user) => user.id === bob.user.id), false);

  const history = await alice.agent.get("/api/v3/calls/history").expect(200);
  assert.equal(history.body.calls.some((item) => item.callId === callId && item.outcome === "blocked"), true);
  aliceSocket.disconnect();
  bobSocket.disconnect();
});

test("Connect client reports background call failures and Android displays package version", async () => {
  const callController = await fs.readFile(path.join(__dirname, "..", "client", "src", "components", "CallController.jsx"), "utf8");
  assert.equal(callController.includes(".catch(() => {})"), false);
  assert.ok(callController.includes("getTracks().forEach((track) => track.stop())"));
  assert.ok(callController.includes("setError(normalizeError(failure))"));
  const android = await fs.readFile(path.join(__dirname, "..", "android", "app", "src", "main", "java", "com", "nexora", "mobile", "MainActivity.kt"), "utf8");
  assert.ok(android.includes("NEXORA " + "$" + "{BuildConfig.VERSION_NAME}"));
});

test("legacy Connect response sanitizer rejects missing privacy context and failed filtering", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "server", "connect.cjs"), "utf8");
  const wrapper = source.slice(source.indexOf("responseJsonWrapper = function connectPrivacyJson"), source.indexOf("app.response.json = responseJsonWrapper;"));
  assert.match(wrapper, /Missing authenticated privacy context/);
  assert.match(wrapper, /this\.statusCode >= 200 && this\.statusCode < 300/);
  assert.match(wrapper, /if \(!user\)/);
  assert.match(wrapper, /this\.status\(404\)/);
  assert.match(wrapper, /catch \(error\)[\s\S]*this\.status\(500\)[\s\S]*RESPONSE_FILTER_FAILED/);
  assert.match(wrapper, /this\.headersSent[\s\S]*this\.destroy\(error\)/);
  assert.doesNotMatch(wrapper, /body\?\.user\?\.id/);
});

test("audio-device changes do not tear down call subscriptions or allocate an idle microphone", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "client", "src", "components", "CallController.jsx"), "utf8");
  const subscriptions = source.slice(source.indexOf("const onStart = (event) => startCall("), source.indexOf("const query = new URLSearchParams(location.search)"));
  assert.doesNotMatch(subscriptions, /releaseMedia\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => releaseMedia\(\), \[releaseMedia\]\)/);
  assert.match(source, /const refreshDevices = useCallback\([\s\S]*?setOutputId\([\s\S]*?\}, \[\]\)/);
  assert.match(source, /preferredId = inputIdRef\.current/);
  assert.match(source, /if \(!previous\) return/);
  assert.match(source, /if \(localStreamRef\.current !== previous\)/);
  assert.match(source, /replacement\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
});

test("legacy bootstrap never returns raw profile data when privacy serialization fails", async () => {
  const alice = accounts.get("Alice");
  const originalRead = instance.store.read;
  let forced = 0;
  instance.store.read = function (...args) {
    if (new Error().stack?.includes("connectPrivacyJson")) {
      forced += 1;
      throw new Error("forced privacy sanitizer failure");
    }
    return originalRead.apply(this, args);
  };

  try {
    const response = await alice.agent.get("/api/bootstrap").expect(500);
    assert.ok(forced > 0, "the failure must occur in the response privacy filter");
    assert.equal(response.body.code, "RESPONSE_FILTER_FAILED");
    assert.equal(response.body.details && Object.keys(response.body.details).length, 0);
    assert.equal(response.body.me, undefined);
    assert.ok(!response.text.includes(alice.user.username));
  } finally {
    instance.store.read = originalRead;
  }
});

test("unauthenticated legacy profile search preserves the authentication error", async () => {
  const response = await request(instance.app).get("/api/users/search?q=test");
  assert.equal(response.status, 401);
  assert.notEqual(response.body.code, "RESPONSE_FILTER_FAILED");
});
