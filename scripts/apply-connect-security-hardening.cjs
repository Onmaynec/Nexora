"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function update(relativePath, transform) {
  const before = read(relativePath);
  const after = transform(before);
  if (after === before) throw new Error(`Patch produced no change: ${relativePath}`);
  write(relativePath, after);
}

update("server/model.cjs", (source) => {
  source = replaceExactly(source, `function areContacts(state, firstUserId, secondUserId) {
  return state.contacts.some(
    (contact) =>
      (contact.userAId === firstUserId && contact.userBId === secondUserId) ||
      (contact.userAId === secondUserId && contact.userBId === firstUserId),
  );
}
`, `function areContacts(state, firstUserId, secondUserId) {
  return state.contacts.some(
    (contact) =>
      (contact.userAId === firstUserId && contact.userBId === secondUserId) ||
      (contact.userAId === secondUserId && contact.userBId === firstUserId),
  );
}

function shareRoom(state, firstUserId, secondUserId) {
  const firstRooms = new Set(state.roomMembers.filter((member) => member.userId === firstUserId).map((member) => member.roomId));
  return state.roomMembers.some((member) => member.userId === secondUserId && firstRooms.has(member.roomId));
}

function canSeeReadReceipt(state, viewerId, readerId) {
  if (viewerId === readerId) return true;
  const reader = findUser(state, readerId);
  if (!reader || isBlockedEither(state, viewerId, readerId)) return false;
  const visibility = reader.readReceiptsVisibility ?? "contacts";
  if (visibility === "everyone") return true;
  if (visibility === "contacts") return areContacts(state, viewerId, readerId);
  if (visibility === "shared_rooms") return shareRoom(state, viewerId, readerId);
  return false;
}
`, "model read-receipt policy helper");

  source = replaceExactly(source, `  const readCount = state.reads.filter(
    (read) =>
      read.conversationId === message.conversationId &&
      read.userId !== message.senderId &&
      Date.parse(read.lastReadAt) >= Date.parse(message.createdAt),
  ).length;
`, `  const readCount = message.senderId === viewerId ? state.reads.filter(
    (read) =>
      read.conversationId === message.conversationId &&
      read.userId !== message.senderId &&
      Date.parse(read.lastReadAt) >= Date.parse(message.createdAt) &&
      canSeeReadReceipt(state, viewerId, read.userId),
  ).length : 0;
`, "serialized readCount policy");

  source = replaceExactly(source, `  areContacts,
  canAccessConversation,`, `  areContacts,
  canSeeReadReceipt,
  canAccessConversation,`, "model export");
  return source;
});

update("server/create-server.cjs", (source) => {
  source = replaceExactly(source, `  areContacts,
  canAccessConversation,`, `  areContacts,
  canAccessConversation,
  canSeeReadReceipt,`, "create-server import");
  source = replaceExactly(source, `      io.to(conversationSocketRoom(conversationId)).emit("conversation:read", { conversationId, userId: user.id, lastReadAt });
      acknowledge({ ok: true });`, `      const freshState = store.read();
      for (const participantId of usersForConversation(freshState, conversation)) {
        if (!canSeeReadReceipt(freshState, participantId, user.id)) continue;
        io.to(userSocketRoom(participantId)).emit("conversation:read", { conversationId, userId: user.id, lastReadAt });
      }
      acknowledge({ ok: true });`, "privacy-scoped read event");
  return source;
});

update("server/connect.cjs", (source) => {
  source = replaceExactly(source, `const MAX_SIGNAL_BYTES = 64 * 1024;
`, `const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_SIGNAL_HISTORY = 128;
`, "signal history constant");

  source = replaceExactly(source, `  function requireCall(socket, callId) {
    const auth = activeSession(socket);
    const call = activeCalls.get(callId);
    if (!call || ![call.callerId, call.calleeId].includes(auth.user.id)) throw connectError("Вызов недоступен.", "RESOURCE_NOT_FOUND", 404);
    const expectedSessionId = call.callerId === auth.user.id ? call.callerSessionId : call.calleeSessionId;
    if (expectedSessionId && expectedSessionId !== auth.session.id) throw connectError("Вызов закреплён за другим устройством.", "FORBIDDEN", 403);
    if (isBlockedEither(auth.state, call.callerId, call.calleeId)) {
      terminalize(call, "failed", "blocked", "blocked");
      throw connectError("Вызов запрещён политикой блокировки.", "CONTACT_BLOCKED", 403);
    }
    return { ...auth, call };
  }
`, `  function requireCall(socket, callId) {
    const auth = activeSession(socket);
    const call = activeCalls.get(callId);
    if (!call || ![call.callerId, call.calleeId].includes(auth.user.id)) throw connectError("Вызов недоступен.", "RESOURCE_NOT_FOUND", 404);
    const expectedSessionId = call.callerId === auth.user.id ? call.callerSessionId : call.calleeSessionId;
    const canClaimIncoming = !expectedSessionId && call.calleeId === auth.user.id && call.state === "ringing";
    if (!canClaimIncoming && expectedSessionId !== auth.session.id) throw connectError("Вызов закреплён за другим устройством.", "FORBIDDEN", 403);
    if (isBlockedEither(auth.state, call.callerId, call.calleeId)) {
      terminalize(call, "failed", "blocked", "blocked");
      throw connectError("Вызов запрещён политикой блокировки.", "CONTACT_BLOCKED", 403);
    }
    return { ...auth, call };
  }

  function requireHttpCall(auth, callId) {
    const call = activeCalls.get(callId);
    if (!call || ![call.callerId, call.calleeId].includes(auth.user.id) || CALL_TERMINAL.has(call.state)) {
      throw connectError("Вызов недоступен.", "RESOURCE_NOT_FOUND", 404);
    }
    const expectedSessionId = call.callerId === auth.user.id ? call.callerSessionId : call.calleeSessionId;
    if (!expectedSessionId || expectedSessionId !== auth.session.id) {
      throw connectError("Вызов закреплён за другим устройством.", "FORBIDDEN", 403);
    }
    const state = store.read();
    if (isBlockedEither(state, call.callerId, call.calleeId)) {
      terminalize(call, "failed", "blocked", "blocked");
      throw connectError("Вызов запрещён политикой блокировки.", "CONTACT_BLOCKED", 403);
    }
    return call;
  }
`, "session-bound call authorization");

  source = replaceExactly(source, `    const call = activeCalls.get(callId);
    if (!call || ![call.callerId, call.calleeId].includes(auth.user.id) || CALL_TERMINAL.has(call.state)) throw connectError("Вызов недоступен.", "RESOURCE_NOT_FOUND", 404);
    if (!turnSecret || String(turnSecret).length < 24 || configuredTurnUrls.length === 0) {`, `    const call = requireHttpCall(auth, callId);
    if (!turnSecret || String(turnSecret).length < 24 || configuredTurnUrls.length === 0) {`, "TURN call authorization");

  source = replaceExactly(source, `    const subject = hash(auth.user.id).slice(0, 20);
    const username = \`${"${expires}:${subject}:${call.id}"}\`;`, `    const subject = hash(\`${"${auth.user.id}:${auth.session.id}"}\`).slice(0, 20);
    const username = \`${"${expires}:${subject}:${call.id}"}\`;`, "TURN session scope");

  source = replaceExactly(source, `        if (existing && existing.callerId === auth.user.id) return acknowledge({ ok: true, duplicate: true, call: callView(existing, auth.user.id) });
        if (existing) throw connectError("callId уже используется.", "CALL_STATE_CONFLICT", 409);`, `        if (existing && existing.callerId === auth.user.id && existing.calleeId === targetId && existing.callerSessionId === auth.session.id) {
          return acknowledge({ ok: true, duplicate: true, call: callView(existing, auth.user.id) });
        }
        if (existing) throw connectError("callId уже используется.", "CALL_STATE_CONFLICT", 409);`, "call start idempotency scope");

  source = replaceExactly(source, `          sequences: new Map([[auth.user.id, 0], [targetId, 0]]),
        };`, `          sequences: new Map([[auth.user.id, 0], [targetId, 0]]),
          signalHashes: new Map([[auth.user.id, new Map()], [targetId, new Map()]]),
        };`, "signal replay history initialization");

  source = replaceExactly(source, `        if (!["connecting", "active", "reconnecting"].includes(auth.call.state)) throw connectError("Signal несовместим с текущим состоянием.", "CALL_STATE_CONFLICT", 409, { currentState: auth.call.state });
        const last = Number(auth.call.sequences.get(auth.user.id) || 0);
        if (signal.sequence <= last) return acknowledge({ ok: true, duplicate: true, sequence: last });
        if (signal.sequence !== last + 1) throw connectError("Нарушена последовательность signaling.", "CALL_STATE_CONFLICT", 409, { expectedSequence: last + 1 });
        auth.call.sequences.set(auth.user.id, signal.sequence);`, `        if (!["connecting", "active", "reconnecting"].includes(auth.call.state)) throw connectError("Signal несовместим с текущим состоянием.", "CALL_STATE_CONFLICT", 409, { currentState: auth.call.state });
        const deviceId = sessionDeviceId(auth.session);
        for (const [key, limit, windowMs] of [
          [\`signal-account:${"${auth.user.id}"}\`, 240, 60_000],
          [\`signal-device:${"${auth.user.id}:${deviceId}"}\`, 180, 60_000],
          [\`signal-call:${"${auth.call.id}:${auth.user.id}"}\`, 64, 10_000],
        ]) {
          const rate = limiter.consume(key, limit, windowMs);
          if (!rate.ok) throw connectError("Слишком много signaling событий.", "RATE_LIMITED", 429, { retryAfter: rate.retryAfter });
        }
        const last = Number(auth.call.sequences.get(auth.user.id) || 0);
        const fingerprint = hash(JSON.stringify({ kind: signal.kind, data: signal.data }));
        const signalHistory = auth.call.signalHashes.get(auth.user.id) || new Map();
        auth.call.signalHashes.set(auth.user.id, signalHistory);
        if (signal.sequence <= last) {
          if (signalHistory.get(signal.sequence) === fingerprint) return acknowledge({ ok: true, duplicate: true, sequence: last });
          throw connectError("Повтор sequence содержит другой signaling payload.", "CALL_STATE_CONFLICT", 409, { sequence: signal.sequence, acceptedSequence: last });
        }
        if (signal.sequence !== last + 1) throw connectError("Нарушена последовательность signaling.", "CALL_STATE_CONFLICT", 409, { expectedSequence: last + 1 });
        auth.call.sequences.set(auth.user.id, signal.sequence);
        signalHistory.set(signal.sequence, fingerprint);
        while (signalHistory.size > MAX_SIGNAL_HISTORY) signalHistory.delete(signalHistory.keys().next().value);`, "signaling replay and rate controls");

  source = replaceExactly(source, `  MAX_SIGNAL_BYTES,
  SlidingWindowLimiter,`, `  MAX_SIGNAL_BYTES,
  MAX_SIGNAL_HISTORY,
  SlidingWindowLimiter,`, "Connect exports");
  return source;
});

update("test/connect-3.6.test.cjs", (source) => {
  source = replaceExactly(source, `const { MAX_SIGNAL_BYTES, SlidingWindowLimiter, validateSignalPayload } = require("../server/connect.cjs");`, `const { MAX_SIGNAL_BYTES, MAX_SIGNAL_HISTORY, SlidingWindowLimiter, validateSignalPayload } = require("../server/connect.cjs");`, "test Connect imports");

  source = replaceExactly(source, `async function register(label) {
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const response = await agent.post("/api/auth/register").send({
    displayName: label,
    username: \`${"${label.toLowerCase().replace(/[^a-z0-9]/g, \"\")}_${crypto.randomBytes(3).toString(\"hex\")}"}\`,
    password: "ConnectTest123!",
  }).expect(201);
  csrf = response.body.csrfToken;
  const account = { agent, user: response.body.user, cookie: cookieFrom(response), csrf: () => csrf };
  accounts.set(label, account);
  return account;
}
`, `async function register(label) {
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const response = await agent.post("/api/auth/register").send({
    displayName: label,
    username: \`${"${label.toLowerCase().replace(/[^a-z0-9]/g, \"\")}_${crypto.randomBytes(3).toString(\"hex\")}"}\`,
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
`, "secondary session test helper");

  source = replaceExactly(source, `  const limiter = new SlidingWindowLimiter();
  assert.equal(limiter.consume("user", 2, 1_000, 1).ok, true);`, `  assert.equal(MAX_SIGNAL_HISTORY, 128);
  const limiter = new SlidingWindowLimiter();
  assert.equal(limiter.consume("user", 2, 1_000, 1).ok, true);`, "signal history unit contract");

  const insertionPoint = `test("call signaling is participant-bound, sequenced and uses short-lived TURN credentials", async () => {`;
  const readReceiptTest = `test("read receipts are filtered at serialization and realtime emission", async () => {
  const alice = accounts.get("Alice");
  const bob = accounts.get("Bob");
  const bootstrap = await alice.agent.get("/api/bootstrap").expect(200);
  const conversation = bootstrap.body.conversations.find((item) => item.type === "dm" && item.peer?.id === bob.user.id);
  assert.ok(conversation);
  const aliceSocket = socketFor(alice);
  const bobSocket = socketFor(bob);
  await Promise.all([once(aliceSocket, "connect"), once(bobSocket, "connect")]);

  await bob.agent.patch("/api/v3/privacy").send({ presenceVisibility: "contacts", lastSeenVisibility: "approximate", readReceiptsVisibility: "nobody" }).expect(200);
  const hiddenMessage = await emitAck(aliceSocket, "message:send", { conversationId: conversation.id, text: "hidden receipt", clientId: \`hidden-${"${crypto.randomUUID()}"}\` });
  assert.equal(hiddenMessage.ok, true);
  let leaked = false;
  aliceSocket.once("conversation:read", () => { leaked = true; });
  assert.equal((await emitAck(bobSocket, "conversation:read", { conversationId: conversation.id })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(leaked, false);
  const hiddenHistory = await alice.agent.get(\`/api/conversations/${"${conversation.id}"}/messages\`).expect(200);
  assert.equal(hiddenHistory.body.messages.find((item) => item.id === hiddenMessage.message.id).readCount, 0);

  await bob.agent.patch("/api/v3/privacy").send({ presenceVisibility: "contacts", lastSeenVisibility: "approximate", readReceiptsVisibility: "contacts" }).expect(200);
  const visibleMessage = await emitAck(aliceSocket, "message:send", { conversationId: conversation.id, text: "visible receipt", clientId: \`visible-${"${crypto.randomUUID()}"}\` });
  assert.equal(visibleMessage.ok, true);
  const visibleEvent = once(aliceSocket, "conversation:read");
  assert.equal((await emitAck(bobSocket, "conversation:read", { conversationId: conversation.id })).ok, true);
  assert.equal((await visibleEvent).userId, bob.user.id);
  const visibleHistory = await alice.agent.get(\`/api/conversations/${"${conversation.id}"}/messages\`).expect(200);
  assert.equal(visibleHistory.body.messages.find((item) => item.id === visibleMessage.message.id).readCount, 1);
  aliceSocket.disconnect();
  bobSocket.disconnect();
});

`;
  source = replaceExactly(source, insertionPoint, `${readReceiptTest}${insertionPoint}`, "read receipt regression insertion");

  source = replaceExactly(source, `  const credentials = await alice.agent.post(\`/api/v3/calls/${"${callId}"}/turn-credentials\`).send({}).expect(200);
  assert.equal(credentials.body.iceServers.length, 2);`, `  const secondaryAlice = await loginSession(alice);
  await secondaryAlice.agent.post(\`/api/v3/calls/${"${callId}"}/turn-credentials\`).send({}).expect(403)
    .expect((response) => assert.equal(response.body.code, "FORBIDDEN"));
  const credentials = await alice.agent.post(\`/api/v3/calls/${"${callId}"}/turn-credentials\`).send({}).expect(200);
  assert.equal(credentials.body.iceServers.length, 2);`, "TURN session binding regression");

  source = replaceExactly(source, `  const duplicate = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "v=0\\r\\n" } });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);

  await emitAck(aliceSocket, "call:end", { callId, reason: "test_complete" });`, `  const duplicate = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "v=0\\r\\n" } });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  const conflictingReplay = await emitAck(aliceSocket, "call.signal", { callId, sequence: 1, kind: "offer", data: { type: "offer", sdp: "v=0\\r\\no=changed" } });
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

  await emitAck(aliceSocket, "call:end", { callId, reason: "test_complete" });`, "signaling replay/rate regression");
  return source;
});

console.log("Applied Connect session, signaling and read-receipt security hardening.");
