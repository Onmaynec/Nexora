"use strict";

const crypto = require("node:crypto");
const {
  hashToken,
  parseSessionToken,
  sessionUser,
  verifyPassword,
} = require("./security.cjs");
const { isRoomBanned, roomRole } = require("./model.cjs");
const { appendEvent } = require("./events.cjs");
const { PulseCloudClientError, safeRequestId } = require("./pulse-cloud-client.cjs");
const { PulseRepositoryError } = require("./pulse-local-repository.cjs");
const { PulseSandboxError } = require("./pulse-sandbox-service.cjs");

function userSocketRoom(userId) {
  return `user:${userId}`;
}

function stableError(response, status, code, message, requestId, details = {}) {
  return response.status(status).json({ ok: false, code, message, requestId, details });
}

function errorResponse(response, error, requestId) {
  const known = error instanceof PulseCloudClientError || error instanceof PulseRepositoryError || error instanceof PulseSandboxError;
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
      roomId: item.roomId || (item.scopeType === "room" ? item.scopeId : null) || payload.roomId || null,
      scopeType: item.scopeType || (payload.roomId ? "room" : "user"),
      scopeId: item.scopeId || payload.roomId || payload.cloudAccountId || null,
      keyId: item.keyId || item.envelope?.keyId || payload.keyId || null,
      sandbox: Boolean(item.sandbox),
    };
  });
  return overview;
}

function mountPulseV3Routes({ app, store, io, serverId, client, repository, sandbox = null, log = () => {} }) {
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

  function emitRoom(roomId, eventType, payload) {
    const conversationId = store.read((state) => state.conversations.find((item) => item.roomId === roomId)?.id);
    if (!conversationId) return;
    io.to(`conversation:${conversationId}`).emit(eventType, payload);
  }

  async function recordGoalEvent(roomId, userId, action, goal, duplicate = false) {
    if (duplicate || !goal) return;
    const systemMessage = await store.mutate((state) => {
      const conversation = state.conversations.find((item) => item.roomId === roomId);
      const actor = state.users.find((item) => item.id === userId);
      const createdAt = new Date().toISOString();
      state.roomAuditLog ||= [];
      state.roomAuditLog.push({
        id: crypto.randomUUID(), roomId, actorId: userId, action: `pulse.goal_${action}`,
        targetUserId: null, createdAt, metadata: { goalId: goal.id, title: String(goal.title || "").slice(0, 120) },
      });
      appendEvent(state, {
        type: `billing.goal_${action}`, actorId: userId, roomId,
        conversationId: conversation?.id || null, payload: { goalId: goal.id },
      });
      if (!conversation) return null;
      const systemKey = `pulse-goal:${goal.id}:${action}`;
      const existing = state.messages.find((item) => item.systemKey === systemKey);
      if (existing) return existing;
      const verbs = { created: "создал(а)", cancelled: "отменил(а)", funded: "завершил(а)" };
      const message = {
        id: crypto.randomUUID(), conversationId: conversation.id, senderId: userId,
        type: "system", system: true, systemCode: `pulse.goal_${action}`, systemKey,
        text: `${actor?.displayName || "Участник"} ${verbs[action] || action} коллективную цель «${goal.title}».`,
        fileId: null, clientId: null, replyToId: null, threadRootId: null, mentions: [],
        createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null,
      };
      state.messages.push(message);
      return message;
    });
    emitRoom(roomId, "data:refresh", { reason: `pulse.goal_${action}`, messageId: systemMessage?.id || null });
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
      cloud: sandbox?.enabled() ? { ...client.status(), mode: "sandbox", enabled: true, productionReady: false, testMode: true } : client.status(),
      linked: Boolean(sandbox?.enabled() || repository.getLink(request.pulseAuth.user.id)?.status === "linked"),
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
    response.status(201).json({ ok: true, requestId: request.pulseRequestId, linkId: session.id, authorizationUrl, expiresAt: session.expiresAt });
  }));

  app.post("/api/v3/cloud-account/link/complete", authRequired, asyncRoute(async (request, response) => {
    const linkId = String(request.body?.linkId || "");
    const session = repository.getLinkSession(linkId);
    if (!session || session.localUserId !== request.pulseAuth.user.id) throw new PulseRepositoryError("Link session не найдена.", "LINK_ATTESTATION_INVALID", 400);
    const attestation = client.verifyLinkAttestation(request.body?.attestation, { linkId: session.id, nonce: session.nonce, localUserId: session.localUserId });
    const link = repository.completeLinkSession({ linkId: session.id, localUserId: session.localUserId, nonce: attestation.nonce, cloudAccountId: attestation.cloudAccountId, cloudSubject: attestation.subject });
    repository.enqueueLocalEvent("billing.account_linked", { cloudAccountId: link.cloudAccountId }, { localUserId: link.localUserId });
    emitUser(link.localUserId, "billing.account_linked", { cloudAccountId: link.cloudAccountId, linkedAt: link.linkedAt });
    response.status(201).json({ ok: true, requestId: request.pulseRequestId, account: link });
  }));

  app.get("/api/v3/cloud-account", authRequired, (request, response) => {
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, account: sandbox.overview(request.pulseAuth.user.id).account });
    const link = repository.getLink(request.pulseAuth.user.id);
    response.json({ ok: true, requestId: request.pulseRequestId, account: link?.status === "linked" ? link : null });
  });

  app.delete("/api/v3/cloud-account/link", authRequired, asyncRoute(async (request, response) => {
    const password = String(request.body?.currentPassword || "");
    const user = store.read((state) => state.users.find((item) => item.id === request.pulseAuth.user.id));
    if (!password || !user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) throw new PulseRepositoryError("Для отвязывания подтвердите текущий пароль.", "CLOUD_ACCOUNT_REAUTH_REQUIRED", 403);
    const previous = repository.getLink(user.id);
    repository.unlink(user.id);
    repository.enqueueLocalEvent("billing.account_unlinked", { cloudAccountId: previous?.cloudAccountId || null }, { localUserId: user.id });
    emitUser(user.id, "billing.account_unlinked", { unlinkedAt: new Date().toISOString() });
    response.json({ ok: true, requestId: request.pulseRequestId });
  }));

  app.get("/api/v3/pulse/overview", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, ...sanitizeOverview(sandbox.overview(userId)) });
    repository.requireLinked(userId);
    try {
      const { overview, requestId } = await client.overview(userId, request.pulseRequestId);
      repository.cacheOverview(userId, overview, { requestId });
      response.json({ ok: true, requestId, cached: false, ...sanitizeOverview(overview) });
    } catch (error) {
      repository.recordSyncFailure(userId, error.code);
      const cached = repository.getCachedOverview(userId);
      if (!cached?.overview) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, cachedAt: cached.cachedAt, warning: { code: error.code, message: error.message }, ...sanitizeOverview(cached.overview) });
    }
  }));

  app.get("/api/v3/pulse/wallet", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, wallet: sandbox.overview(userId).wallet });
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
    const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 50));
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, transactions: sandbox.transactions(userId, limit) });
    repository.requireLinked(userId);
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
    if (sandbox?.enabled()) {
      const transaction = sandbox.transactions(userId, 200).find((item) => item.id === request.params.id);
      if (!transaction) throw new PulseRepositoryError("Операция не найдена.", "RESOURCE_NOT_FOUND", 404);
      return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, transaction });
    }
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
    if (sandbox?.enabled()) throw new PulseRepositoryError("В тестовой модели денежные покупки отключены. Импульсы можно тратить во встроенном каталоге.", "PULSE_SANDBOX_NO_PAYMENTS", 409);
    repository.requireLinked(userId);
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const result = await client.checkout(userId, productCode, { currency: request.body?.currency || "EUR", region: request.body?.region || "*", idempotencyKey, requestId: request.pulseRequestId });
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
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, subscription: sandbox.overview(userId).subscription });
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
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, goals: sandbox.goals(request.pulseAuth.user.id, request.params.roomId) });
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
      const goals = state.pulseGoals.filter((item) => item.roomId === request.params.roomId).map((goal) => ({ ...goal, contributionCount: state.pulseContributions.filter((item) => item.goalId === goal.id).length }));
      if (!goals.length) throw error;
      response.json({ ok: true, requestId: request.pulseRequestId, cached: true, goals, warning: { code: error.code, message: error.message } });
    }
  }));

  app.post("/api/v3/rooms/:roomId/pulse/goals", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const membership = requireRoomMember(request.params.roomId, userId);
    if (!["owner", "moderator"].includes(membership.role)) {
      throw new PulseRepositoryError("Цели доступны владельцу и модераторам комнаты.", "PERMISSION_DENIED", 403);
    }
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const title = String(request.body?.title || "").trim();
    const description = String(request.body?.description || "").trim();
    const targetAmount = Math.trunc(Number(request.body?.targetAmount));
    const expiresAt = new Date(request.body?.expiresAt);
    if (title.length < 3 || title.length > 120) throw new PulseRepositoryError("Название цели должно содержать от 3 до 120 символов.", "VALIDATION_FAILED", 400);
    if (description.length < 3 || description.length > 1000) throw new PulseRepositoryError("Описание цели должно содержать от 3 до 1000 символов.", "VALIDATION_FAILED", 400);
    if (!Number.isSafeInteger(targetAmount) || targetAmount < 400 || targetAmount > 1_000_000) throw new PulseRepositoryError("Цель должна быть целым числом от 400 до 1 000 000 Импульсов.", "VALIDATION_FAILED", 400);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 55 * 60_000 || expiresAt.getTime() > Date.now() + 366 * 86_400_000) {
      throw new PulseRepositoryError("Срок цели недействителен.", "VALIDATION_FAILED", 400);
    }
    const input = {
      productCode: "room_reaction_pack", title, description, targetAmount,
      expiresAt: expiresAt.toISOString(), entitlementDurationDays: 30, idempotencyKey,
    };
    if (sandbox?.enabled()) {
      const result = await sandbox.createGoal(userId, request.params.roomId, input);
      await recordGoalEvent(request.params.roomId, userId, "created", result.goal, result.duplicate);
      emitRoom(request.params.roomId, "billing.goal_created", result.goal);
      return response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.pulseRequestId, ...result });
    }
    const result = await client.createGoal(userId, request.params.roomId, input, request.pulseRequestId);
    await store.mutate((state) => {
      const existing = state.pulseGoals.find((item) => item.id === result.goal.id);
      if (existing) Object.assign(existing, result.goal, { roomId: request.params.roomId, source: "pulse_cloud" });
      else state.pulseGoals.push({ ...result.goal, roomId: request.params.roomId, source: "pulse_cloud" });
    });
    repository.enqueueLocalEvent("billing.goal_created", { goalId: result.goal.id, roomId: request.params.roomId }, { roomId: request.params.roomId });
    await recordGoalEvent(request.params.roomId, userId, "created", result.goal, Boolean(result.duplicate));
    emitRoom(request.params.roomId, "billing.goal_created", result.goal);
    response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, goal: result.goal, duplicate: Boolean(result.duplicate) });
  }));

  app.post("/api/v3/rooms/:roomId/pulse/goals/:goalId/contributions", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const membership = requireRoomMember(request.params.roomId, userId);
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const previousStatus = membership.state.pulseGoals.find((item) => item.id === request.params.goalId)?.status || null;
    if (sandbox?.enabled()) {
      const result = await sandbox.contribute(userId, request.params.roomId, request.params.goalId, request.body?.amount, idempotencyKey);
      emitUser(userId, "billing.wallet_updated", { balance: result.balance });
      emitRoom(request.params.roomId, "billing.goal_updated", result.goal);
      if (previousStatus !== "funded" && result.goal?.status === "funded") await recordGoalEvent(request.params.roomId, userId, "funded", result.goal, result.duplicate);
      return response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.pulseRequestId, ...result });
    }
    const result = await client.contribute(userId, request.params.roomId, request.params.goalId, request.body?.amount, idempotencyKey, request.pulseRequestId);
    await store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
      if (goal && result.result.goal) Object.assign(goal, result.result.goal);
      const contribution = result.result.contribution;
      if (contribution && !state.pulseContributions.some((item) => item.id === contribution.id)) state.pulseContributions.push({ ...contribution, roomId: request.params.roomId, source: "pulse_cloud" });
    });
    emitUser(userId, "billing.wallet_updated", { balance: result.result.balance ?? result.result.newBalance });
    emitRoom(request.params.roomId, "billing.goal_updated", result.result.goal);
    if (previousStatus !== "funded" && result.result.goal?.status === "funded") await recordGoalEvent(request.params.roomId, userId, "funded", result.result.goal, result.result.duplicate);
    response.status(result.result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, ...result.result });
  }));

  app.post("/api/v3/rooms/:roomId/pulse/goals/:goalId/cancel", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const membership = requireRoomMember(request.params.roomId, userId);
    if (!["owner", "moderator"].includes(membership.role)) throw new PulseRepositoryError("Недостаточно прав для отмены цели.", "PERMISSION_DENIED", 403);
    const cachedGoal = membership.state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
    if (membership.role === "moderator" && cachedGoal?.createdBy !== userId) {
      throw new PulseRepositoryError("Модератор может отменить только созданную им цель.", "PERMISSION_DENIED", 403);
    }
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    if (sandbox?.enabled()) {
      const result = await sandbox.cancelGoal(userId, request.params.roomId, request.params.goalId, idempotencyKey);
      await recordGoalEvent(request.params.roomId, userId, "cancelled", result.goal, result.duplicate);
      emitRoom(request.params.roomId, "billing.goal_cancelled", result.goal);
      return response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.pulseRequestId, ...result });
    }
    const result = await client.cancelGoal(userId, request.params.roomId, request.params.goalId, idempotencyKey, request.pulseRequestId);
    await store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
      if (goal) Object.assign(goal, result.result.goal || { status: result.result.status || "cancelled" });
    });
    repository.enqueueLocalEvent("billing.goal_cancelled", { goalId: request.params.goalId, roomId: request.params.roomId }, { roomId: request.params.roomId });
    await recordGoalEvent(request.params.roomId, userId, "cancelled", result.result.goal || cachedGoal, result.result.duplicate);
    emitRoom(request.params.roomId, "billing.goal_cancelled", result.result.goal || result.result);
    response.status(result.result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, ...result.result });
  }));

  log("Pulse Local Server API v3 mounted", "info");
  return { authRequired };
}

module.exports = { mountPulseV3Routes, sanitizeOverview, stableError };
