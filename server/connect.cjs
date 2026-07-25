"use strict";

const crypto = require("node:crypto");

const { appendEvent } = require("./events.cjs");
const {
  areContacts,
  findUser,
  isBlockedEither,
} = require("./model.cjs");
const { sessionDeviceId } = require("./stable-core.cjs");

const SAFE_ID = /^[A-Za-z0-9_.:-]{8,160}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,160}$/;
const REQUEST_STATES = new Set(["pending", "accepted", "rejected", "cancelled", "expired"]);
const PRESENCE_VISIBILITY = new Set(["everyone", "contacts", "shared_rooms", "nobody"]);
const LAST_SEEN_VISIBILITY = new Set(["exact", "approximate", "hidden"]);
const READ_VISIBILITY = new Set(["everyone", "contacts", "shared_rooms", "nobody"]);
const CALL_TERMINAL = new Set(["ended", "declined", "missed", "failed"]);
const CALL_SIGNAL_KINDS = new Set(["offer", "answer", "ice", "restart"]);
const CALL_RING_MS = 45_000;
const CALL_CONNECT_MS = 35_000;
const CALL_RETENTION_MS = 120_000;
const CONTACT_REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_SIGNAL_BYTES = 64 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function safeRequestId(value) {
  const candidate = String(value || "");
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function stableError(response, status, code, message, requestId, details = {}) {
  if (code === "RATE_LIMITED" && Number(details.retryAfter) > 0) response.setHeader("Retry-After", String(Math.ceil(details.retryAfter)));
  return response.status(status).json({ ok: false, code, message, requestId, details });
}

function connectError(message, code, status, details = {}) {
  return Object.assign(new Error(message), { code, status, details });
}

function errorResponse(response, error, requestId, log = () => {}) {
  const status = Math.max(400, Math.min(599, Number(error?.status || 500)));
  const code = String(error?.code || "TEMPORARY_UNAVAILABLE");
  if (status >= 500) log(`Connect ${requestId}: ${error.stack || error.message}`, "error");
  return stableError(
    response,
    status,
    code,
    status >= 500 ? "Временная ошибка Local Server." : String(error?.message || "Операция не выполнена."),
    requestId,
    error?.details || {},
  );
}

function safeAckError(error) {
  return {
    ok: false,
    code: String(error?.code || "TEMPORARY_UNAVAILABLE"),
    error: Number(error?.status || 500) >= 500 ? "Временная ошибка Local Server." : String(error?.message || "Операция не выполнена."),
    details: error?.details || {},
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function cleanLine(value, max = 160) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    throw connectError("Некорректный cursor.", "VALIDATION_FAILED", 400);
  }
}

function canSeeUserByScope(state, viewerId, subjectId, visibility = "everyone") {
  if (viewerId === subjectId) return true;
  if (isBlockedEither(state, viewerId, subjectId)) return false;
  if (visibility === "nobody") return false;
  if (visibility === "everyone") return true;
  if (visibility === "contacts") return areContacts(state, viewerId, subjectId);
  if (visibility === "shared_rooms") return sharedRoom(state, viewerId, subjectId);
  return false;
}

function sharedRoom(state, firstUserId, secondUserId) {
  const first = new Set(state.roomMembers.filter((item) => item.userId === firstUserId).map((item) => item.roomId));
  return state.roomMembers.some((item) => item.userId === secondUserId && first.has(item.roomId));
}

function relationshipScope(state, viewerId, subjectId) {
  if (viewerId === subjectId) return { self: true, contact: true, sharedRoom: true };
  return {
    self: false,
    contact: areContacts(state, viewerId, subjectId),
    sharedRoom: sharedRoom(state, viewerId, subjectId),
  };
}

function defaultPrivacy(user = {}) {
  return {
    presenceVisibility: PRESENCE_VISIBILITY.has(user.presenceVisibility) ? user.presenceVisibility : "everyone",
    lastSeenVisibility: LAST_SEEN_VISIBILITY.has(user.lastSeenVisibility) ? user.lastSeenVisibility : "approximate",
    readReceiptsVisibility: READ_VISIBILITY.has(user.readReceiptsVisibility) ? user.readReceiptsVisibility : "contacts",
  };
}

function safeProfile(state, user, viewerId, options = {}) {
  if (!user || user.disabledAt) return null;
  const relationship = relationshipScope(state, viewerId, user.id);
  const blocked = viewerId !== user.id && isBlockedEither(state, viewerId, user.id);
  if (blocked && !options.allowBlockedByViewer) return null;
  const scoped = relationship.self || relationship.contact || relationship.sharedRoom;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarFileId ? `/api/avatars/${user.avatarFileId}` : null,
    avatarFrame: user.avatarFrame ?? "none",
    profileColor: user.profileColor ?? "violet",
    plusBadgeVisible: user.plusBadgeVisible !== false,
    role: scoped ? user.role : "user",
    isBot: Boolean(user.isBot),
    status: scoped ? user.status ?? "" : "",
    bio: scoped ? user.bio ?? "" : "",
    createdAt: scoped ? user.createdAt : null,
  };
}

class SlidingWindowLimiter {
  constructor() {
    this.entries = new Map();
  }

  consume(key, limit, windowMs, now = Date.now()) {
    const values = (this.entries.get(key) || []).filter((timestamp) => timestamp > now - windowMs);
    if (values.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((values[0] + windowMs - now) / 1_000));
      this.entries.set(key, values);
      return { ok: false, retryAfter };
    }
    values.push(now);
    this.entries.set(key, values);
    return { ok: true, retryAfter: 0 };
  }

  cleanup(now = Date.now()) {
    for (const [key, values] of this.entries) {
      const active = values.filter((timestamp) => timestamp > now - 60 * 60 * 1_000);
      if (active.length) this.entries.set(key, active); else this.entries.delete(key);
    }
  }
}

function validateSignalPayload(payload) {
  const callId = cleanLine(payload?.callId, 160);
  const sequence = Number(payload?.sequence);
  const kind = cleanLine(payload?.kind, 24);
  if (!SAFE_ID.test(callId) || !Number.isSafeInteger(sequence) || sequence < 1 || sequence > 1_000_000_000 || !CALL_SIGNAL_KINDS.has(kind)) {
    throw connectError("Некорректный signaling payload.", "VALIDATION_FAILED", 400);
  }
  let serialized;
  try { serialized = JSON.stringify(payload?.data ?? null); } catch { throw connectError("Некорректный signaling payload.", "VALIDATION_FAILED", 400); }
  if (Buffer.byteLength(serialized, "utf8") > MAX_SIGNAL_BYTES) {
    throw connectError("Signaling payload превышает допустимый размер.", "VALIDATION_FAILED", 413, { maxBytes: MAX_SIGNAL_BYTES });
  }
  const data = payload?.data;
  if (["offer", "answer"].includes(kind)) {
    if (!data || typeof data !== "object" || data.type !== kind || typeof data.sdp !== "string" || data.sdp.length < 1 || data.sdp.length > MAX_SIGNAL_BYTES) {
      throw connectError("Некорректный SDP payload.", "VALIDATION_FAILED", 400);
    }
  }
  if (kind === "ice") {
    if (data !== null && (typeof data !== "object" || (data.candidate != null && typeof data.candidate !== "string"))) {
      throw connectError("Некорректный ICE candidate.", "VALIDATION_FAILED", 400);
    }
    if (typeof data?.candidate === "string" && data.candidate.length > 8_192) {
      throw connectError("ICE candidate превышает допустимый размер.", "VALIDATION_FAILED", 413);
    }
  }
  return { callId, sequence, kind, data: data ?? null };
}

function parseTurnUrls(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return source.map((item) => String(item).trim()).filter((item) => /^(?:stun|turn|turns):[^\s]{3,500}$/i.test(item)).slice(0, 8);
}

async function mountConnect({
  app,
  store,
  io,
  serverId,
  authRequired,
  onlineUserIds = null,
  setPresencePublisher = null,
  turnSecret = process.env.NEXORA_TURN_SECRET,
  turnUrls = process.env.NEXORA_TURN_URLS,
  turnTtlSeconds = process.env.NEXORA_TURN_TTL_SECONDS,
  log = () => {},
} = {}) {
  if (!app || !store?.db || !io || !serverId || !authRequired) throw new Error("Connect requires app, store, io, serverId and authRequired.");

  const limiter = new SlidingWindowLimiter();
  const activeCalls = new Map();
  const socketsBySession = new Map();
  const socketsByUser = new Map();
  const configuredTurnUrls = parseTurnUrls(turnUrls);
  const turnCredentialTtl = Math.max(60, Math.min(900, Number(turnTtlSeconds) || 600));
  let presenceSequence = 0;
  let presenceTimer = null;
  let stopped = false;
  const originalIoEmit = io.emit;
  const originalResponseJson = app.response.json;
  let responseJsonWrapper = null;

  await store.mutate((state) => {
    for (const user of state.users) {
      const row = store.db.prepare("SELECT * FROM connect_privacy WHERE user_id=?").get(user.id);
      const privacy = row ? {
        presenceVisibility: row.presence_visibility,
        lastSeenVisibility: row.last_seen_visibility,
        readReceiptsVisibility: row.read_receipts_visibility,
      } : defaultPrivacy(user);
      Object.assign(user, privacy);
      if (!row) {
        store.db.prepare(`INSERT OR IGNORE INTO connect_privacy
          (user_id,presence_visibility,last_seen_visibility,read_receipts_visibility,updated_at)
          VALUES(?,?,?,?,?)`).run(user.id, privacy.presenceVisibility, privacy.lastSeenVisibility, privacy.readReceiptsVisibility, nowIso());
      }
    }
  });

  function visiblePresenceIds(state, viewerId, ids) {
    return new Set([...ids].filter((subjectId) => {
      const subject = findUser(state, subjectId);
      return subject && (subjectId === viewerId || canSeeUserByScope(state, viewerId, subjectId, privacyFor(subject).presenceVisibility));
    }));
  }

  function sanitizeUserView(state, value, viewerId, allowBlockedByViewer = false) {
    if (!value?.id) return value;
    const safe = safeProfile(state, findUser(state, value.id), viewerId, { allowBlockedByViewer });
    if (!safe) return null;
    const preserved = {};
    for (const key of ["online", "conversationId", "roomRole", "customRoleIds", "restrictedUntil", "plus", "contact", "requestDirection"]) {
      if (Object.hasOwn(value, key)) preserved[key] = value[key];
    }
    return { ...safe, ...preserved };
  }

  function visibleReadCount(state, serialized, viewerId) {
    if (!serialized?.id || serialized.sender?.id !== viewerId) return 0;
    const raw = state.messages.find((item) => item.id === serialized.id);
    if (!raw) return 0;
    return state.reads.filter((read) => {
      if (read.conversationId !== raw.conversationId || read.userId === raw.senderId || Date.parse(read.lastReadAt) < Date.parse(raw.createdAt)) return false;
      const reader = findUser(state, read.userId);
      return reader && canSeeUserByScope(state, viewerId, reader.id, privacyFor(reader).readReceiptsVisibility);
    }).length;
  }

  function sanitizeMessageView(state, message, viewerId) {
    if (!message || typeof message !== "object") return message;
    return {
      ...message,
      sender: sanitizeUserView(state, message.sender, viewerId),
      readCount: visibleReadCount(state, message, viewerId),
    };
  }

  function sanitizeBootstrap(body, viewerId) {
    const state = store.read();
    const visible = visiblePresenceIds(state, viewerId, new Set(Array.isArray(body.onlineUserIds) ? body.onlineUserIds : []));
    const conversations = Array.isArray(body.conversations) ? body.conversations.map((conversation) => {
      const members = Array.isArray(conversation.members) ? conversation.members.map((member) => {
        const next = sanitizeUserView(state, member, viewerId);
        return next ? { ...next, online: visible.has(member.id) } : null;
      }).filter(Boolean) : conversation.members;
      return {
        ...conversation,
        peer: conversation.peer ? sanitizeUserView(state, conversation.peer, viewerId) : conversation.peer,
        online: conversation.peer ? visible.has(conversation.peer.id) : false,
        members,
        lastMessage: sanitizeMessageView(state, conversation.lastMessage, viewerId),
      };
    }) : body.conversations;
    const rooms = Array.isArray(body.rooms) ? body.rooms.map((room) => ({
      ...room,
      owner: sanitizeUserView(state, room.owner, viewerId),
      onlineCount: state.roomMembers.filter((member) => member.roomId === room.id && visible.has(member.userId)).length,
    })) : body.rooms;
    return {
      ...body,
      onlineUserIds: [...visible],
      conversations,
      rooms,
      contacts: Array.isArray(body.contacts) ? body.contacts.map((user) => {
        const next = sanitizeUserView(state, user, viewerId);
        return next ? { ...next, online: visible.has(user.id) } : null;
      }).filter(Boolean) : body.contacts,
      contactRequests: Array.isArray(body.contactRequests) ? body.contactRequests.map((item) => ({ ...item, user: sanitizeUserView(state, item.user, viewerId, true) })).filter((item) => item.user) : body.contactRequests,
      blocked: Array.isArray(body.blocked) ? body.blocked.map((user) => sanitizeUserView(state, user, viewerId, true)).filter(Boolean) : body.blocked,
      privacy: privacyFor(findUser(state, viewerId)),
    };
  }

  responseJsonWrapper = function connectPrivacyJson(body) {
    try {
      const request = this.req;
      const viewerId = request?.pulseAuth?.user?.id || request?.nexora?.user?.id || body?.me?.id || body?.user?.id;
      if (viewerId && body && typeof body === "object") {
        const state = store.read();
        if (request.path === "/api/bootstrap" && body.me) body = sanitizeBootstrap(body, viewerId);
        else if (/^\/api\/users\/[^/]+\/profile$/.test(request.path) && body.user) {
          const user = sanitizeUserView(state, body.user, viewerId);
          if (user) body = { ...body, user, relationship: { ...body.relationship, blockedMe: undefined, canCall: Boolean(body.relationship?.contact && !isBlockedEither(state, viewerId, user.id)) } };
        } else if (request.path === "/api/users/search" && Array.isArray(body.users)) {
          body = { ...body, users: body.users.map((user) => sanitizeUserView(state, user, viewerId, true)).filter(Boolean) };
        } else if (/^\/api\/conversations\/[^/]+\/messages$/.test(request.path) && Array.isArray(body.messages)) {
          body = { ...body, messages: body.messages.map((message) => sanitizeMessageView(state, message, viewerId)) };
        }
        const blockMatch = /^\/api\/blocks\/([^/]+)$/.exec(request.path);
        if (blockMatch && request.method === "POST") {
          terminateBetween(viewerId, blockMatch[1], "blocked");
          schedulePresence();
        } else if (blockMatch || /^\/api\/contacts\//.test(request.path) || /^\/api\/contacts\/requests\//.test(request.path)) {
          schedulePresence();
        }
      }
    } catch (error) {
      log(`Connect response sanitizer failed: ${error.message}`, "error");
    }
    return originalResponseJson.call(this, body);
  };
  app.response.json = responseJsonWrapper;

  io.emit = function connectScopedEmit(eventName, ...args) {
    if (eventName === "presence:update") {
      schedulePresence(new Set(Array.isArray(args[0]) ? args[0] : []));
      return true;
    }
    return originalIoEmit.call(this, eventName, ...args);
  };

  function requestContext(request, response, next) {
    request.connectRequestId = request.pulseRequestId || safeRequestId(request.headers["x-request-id"]);
    response.setHeader("X-Request-ID", request.connectRequestId);
    response.setHeader("Cache-Control", "no-store");
    next();
  }

  function currentAuth(request) {
    const auth = request.pulseAuth;
    if (!auth?.user || !auth?.session) throw connectError("Требуется вход в аккаунт.", "AUTH_REQUIRED", 401);
    return auth;
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try { await handler(request, response); } catch (error) { errorResponse(response, error, request.connectRequestId, log); }
    };
  }

  function emitUsers(userIds, eventName, payload) {
    for (const userId of new Set(userIds.filter(Boolean))) io.to(`user:${userId}`).emit(eventName, payload);
  }

  function appendConnectAudit(actorId, action, targetUserId = null, objectId = null, data = {}) {
    const safeData = JSON.stringify(data, (_key, value) => typeof value === "string" ? value.slice(0, 256) : value).slice(0, 2_048);
    store.db.prepare(`INSERT INTO connect_audit(id,actor_id,action,target_user_id,object_id,created_at,data)
      VALUES(?,?,?,?,?,?,?)`).run(crypto.randomUUID(), actorId, action, targetUserId, objectId, nowIso(), safeData || "{}");
  }

  function cleanupIdempotency() {
    store.db.prepare("DELETE FROM connect_idempotency WHERE expires_at<=?").run(nowIso());
  }

  function idempotencyKey(request, required = true) {
    const value = String(request.headers["idempotency-key"] || "");
    if (!value && !required) return null;
    if (!IDEMPOTENCY_KEY.test(value)) throw connectError("Требуется корректный Idempotency-Key.", "VALIDATION_FAILED", 400);
    return value;
  }

  function readIdempotency(userId, scope, key) {
    if (!key) return null;
    const row = store.db.prepare(`SELECT status_code,response_json,expires_at FROM connect_idempotency
      WHERE user_id=? AND scope=? AND key_hash=?`).get(userId, scope, hash(key));
    if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
    try { return { status: Number(row.status_code), body: JSON.parse(row.response_json) }; } catch { return null; }
  }

  function writeIdempotency(userId, scope, key, status, body) {
    if (!key) return;
    store.db.prepare(`INSERT INTO connect_idempotency
      (user_id,scope,key_hash,status_code,response_json,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(user_id,scope,key_hash) DO UPDATE SET
        status_code=excluded.status_code,response_json=excluded.response_json,expires_at=excluded.expires_at`)
      .run(userId, scope, hash(key), status, JSON.stringify(body), nowIso(), new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString());
  }

  function expireRequest(item, timestamp = Date.now()) {
    if (item?.status === "pending" && item.expiresAt && Date.parse(item.expiresAt) <= timestamp) {
      item.status = "expired";
      item.resolvedAt = new Date(timestamp).toISOString();
      return true;
    }
    return false;
  }

  function requestView(state, item, viewerId) {
    const peerId = item.fromUserId === viewerId ? item.toUserId : item.fromUserId;
    return {
      id: item.id,
      direction: item.fromUserId === viewerId ? "outgoing" : "incoming",
      status: REQUEST_STATES.has(item.status) ? item.status : "expired",
      user: safeProfile(state, findUser(state, peerId), viewerId, { allowBlockedByViewer: true }),
      createdAt: item.createdAt,
      expiresAt: item.expiresAt ?? null,
      resolvedAt: item.resolvedAt ?? null,
    };
  }

  function emitRequestChange(item, reason) {
    const state = store.read();
    for (const userId of [item.fromUserId, item.toUserId]) {
      io.to(`user:${userId}`).emit("contact.request_changed", {
        eventId: crypto.randomUUID(),
        version: 1,
        reason,
        request: requestView(state, item, userId),
      });
    }
    emitUsers([item.fromUserId, item.toUserId], "data:refresh", { reason: `contact.${reason}` });
  }

  function privacyFor(user) {
    return defaultPrivacy(user);
  }

  function lastSeenFor(state, subjectId, mode) {
    if (mode === "hidden") return null;
    const exact = state.sessions
      .filter((session) => session.userId === subjectId)
      .map((session) => session.lastSeenAt || session.createdAt)
      .filter(Boolean)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
    if (!exact || mode === "exact") return exact;
    const value = new Date(exact);
    if (!Number.isFinite(value.getTime())) return null;
    const age = Date.now() - value.getTime();
    if (age < 24 * 60 * 60 * 1_000) {
      value.setMinutes(0, 0, 0);
    } else {
      value.setHours(0, 0, 0, 0);
    }
    return value.toISOString();
  }

  function presenceSnapshot(viewerId, onlineSet) {
    const state = store.read();
    const states = [];
    for (const subject of state.users) {
      if (subject.disabledAt) continue;
      const allowed = subject.id === viewerId || canSeeUserByScope(state, viewerId, subject.id, privacyFor(subject).presenceVisibility);
      if (!allowed) continue;
      const online = onlineSet.has(subject.id);
      states.push({
        userId: subject.id,
        online,
        lastSeen: online ? null : lastSeenFor(state, subject.id, privacyFor(subject).lastSeenVisibility),
        precision: privacyFor(subject).lastSeenVisibility,
      });
    }
    return states;
  }

  function currentOnlineUserIds() {
    if (typeof onlineUserIds === "function") {
      const value = onlineUserIds();
      if (value && typeof value[Symbol.iterator] === "function") return new Set(value);
    }
    return new Set(socketsByUser.keys());
  }

  function publishPresence(onlineSet = currentOnlineUserIds()) {
    if (stopped) return;
    const state = store.read();
    const sequence = ++presenceSequence;
    for (const viewer of state.users.filter((user) => !user.disabledAt)) {
      const states = presenceSnapshot(viewer.id, onlineSet);
      io.to(`user:${viewer.id}`).emit("presence.changed", {
        eventId: crypto.randomUUID(),
        sequence,
        version: 1,
        replace: true,
        states,
      });
      io.to(`user:${viewer.id}`).emit("presence:update", states.filter((item) => item.online).map((item) => item.userId));
    }
  }

  function schedulePresence(onlineSet = currentOnlineUserIds()) {
    clearTimeout(presenceTimer);
    const snapshot = new Set(onlineSet);
    presenceTimer = setTimeout(() => publishPresence(snapshot), 80);
    presenceTimer.unref?.();
  }

  if (typeof setPresencePublisher === "function") setPresencePublisher(schedulePresence);

  function activeSession(socket) {
    const state = store.read();
    const user = findUser(state, socket.data.user?.id);
    const session = state.sessions.find((item) => item.id === socket.data.sessionId && item.userId === user?.id && Date.parse(item.expiresAt) > Date.now());
    if (!user || !session) throw connectError("Сессия отозвана.", "AUTH_REQUIRED", 401);
    return { state, user, session };
  }

  function otherParticipant(call, userId) {
    return call.callerId === userId ? call.calleeId : call.callerId;
  }

  function callView(call, viewerId) {
    const state = store.read();
    const peerId = otherParticipant(call, viewerId);
    return {
      callId: call.id,
      state: call.state,
      peer: safeProfile(state, findUser(state, peerId), viewerId, { allowBlockedByViewer: true }),
      direction: call.callerId === viewerId ? "outgoing" : "incoming",
      startedAt: call.startedAt,
      answeredAt: call.answeredAt ?? null,
      endedAt: call.endedAt ?? null,
      duration: call.answeredAt ? Math.max(0, Math.floor(((call.endedAt ? Date.parse(call.endedAt) : Date.now()) - Date.parse(call.answeredAt)) / 1_000)) : 0,
      reason: call.endedReason ?? null,
    };
  }

  function emitCallState(call) {
    for (const userId of [call.callerId, call.calleeId]) {
      io.to(`user:${userId}`).emit("call.state_changed", {
        eventId: crypto.randomUUID(),
        version: 1,
        call: callView(call, userId),
      });
    }
  }

  function historyOutcome(call, requested) {
    if (requested) return requested;
    if (call.state === "ended") return "completed";
    if (call.state === "declined") return "declined";
    if (call.state === "missed") return "missed";
    return "failed";
  }

  function persistCall(call, outcome) {
    store.db.prepare(`INSERT OR IGNORE INTO connect_call_history
      (id,caller_id,callee_id,state,outcome,started_at,answered_at,ended_at,duration_seconds,ended_reason,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      call.id,
      call.callerId,
      call.calleeId,
      call.state,
      historyOutcome(call, outcome),
      call.startedAt,
      call.answeredAt || null,
      call.endedAt,
      call.answeredAt ? Math.max(0, Math.floor((Date.parse(call.endedAt) - Date.parse(call.answeredAt)) / 1_000)) : 0,
      cleanLine(call.endedReason, 120) || null,
      call.startedAt,
    );
  }

  function terminalize(call, state, reason, outcome = null) {
    if (!call || CALL_TERMINAL.has(call.state)) return call;
    if (!CALL_TERMINAL.has(state)) throw new Error(`Invalid terminal call state: ${state}`);
    call.state = state;
    call.endedAt = nowIso();
    call.endedReason = cleanLine(reason, 120) || state;
    call.deadline = null;
    persistCall(call, outcome);
    emitCallState(call);
    setTimeout(() => {
      if (activeCalls.get(call.id) === call && CALL_TERMINAL.has(call.state)) activeCalls.delete(call.id);
    }, CALL_RETENTION_MS).unref?.();
    return call;
  }

  function terminateBetween(firstUserId, secondUserId, reason = "blocked") {
    for (const call of activeCalls.values()) {
      if (CALL_TERMINAL.has(call.state)) continue;
      if ([call.callerId, call.calleeId].includes(firstUserId) && [call.callerId, call.calleeId].includes(secondUserId)) {
        terminalize(call, "failed", reason, reason === "blocked" ? "blocked" : "failed");
      }
    }
  }

  function findActiveForUser(userId) {
    return [...activeCalls.values()].find((call) => !CALL_TERMINAL.has(call.state) && [call.callerId, call.calleeId].includes(userId));
  }

  function requireCall(socket, callId) {
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

  function targetSessionRoom(call, senderId) {
    if (call.callerId === senderId) return call.calleeSessionId ? `session:${call.calleeSessionId}` : `user:${call.calleeId}`;
    return `session:${call.callerSessionId}`;
  }

  app.use("/api/v3", requestContext);

  app.get("/api/v3/users/search", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const limitResult = limiter.consume(`search:${auth.user.id}`, 30, 60_000);
    if (!limitResult.ok) throw connectError("Слишком много поисковых запросов.", "RATE_LIMITED", 429, { retryAfter: limitResult.retryAfter });
    const query = cleanLine(request.query.q, 48).toLowerCase().replace(/^@/, "");
    if (query.length < 2) return response.json({ ok: true, requestId: request.connectRequestId, users: [], nextCursor: null });
    const limit = Math.max(1, Math.min(50, Number(request.query.limit) || 20));
    const cursor = decodeCursor(request.query.cursor);
    const state = store.read();
    const sorted = state.users
      .filter((user) => !user.disabledAt && user.id !== auth.user.id && !isBlockedEither(state, auth.user.id, user.id))
      .filter((user) => user.username.toLowerCase().includes(query) || user.displayName.toLowerCase().includes(query))
      .sort((left, right) => left.username.localeCompare(right.username) || left.id.localeCompare(right.id));
    const foundStart = cursor ? sorted.findIndex((user) => user.username > cursor.username || (user.username === cursor.username && user.id > cursor.id)) : 0;
    const start = foundStart < 0 ? sorted.length : foundStart;
    const page = sorted.slice(start, start + limit);
    const users = page.map((user) => {
      const requestItem = state.contactRequests.find((item) => {
        expireRequest(item);
        return item.status === "pending" && [item.fromUserId, item.toUserId].includes(auth.user.id) && [item.fromUserId, item.toUserId].includes(user.id);
      });
      return {
        ...safeProfile(state, user, auth.user.id),
        contact: areContacts(state, auth.user.id, user.id),
        requestDirection: requestItem ? (requestItem.fromUserId === auth.user.id ? "outgoing" : "incoming") : null,
      };
    });
    const tail = page.at(-1);
    response.json({
      ok: true,
      requestId: request.connectRequestId,
      users,
      nextCursor: tail && start + page.length < sorted.length ? encodeCursor({ username: tail.username, id: tail.id }) : null,
    });
  }));

  app.get("/api/v3/users/:id/profile", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const state = store.read();
    const user = findUser(state, cleanLine(request.params.id, 160));
    const profile = safeProfile(state, user, auth.user.id);
    if (!profile) throw connectError("Профиль недоступен.", "RESOURCE_NOT_FOUND", 404);
    const requestItem = state.contactRequests.find((item) => item.status === "pending" && [item.fromUserId, item.toUserId].includes(auth.user.id) && [item.fromUserId, item.toUserId].includes(user.id));
    const conversation = state.conversations.find((item) => item.type === "dm" && item.userIds.includes(auth.user.id) && item.userIds.includes(user.id));
    const rooms = state.rooms.filter((room) => state.roomMembers.some((member) => member.roomId === room.id && member.userId === auth.user.id)
      && state.roomMembers.some((member) => member.roomId === room.id && member.userId === user.id));
    response.json({
      ok: true,
      requestId: request.connectRequestId,
      user: profile,
      relationship: {
        self: auth.user.id === user.id,
        contact: auth.user.id !== user.id && areContacts(state, auth.user.id, user.id),
        blockedByMe: state.blocks.some((block) => block.blockerId === auth.user.id && block.blockedId === user.id),
        requestDirection: requestItem ? (requestItem.fromUserId === auth.user.id ? "outgoing" : "incoming") : null,
        requestId: requestItem?.id ?? null,
        conversationId: conversation?.id ?? null,
        sharedRooms: rooms.slice(0, 12).map((room) => ({ id: room.id, name: room.name })),
        canCall: auth.user.id !== user.id && areContacts(state, auth.user.id, user.id) && !isBlockedEither(state, auth.user.id, user.id),
      },
      deepLink: { serverId, type: "profile", id: user.id },
    });
  }));

  app.get("/api/v3/deep-links/resolve", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const requestedServerId = cleanLine(request.query.serverId, 160);
    const type = cleanLine(request.query.type, 32);
    const id = cleanLine(request.query.id, 160);
    if (requestedServerId !== serverId || type !== "profile" || !SAFE_ID.test(id)) {
      throw connectError("Объект ссылки недоступен.", "RESOURCE_NOT_FOUND", 404);
    }
    const state = store.read();
    const profile = safeProfile(state, findUser(state, id), auth.user.id);
    if (!profile) throw connectError("Объект ссылки недоступен.", "RESOURCE_NOT_FOUND", 404);
    response.json({ ok: true, requestId: request.connectRequestId, serverId, object: { type: "profile", id, profile } });
  }));

  app.post("/api/v3/contacts/requests", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const key = idempotencyKey(request);
    const scope = "contact.request.create";
    cleanupIdempotency();
    const duplicate = readIdempotency(auth.user.id, scope, key);
    if (duplicate) return response.status(duplicate.status).json({ ...duplicate.body, duplicate: true });
    const targetId = cleanLine(request.body?.userId, 160);
    if (!SAFE_ID.test(targetId) || targetId === auth.user.id) throw connectError("Некорректный пользователь.", "VALIDATION_FAILED", 400);
    const rate = limiter.consume(`contact-request:${auth.user.id}`, 20, 60 * 60 * 1_000);
    if (!rate.ok) throw connectError("Лимит заявок превышен.", "RATE_LIMITED", 429, { retryAfter: rate.retryAfter });

    const result = await store.mutate((state) => {
      const target = findUser(state, targetId);
      if (!target) throw connectError("Пользователь не найден.", "RESOURCE_NOT_FOUND", 404);
      if (isBlockedEither(state, auth.user.id, targetId)) throw connectError("Операция запрещена политикой блокировки.", "CONTACT_BLOCKED", 403);
      if (areContacts(state, auth.user.id, targetId)) throw connectError("Пользователь уже в контактах.", "STATE_CONFLICT", 409);
      const related = state.contactRequests.filter((item) => [item.fromUserId, item.toUserId].includes(auth.user.id) && [item.fromUserId, item.toUserId].includes(targetId));
      for (const item of related) expireRequest(item);
      const pending = related.find((item) => item.status === "pending");
      if (pending) {
        if (pending.fromUserId === auth.user.id) return { item: pending, duplicate: true };
        throw connectError("Уже существует входящая заявка.", "STATE_CONFLICT", 409, { requestId: pending.id });
      }
      const item = {
        id: crypto.randomUUID(),
        fromUserId: auth.user.id,
        toUserId: targetId,
        status: "pending",
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + CONTACT_REQUEST_TTL_MS).toISOString(),
        resolvedAt: null,
      };
      state.contactRequests.push(item);
      appendEvent(state, { type: "contact.request_changed", actorId: auth.user.id, userIds: [auth.user.id, targetId], payload: { requestId: item.id, status: item.status } });
      return { item, duplicate: false };
    });
    appendConnectAudit(auth.user.id, "contact.request_created", targetId, result.item.id);
    const body = { ok: true, requestId: request.connectRequestId, contactRequest: requestView(store.read(), result.item, auth.user.id), duplicate: result.duplicate };
    const status = result.duplicate ? 200 : 201;
    writeIdempotency(auth.user.id, scope, key, status, body);
    emitRequestChange(result.item, "created");
    response.status(status).json(body);
  }));

  app.patch("/api/v3/contacts/requests/:id", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const requestId = cleanLine(request.params.id, 160);
    const action = cleanLine(request.body?.action, 24);
    if (!SAFE_ID.test(requestId) || !["accept", "reject", "cancel"].includes(action)) throw connectError("Некорректный переход заявки.", "VALIDATION_FAILED", 400);
    const key = idempotencyKey(request);
    const scope = `contact.request.${requestId}.${action}`;
    const duplicate = readIdempotency(auth.user.id, scope, key);
    if (duplicate) return response.status(duplicate.status).json({ ...duplicate.body, duplicate: true });

    const result = await store.mutate((state) => {
      const item = state.contactRequests.find((candidate) => candidate.id === requestId && [candidate.fromUserId, candidate.toUserId].includes(auth.user.id));
      if (!item) throw connectError("Заявка не найдена.", "RESOURCE_NOT_FOUND", 404);
      expireRequest(item);
      const targetState = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled";
      if (item.status === targetState) return { item, duplicate: true, conversation: null };
      if (item.status !== "pending") throw connectError("Состояние заявки изменилось.", "STATE_CONFLICT", 409, { currentState: item.status });
      if (action === "cancel" && item.fromUserId !== auth.user.id) throw connectError("Отменить заявку может только отправитель.", "FORBIDDEN", 403);
      if (["accept", "reject"].includes(action) && item.toUserId !== auth.user.id) throw connectError("Решение принимает получатель заявки.", "FORBIDDEN", 403);
      if (isBlockedEither(state, item.fromUserId, item.toUserId)) throw connectError("Операция запрещена политикой блокировки.", "CONTACT_BLOCKED", 403);
      item.status = targetState;
      item.resolvedAt = nowIso();
      let conversation = null;
      if (targetState === "accepted") {
        const [userAId, userBId] = [item.fromUserId, item.toUserId].sort();
        if (!areContacts(state, userAId, userBId)) state.contacts.push({ id: crypto.randomUUID(), userAId, userBId, createdAt: nowIso() });
        conversation = state.conversations.find((candidate) => candidate.type === "dm" && candidate.userIds.includes(userAId) && candidate.userIds.includes(userBId));
        if (!conversation) {
          conversation = { id: crypto.randomUUID(), type: "dm", userIds: [userAId, userBId], roomId: null, createdAt: nowIso() };
          state.conversations.push(conversation);
        }
      }
      appendEvent(state, { type: "contact.request_changed", actorId: auth.user.id, userIds: [item.fromUserId, item.toUserId], payload: { requestId: item.id, status: item.status } });
      return { item, duplicate: false, conversation };
    });
    const auditAction = { accept: "contact.request_accepted", reject: "contact.request_rejected", cancel: "contact.request_cancelled" }[action];
    appendConnectAudit(auth.user.id, auditAction, otherParticipant({ callerId: result.item.fromUserId, calleeId: result.item.toUserId }, auth.user.id), result.item.id);
    const body = {
      ok: true,
      requestId: request.connectRequestId,
      contactRequest: requestView(store.read(), result.item, auth.user.id),
      conversationId: result.conversation?.id ?? null,
      duplicate: result.duplicate,
    };
    writeIdempotency(auth.user.id, scope, key, 200, body);
    emitRequestChange(result.item, action);
    response.json(body);
  }));

  app.delete("/api/v3/contacts/:userId", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const targetId = cleanLine(request.params.userId, 160);
    if (!SAFE_ID.test(targetId) || targetId === auth.user.id) throw connectError("Некорректный пользователь.", "VALIDATION_FAILED", 400);
    const removed = await store.mutate((state) => {
      if (!findUser(state, targetId)) throw connectError("Пользователь не найден.", "RESOURCE_NOT_FOUND", 404);
      const before = state.contacts.length;
      state.contacts = state.contacts.filter((contact) => !([contact.userAId, contact.userBId].includes(auth.user.id) && [contact.userAId, contact.userBId].includes(targetId)));
      for (const item of state.contactRequests) {
        if (item.status === "pending" && [item.fromUserId, item.toUserId].includes(auth.user.id) && [item.fromUserId, item.toUserId].includes(targetId)) {
          item.status = "cancelled";
          item.resolvedAt = nowIso();
        }
      }
      appendEvent(state, { type: "contact.removed", actorId: auth.user.id, userIds: [auth.user.id, targetId], payload: { targetUserId: targetId } });
      return before !== state.contacts.length;
    });
    appendConnectAudit(auth.user.id, "contact.removed", targetId);
    emitUsers([auth.user.id, targetId], "contact.request_changed", { eventId: crypto.randomUUID(), version: 1, reason: "contact_removed", targetUserId: targetId });
    emitUsers([auth.user.id, targetId], "data:refresh", { reason: "contact.removed" });
    schedulePresence();
    response.json({ ok: true, requestId: request.connectRequestId, removed, duplicate: !removed });
  }));

  app.post("/api/v3/blocks/:userId", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const targetId = cleanLine(request.params.userId, 160);
    if (!SAFE_ID.test(targetId) || targetId === auth.user.id) throw connectError("Некорректный пользователь.", "VALIDATION_FAILED", 400);
    const created = await store.mutate((state) => {
      if (!findUser(state, targetId)) throw connectError("Пользователь не найден.", "RESOURCE_NOT_FOUND", 404);
      const existing = state.blocks.find((block) => block.blockerId === auth.user.id && block.blockedId === targetId);
      if (!existing) state.blocks.push({ id: crypto.randomUUID(), blockerId: auth.user.id, blockedId: targetId, createdAt: nowIso() });
      state.contacts = state.contacts.filter((contact) => !([contact.userAId, contact.userBId].includes(auth.user.id) && [contact.userAId, contact.userBId].includes(targetId)));
      for (const item of state.contactRequests) {
        if (item.status === "pending" && [item.fromUserId, item.toUserId].includes(auth.user.id) && [item.fromUserId, item.toUserId].includes(targetId)) {
          item.status = "cancelled";
          item.resolvedAt = nowIso();
        }
      }
      appendEvent(state, { type: "contact.blocked", actorId: auth.user.id, userIds: [auth.user.id, targetId], payload: { targetUserId: targetId } });
      return !existing;
    });
    terminateBetween(auth.user.id, targetId, "blocked");
    appendConnectAudit(auth.user.id, "contact.blocked", targetId);
    emitUsers([auth.user.id, targetId], "data:refresh", { reason: "contact.blocked" });
    schedulePresence();
    response.status(created ? 201 : 200).json({ ok: true, requestId: request.connectRequestId, blocked: true, duplicate: !created });
  }));

  app.delete("/api/v3/blocks/:userId", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const targetId = cleanLine(request.params.userId, 160);
    if (!SAFE_ID.test(targetId)) throw connectError("Некорректный пользователь.", "VALIDATION_FAILED", 400);
    const removed = await store.mutate((state) => {
      const before = state.blocks.length;
      state.blocks = state.blocks.filter((block) => !(block.blockerId === auth.user.id && block.blockedId === targetId));
      appendEvent(state, { type: "contact.unblocked", actorId: auth.user.id, userIds: [auth.user.id], payload: { targetUserId: targetId } });
      return before !== state.blocks.length;
    });
    appendConnectAudit(auth.user.id, "contact.unblocked", targetId);
    emitUsers([auth.user.id], "data:refresh", { reason: "contact.unblocked" });
    schedulePresence();
    response.json({ ok: true, requestId: request.connectRequestId, unblocked: removed, duplicate: !removed });
  }));

  app.get("/api/v3/privacy", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    response.json({ ok: true, requestId: request.connectRequestId, privacy: privacyFor(store.read((state) => findUser(state, auth.user.id))) });
  }));

  app.patch("/api/v3/privacy", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const presenceVisibility = cleanLine(request.body?.presenceVisibility, 24);
    const lastSeenVisibility = cleanLine(request.body?.lastSeenVisibility, 24);
    const readReceiptsVisibility = cleanLine(request.body?.readReceiptsVisibility, 24);
    if (!PRESENCE_VISIBILITY.has(presenceVisibility) || !LAST_SEEN_VISIBILITY.has(lastSeenVisibility) || !READ_VISIBILITY.has(readReceiptsVisibility)) {
      throw connectError("Некорректные настройки приватности.", "VALIDATION_FAILED", 400);
    }
    const privacy = await store.mutate((state) => {
      const user = findUser(state, auth.user.id);
      if (!user) throw connectError("Пользователь не найден.", "RESOURCE_NOT_FOUND", 404);
      Object.assign(user, { presenceVisibility, lastSeenVisibility, readReceiptsVisibility });
      appendEvent(state, { type: "privacy.changed", actorId: user.id, userIds: [user.id], payload: { presenceVisibility, lastSeenVisibility, readReceiptsVisibility } });
      return privacyFor(user);
    });
    store.db.prepare(`INSERT INTO connect_privacy
      (user_id,presence_visibility,last_seen_visibility,read_receipts_visibility,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      presence_visibility=excluded.presence_visibility,last_seen_visibility=excluded.last_seen_visibility,
      read_receipts_visibility=excluded.read_receipts_visibility,updated_at=excluded.updated_at`)
      .run(auth.user.id, presenceVisibility, lastSeenVisibility, readReceiptsVisibility, nowIso());
    appendConnectAudit(auth.user.id, "privacy.changed", null, null, { presenceVisibility, lastSeenVisibility, readReceiptsVisibility });
    schedulePresence();
    response.json({ ok: true, requestId: request.connectRequestId, privacy });
  }));

  app.post("/api/v3/calls/:callId/turn-credentials", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const callId = cleanLine(request.params.callId, 160);
    const call = activeCalls.get(callId);
    if (!call || ![call.callerId, call.calleeId].includes(auth.user.id) || CALL_TERMINAL.has(call.state)) throw connectError("Вызов недоступен.", "RESOURCE_NOT_FOUND", 404);
    if (!turnSecret || String(turnSecret).length < 24 || configuredTurnUrls.length === 0) {
      throw connectError("TURN relay временно недоступен.", "TURN_UNAVAILABLE", 503);
    }
    const expires = Math.floor(Date.now() / 1_000) + turnCredentialTtl;
    const subject = hash(auth.user.id).slice(0, 20);
    const username = `${expires}:${subject}:${call.id}`;
    const credential = crypto.createHmac("sha256", String(turnSecret)).update(username).digest("base64");
    const iceServers = configuredTurnUrls.map((url) => /^stun:/i.test(url) ? { urls: [url] } : { urls: [url], username, credential, credentialType: "password" });
    response.json({ ok: true, requestId: request.connectRequestId, callId, expiresAt: new Date(expires * 1_000).toISOString(), iceServers });
  }));

  app.get("/api/v3/calls/history", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const limit = Math.max(1, Math.min(100, Number(request.query.limit) || 30));
    const cursor = decodeCursor(request.query.cursor);
    const params = [auth.user.id, auth.user.id];
    let cursorClause = "";
    if (cursor?.endedAt && cursor?.id) {
      cursorClause = " AND (ended_at < ? OR (ended_at = ? AND id < ?))";
      params.push(cursor.endedAt, cursor.endedAt, cursor.id);
    }
    params.push(limit + 1);
    const rows = store.db.prepare(`SELECT * FROM connect_call_history
      WHERE (caller_id=? OR callee_id=?)${cursorClause}
      ORDER BY ended_at DESC,id DESC LIMIT ?`).all(...params);
    const state = store.read();
    const page = rows.slice(0, limit).map((row) => {
      const peerId = row.caller_id === auth.user.id ? row.callee_id : row.caller_id;
      return {
        callId: row.id,
        direction: row.caller_id === auth.user.id ? "outgoing" : "incoming",
        peer: safeProfile(state, findUser(state, peerId), auth.user.id, { allowBlockedByViewer: true }) || { id: peerId, displayName: "Недоступный пользователь", username: "hidden" },
        state: row.state,
        outcome: row.outcome,
        startedAt: row.started_at,
        answeredAt: row.answered_at,
        endedAt: row.ended_at,
        duration: Number(row.duration_seconds || 0),
      };
    });
    const tail = rows.length > limit ? rows[limit - 1] : null;
    response.json({ ok: true, requestId: request.connectRequestId, calls: page, nextCursor: tail ? encodeCursor({ endedAt: tail.ended_at, id: tail.id }) : null });
  }));

  app.get("/api/v3/calls/diagnostics", authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    response.json({
      ok: true,
      requestId: request.connectRequestId,
      diagnostics: {
        webrtcSignaling: true,
        turnConfigured: Boolean(turnSecret && configuredTurnUrls.length),
        relayRequired: true,
        activeCall: Boolean(findActiveForUser(auth.user.id)),
        selectedDeviceId: sessionDeviceId(auth.session),
        contentIncluded: false,
        candidatesIncluded: false,
        userIdentifiersIncluded: false,
      },
    });
  }));

  io.on("connection", (socket) => {
    const userId = socket.data.user?.id;
    const sessionId = socket.data.sessionId;
    if (!userId || !sessionId) return;
    if (!socketsBySession.has(sessionId)) socketsBySession.set(sessionId, new Set());
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
    socketsBySession.get(sessionId).add(socket.id);
    socketsByUser.get(userId).add(socket.id);
    schedulePresence();

    socket.on("call:start", async (payload, acknowledge = () => {}) => {
      try {
        const auth = activeSession(socket);
        const targetId = cleanLine(payload?.targetUserId, 160);
        const callId = cleanLine(payload?.callId, 160);
        if (!SAFE_ID.test(callId) || !SAFE_ID.test(targetId) || targetId === auth.user.id) throw connectError("Некорректный вызов.", "VALIDATION_FAILED", 400);
        const existing = activeCalls.get(callId);
        if (existing && existing.callerId === auth.user.id) return acknowledge({ ok: true, duplicate: true, call: callView(existing, auth.user.id) });
        if (existing) throw connectError("callId уже используется.", "CALL_STATE_CONFLICT", 409);
        const target = findUser(auth.state, targetId);
        if (!target || !auth.state.sessions.some((session) => session.userId === targetId && Date.parse(session.expiresAt) > Date.now())) {
          throw connectError("Пользователь не может принять вызов.", "CALL_TARGET_UNAVAILABLE", 409);
        }
        if (isBlockedEither(auth.state, auth.user.id, targetId)) throw connectError("Вызов запрещён политикой блокировки.", "CONTACT_BLOCKED", 403);
        if (!areContacts(auth.state, auth.user.id, targetId)) throw connectError("Звонки доступны только контактам.", "POLICY_RESTRICTED", 403);
        if (findActiveForUser(auth.user.id) || findActiveForUser(targetId)) throw connectError("Пользователь уже участвует в вызове.", "CALL_TARGET_UNAVAILABLE", 409);
        const deviceId = sessionDeviceId(auth.session);
        for (const [key, limit, windowMs] of [
          [`call-account:${auth.user.id}`, 12, 10 * 60_000],
          [`call-device:${auth.user.id}:${deviceId}`, 8, 10 * 60_000],
          [`call-target:${auth.user.id}:${targetId}`, 4, 5 * 60_000],
        ]) {
          const rate = limiter.consume(key, limit, windowMs);
          if (!rate.ok) throw connectError("Слишком много попыток вызова.", "RATE_LIMITED", 429, { retryAfter: rate.retryAfter });
        }
        const call = {
          id: callId,
          callerId: auth.user.id,
          calleeId: targetId,
          callerSessionId: auth.session.id,
          calleeSessionId: null,
          state: "ringing",
          startedAt: nowIso(),
          answeredAt: null,
          endedAt: null,
          endedReason: null,
          deadline: Date.now() + CALL_RING_MS,
          sequences: new Map([[auth.user.id, 0], [targetId, 0]]),
        };
        activeCalls.set(call.id, call);
        io.to(`user:${targetId}`).emit("call.incoming", { eventId: crypto.randomUUID(), version: 1, call: callView(call, targetId) });
        emitCallState(call);
        appendConnectAudit(auth.user.id, "call.started", targetId, call.id);
        acknowledge({ ok: true, call: callView(call, auth.user.id) });
      } catch (error) { acknowledge(safeAckError(error)); }
    });

    socket.on("call:answer", async (payload, acknowledge = () => {}) => {
      try {
        const callId = cleanLine(payload?.callId, 160);
        const auth = requireCall(socket, callId);
        if (auth.call.calleeId !== auth.user.id) throw connectError("Ответить может только получатель.", "FORBIDDEN", 403);
        if (auth.call.state === "connecting" && auth.call.calleeSessionId === auth.session.id) return acknowledge({ ok: true, duplicate: true, call: callView(auth.call, auth.user.id) });
        if (auth.call.state !== "ringing") throw connectError("Вызов уже изменил состояние.", "CALL_STATE_CONFLICT", 409, { currentState: auth.call.state });
        auth.call.calleeSessionId = auth.session.id;
        auth.call.state = "connecting";
        auth.call.answeredAt = nowIso();
        auth.call.deadline = Date.now() + CALL_CONNECT_MS;
        emitCallState(auth.call);
        acknowledge({ ok: true, call: callView(auth.call, auth.user.id) });
      } catch (error) { acknowledge(safeAckError(error)); }
    });

    socket.on("call:decline", async (payload, acknowledge = () => {}) => {
      try {
        const auth = requireCall(socket, cleanLine(payload?.callId, 160));
        if (auth.call.calleeId !== auth.user.id) throw connectError("Отклонить вызов может только получатель.", "FORBIDDEN", 403);
        if (auth.call.state === "declined") return acknowledge({ ok: true, duplicate: true, call: callView(auth.call, auth.user.id) });
        if (auth.call.state !== "ringing") throw connectError("Вызов уже изменил состояние.", "CALL_STATE_CONFLICT", 409, { currentState: auth.call.state });
        terminalize(auth.call, "declined", "declined", "declined");
        acknowledge({ ok: true, call: callView(auth.call, auth.user.id) });
      } catch (error) { acknowledge(safeAckError(error)); }
    });

    socket.on("call:end", async (payload, acknowledge = () => {}) => {
      try {
        const auth = requireCall(socket, cleanLine(payload?.callId, 160));
        if (CALL_TERMINAL.has(auth.call.state)) return acknowledge({ ok: true, duplicate: true, call: callView(auth.call, auth.user.id) });
        terminalize(auth.call, auth.call.answeredAt ? "ended" : "failed", cleanLine(payload?.reason, 120) || "ended", auth.call.answeredAt ? "completed" : "failed");
        acknowledge({ ok: true, call: callView(auth.call, auth.user.id) });
      } catch (error) { acknowledge(safeAckError(error)); }
    });

    socket.on("call:state", async (payload, acknowledge = () => {}) => {
      try {
        const auth = requireCall(socket, cleanLine(payload?.callId, 160));
        const next = cleanLine(payload?.state, 24);
        const allowed = {
          connecting: new Set(["active", "failed"]),
          active: new Set(["reconnecting", "failed"]),
          reconnecting: new Set(["active", "failed"]),
        };
        if (auth.call.state === next) return acknowledge({ ok: true, duplicate: true, call: callView(auth.call, auth.user.id) });
        if (!allowed[auth.call.state]?.has(next)) throw connectError("Недопустимый переход состояния вызова.", "CALL_STATE_CONFLICT", 409, { currentState: auth.call.state });
        if (next === "failed") terminalize(auth.call, "failed", cleanLine(payload?.reason, 120) || "peer_failed", "failed");
        else {
          auth.call.state = next;
          auth.call.deadline = next === "reconnecting" ? Date.now() + CALL_CONNECT_MS : null;
          emitCallState(auth.call);
        }
        acknowledge({ ok: true, call: callView(auth.call, auth.user.id) });
      } catch (error) { acknowledge(safeAckError(error)); }
    });

    socket.on("call.signal", async (payload, acknowledge = () => {}) => {
      try {
        const signal = validateSignalPayload(payload);
        const auth = requireCall(socket, signal.callId);
        if (!["connecting", "active", "reconnecting"].includes(auth.call.state)) throw connectError("Signal несовместим с текущим состоянием.", "CALL_STATE_CONFLICT", 409, { currentState: auth.call.state });
        const last = Number(auth.call.sequences.get(auth.user.id) || 0);
        if (signal.sequence <= last) return acknowledge({ ok: true, duplicate: true, sequence: last });
        if (signal.sequence !== last + 1) throw connectError("Нарушена последовательность signaling.", "CALL_STATE_CONFLICT", 409, { expectedSequence: last + 1 });
        auth.call.sequences.set(auth.user.id, signal.sequence);
        io.to(targetSessionRoom(auth.call, auth.user.id)).emit("call.signal", {
          eventId: crypto.randomUUID(),
          version: 1,
          callId: auth.call.id,
          fromUserId: auth.user.id,
          sequence: signal.sequence,
          kind: signal.kind,
          data: signal.data,
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        });
        acknowledge({ ok: true, sequence: signal.sequence });
      } catch (error) { acknowledge(safeAckError(error)); }
    });

    socket.on("disconnect", () => {
      socketsBySession.get(sessionId)?.delete(socket.id);
      socketsByUser.get(userId)?.delete(socket.id);
      if (socketsBySession.get(sessionId)?.size === 0) socketsBySession.delete(sessionId);
      if (socketsByUser.get(userId)?.size === 0) socketsByUser.delete(userId);
      const currentState = store.read();
      for (const call of activeCalls.values()) {
        if (CALL_TERMINAL.has(call.state)) continue;
        const bound = call.callerSessionId === sessionId || call.calleeSessionId === sessionId;
        if (bound && !socketsBySession.has(sessionId)) {
          terminalize(call, "failed", "session_disconnected", "revoked");
          continue;
        }
        if (call.state === "ringing" && call.calleeId === userId && !socketsByUser.has(userId)) {
          const target = findUser(currentState, userId);
          const hasValidSession = Boolean(target && currentState.sessions.some((candidate) => candidate.userId === userId && Date.parse(candidate.expiresAt) > Date.now()));
          if (!hasValidSession) terminalize(call, "failed", "target_session_revoked", "revoked");
        }
      }
      schedulePresence();
    });
  });

  const maintenanceTimer = setInterval(() => {
    const now = Date.now();
    for (const call of activeCalls.values()) {
      if (CALL_TERMINAL.has(call.state) || !call.deadline || call.deadline > now) continue;
      if (call.state === "ringing") terminalize(call, "missed", "ring_timeout", "missed");
      else terminalize(call, "failed", "connection_timeout", "failed");
    }
    cleanupIdempotency();
    limiter.cleanup(now);
  }, 1_000);
  maintenanceTimer.unref?.();

  schedulePresence();
  log("Connect 3.6.0 mounted: contacts/privacy/presence/call signaling", "info");

  return {
    status() {
      return {
        contacts: true,
        privacyPresence: true,
        directCalls: true,
        activeCalls: [...activeCalls.values()].filter((call) => !CALL_TERMINAL.has(call.state)).length,
        turnConfigured: Boolean(turnSecret && configuredTurnUrls.length),
        signalMaxBytes: MAX_SIGNAL_BYTES,
      };
    },
    terminateBetween,
    publishPresence: schedulePresence,
    close() {
      stopped = true;
      clearTimeout(presenceTimer);
      clearInterval(maintenanceTimer);
      for (const call of activeCalls.values()) {
        if (!CALL_TERMINAL.has(call.state)) terminalize(call, "failed", "server_shutdown", "unavailable");
      }
      if (typeof setPresencePublisher === "function") setPresencePublisher(null);
      if (io.emit !== originalIoEmit) io.emit = originalIoEmit;
      if (app.response.json === responseJsonWrapper) app.response.json = originalResponseJson;
    },
  };
}

module.exports = {
  CALL_SIGNAL_KINDS,
  MAX_SIGNAL_BYTES,
  SlidingWindowLimiter,
  defaultPrivacy,
  mountConnect,
  parseTurnUrls,
  safeProfile,
  validateSignalPayload,
};
