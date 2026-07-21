"use strict";

const crypto = require("node:crypto");
const express = require("express");
const { BillingDatabase, BillingError, timingSafeEqualText } = require("./billing-core.cjs");
const { StripeProvider } = require("./stripe-provider.cjs");
const { createEntitlementSigner, createResponseSigner } = require("./entitlements.cjs");

function safeJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function requestIdMiddleware(request, response, next) {
  const incoming = String(request.headers["x-request-id"] || "").trim();
  const requestId = /^[A-Za-z0-9_.:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  request.requestId = requestId;
  response.setHeader("X-Request-ID", requestId);
  next();
}

function createRateLimiter({ windowMs = 60_000, limit = 120 } = {}) {
  const buckets = new Map();
  return (request, response, next) => {
    const key = `${request.ip}:${request.path}`;
    const now = Date.now();
    const bucket = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (bucket.length >= limit) {
      return response.status(429).json({ ok: false, code: "RATE_LIMITED", message: "Слишком много запросов.", requestId: request.requestId, details: {} });
    }
    bucket.push(now);
    buckets.set(key, bucket);
    next();
  };
}

function createCloudApp(options = {}) {
  const database = options.database || new BillingDatabase(options.databaseFile || "data/pulse-cloud.sqlite", {
    entitlementSigner: options.entitlementSigner || createEntitlementSigner({
      keyId: options.entitlementKeyId,
      privateKey: options.entitlementPrivateKey,
    }),
  });
  const responseSigner = options.responseSigner || createResponseSigner({
    keyId: options.entitlementKeyId,
    privateKey: options.entitlementPrivateKey,
  });
  const provider = options.provider || new StripeProvider({
    secretKey: options.paymentSecretKey,
    webhookSecret: options.paymentWebhookSecret,
    fetchImpl: options.fetchImpl,
  });
  const publicUrl = String(options.publicUrl || "").replace(/\/+$/, "");
  const serverApiKey = String(options.serverApiKey || "");
  const adminApiKey = String(options.adminApiKey || "");
  const configuredServerId = String(options.serverId || "").trim();
  const defaultCurrency = String(options.currency || "EUR").toUpperCase();
  const defaultRegion = String(options.region || "*");

  if (!serverApiKey || serverApiKey.length < 24) throw new BillingError("NEXORA_PULSE_API_KEY не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
  if (!adminApiKey || adminApiKey.length < 24) throw new BillingError("CLOUD_ADMIN_API_KEY не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
  if (!/^https:\/\//i.test(publicUrl) && options.allowInsecurePublicUrl !== true) {
    throw new BillingError("CLOUD_PUBLIC_URL должен использовать HTTPS.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }

  if (options.plusPriceId) {
    database.upsertPrice({
      id: "price_nexora_plus_default",
      productCode: "nexora_plus",
      providerPriceId: options.plusPriceId,
      currency: defaultCurrency,
      amountMinor: Number(options.plusPriceMinor || 0),
      region: defaultRegion,
      taxMode: options.taxMode || "exclusive",
    });
  }
  if (options.impulse500PriceId) {
    database.upsertPrice({
      id: "price_impulse_pack_500_default",
      productCode: "impulse_pack_500",
      providerPriceId: options.impulse500PriceId,
      currency: defaultCurrency,
      amountMinor: Number(options.impulse500PriceMinor || 0),
      region: defaultRegion,
      taxMode: options.taxMode || "exclusive",
    });
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy || 1);
  app.use(requestIdMiddleware);
  app.use(createRateLimiter({ windowMs: 60_000, limit: Number(options.rateLimit || 180) }));

  function sendError(response, error) {
    const status = error instanceof BillingError ? error.status : 500;
    const code = error instanceof BillingError ? error.code : "INTERNAL_ERROR";
    const message = error instanceof BillingError ? error.message : "Временная ошибка Pulse Cloud.";
    return response.status(status).json({ ok: false, code, message, requestId: response.getHeader("X-Request-ID"), details: error instanceof BillingError ? safeJson(error.details || {}) : {} });
  }

  function serverAuth(request, response, next) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!timingSafeEqualText(token, serverApiKey)) return sendError(response, new BillingError("Service credential недействителен.", "AUTH_REQUIRED", 401));
    const headerServerId = String(request.headers["x-nexora-server-id"] || "").trim();
    if (!headerServerId) return sendError(response, new BillingError("X-Nexora-Server-ID обязателен.", "VALIDATION_FAILED", 400));
    if (configuredServerId && headerServerId !== configuredServerId) return sendError(response, new BillingError("Credential не разрешён для этого Server ID.", "PULSE_SCOPE_MISMATCH", 403));
    request.nexoraServerId = headerServerId;
    next();
  }

  function adminAuth(request, response, next) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!timingSafeEqualText(token, adminApiKey)) return sendError(response, new BillingError("Operator credential недействителен.", "AUTH_REQUIRED", 401));
    next();
  }

  function signed(response, value, status = 200) {
    return response.status(status).json(responseSigner(value));
  }

  app.post("/v1/provider/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), async (request, response) => {
    let event;
    try {
      event = provider.verifyWebhook(request.body, request.headers["stripe-signature"]);
      const payloadHash = crypto.createHash("sha256").update(request.body).digest("hex");
      const recorded = database.recordProviderEvent({ provider: "stripe", eventId: event.id, eventType: event.type, payloadHash });
      if (recorded.duplicate) return response.status(200).json({ received: true, duplicate: true, requestId: request.requestId });

      const object = event.data.object;
      if (event.type === "checkout.session.completed") {
        const orderId = String(object.metadata?.order_id || object.client_reference_id || "");
        if (!orderId) throw new BillingError("Checkout session не содержит order ID.", "PAYMENT_SCOPE_MISMATCH", 409);
        if (object.mode === "payment") {
          database.completeImpulseOrder({
            orderId,
            providerPaymentId: object.payment_intent,
            amountMinor: object.amount_total,
            currency: object.currency,
            provider: "stripe",
          });
        } else if (object.mode === "subscription") {
          const subscription = await provider.retrieveSubscription(object.subscription);
          const metadata = subscription.metadata || {};
          if (metadata.order_id !== orderId) throw new BillingError("Subscription metadata не соответствует checkout.", "PAYMENT_SCOPE_MISMATCH", 409);
          database.activatePlusPeriod({
            accountId: metadata.cloud_account_id,
            serverId: metadata.server_id,
            providerSubscriptionId: subscription.id,
            periodStart: new Date(Number(subscription.current_period_start) * 1000),
            periodEnd: new Date(Number(subscription.current_period_end) * 1000),
            status: subscription.status || "active",
          });
        }
      } else if (event.type === "invoice.paid") {
        const subscriptionId = String(object.subscription || "");
        if (subscriptionId) {
          const subscription = await provider.retrieveSubscription(subscriptionId);
          const metadata = subscription.metadata || {};
          database.activatePlusPeriod({
            accountId: metadata.cloud_account_id,
            serverId: metadata.server_id,
            providerSubscriptionId: subscription.id,
            periodStart: new Date(Number(subscription.current_period_start) * 1000),
            periodEnd: new Date(Number(subscription.current_period_end) * 1000),
            status: subscription.status || "active",
          });
        }
      } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
        const status = event.type.endsWith("deleted") ? "cancelled" : String(object.status || "active");
        database.db.prepare(`
          UPDATE subscriptions SET status=?, cancel_at_period_end=?, current_period_start=?, current_period_end=?, updated_at=?
          WHERE provider_subscription_id=?
        `).run(status, object.cancel_at_period_end ? 1 : 0, new Date(Number(object.current_period_start) * 1000).toISOString(), new Date(Number(object.current_period_end) * 1000).toISOString(), new Date().toISOString(), object.id);
      } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
        const paymentIntentId = String(object.payment_intent || "");
        const payment = database.db.prepare(`
          SELECT payments.*, orders.cloud_account_id, orders.product_code, products.impulse_amount
          FROM payments
          JOIN orders ON orders.id=payments.order_id
          JOIN products ON products.code=orders.product_code
          WHERE payments.provider_payment_id=?
        `).get(paymentIntentId);
        if (payment?.impulse_amount > 0) {
          database.applyChargeback({
            accountId: payment.cloud_account_id,
            amount: Number(payment.impulse_amount),
            referenceId: event.id,
            idempotencyKey: `${event.type}:${event.id}`,
            operationType: event.type === "charge.refunded" ? "payment_refund" : "chargeback",
          });
        } else if (payment?.cloud_account_id) {
          database.setAccountStatus(payment.cloud_account_id, "restricted");
        }
      }
      database.markProviderEvent(event.id, "processed");
      return response.status(200).json({ received: true, requestId: request.requestId });
    } catch (error) {
      if (event?.id) database.markProviderEvent(event.id, "failed", error.code || "INTERNAL_ERROR");
      return sendError(response, error);
    }
  });

  app.use(express.json({ limit: "256kb", strict: true }));

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true, service: "nexora-pulse-cloud", ledger: database.ledgerInvariant() });
  });

  app.get("/v1/public-keys", (_request, response) => {
    response.json({ ok: true, keys: [{ keyId: options.entitlementKeyId, publicKey: options.entitlementPublicKey, algorithm: "Ed25519" }] });
  });

  app.post("/v1/admin/accounts", adminAuth, (request, response) => {
    try {
      const account = database.createCloudAccount({ id: request.body?.id, country: request.body?.country });
      response.status(201).json({ ok: true, account, requestId: request.requestId });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/admin/links", adminAuth, (request, response) => {
    try {
      const link = database.linkLocalAccount({ accountId: request.body?.accountId, serverId: request.body?.serverId, localUserId: request.body?.localUserId });
      response.status(201).json({ ok: true, link, requestId: request.requestId });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/servers/:serverId/users/:userId/overview", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      signed(response, database.overview(request.params.serverId, request.params.userId));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/checkout/sessions", serverAuth, async (request, response) => {
    try {
      const serverId = String(request.body?.serverId || request.nexoraServerId);
      if (serverId !== request.nexoraServerId) throw new BillingError("Server ID в body не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || request.requestId);
      const { order, price } = database.createOrder({
        serverId,
        localUserId: request.body?.userId,
        productCode: request.body?.productCode,
        currency: request.body?.currency || defaultCurrency,
        region: request.body?.region || defaultRegion,
        idempotencyKey,
      });
      const session = await provider.createCheckoutSession({
        order,
        price,
        successUrl: `${publicUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${publicUrl}/checkout/cancelled?order_id=${encodeURIComponent(order.id)}`,
      });
      const cached = database.attachCheckoutSession({
        orderId: order.id,
        provider: "stripe",
        providerSessionId: session.id,
        url: session.url,
        expiresAt: new Date(Number(session.expires_at) * 1000).toISOString(),
      });
      signed(response, { checkoutId: cached.id, orderId: order.id, url: cached.url, expiresAt: cached.expires_at }, 201);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/checkout/:id", serverAuth, (request, response) => {
    try {
      const checkout = database.db.prepare(`
        SELECT checkout_sessions.*, orders.server_id, orders.local_user_id, orders.status AS order_status
        FROM checkout_sessions JOIN orders ON orders.id=checkout_sessions.order_id WHERE checkout_sessions.id=?
      `).get(request.params.id);
      if (!checkout || checkout.server_id !== request.nexoraServerId) throw new BillingError("Checkout не найден.", "RESOURCE_NOT_FOUND", 404);
      signed(response, { checkoutId: checkout.id, orderId: checkout.order_id, status: checkout.order_status, expiresAt: checkout.expires_at });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/goals", serverAuth, (request, response) => {
    try {
      const serverId = String(request.body?.serverId || request.nexoraServerId);
      if (serverId !== request.nexoraServerId) throw new BillingError("Server ID в body не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const goal = database.createGoal({
        serverId,
        roomId: request.body?.roomId,
        createdBy: request.body?.userId,
        productCode: request.body?.productCode,
        title: request.body?.title,
        description: request.body?.description,
        targetAmount: request.body?.targetAmount,
        expiresAt: request.body?.expiresAt,
        entitlementDurationDays: request.body?.entitlementDurationDays,
      });
      signed(response, { goal }, 201);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/goals/:goalId/contributions", serverAuth, (request, response) => {
    try {
      const serverId = String(request.body?.serverId || request.nexoraServerId);
      if (serverId !== request.nexoraServerId) throw new BillingError("Server ID в body не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const result = database.contributeToGoal({
        serverId,
        localUserId: request.body?.userId,
        goalId: request.params.goalId,
        requestedAmount: request.body?.amount,
        idempotencyKey: request.headers["idempotency-key"] || request.body?.idempotencyKey,
      });
      signed(response, result, result.duplicate ? 200 : 201);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/goals/:goalId/cancel", serverAuth, (request, response) => {
    try {
      const serverId = String(request.body?.serverId || request.nexoraServerId);
      if (serverId !== request.nexoraServerId) throw new BillingError("Server ID в body не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const result = database.cancelGoal({
        serverId,
        localUserId: request.body?.userId,
        goalId: request.params.goalId,
        idempotencyKey: request.headers["idempotency-key"] || request.body?.idempotencyKey,
      });
      signed(response, result, result.duplicate ? 200 : 201);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.use((error, _request, response, _next) => sendError(response, error));

  return { app, database, provider };
}

module.exports = {
  createCloudApp,
  createRateLimiter,
  requestIdMiddleware,
};
