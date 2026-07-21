"use strict";

const crypto = require("node:crypto");
const {
  hashToken,
  parseSessionToken,
  sessionUser,
  verifyPassword,
} = require("./security.cjs");
const { isRoomBanned, roomRole } = require("./model.cjs");
const { PulseCloudClientError, safeRequestId } = require("./pulse-cloud-client.cjs");
const { PulseRepositoryError } = require("./pulse-local-repository.cjs");

function userSocketRoom(userId) {
  return `user:${userId}`;
}

function stableError(response, status, code, message, requestId, details = {}) {
  return response.status(status).json({ ok: false, code, message, requestId, details });
}

function errorResponse(response, error, requestId) {
  const known = error instanceof PulseCloudClientError || error instanceof PulseRepositoryError;
  return stableError(
    response,
    known ? error.status : Number(error?.status || 500),
    known ? error.code : String(error?.code || "INTERNAL_ERROR"),
    known ? error.message : "Временная ошибка Local Server.",
    requestId,
    known ? error.details || {} : {},
  );
}

function sanitizeOverview(value) {
  if (!value) return null;
  const overview = structuredClone(value);
  overview.entitlements = (overview.entitlements || []).map((item) => {
    const payload = item.verifiedPayload || {};
    return {
      id: item.id || payload.id || null,
      jti: item.jti || payload.jti || null,
      productCode: item.productCode || payload.productCode,
      status: item.status || payload.status,
      startsAt: item.startsAt || payload.notBefore || payload.issuedAt,
      expiresAt: item.expiresAt || payload.expiresAt,
      roomId: payload.roomId || null,
      keyId: item.keyId || item.envelope?.keyId || payload.keyId || null,
    };
  });
  return overview;
}

function mountPulseV3Routes({ app, store, io, serverId, client, repository, log = () => {} }) {
  if (!app || !store || !io || !serverId || !client || !repository) throw new Error("Pulse v3 routes require app, store, io, serverId, client and repository.");

  function requestContext(request, response, next) {
    request.pulseRequestId = safeRequestId(request.headers["x-request-id"]);
    response.setHeader("X-Request-ID", request.pulseRequestId);
    next();
  }

  function authRequired(request, response, next) {
    const token = parseSessionToken(request.headers.cookie);
    const tokenHash = token ? hashToken(token) : null;
    const session = tokenHash ? store.read((state) => state.sessions.find(
      (item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now(),
    )) : null;
    const user = sessionUser(store, token);
    if (!user || !session) return stableError(response, 401, "AUTH_REQUIRED", "Требуется вход в аккаунт.", request.pulseRequestId);
    if (user.mustChangePassword) return stableError(response, 428, "PASSWORD_CHANGE_REQUIRED", "Сначала измените временный пароль.", request.pulseRequestId);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const supplied = String(request.headers["x-nexora-csrf"] || "");
      const expected = String(session.csrfToken || "");
      const valid = supplied && expected && supplied.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
      if (!valid) return stableError(response, 403, "CSRF_INVALID", "Запрос отклонён защитой CSRF.", request.pulseRequestId);
      if (store.read((state) => state.settings.emergencyReadOnly)) {
        return stableError(response, 503, "SERVER_READ_ONLY", "Сервер временно работает только для чтения.", request.pulseRequestId);
      }
    }
    request.pulseAuth = { token, tokenHash, session, user };
    next();
  }

  function emitUser(userId, eventType, payload) {
    io.to(userSocketRoom(userId)).emit(eventType, payload);
    io.to(userSocketRoom(userId)).emit("billing:event", { type: eventType, payload });
  }

  function requireRoomMember(roomId, userId) {
    const state = store.read();
    const room = state.rooms.find((item) => item.id === roomId);
    if (!room) throw Object.assign(new Error("Комната не найдена."), { code: "RESOURCE_NOT_FOUND", status: 404 });
    const role = roomRole(state, roomId, userId);
    if (!role) throw Object.assign(new Error("Для операции нужно состоять в комнате."), { code: "PERMISSION_DENIED", status: 403 });
    if (isRoomBanned(state, roomId, userId)) throw Object.assign(new Error("Пользователь заблокирован в комнате."), { code: "ROOM_BANNED", status: 403 });
    return { state, room, role };
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try { await handler(request, response); } catch (error) { errorResponse(response, error, request.pulseRequestId); }
    };
  }

  app.use("/api/v3", requestContext);

  app.get("/api/v3/pulse/status", authRequired, (request, response) => {
    response.json({
      ok: true,
      requestId: request.pulseRequestId,
      schemaVersion: store.stats().schemaVersion,
      cloud: client.status(),
      linked: repository.getLink(request.pulseAuth.user.id)?.status === "linked",
    });
  });

  app.post("/api/v3/cloud-account/link/start", authRequired, asyncRoute(async (request, response) => {
    client.requireProduction();
    const session = repository.createLinkSession(request.pulseAuth.user.id);
    const authorizationUrl = client.authorizationUrl({
      linkId: session.id,
      nonce: session.nonce,
      localUserId: session.localUserId,
      redirectUri: request.body?.redirectUri || "nexora://cloud-account/complete",
    });
    response.status(201).json({
      ok: true,
      requestId: request.pulseRequestId,
      linkId: session.id,
      authorizationUrl,
      expiresAt: session.expiresAt,
    });
  }));

  app.post("/api/v3/cloud-account/link/complete", authRequired, asyncRoute(async (request, response) => {
    const linkId = String(request.body?.linkId || "");
    const session = repository.getLinkSession(linkId);
    if (!session || session.localUserId !== request.pulseAuth.user.id) {
      throw new PulseRepositoryError("Link session не найдена.", "LINK_ATTESTATION_INVALID", 400);
    }
    const attestation = client.verifyLinkAttestation(request.body?.attestation, {
      linkId: session.id,
      nonce: session.nonce,
      localUserId: session.localUserId,
    });
    const link = repository.completeLinkSession({
      linkId: session.id,
      localUserId: session.localUserId,
      nonce: attestation.nonce,
      cloudAccountId: attestation.cloudAccountId,
      cloudSubject: attestation.subject,
    });
    repository.enqueueLocalEvent("billing.account_linked", { cloudAccountId: link.cloudAccountId }, { localUserId: link.localUserId });
    emitUser(link.localUserId, "billing.account_linked", { cloudAccountId: link.cloudAccountId, linkedAt: link.linkedAt });
    response.status(201).json({ ok: true, requestId: request.pulseRequestId, account: link });
  }));

  app.get("/api/v3/cloud-account", authRequired, (request, response) => {
    const link = repository.getLink(request.pulseAuth.user.id);
    response.json({ ok: true, requestId: request.pulseRequestId, account: link?.status === "linked" ? link : null });
  });

  app.delete("/api/v3/cloud-account/link", authRequired, asyncRoute(async (request, response) => {
    const password = String(request.body?.currentPassword || "");
    const user = store.read((state) => state.users.find((item) => item.id === request.pulseAuth.user.id));
    if (!password || !user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      throw new PulseRepositoryError("Для отвязывания подтвердите текущий пароль.", "CLOUD_ACCOUNT_REAUTH_REQUIRED", 403);
    }
    const previous = repository.getLink(user.id);
    repository.unlink(user.id);
    repository.enqueueLocalEvent("billing.account_unlinked", { cloudAccountId: previous?.cloudAccountId || null }, { localUserId: user.id });
    emitUser(user.id, "billing.account_unlinked", { unlinkedAt: new Date().toISOString() });
    response.json({ ok: true, requestId: request.pulseRequestId });
  }));

  app.get("/api/v3/pulse/overview", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    try {
      const { overview, requestId } = await client.overview(userId, request.pulseRequestId);
      repository.cacheOverview(userId, overview, { requestId });
      response.json({ ok: true, requestId, cached: false, ...sanitizeOverview(overview) });
    } catch (error) {
      repository.recordSyncFailure(userId, error.code);
      const cached = repository.getCachedOverview(userId);
      if (!cached?.overview) throw error;
      response.json({
        ok: true,
        requestId: request.pulseRequestId,
        cached: true,
        cachedAt: cached.cachedAt,
        warning: { code: error.code, message: error.message },
        ...sanitizeOverview(cached.overview),
      });
    }
  }));

  app.get("/api/v3/pulse/wallet", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    try {
      const { overview, requestId } = await client.overview(userId, request.pulseRequestId);
      repository.cacheOverview(userId, overview, { requestId });
      response.json({ ok: true, requestId, cached: false, wallet: overview.wallet });
    } catch (error) {
      repository.recordSyncFailure(userId, error.code);
      const cached = repository.getCachedOverview(userId);
      if (!cached?.overview?.wallet) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, cachedAt: cached.cachedAt, wallet: cached.overview.wallet, warning: { code: error.code, message: error.message } });
    }
  }));

  app.get("/api/v3/pulse/transactions", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 50));
    try {
      const result = await client.transactions(userId, { limit, before: request.query.before, requestId: request.pulseRequestId });
      repository.cacheTransactions(userId, result.transactions, result.requestId);
      response.json({ ok: true, requestId: result.requestId, cached: false, transactions: result.transactions });
    } catch (error) {
      const transactions = repository.listTransactions(userId, { limit, before: request.query.before });
      if (!transactions.length) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, transactions, warning: { code: error.code, message: error.message } });
    }
  }));

  app.get("/api/v3/pulse/transactions/:id", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    try {
      const result = await client.transaction(userId, request.params.id, request.pulseRequestId);
      repository.cacheTransactions(userId, [result.transaction], result.requestId);
      response.json({ ok: true, requestId: result.requestId, cached: false, transaction: result.transaction });
    } catch (error) {
      const transaction = repository.getTransaction(userId, request.params.id);
      if (!transaction) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, transaction, warning: { code: error.code, message: error.message } });
    }
  }));

  async function createCheckout(request, response, productCode) {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const result = await client.checkout(userId, productCode, {
      currency: request.body?.currency || "EUR",
      region: request.body?.region || "*",
      idempotencyKey,
      requestId: request.pulseRequestId,
    });
    const checkout = repository.cacheCheckout(userId, productCode, result.checkout, result.requestId);
    emitUser(userId, "billing.checkout_updated", checkout);
    response.status(201).json({ ok: true, requestId: result.requestId, checkout });
  }

  app.post("/api/v3/pulse/checkout/subscription", authRequired, asyncRoute((request, response) => createCheckout(request, response, "nexora_plus")));

  app.post("/api/v3/pulse/checkout/impulses", authRequired, asyncRoute(async (request, response) => {
    const productCode = String(request.body?.productCode || "");
    if (!/^impulse_pack_[A-Za-z0-9_-]{1,48}$/.test(productCode)) throw new PulseRepositoryError("Пакет Импульсов не выбран.", "VALIDATION_FAILED", 400);
    await createCheckout(request, response, productCode);
  }));

  app.get("/api/v3/pulse/checkout/:id", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    const cached = repository.getCheckout(userId, request.params.id);
    if (!cached) throw new PulseRepositoryError("Checkout не найден.", "RESOURCE_NOT_FOUND", 404);
    try {
      const result = await client.checkoutStatus(userId, cached.checkoutId, request.pulseRequestId);
      const checkout = repository.cacheCheckout(userId, cached.productCode, { ...cached, ...result.checkout }, result.requestId);
      response.json({ ok: true, requestId: result.requestId, cached: false, checkout });
    } catch (error) {
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, checkout: cached, warning: { code: error.code, message: error.message } });
    }
  }));

  app.get("/api/v3/pulse/subscription", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    try {
      const { overview, requestId } = await client.overview(userId, request.pulseRequestId);
      repository.cacheOverview(userId, overview, { requestId });
      response.json({ ok: true, requestId, cached: false, subscription: overview.subscription || null });
    } catch (error) {
      const cached = repository.getCachedOverview(userId);
      if (!cached?.overview) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, subscription: cached.overview.subscription || null, warning: { code: error.code, message: error.message } });
    }
  }));

  app.get("/api/v3/rooms/:roomId/pulse/goals", authRequired, asyncRoute(async (request, response) => {
    requireRoomMember(request.params.roomId, request.pulseAuth.user.id);
    try {
      const result = await client.goals(request.params.roomId, request.pulseRequestId);
      await store.mutate((state) => {
        const remoteIds = new Set(result.goals.map((item) => item.id));
        state.pulseGoals = state.pulseGoals.filter((item) => item.roomId !== request.params.roomId || !remoteIds.has(item.id));
        for (const goal of result.goals) state.pulseGoals.push({ ...goal, roomId: request.params.roomId, source: "pulse_cloud" });
      });
      response.json({ ok: true, requestId: result.requestId, cached: false, goals: result.goals });
    } catch (error) {
      const state = store.read();
      const goals = state.pulseGoals.filter((item) => item.roomId === request.params.roomId)
        .map((goal) => ({
          ...goal,
          contributionCount: state.pulseContributions.filter((item) => item.goalId === goal.id).length,
        }));
      if (!goals.length) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, goals, warning: { code: error.code, message: error.message } });
    }
  }));

  app.post("/api/v3/rooms/:roomId/pulse/goals", authRequired, asyncRoute(async (request, response) => {
    const membership = requireRoomMember(request.params.roomId, request.pulseAuth.user.id);
    if (membership.room.ownerId !== request.pulseAuth.user.id) throw Object.assign(new Error("Только владелец комнаты может создать коммерческую цель."), { code: "PERMISSION_DENIED", status: 403 });
    const result = await client.createGoal(request.pulseAuth.user.id, request.params.roomId, {
      productCode: request.body?.productCode,
      title: request.body?.title,
      description: request.body?.description,
      targetAmount: request.body?.targetAmount,
      expiresAt: request.body?.expiresAt,
      entitlementDurationDays: request.body?.entitlementDurationDays,
      idempotencyKey: request.headers["idempotency-key"] || request.body?.idempotencyKey,
    }, request.pulseRequestId);
    await store.mutate((state) => {
      if (!state.pulseGoals.some((item) => item.id === result.goal.id)) state.pulseGoals.push({ ...result.goal, source: "pulse_cloud" });
    });
    repository.enqueueLocalEvent("billing.goal_created", { goalId: result.goal.id, roomId: request.params.roomId }, { roomId: request.params.roomId });
    io.to(`conversation:${membership.state.conversations.find((item) => item.roomId === request.params.roomId)?.id}`).emit("billing.goal_created", result.goal);
    response.status(201).json({ ok: true, requestId: result.requestId, goal: result.goal });
  }));

  app.post("/api/v3/rooms/:roomId/pulse/goals/:goalId/contributions", authRequired, asyncRoute(async (request, response) => {
    const membership = requireRoomMember(request.params.roomId, request.pulseAuth.user.id);
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const result = await client.contribute(request.pulseAuth.user.id, request.params.roomId, request.params.goalId, request.body?.amount, idempotencyKey, request.pulseRequestId);
    await store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
      if (goal && result.result.goal) Object.assign(goal, result.result.goal);
      const contribution = result.result.contribution;
      if (contribution && !state.pulseContributions.some((item) => item.id === contribution.id)) state.pulseContributions.push({ ...contribution, roomId: request.params.roomId, source: "pulse_cloud" });
    });
    emitUser(request.pulseAuth.user.id, "billing.wallet_updated", { balance: result.result.balance ?? result.result.newBalance });
    const conversationId = membership.state.conversations.find((item) => item.roomId === request.params.roomId)?.id;
    if (conversationId) io.to(`conversation:${conversationId}`).emit("billing.goal_updated", result.result.goal);
    response.status(result.result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, ...result.result });
  }));

  app.post("/api/v3/rooms/:roomId/pulse/goals/:goalId/cancel", authRequired, asyncRoute(async (request, response) => {
    const membership = requireRoomMember(request.params.roomId, request.pulseAuth.user.id);
    if (membership.room.ownerId !== request.pulseAuth.user.id) throw Object.assign(new Error("Только владелец комнаты может отменить цель."), { code: "PERMISSION_DENIED", status: 403 });
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const result = await client.cancelGoal(request.pulseAuth.user.id, request.params.roomId, request.params.goalId, idempotencyKey, request.pulseRequestId);
    await store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
      if (goal) Object.assign(goal, result.result.goal || { status: result.result.status || "cancelled" });
    });
    repository.enqueueLocalEvent("billing.goal_cancelled", { goalId: request.params.goalId, roomId: request.params.roomId }, { roomId: request.params.roomId });
    const conversationId = membership.state.conversations.find((item) => item.roomId === request.params.roomId)?.id;
    if (conversationId) io.to(`conversation:${conversationId}`).emit("billing.goal_cancelled", result.result);
    response.status(result.result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, ...result.result });
  }));

  log("Pulse Local Server API v3 mounted", "info");
  return { authRequired };
}

module.exports = {
  mountPulseV3Routes,
  sanitizeOverview,
  stableError,
};
