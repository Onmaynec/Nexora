"use strict";

const express = require("express");
const { createCloudApp, requestIdMiddleware } = require("./create-cloud-server.cjs");
const { BillingError, timingSafeEqualText } = require("./billing-core.cjs");
const { createResponseSigner } = require("./entitlements.cjs");

function safeJson(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function decodeEnvelopePayload(envelope) {
  if (!envelope?.payload || !envelope?.signature || !envelope?.keyId) return null;
  try { return JSON.parse(Buffer.from(String(envelope.payload), "base64url").toString("utf8")); } catch { return null; }
}

function createCloudAppV11(options = {}) {
  const responseSigner = options.responseSigner || createResponseSigner({
    keyId: options.entitlementKeyId,
    privateKey: options.entitlementPrivateKey,
  });
  const base = createCloudApp({ ...options, responseSigner });
  const { database } = base;
  const app = express();
  const serverApiKey = String(options.serverApiKey || "");
  const configuredServerId = String(options.serverId || "").trim();

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    requestIdMiddleware(request, response, () => {
      request.headers["x-request-id"] = request.requestId;
      next();
    });
  });
  app.use(express.json({ limit: "256kb", strict: true }));

  function sendError(response, error) {
    const status = error instanceof BillingError ? error.status : 500;
    const code = error instanceof BillingError ? error.code : "INTERNAL_ERROR";
    const message = error instanceof BillingError ? error.message : "Временная ошибка Pulse Cloud.";
    return response.status(status).json({
      ok: false,
      code,
      message,
      requestId: response.getHeader("X-Request-ID"),
      details: error instanceof BillingError ? safeJson(error.details || {}) : {},
    });
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

  function signed(response, value, status = 200) {
    return response.status(status).json(responseSigner(value));
  }

  function linkedAccount(serverId, userId) {
    return database.requireActiveLink(serverId, userId).account;
  }

  function transactionRows(accountId, { limit = 50, before = null, transactionId = null } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const rows = database.db.prepare(`
      WITH wallet_transactions AS (
        SELECT
          tx.id,
          tx.operation_type,
          tx.reference_id,
          tx.currency,
          tx.created_at,
          tx.metadata_json,
          (entry.credit - entry.debit) AS amount,
          SUM(entry.credit - entry.debit) OVER (
            ORDER BY tx.created_at, tx.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS balance_after
        FROM ledger_transactions tx
        JOIN ledger_entries entry ON entry.transaction_id=tx.id
        JOIN ledger_accounts account ON account.id=entry.account_id
        WHERE account.owner_type='cloud_account'
          AND account.owner_id=?
          AND account.kind='user_wallet'
      )
      SELECT * FROM wallet_transactions
      WHERE (? IS NULL OR created_at < ?)
        AND (? IS NULL OR id = ?)
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(accountId, before, before, transactionId, transactionId, safeLimit);
    return rows.map((row) => ({
      id: row.id,
      operationType: row.operation_type,
      referenceId: row.reference_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: "completed",
      balanceBefore: Number(row.balance_after) - Number(row.amount),
      balanceAfter: Number(row.balance_after),
      createdAt: row.created_at,
      metadata: (() => { try { return JSON.parse(row.metadata_json || "{}"); } catch { return {}; } })(),
    }));
  }

  app.use((request, response, next) => {
    const originalJson = response.json.bind(response);
    response.json = (body) => {
      const payload = decodeEnvelopePayload(body);
      if (!payload) return originalJson(body);
      const headerServerId = String(request.headers["x-nexora-server-id"] || "").trim();
      let serverId = payload.serverId || request.body?.serverId || headerServerId || null;
      let userId = payload.userId || request.body?.userId || null;
      let roomId = payload.roomId || request.body?.roomId || payload.goal?.room_id || payload.goal?.roomId || null;

      if (request.method === "GET" && /^\/v1\/checkout\//.test(request.path)) {
        const checkoutId = payload.checkoutId || request.params?.id || request.path.split("/").at(-1);
        const checkout = database.db.prepare(`
          SELECT orders.server_id, orders.local_user_id
          FROM checkout_sessions JOIN orders ON orders.id=checkout_sessions.order_id
          WHERE checkout_sessions.id=?
        `).get(checkoutId);
        serverId ||= checkout?.server_id || null;
        userId ||= checkout?.local_user_id || null;
      }
      if (/^\/v1\/goals\//.test(request.path)) {
        const goalId = request.params?.goalId || request.path.split("/")[3];
        const goal = database.db.prepare("SELECT server_id, room_id FROM room_goals WHERE id=?").get(goalId);
        serverId ||= goal?.server_id || null;
        roomId ||= goal?.room_id || null;
      }
      if (!serverId) return originalJson(body);
      return originalJson(responseSigner({ ...payload, serverId, userId, roomId }));
    };
    next();
  });

  app.get("/v1/servers/:serverId/users/:userId/transactions", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const account = linkedAccount(request.params.serverId, request.params.userId);
      signed(response, {
        serverId: request.params.serverId,
        userId: request.params.userId,
        transactions: transactionRows(account.id, { limit: request.query.limit, before: request.query.before || null }),
      });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/servers/:serverId/users/:userId/transactions/:transactionId", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const account = linkedAccount(request.params.serverId, request.params.userId);
      const transaction = transactionRows(account.id, { transactionId: request.params.transactionId, limit: 1 })[0];
      if (!transaction) throw new BillingError("Transaction не найдена.", "RESOURCE_NOT_FOUND", 404);
      signed(response, { serverId: request.params.serverId, userId: request.params.userId, transaction });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/servers/:serverId/users/:userId/receipts", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const account = linkedAccount(request.params.serverId, request.params.userId);
      const receipts = database.db.prepare(`
        SELECT receipts.*, orders.product_code, payments.status AS payment_status
        FROM receipts
        JOIN orders ON orders.id=receipts.order_id
        JOIN payments ON payments.id=receipts.payment_id
        WHERE orders.cloud_account_id=? AND orders.server_id=? AND orders.local_user_id=?
        ORDER BY receipts.created_at DESC
        LIMIT ?
      `).all(account.id, request.params.serverId, request.params.userId, Math.max(1, Math.min(200, Number(request.query.limit) || 50)))
        .map((row) => ({
          id: row.id,
          orderId: row.order_id,
          receiptNumber: row.receipt_number,
          productCode: row.product_code,
          amountMinor: Number(row.amount_minor),
          currency: row.currency,
          taxMinor: Number(row.tax_minor),
          status: row.status,
          paymentStatus: row.payment_status,
          providerUrl: row.provider_url,
          createdAt: row.created_at,
        }));
      signed(response, { serverId: request.params.serverId, userId: request.params.userId, receipts });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/servers/:serverId/users/:userId/catalog", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const roomId = String(request.query.roomId || "").trim() || null;
      const catalog = database.catalog({ serverId: request.params.serverId, localUserId: request.params.userId, roomId });
      signed(response, { serverId: request.params.serverId, userId: request.params.userId, roomId, catalog });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/servers/:serverId/users/:userId/purchases", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
      const result = database.purchaseCatalogProduct({
        serverId: request.params.serverId,
        localUserId: request.params.userId,
        productCode: request.body?.productCode,
        roomId: request.body?.roomId || null,
        idempotencyKey,
      });
      signed(response, { serverId: request.params.serverId, userId: request.params.userId, roomId: request.body?.roomId || null, ...result }, result.duplicate ? 200 : 201);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/servers/:serverId/rooms/:roomId/goals", serverAuth, (request, response) => {
    try {
      if (request.params.serverId !== request.nexoraServerId) throw new BillingError("Server ID в маршруте не соответствует credential.", "PULSE_SCOPE_MISMATCH", 403);
      const goals = database.db.prepare(`
        SELECT room_goals.*,
          (SELECT COUNT(*) FROM goal_contributions WHERE goal_contributions.goal_id=room_goals.id) AS contribution_count
        FROM room_goals
        WHERE server_id=? AND room_id=?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(request.params.serverId, request.params.roomId, Math.max(1, Math.min(200, Number(request.query.limit) || 50)))
        .map((row) => ({
          id: row.id,
          serverId: row.server_id,
          roomId: row.room_id,
          productCode: row.product_code,
          title: row.title,
          description: row.description,
          targetAmount: Number(row.target_amount),
          currentAmount: Number(row.current_amount),
          status: row.status,
          createdBy: row.created_by,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          fundedAt: row.funded_at,
          closedAt: row.closed_at,
          entitlementDurationDays: Number(row.entitlement_duration_days),
          contributionCount: Number(row.contribution_count),
        }));
      signed(response, { serverId: request.params.serverId, roomId: request.params.roomId, goals });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.use(base.app);
  return { ...base, app };
}

module.exports = {
  createCloudAppV11,
  decodeEnvelopePayload,
};
