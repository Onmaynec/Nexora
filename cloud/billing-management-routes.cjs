"use strict";

const { BillingError, timingSafeEqualText } = require("./billing-core.cjs");

function encodeCursor(row) {
  if (!row) return null;
  return Buffer.from(JSON.stringify({ createdAt: row.created_at, eventId: row.event_id }), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!cursor?.createdAt || !cursor?.eventId) return null;
    return cursor;
  } catch {
    throw new BillingError("Event cursor повреждён.", "VALIDATION_FAILED", 400);
  }
}

function mountBillingManagementRoutes({ app, database, provider, responseSigner, serverApiKey, configuredServerId = "", publicUrl = "" }) {
  if (!app || !database || !provider || !responseSigner) throw new Error("Billing management routes require app, database, provider and response signer.");
  const jsonBody = require("express").json({ limit: "64kb", strict: true });

  function sendError(response, error) {
    const known = error instanceof BillingError;
    return response.status(known ? error.status : 500).json({
      ok: false,
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "Временная ошибка Pulse Cloud.",
      requestId: response.getHeader("X-Request-ID") || null,
      details: known ? error.details || {} : {},
    });
  }

  function serverAuth(request, response, next) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!timingSafeEqualText(token, serverApiKey)) return sendError(response, new BillingError("Service credential недействителен.", "AUTH_REQUIRED", 401));
    const serverId = String(request.headers["x-nexora-server-id"] || "").trim();
    if (!serverId) return sendError(response, new BillingError("X-Nexora-Server-ID обязателен.", "VALIDATION_FAILED", 400));
    if (configuredServerId && serverId !== configuredServerId) return sendError(response, new BillingError("Credential не разрешён для этого Server ID.", "PULSE_SCOPE_MISMATCH", 403));
    request.nexoraServerId = serverId;
    next();
  }

  function signed(response, payload, status = 200) {
    return response.status(status).json(responseSigner(payload));
  }

  function requireRouteServer(request) {
    if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
  }

  function accountFor(request) {
    requireRouteServer(request);
    return database.requireActiveLink(request.params.serverId, request.params.userId).account;
  }

  app.post("/v1/servers/:serverId/users/:userId/subscription/cancel", serverAuth, jsonBody, async (request, response) => {
    try {
      const account = accountFor(request);
      const subscription = database.db.prepare(`
        SELECT * FROM subscriptions WHERE cloud_account_id=? AND product_code='nexora_plus'
        ORDER BY updated_at DESC LIMIT 1
      `).get(account.id);
      if (!subscription) throw new BillingError("Активная подписка не найдена.", "RESOURCE_NOT_FOUND", 404);
      const key = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
      if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(key)) throw new BillingError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
      if (!subscription.cancel_at_period_end && !["cancelled", "canceled"].includes(subscription.status)) {
        const remote = await provider.request(`/v1/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, { cancel_at_period_end: true }, { idempotencyKey: key });
        database.db.prepare(`
          UPDATE subscriptions SET status=?, cancel_at_period_end=1, current_period_start=?, current_period_end=?, updated_at=? WHERE id=?
        `).run(
          String(remote.status || subscription.status),
          remote.current_period_start ? new Date(Number(remote.current_period_start) * 1000).toISOString() : subscription.current_period_start,
          remote.current_period_end ? new Date(Number(remote.current_period_end) * 1000).toISOString() : subscription.current_period_end,
          new Date().toISOString(),
          subscription.id,
        );
        database.enqueueEvent("billing.subscription_updated", "subscription", subscription.id, { accountId: account.id, serverId: request.params.serverId, userId: request.params.userId, status: remote.status || subscription.status, cancelAtPeriodEnd: true });
      }
      const updated = database.db.prepare("SELECT * FROM subscriptions WHERE id=?").get(subscription.id);
      signed(response, { serverId: request.params.serverId, userId: request.params.userId, subscription: updated, cancelledAtPeriodEnd: Boolean(updated.cancel_at_period_end) });
    } catch (error) { sendError(response, error); }
  });

  app.post("/v1/servers/:serverId/users/:userId/subscription/portal", serverAuth, jsonBody, async (request, response) => {
    try {
      const account = accountFor(request);
      const subscription = database.db.prepare(`SELECT * FROM subscriptions WHERE cloud_account_id=? ORDER BY updated_at DESC LIMIT 1`).get(account.id);
      if (!subscription) throw new BillingError("Подписка не найдена.", "RESOURCE_NOT_FOUND", 404);
      const remote = await provider.retrieveSubscription(subscription.provider_subscription_id);
      const customerId = typeof remote.customer === "string" ? remote.customer : remote.customer?.id;
      if (!/^cus_[A-Za-z0-9]+$/.test(String(customerId || ""))) throw new BillingError("Billing customer не найден.", "PAYMENT_PROVIDER_ERROR", 502);
      const key = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
      if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(key)) throw new BillingError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
      const returnUrl = String(request.body?.returnUrl || `${String(publicUrl).replace(/\/+$/, "")}/billing/return`);
      if (!/^https:\/\//i.test(returnUrl)) throw new BillingError("returnUrl должен использовать HTTPS.", "VALIDATION_FAILED", 400);
      const portal = await provider.createBillingPortalSession({ customerId, returnUrl, idempotencyKey: key });
      if (!/^https:\/\//i.test(String(portal.url || ""))) throw new BillingError("Provider вернул небезопасный portal URL.", "PAYMENT_PROVIDER_ERROR", 502);
      signed(response, { serverId: request.params.serverId, userId: request.params.userId, url: portal.url, createdAt: new Date().toISOString() }, 201);
    } catch (error) { sendError(response, error); }
  });

  app.get("/v1/servers/:serverId/events", serverAuth, (request, response) => {
    try {
      requireRouteServer(request);
      const cursor = decodeCursor(request.query.after);
      const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100));
      const rows = database.db.prepare(`
        SELECT * FROM outbox_events
        WHERE (? IS NULL OR created_at > ? OR (created_at = ? AND event_id > ?))
        ORDER BY created_at, event_id LIMIT ?
      `).all(cursor?.createdAt || null, cursor?.createdAt || null, cursor?.createdAt || null, cursor?.eventId || null, limit * 5);
      const events = [];
      let lastSeen = null;
      for (const row of rows) {
        lastSeen = row;
        let payload;
        try { payload = JSON.parse(row.payload_json || "{}"); } catch { payload = {}; }
        let allowed = payload.serverId === request.params.serverId;
        if (!allowed && payload.accountId) {
          allowed = Boolean(database.db.prepare(`SELECT 1 FROM local_account_links WHERE cloud_account_id=? AND server_id=? LIMIT 1`).get(payload.accountId, request.params.serverId));
        }
        if (!allowed && row.aggregate_type === "entitlement") {
          allowed = Boolean(database.db.prepare(`SELECT 1 FROM entitlements WHERE (id=? OR jti=?) AND server_id=? LIMIT 1`).get(row.aggregate_id, row.aggregate_id, request.params.serverId));
        }
        if (!allowed && row.aggregate_type === "goal") {
          allowed = Boolean(database.db.prepare(`SELECT 1 FROM room_goals WHERE id=? AND server_id=? LIMIT 1`).get(row.aggregate_id, request.params.serverId));
        }
        if (!allowed) continue;
        events.push({ eventId: row.event_id, type: row.event_type, aggregateType: row.aggregate_type, aggregateId: row.aggregate_id, payload, createdAt: row.created_at });
        if (events.length >= limit) break;
      }
      signed(response, { serverId: request.params.serverId, events, cursor: encodeCursor(lastSeen), hasMore: rows.length > events.length });
    } catch (error) { sendError(response, error); }
  });
}

module.exports = { decodeCursor, encodeCursor, mountBillingManagementRoutes };
