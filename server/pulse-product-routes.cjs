"use strict";

const crypto = require("node:crypto");
const { PulseRepositoryError } = require("./pulse-local-repository.cjs");

function mountPulseProductRoutes({ app, authRequired, client, repository, syncWorker, sandbox = null, io = null, store = null }) {
  if (!app || !authRequired || !client || !repository) throw new Error("Pulse product routes require app, auth middleware, client and repository.");
  const asyncRoute = (handler) => async (request, response) => {
    try { await handler(request, response); }
    catch (error) {
      response.status(Number(error.status || 500)).json({ ok: false, code: String(error.code || "INTERNAL_ERROR"), message: error.message || "Временная ошибка Local Server.", requestId: request.pulseRequestId || null, details: error.details || {} });
    }
  };
  const idempotency = (request) => {
    const key = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(key)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    return key;
  };
  const requireRoomOwner = (userId, roomId) => {
    if (!roomId || !store) return null;
    const room = store.read((state) => state.rooms.find((item) => item.id === roomId));
    if (!room) throw new PulseRepositoryError("Комната не найдена.", "RESOURCE_NOT_FOUND", 404);
    if (room.ownerId !== userId) throw new PulseRepositoryError("Покупки для комнаты доступны только владельцу.", "PERMISSION_DENIED", 403);
    return room;
  };
  const emitUser = (userId, eventType, payload) => {
    if (!io) return;
    io.to(`user:${userId}`).emit(eventType, payload);
    io.to(`user:${userId}`).emit("billing:event", { type: eventType, payload });
  };
  const emitRoom = (roomId, eventType, payload) => {
    if (!io || !store || !roomId) return;
    const conversationId = store.read((state) => state.conversations.find((item) => item.roomId === roomId)?.id);
    if (conversationId) io.to(`conversation:${conversationId}`).emit(eventType, payload);
  };

  app.get("/api/v3/pulse/receipts", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    if (sandbox?.enabled()) {
      return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, receipts: sandbox.receipts(userId) });
    }
    repository.requireLinked(userId);
    const result = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/receipts?limit=${Math.max(1, Math.min(200, Number(request.query.limit) || 50))}`, { userId, requestId: request.pulseRequestId });
    response.json({ ok: true, requestId: result.requestId, receipts: result.payload.receipts || [] });
  }));

  app.get("/api/v3/pulse/catalog", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const roomId = String(request.query.roomId || "").trim() || null;
    if (roomId) requireRoomOwner(userId, roomId);
    if (sandbox?.enabled()) {
      return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, catalog: sandbox.catalog(userId, roomId) });
    }
    repository.requireLinked(userId);
    const query = roomId ? `?roomId=${encodeURIComponent(roomId)}` : "";
    const result = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/catalog${query}`, { userId, roomId, requestId: request.pulseRequestId });
    response.json({ ok: true, requestId: result.requestId, cached: false, catalog: result.payload.catalog || [] });
  }));

  app.post("/api/v3/pulse/purchases", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const productCode = String(request.body?.productCode || "").trim();
    const roomId = String(request.body?.roomId || "").trim() || null;
    const key = idempotency(request);
    if (roomId) requireRoomOwner(userId, roomId);
    let result;
    let requestId = request.pulseRequestId;
    if (sandbox?.enabled()) {
      result = await sandbox.purchase(userId, productCode, { roomId, idempotencyKey: key, actor: userId });
    } else {
      repository.requireLinked(userId);
      const cloud = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/purchases`, {
        method: "POST",
        body: { productCode, roomId },
        idempotencyKey: key,
        requestId,
        userId,
        roomId,
        productCode,
      });
      result = cloud.payload;
      requestId = cloud.requestId;
      if (result?.entitlement) {
        await store?.mutate?.((state) => {
          const existing = state.billingEntitlements.find((item) => item.id === result.entitlement.id || item.jti === result.entitlement.jti);
          if (existing) Object.assign(existing, result.entitlement, { source: "pulse_cloud" });
          else state.billingEntitlements.push({ ...result.entitlement, source: "pulse_cloud" });
        });
      }
    }
    emitUser(userId, "billing.wallet_updated", { balance: result.walletBalance ?? result.balance, productCode });
    emitUser(userId, "billing.entitlement_updated", result.entitlement || null);
    if (roomId) emitRoom(roomId, "billing.entitlement_updated", result.entitlement || null);
    response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId, ...result });
  }));

  app.post("/api/v3/pulse/subscription/cancel", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    if (sandbox?.enabled()) throw new PulseRepositoryError("У тестового Plus нет автоматического продления.", "PULSE_SANDBOX_NO_RENEWAL", 409);
    repository.requireLinked(userId);
    const key = idempotency(request);
    const result = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/subscription/cancel`, { method: "POST", body: {}, userId, idempotencyKey: key, requestId: request.pulseRequestId });
    response.json({ ok: true, requestId: result.requestId, subscription: result.payload.subscription, cancelledAtPeriodEnd: result.payload.cancelledAtPeriodEnd });
  }));

  app.post("/api/v3/pulse/subscription/portal", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    if (sandbox?.enabled()) throw new PulseRepositoryError("Billing Portal недоступен в тестовой модели.", "PULSE_SANDBOX_NO_PAYMENTS", 409);
    repository.requireLinked(userId);
    const key = idempotency(request);
    const returnUrl = String(request.body?.returnUrl || "");
    const result = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/subscription/portal`, { method: "POST", body: { returnUrl }, userId, idempotencyKey: key, requestId: request.pulseRequestId });
    response.status(201).json({ ok: true, requestId: result.requestId, url: result.payload.url });
  }));

  app.get("/api/v3/pulse/sync", authRequired, (request, response) => {
    response.json({ ok: true, requestId: request.pulseRequestId, sync: syncWorker?.status() || { running: false } });
  });

  app.post("/api/v3/pulse/sync", authRequired, asyncRoute(async (request, response) => {
    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId || crypto.randomUUID(), result: { skipped: true, reason: "sandbox" } });
    const result = syncWorker ? await syncWorker.runOnce() : { skipped: true, reason: "unavailable" };
    response.json({ ok: true, requestId: request.pulseRequestId || crypto.randomUUID(), result });
  }));
}

module.exports = { mountPulseProductRoutes };
