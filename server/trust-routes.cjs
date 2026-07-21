"use strict";

const crypto = require("node:crypto");
const {
  hashToken,
  parseSessionToken,
  sessionUser,
} = require("./security.cjs");
const {
  canAccessConversation,
  findConversation,
  findUser,
  isRoomBanned,
  roomRole,
} = require("./model.cjs");
const { MLS_CIPHERSUITE, TrustCoreError, canonical, hash } = require("./trust-core.cjs");

function requestId(value) {
  const text = String(value || "");
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(text) ? text : crypto.randomUUID();
}

function stableError(response, error, id) {
  const known = error instanceof TrustCoreError;
  const status = known ? error.status : Number(error?.status || 500);
  const code = known ? error.code : String(error?.code || "INTERNAL_ERROR");
  const message = known ? error.message : "Временная ошибка Trust Core.";
  return response.status(status).json({ ok: false, requestId: id, code, message, details: known ? error.details || {} : {} });
}

function mountTrustRoutes({ app, store, io, trustCore, log = () => {} } = {}) {
  if (!app || !store || !io || !trustCore) throw new Error("Trust routes require app, store, io and trustCore.");

  function context(request, response, next) {
    request.trustRequestId = requestId(request.headers["x-request-id"]);
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
    if (!session || !user) return stableError(response, new TrustCoreError("Требуется вход в аккаунт.", "AUTH_REQUIRED", 401), request.trustRequestId);
    if (user.mustChangePassword) return stableError(response, new TrustCoreError("Сначала измените временный пароль.", "PASSWORD_CHANGE_REQUIRED", 428), request.trustRequestId);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const supplied = String(request.headers["x-nexora-csrf"] || "");
      const expected = String(session.csrfToken || "");
      const valid = supplied && expected && supplied.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
      if (!valid) return stableError(response, new TrustCoreError("Запрос отклонён защитой CSRF.", "CSRF_INVALID", 403), request.trustRequestId);
      if (store.read((state) => Boolean(state.settings.emergencyReadOnly))) {
        return stableError(response, new TrustCoreError("Сервер временно работает только для чтения.", "SERVER_READ_ONLY", 503), request.trustRequestId);
      }
    }
    request.trustAuth = { token, tokenHash, session, user };
    next();
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try { await handler(request, response); }
      catch (error) {
        if (!(error instanceof TrustCoreError)) log(`Trust API ${request.trustRequestId}: ${error.stack || error.message}`, "error");
        stableError(response, error, request.trustRequestId);
      }
    };
  }

  function deviceId(request) {
    const value = String(request.headers["x-nexora-device-id"] || request.body?.deviceId || "");
    if (!value) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    return value;
  }

  function requireConversation(userId, conversationId) {
    const state = store.read();
    const conversation = findConversation(state, String(conversationId));
    if (!conversation || !canAccessConversation(state, conversation, userId)) {
      throw new TrustCoreError("Диалог не найден.", "RESOURCE_NOT_FOUND", 404);
    }
    if (conversation.type === "room" && isRoomBanned(state, conversation.roomId, userId)) {
      throw new TrustCoreError("Пользователь заблокирован в комнате.", "ROOM_BANNED", 403);
    }
    return { state, conversation };
  }

  function usersCanExchangeKeys(requesterId, targetId) {
    if (String(requesterId) === String(targetId)) return true;
    const state = store.read();
    if (!findUser(state, targetId)) return false;
    return state.conversations.some((conversation) => {
      if (!canAccessConversation(state, conversation, requesterId)) return false;
      if (conversation.type === "dm") return conversation.userIds.includes(targetId);
      return Boolean(roomRole(state, conversation.roomId, targetId))
        && !isRoomBanned(state, conversation.roomId, requesterId)
        && !isRoomBanned(state, conversation.roomId, targetId);
    });
  }

  function emitUser(userId, type, payload) {
    io.to(`user:${userId}`).emit(type, payload);
    io.to(`user:${userId}`).emit("trust:event", { type, payload });
  }

  function emitConversation(conversationId, type, payload) {
    io.to(`conversation:${conversationId}`).emit(type, payload);
    io.to(`conversation:${conversationId}`).emit("trust:event", { type, payload });
  }

  app.use("/api/v4/trust", context, authRequired);

  app.get("/api/v4/trust/status", (request, response) => {
    response.json({ ok: true, requestId: request.trustRequestId, trust: trustCore.status(request.trustAuth.user.id) });
  });

  app.get("/api/v4/trust/devices", (request, response) => {
    response.json({ ok: true, requestId: request.trustRequestId, devices: trustCore.listDevices(request.trustAuth.user.id) });
  });

  app.get("/api/v4/trust/users/:userId/devices", asyncRoute(async (request, response) => {
    if (!usersCanExchangeKeys(request.trustAuth.user.id, request.params.userId)) {
      throw new TrustCoreError("Устройства пользователя недоступны.", "PERMISSION_DENIED", 403);
    }
    response.json({ ok: true, requestId: request.trustRequestId, devices: trustCore.listDevices(request.params.userId).filter((item) => item.status === "active") });
  }));

  app.post("/api/v4/trust/challenges", asyncRoute(async (request, response) => {
    const purpose = String(request.body?.purpose || "");
    const actorDeviceId = request.headers["x-nexora-device-id"] ? deviceId(request) : null;
    let targetDeviceId = request.body?.targetDeviceId || null;
    let challengeContext = request.body?.context || {};

    if (purpose === "register_device") {
      const candidateId = String(challengeContext?.deviceId || "");
      const fingerprint = String(challengeContext?.fingerprint || "");
      if (!/^[0-9a-f-]{36}$/i.test(candidateId) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
        throw new TrustCoreError("Для регистрации нужны deviceId и fingerprint.", "TRUST_VALIDATION_FAILED", 400);
      }
      targetDeviceId = null;
      challengeContext = { deviceId: candidateId.toLowerCase(), fingerprint };
    } else if (["verify_device", "revoke_device"].includes(purpose)) {
      if (!actorDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
      const actor = trustCore.requireDevice(request.trustAuth.user.id, actorDeviceId, { verified: purpose === "verify_device" });
      const target = trustCore.getDevice(targetDeviceId);
      if (!target || target.userId !== request.trustAuth.user.id || target.status !== "active") {
        throw new TrustCoreError("Целевое устройство не найдено.", "TRUST_DEVICE_NOT_FOUND", 404);
      }
      challengeContext = { actorDeviceId: actor.id, targetDeviceId: target.id, targetFingerprint: target.fingerprint };
    } else {
      throw new TrustCoreError("Неизвестное назначение challenge.", "TRUST_VALIDATION_FAILED", 400);
    }

    const challenge = trustCore.createChallenge({
      userId: request.trustAuth.user.id,
      purpose,
      targetDeviceId,
      context: challengeContext,
    });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, challenge });
  }));

  app.post("/api/v4/trust/devices", asyncRoute(async (request, response) => {
    const result = trustCore.registerDevice({
      userId: request.trustAuth.user.id,
      challengeId: request.body?.challengeId,
      deviceId: request.body?.deviceId,
      displayName: request.body?.displayName,
      identityKey: request.body?.identityKey,
      signatureKey: request.body?.signatureKey,
      credential: request.body?.credential,
      capabilities: request.body?.capabilities,
      proofSignature: request.body?.proofSignature,
    });
    emitUser(request.trustAuth.user.id, "trust.device_registered", result.device);
    response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.trustRequestId, ...result });
  }));

  app.post("/api/v4/trust/devices/:deviceId/verify", asyncRoute(async (request, response) => {
    const device = trustCore.verifyDevice({
      userId: request.trustAuth.user.id,
      actorDeviceId: deviceId(request),
      targetDeviceId: request.params.deviceId,
      challengeId: request.body?.challengeId,
      proofSignature: request.body?.proofSignature,
    });
    emitUser(request.trustAuth.user.id, "trust.device_verified", device);
    response.json({ ok: true, requestId: request.trustRequestId, device });
  }));

  app.delete("/api/v4/trust/devices/:deviceId", asyncRoute(async (request, response) => {
    const device = trustCore.revokeDevice({
      userId: request.trustAuth.user.id,
      actorDeviceId: deviceId(request),
      targetDeviceId: request.params.deviceId,
      challengeId: request.body?.challengeId,
      proofSignature: request.body?.proofSignature,
    });
    emitUser(request.trustAuth.user.id, "trust.device_revoked", device);
    response.json({ ok: true, requestId: request.trustRequestId, device });
  }));

  app.post("/api/v4/trust/key-packages", asyncRoute(async (request, response) => {
    const packages = trustCore.uploadKeyPackages({
      userId: request.trustAuth.user.id,
      deviceId: deviceId(request),
      packages: request.body?.packages,
    });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, packages });
  }));

  app.post("/api/v4/trust/users/:userId/key-packages/claim", asyncRoute(async (request, response) => {
    if (!usersCanExchangeKeys(request.trustAuth.user.id, request.params.userId)) {
      throw new TrustCoreError("KeyPackage пользователя недоступен.", "PERMISSION_DENIED", 403);
    }
    const keyPackage = trustCore.claimKeyPackage({
      targetUserId: request.params.userId,
      requesterUserId: request.trustAuth.user.id,
      requesterDeviceId: deviceId(request),
    });
    response.json({ ok: true, requestId: request.trustRequestId, keyPackage });
  }));

  app.get("/api/v4/trust/conversations/:conversationId/group", asyncRoute(async (request, response) => {
    requireConversation(request.trustAuth.user.id, request.params.conversationId);
    response.json({ ok: true, requestId: request.trustRequestId, group: trustCore.getGroupByConversation(request.params.conversationId) });
  }));

  app.post("/api/v4/trust/conversations/:conversationId/group", asyncRoute(async (request, response) => {
    const { conversation } = requireConversation(request.trustAuth.user.id, request.params.conversationId);
    if (Number(request.body?.ciphersuite || MLS_CIPHERSUITE) !== MLS_CIPHERSUITE) {
      throw new TrustCoreError("Поддерживается только MLS ciphersuite 1.", "MLS_CIPHERSUITE_UNSUPPORTED", 400);
    }
    const result = trustCore.createGroup({
      conversationId: conversation.id,
      creatorUserId: request.trustAuth.user.id,
      creatorDeviceId: deviceId(request),
      groupId: request.body?.groupId,
      publicStateHash: request.body?.publicStateHash,
      leafIndex: request.body?.leafIndex,
    });
    emitConversation(conversation.id, "mls.group_created", result.group);
    response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.trustRequestId, ...result });
  }));

  app.post("/api/v4/trust/groups/:groupId/commits", asyncRoute(async (request, response) => {
    const group = trustCore.getGroupByConversation(request.body?.conversationId);
    if (!group || group.id !== request.params.groupId) throw new TrustCoreError("MLS group не найден.", "MLS_GROUP_NOT_FOUND", 404);
    const { state, conversation } = requireConversation(request.trustAuth.user.id, group.conversationId);
    const actorDevice = trustCore.requireDevice(request.trustAuth.user.id, deviceId(request), { verified: true });
    const addedDevices = Array.isArray(request.body?.addedDevices) ? request.body.addedDevices : [];
    const removedDeviceIds = Array.isArray(request.body?.removedDeviceIds) ? request.body.removedDeviceIds : [];

    for (const item of addedDevices) {
      const target = trustCore.getDevice(item?.deviceId);
      if (!target || target.userId !== String(item?.userId) || target.status !== "active" || target.trustState !== "verified") {
        throw new TrustCoreError("Добавляемое устройство недействительно.", "MLS_MEMBER_DEVICE_INVALID", 409);
      }
      if (!canAccessConversation(state, conversation, target.userId)) {
        throw new TrustCoreError("Нельзя добавить устройство пользователя вне диалога.", "MLS_MEMBER_SCOPE_INVALID", 403);
      }
    }

    const currentMembers = new Map((group.members || []).map((member) => [member.deviceId, member]));
    for (const removedId of removedDeviceIds) {
      const member = currentMembers.get(String(removedId).toLowerCase());
      if (!member) throw new TrustCoreError("Удаляемое устройство не состоит в MLS group.", "MLS_MEMBER_DEVICE_INVALID", 409);
      if (member.userId === request.trustAuth.user.id) continue;
      const target = trustCore.getDevice(member.deviceId);
      const privileged = conversation.type === "room" && (
        findUser(state, request.trustAuth.user.id)?.role === "server_admin"
        || ["owner", "moderator"].includes(roomRole(state, conversation.roomId, request.trustAuth.user.id))
      );
      if (!privileged && target?.status !== "revoked") {
        throw new TrustCoreError("Удалять чужое активное устройство может только модератор комнаты.", "PERMISSION_DENIED", 403);
      }
    }

    const result = trustCore.recordCommit({
      groupRecordId: group.id,
      actorUserId: request.trustAuth.user.id,
      actorDeviceId: actorDevice.id,
      previousEpoch: request.body?.previousEpoch,
      epoch: request.body?.epoch,
      commit: request.body?.commit,
      publicStateHash: request.body?.publicStateHash,
      addedDevices,
      removedDeviceIds,
      welcomes: request.body?.welcomes || [],
      proofSignature: request.body?.proofSignature,
    });
    emitConversation(conversation.id, "mls.commit", {
      conversationId: conversation.id,
      groupId: group.id,
      previousEpoch: Number(request.body?.previousEpoch),
      epoch: Number(request.body?.epoch),
      commit: request.body?.commit,
      commitHash: result.commitHash,
      publicStateHash: request.body?.publicStateHash,
      actorUserId: request.trustAuth.user.id,
      actorDeviceId: actorDevice.id,
    });
    response.status(201).json({ ok: true, requestId: request.trustRequestId, ...result });
  }));

  app.post("/api/v4/trust/welcomes/claim", asyncRoute(async (request, response) => {
    const welcome = trustCore.claimWelcome({ userId: request.trustAuth.user.id, deviceId: deviceId(request) });
    response.json({ ok: true, requestId: request.trustRequestId, welcome });
  }));

  app.get("/api/v4/trust/audit", (request, response) => {
    response.json({ ok: true, requestId: request.trustRequestId, entries: trustCore.listAudit(request.trustAuth.user.id, request.query.limit) });
  });

  log("Trust Core API v4 mounted", "info");
  return { authRequired, requireConversation, usersCanExchangeKeys };
}

module.exports = { mountTrustRoutes, stableError };
