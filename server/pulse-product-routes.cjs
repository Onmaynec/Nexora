"use strict";

const crypto = require("node:crypto");
const { PulseRepositoryError } = require("./pulse-local-repository.cjs");

function mountPulseProductRoutes({ app, authRequired, client, repository, syncWorker }) {
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

  app.get("/api/v3/pulse/receipts", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    const result = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/receipts?limit=${Math.max(1, Math.min(200, Number(request.query.limit) || 50))}`, { userId, requestId: request.pulseRequestId });
    response.json({ ok: true, requestId: result.requestId, receipts: result.payload.receipts || [] });
  }));

  app.post("/api/v3/pulse/subscription/cancel", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    repository.requireLinked(userId);
    const key = idempotency(request);
    const result = await client.request(`/v1/servers/${encodeURIComponent(client.serverId)}/users/${encodeURIComponent(userId)}/subscription/cancel`, { method: "POST", body: {}, userId, idempotencyKey: key, requestId: request.pulseRequestId });
    response.json({ ok: true, requestId: result.requestId, subscription: result.payload.subscription, cancelledAtPeriodEnd: result.payload.cancelledAtPeriodEnd });
  }));

  app.post("/api/v3/pulse/subscription/portal", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
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
    const result = syncWorker ? await syncWorker.runOnce() : { skipped: true, reason: "unavailable" };
    response.json({ ok: true, requestId: request.pulseRequestId || crypto.randomUUID(), result });
  }));
}

module.exports = { mountPulseProductRoutes };
