"use strict";

const crypto = require("node:crypto");
const { hashToken, parseSessionToken, sessionUser } = require("./security.cjs");
const { canAccessConversation, findConversation, isBlockedEither, isRoomBanned } = require("./model.cjs");
const { TrustRepositoryError } = require("./trust-repository.cjs");

function safeRequestId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(text) ? text : crypto.randomUUID();
}

function stableError(response, status, code, message, requestId, details = {}) {
  return response.status(status).json({ ok: false, code, message, requestId, details });
}

function userSocketRoom(userId) {
  return `user:${userId}`;
}

function conversationUsers(state, conversation) {
  if (conversation.type === "dm") return conversation.userIds.filter((userId) => state.users.some((user) => user.id === userId && !user.disabledAt));
  return state.roomMembers
    .filter((member) => member.roomId === conversation.roomId && !isRoomBanned(state, conversation.roomId, member.userId))
    .map((member) => member.userId);
}

function mountTrustV4Routes({ app, store, io, repository, log = () => {} }) {
  if (!app || !store || !io || !repository) throw new Error("Trust v4 routes require app, store, io and repository.");

  function requestContext(request, response, next) {
    request.trustRequestId = safeRequestId(request.headers["x-request-id"]);
    response.setHeader("X-Request-ID", request.trustRequestId);
    response.setHeader("Cache-Control", "no-store");
    next();
  }

  function authRequired(request, response, next) {
    const token = parseSessionToken(request.headers.cookie);
    const tokenHash = token ? hashToken(token) : null;
    const session = tokenHash ? store.read((state) => state.sessions.find(
      (item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now(),
    )) : null;
    const user = sessionUser(store, token);
    if (!user || !session) return stableError(response, 401, "AUTH_REQUIRED", "Требуется вход в аккаунт.", request.trustRequestId);
    if (user.mustChangePassword) return stableError(response, 428, "PASSWORD_CHANGE_REQUIRED", "Сначала измените временный пароль.", request.trustRequestId);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const supplied = String(request.headers["x-nexora-csrf"] || "");
      const expected = String(session.csrfToken || "");
      const valid = supplied && expected && supplied.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
      if (!valid) return stableError(response, 403, "CSRF_INVALID", "Запрос отклонён защитой CSRF.", request.trustRequestId);
      if (store.read((state) => state.settings.emergencyReadOnly)) {
        return stableError(response, 503, "SERVER_READ_ONLY", "Сервер временно работает только для чтения.", request.trustRequestId);
      }
    }
    request.trustAuth = { token, tokenHash, session, user };
    next();
  }

  async function rateLimit(request, response, next) {
    const userId = request.trustAuth?.user?.id || "anonymous";
    const route = `${request.method}:${request.path.replace(/[A-Za-z0-9_-]{24,}/g, ":id")}`;
    const key = `trust:${userId}:${route}`;
    const now = Date.now();
    const allowed = await store.mutate((state) => {
      state.rateLimits ||= [];
      let bucket = state.rateLimits.find((item) => item.key === key);
      if (!bucket || now - Date.parse(bucket.windowStartedAt) >= 60_000) {
        bucket = { key, windowStartedAt: new Date(now).toISOString(), hits: 0 };
        state.rateLimits = state.rateLimits.filter((item) => item.key !== key);
        state.rateLimits.push(bucket);
      }
      if (bucket.hits >= 180) return false;
      bucket.hits += 1;
      return true;
    });
    if (!allowed) return stableError(response, 429, "RATE_LIMITED", "Слишком много Trust Core запросов.", request.trustRequestId, { retryAfter: 60 });
    next();
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try {
        await handler(request, response);
      } catch (error) {
        if (!(error instanceof TrustRepositoryError)) log(`Trust API ${request.trustRequestId}: ${error.stack || error.message}`, "error");
        return stableError(
          response,
          error instanceof TrustRepositoryError ? error.status : Number(error.status || 500),
          error instanceof TrustRepositoryError ? error.code : String(error.code || "INTERNAL_ERROR"),
          error instanceof TrustRepositoryError ? error.message : "Временная ошибка Trust Delivery Service.",
          request.trustRequestId,
          error instanceof TrustRepositoryError ? error.details : {},
        );
      }
    };
  }

  function requireConversation(conversationId, userId) {
    const state = store.read();
    const conversation = findConversation(state, String(conversationId || ""));
    if (!canAccessConversation(state, conversation, userId)) {
      throw new TrustRepositoryError("Conversation недоступен.", "TRUST_CONVERSATION_ACCESS_DENIED", 403);
    }
    if (conversation.type === "room" && isRoomBanned(state, conversation.roomId, userId)) {
      throw new TrustRepositoryError("Пользователь заблокирован в комнате.", "ROOM_BANNED", 403);
    }
    if (conversation.type === "dm") {
      const peerId = conversation.userIds.find((id) => id !== userId);
      if (peerId && isBlockedEither(state, userId, peerId)) {
        throw new TrustRepositoryError("Защищённый канал недоступен из-за блокировки контакта.", "CONTACT_BLOCKED", 403);
      }
    }
    return { state, conversation };
  }

  function rejectPlaintext(body) {
    const forbidden = ["text", "plaintext", "message", "content", "body"];
    const present = forbidden.find((key) => Object.prototype.hasOwnProperty.call(body || {}, key));
    if (present) throw new TrustRepositoryError("Delivery Service принимает только opaque MLS payload.", "TRUST_PLAINTEXT_REJECTED", 400, { field: present });
  }

  function notifyConversation(conversationId, type, payload) {
    const state = store.read();
    const conversation = findConversation(state, conversationId);
    if (!conversation) return;
    for (const userId of conversationUsers(state, conversation)) {
      io.to(userSocketRoom(userId)).emit("trust:event", { type, conversationId, payload });
    }
  }

  app.use("/api/v4/trust", requestContext, authRequired, rateLimit);

  app.get("/api/v4/trust/status", (request, response) => {
    response.json({
      ok: true,
      requestId: request.trustRequestId,
      protocol: "MLS_1_0",
      ciphersuite: "MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519",
      schemaVersion: store.stats().schemaVersion,
      serverDecrypts: false,
      plaintextAccepted: false,
      transparency: repository.transparencyRoot(),
    });
  });

  app.get("/api/v4/trust/devices", (request, response) => {
    response.json({ ok: true, requestId: request.trustRequestId, devices: repository.listDevices(request.trustAuth.user.id) });
  });

  app.post("/api/v4/trust/devices", asyncRoute(async (request, response) => {
    rejectPlaintext(request.body);
    const device = repository.registerDevice({
      id: request.body?.id,
      userId: request.trustAuth.user.id,
      label: request.body?.label,
      credentialIdentity: request.body?.credentialIdentity,
      signatureKey: request.body?.signatureKey,
    });
    io.to(userSocketRoom(request.trustAuth.user.id)).emit("trust:event", { type: "device.registered", payload: { deviceId: device.id } });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, device });
  }));

  app.delete("/api/v4/trust/devices/:deviceId", asyncRoute(async (request, response) => {
    const actorDeviceId = String(request.headers["x-nexora-device-id"] || "");
    const device = repository.revokeDevice(request.params.deviceId, request.trustAuth.user.id, actorDeviceId || null);
    io.to(userSocketRoom(request.trustAuth.user.id)).emit("trust:event", { type: "device.revoked", payload: { deviceId: device.id } });
    response.json({ ok: true, requestId: request.trustRequestId, device });
  }));

  app.post("/api/v4/trust/key-packages", asyncRoute(async (request, response) => {
    rejectPlaintext(request.body);
    const keyPackage = repository.publishKeyPackage({
      id: request.body?.id,
      userId: request.trustAuth.user.id,
      deviceId: request.body?.deviceId,
      packageData: request.body?.packageData,
      expiresAt: request.body?.expiresAt,
    });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, keyPackage });
  }));

  app.post("/api/v4/trust/key-packages/claim", asyncRoute(async (request, response) => {
    rejectPlaintext(request.body);
    const deviceId = String(request.body?.requesterDeviceId || "");
    const group = repository.groupStatus(request.body?.groupId, deviceId, request.trustAuth.user.id);
    const { state, conversation } = requireConversation(group.conversationId, request.trustAuth.user.id);
    const targetUserId = String(request.body?.targetUserId || "");
    if (!canAccessConversation(state, conversation, targetUserId)) {
      throw new TrustRepositoryError("Целевой пользователь не состоит в conversation.", "TRUST_TARGET_NOT_MEMBER", 409);
    }
    const keyPackage = repository.claimKeyPackage({
      targetUserId,
      groupId: group.id,
      requesterDeviceId: deviceId,
      requesterUserId: request.trustAuth.user.id,
    });
    response.json({ ok: true, requestId: request.trustRequestId, keyPackage });
  }));

  app.post("/api/v4/trust/groups", asyncRoute(async (request, response) => {
    rejectPlaintext(request.body);
    requireConversation(request.body?.conversationId, request.trustAuth.user.id);
    const group = repository.createGroup({
      id: request.body?.id,
      conversationId: request.body?.conversationId,
      userId: request.trustAuth.user.id,
      creatorDeviceId: request.body?.creatorDeviceId,
    });
    notifyConversation(group.conversationId, "group.created", { groupId: group.id, epoch: group.epoch });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, group });
  }));

  app.get("/api/v4/trust/groups/:groupId", asyncRoute(async (request, response) => {
    const deviceId = String(request.query.deviceId || request.headers["x-nexora-device-id"] || "");
    const group = repository.groupStatus(request.params.groupId, deviceId, request.trustAuth.user.id);
    requireConversation(group.conversationId, request.trustAuth.user.id);
    response.json({ ok: true, requestId: request.trustRequestId, group });
  }));

  app.post("/api/v4/trust/groups/:groupId/envelopes", asyncRoute(async (request, response) => {
    rejectPlaintext(request.body);
    const group = repository.groupStatus(request.params.groupId, request.body?.senderDeviceId, request.trustAuth.user.id);
    requireConversation(group.conversationId, request.trustAuth.user.id);
    const envelope = repository.submitEnvelope({
      id: request.body?.id,
      groupId: group.id,
      senderDeviceId: request.body?.senderDeviceId,
      senderUserId: request.trustAuth.user.id,
      type: request.body?.type,
      epoch: request.body?.epoch,
      idempotencyKey: request.headers["idempotency-key"] || request.body?.idempotencyKey,
      payloadData: request.body?.payloadData,
    });
    notifyConversation(group.conversationId, "envelope.created", { groupId: group.id, sequence: envelope.sequence, epoch: envelope.epoch, type: envelope.type });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, envelope });
  }));

  app.get("/api/v4/trust/groups/:groupId/envelopes", asyncRoute(async (request, response) => {
    const deviceId = String(request.query.deviceId || request.headers["x-nexora-device-id"] || "");
    const group = repository.groupStatus(request.params.groupId, deviceId, request.trustAuth.user.id);
    requireConversation(group.conversationId, request.trustAuth.user.id);
    const envelopes = repository.listEnvelopes({
      groupId: group.id,
      deviceId,
      userId: request.trustAuth.user.id,
      after: request.query.after,
      limit: request.query.limit,
    });
    response.json({ ok: true, requestId: request.trustRequestId, envelopes, cursor: envelopes.at(-1)?.sequence || Number(request.query.after || 0) });
  }));

  app.post("/api/v4/trust/groups/:groupId/commits", asyncRoute(async (request, response) => {
    rejectPlaintext(request.body);
    const group = repository.groupStatus(request.params.groupId, request.body?.senderDeviceId, request.trustAuth.user.id);
    requireConversation(group.conversationId, request.trustAuth.user.id);
    const result = repository.submitCommit({
      id: request.body?.id,
      groupId: group.id,
      senderDeviceId: request.body?.senderDeviceId,
      senderUserId: request.trustAuth.user.id,
      targetEpoch: request.body?.targetEpoch,
      idempotencyKey: request.headers["idempotency-key"] || request.body?.idempotencyKey,
      payloadData: request.body?.payloadData,
      mutations: request.body?.mutations,
    });
    notifyConversation(group.conversationId, "commit.created", { groupId: group.id, sequence: result.envelope.sequence, epoch: result.envelope.epoch });
    response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.trustRequestId, ...result });
  }));

  app.get("/api/v4/trust/devices/:deviceId/welcomes", asyncRoute(async (request, response) => {
    const welcomes = repository.listWelcomes(request.params.deviceId, request.trustAuth.user.id);
    response.json({ ok: true, requestId: request.trustRequestId, welcomes });
  }));

  app.post("/api/v4/trust/welcomes/:welcomeId/ack", asyncRoute(async (request, response) => {
    const welcome = repository.acknowledgeWelcome(request.params.welcomeId, request.body?.deviceId, request.trustAuth.user.id);
    response.json({ ok: true, requestId: request.trustRequestId, welcome });
  }));

  app.get("/api/v4/trust/transparency/root", (_request, response) => {
    response.json({ ok: true, root: repository.transparencyRoot() });
  });

  app.get("/api/v4/trust/transparency/proof/:index", asyncRoute(async (request, response) => {
    response.json({ ok: true, requestId: request.trustRequestId, ...repository.transparencyProof(request.params.index) });
  }));

  return { repository };
}

module.exports = {
  conversationUsers,
  mountTrustV4Routes,
  safeRequestId,
};
