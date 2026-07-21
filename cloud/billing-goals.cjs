"use strict";

const crypto = require("node:crypto");
const {
  BillingError,
  DEFAULT_ENTITLEMENT_DAYS,
  IMPULSE_CURRENCY,
  MONTHLY_PLUS_IMPULSES,
  PLUS_PRODUCT,
  parseJson,
  requireId,
  requirePositiveInt,
  serializeRow,
  timingSafeEqualText,
} = require("./billing-common.cjs");

module.exports = {
  createGoal({ serverId, roomId, createdBy, productCode, title, description = "", targetAmount, expiresAt, entitlementDurationDays = DEFAULT_ENTITLEMENT_DAYS }) {
    const product = this.db.prepare("SELECT * FROM products WHERE code=? AND active=1").get(requireId(productCode, "productCode"));
    if (!product || product.product_type !== "room_entitlement") {
      throw new BillingError("Продукт комнаты недоступен.", "PRODUCT_UNAVAILABLE", 409);
    }
    const target = requirePositiveInt(targetAmount, "targetAmount");
    const expiry = new Date(expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= this.clock().getTime()) {
      throw new BillingError("Срок цели должен быть в будущем.", "VALIDATION_FAILED", 400, { field: "expiresAt" });
    }
    const goal = {
      id: crypto.randomUUID(), serverId: requireId(serverId, "serverId"), roomId: requireId(roomId, "roomId"),
      productCode: product.code, title: String(title || product.display_name).trim().slice(0, 120), description: String(description || "").trim().slice(0, 1000),
      targetAmount: target, currentAmount: 0, status: "active", createdBy: requireId(createdBy, "createdBy"),
      createdAt: this.clock().toISOString(), expiresAt: expiry.toISOString(), entitlementDurationDays: requirePositiveInt(entitlementDurationDays, "entitlementDurationDays", 3650),
    };
    this.db.prepare(`
      INSERT INTO room_goals(id, server_id, room_id, product_code, title, description, target_amount, current_amount, status, created_by, created_at, expires_at, entitlement_duration_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)
    `).run(goal.id, goal.serverId, goal.roomId, goal.productCode, goal.title, goal.description, goal.targetAmount, goal.createdBy, goal.createdAt, goal.expiresAt, goal.entitlementDurationDays);
    this.ensureLedgerAccount("room_goal", goal.id, "goal_escrow", IMPULSE_CURRENCY);
    this.enqueueEvent("billing.goal_created", "room_goal", goal.id, goal);
    return goal;
  },

  getGoal(goalId) {
    return serializeRow(this.db.prepare("SELECT * FROM room_goals WHERE id=?").get(requireId(goalId, "goalId")));
  },

  contributeToGoal({ serverId, localUserId, goalId, requestedAmount, idempotencyKey }) {
    const requested = requirePositiveInt(requestedAmount, "amount", 100_000);
    const normalizedUserId = requireId(localUserId, "localUserId");
    const key = requireId(idempotencyKey, "idempotencyKey");
    return this.transaction(() => {
      const { account } = this.requireActiveLink(serverId, normalizedUserId);
      const duplicate = this.db.prepare(`
        SELECT * FROM goal_contributions WHERE local_user_id=? AND idempotency_key=?
      `).get(normalizedUserId, key);
      if (duplicate) {
        const goal = this.getGoal(duplicate.goal_id);
        return {
          contributionId: duplicate.id,
          goalId: duplicate.goal_id,
          userId: normalizedUserId,
          requestedPulse: Number(duplicate.requested_amount),
          acceptedPulse: Number(duplicate.accepted_amount),
          refusedPulse: Number(duplicate.requested_amount) - Number(duplicate.accepted_amount),
          newBalance: this.getBalance(account.id),
          balance: this.getBalance(account.id),
          duplicate: true,
          goal,
        };
      }
      const goal = this.db.prepare("SELECT * FROM room_goals WHERE id=?").get(requireId(goalId, "goalId"));
      if (!goal || goal.server_id !== requireId(serverId, "serverId")) throw new BillingError("Цель не найдена.", "GOAL_NOT_FOUND", 404);
      if (goal.status !== "active") throw new BillingError("Цель уже закрыта.", "GOAL_CLOSED", 409);
      if (Date.parse(goal.expires_at) <= this.clock().getTime()) {
        this.db.prepare("UPDATE room_goals SET status='expired', closed_at=? WHERE id=?").run(this.clock().toISOString(), goal.id);
        throw new BillingError("Срок цели истёк.", "GOAL_EXPIRED", 410);
      }
      const remaining = Number(goal.target_amount) - Number(goal.current_amount);
      if (remaining <= 0) throw new BillingError("Цель уже собрана.", "GOAL_ALREADY_FUNDED", 409);
      const accepted = Math.min(requested, remaining);
      const balance = this.getBalance(account.id);
      if (balance < accepted) throw new BillingError("Недостаточно Импульсов.", "WALLET_INSUFFICIENT_FUNDS", 409);

      const wallet = this.ensureLedgerAccount("cloud_account", account.id, "user_wallet", IMPULSE_CURRENCY);
      const escrow = this.ensureLedgerAccount("room_goal", goal.id, "goal_escrow", IMPULSE_CURRENCY);
      const ledger = this._postLedgerTransaction({
        operationType: "goal_contribution",
        referenceId: goal.id,
        idempotencyKey: `goal:${goal.id}:${normalizedUserId}:${key}`,
        entries: [
          { accountId: wallet.id, debit: accepted, credit: 0 },
          { accountId: escrow.id, debit: 0, credit: accepted },
        ],
        metadata: { goalId: goal.id, accountId: account.id, requested, accepted },
      });
      const contributionId = crypto.randomUUID();
      const timestamp = this.clock().toISOString();
      this.db.prepare(`
        INSERT INTO goal_contributions(id, goal_id, cloud_account_id, local_user_id, requested_amount, accepted_amount, status, idempotency_key, ledger_transaction_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?)
      `).run(contributionId, goal.id, account.id, normalizedUserId, requested, accepted, key, ledger.transaction.id, timestamp);
      const nextAmount = Number(goal.current_amount) + accepted;
      let status = "active";
      let fundedAt = null;
      let entitlement = null;
      if (nextAmount >= Number(goal.target_amount)) {
        status = "funded";
        fundedAt = timestamp;
        entitlement = this._createEntitlement({
          serverId: goal.server_id,
          roomId: goal.room_id,
          productCode: goal.product_code,
          durationDays: Number(goal.entitlement_duration_days),
        });
      }
      this.db.prepare(`
        UPDATE room_goals SET current_amount=?, status=?, funded_at=COALESCE(funded_at, ?) WHERE id=?
      `).run(Math.min(nextAmount, Number(goal.target_amount)), status, fundedAt, goal.id);
      this.enqueueEvent("billing.goal_updated", "room_goal", goal.id, { goalId: goal.id, currentAmount: Math.min(nextAmount, Number(goal.target_amount)), targetAmount: Number(goal.target_amount), status });
      if (status === "funded") this.enqueueEvent("billing.goal_funded", "room_goal", goal.id, { goalId: goal.id, entitlementJti: entitlement.jti });
      this.enqueueEvent("billing.wallet_updated", "wallet", account.id, { accountId: account.id, balance: this.getBalance(account.id) });
      return {
        contributionId,
        goalId: goal.id,
        userId: normalizedUserId,
        requestedPulse: requested,
        acceptedPulse: accepted,
        refusedPulse: requested - accepted,
        newBalance: this.getBalance(account.id),
        balance: this.getBalance(account.id),
        createdAt: timestamp,
        duplicate: false,
        entitlement: entitlement ? { ...entitlement, ...entitlement.envelope } : null,
      };
    });
  },

  cancelGoal({ serverId, localUserId, goalId, idempotencyKey }) {
    const normalizedServerId = requireId(serverId, "serverId");
    const normalizedUserId = requireId(localUserId, "localUserId");
    const key = requireId(idempotencyKey, "idempotencyKey");
    return this.transaction(() => {
      const goal = this.db.prepare("SELECT * FROM room_goals WHERE id=?").get(requireId(goalId, "goalId"));
      if (!goal || goal.server_id !== normalizedServerId) throw new BillingError("Цель не найдена.", "GOAL_NOT_FOUND", 404);
      if (goal.created_by !== normalizedUserId) throw new BillingError("Только владелец цели может отменить её.", "PERMISSION_DENIED", 403);
      const existingEvent = this.db.prepare("SELECT * FROM outbox_events WHERE aggregate_id=? AND event_type='billing.goal_refunded' AND payload_json LIKE ?")
        .get(goal.id, `%${key}%`);
      if (existingEvent) return { goal: this.getGoal(goal.id), refundedPulse: Number(goal.current_amount), duplicate: true };
      if (goal.status !== "active") throw new BillingError("Активную цель уже нельзя отменить.", "GOAL_CLOSED", 409);
      this.db.prepare("UPDATE room_goals SET status='refunding' WHERE id=?").run(goal.id);
      let refundedPulse = 0;
      const contributions = this.db.prepare(`
        SELECT * FROM goal_contributions WHERE goal_id=? AND status='accepted' ORDER BY created_at, id
      `).all(goal.id);
      const escrow = this.ensureLedgerAccount("room_goal", goal.id, "goal_escrow", IMPULSE_CURRENCY);
      for (const contribution of contributions) {
        const wallet = this.ensureLedgerAccount("cloud_account", contribution.cloud_account_id, "user_wallet", IMPULSE_CURRENCY);
        const refundLedger = this._postLedgerTransaction({
          operationType: "goal_full_refund",
          referenceId: contribution.id,
          idempotencyKey: `goal-refund:${contribution.id}`,
          entries: [
            { accountId: escrow.id, debit: Number(contribution.accepted_amount), credit: 0 },
            { accountId: wallet.id, debit: 0, credit: Number(contribution.accepted_amount) },
          ],
          metadata: { goalId: goal.id, contributionId: contribution.id },
        });
        this.db.prepare(`
          UPDATE goal_contributions SET status='refunded', refunded_at=? WHERE id=?
        `).run(this.clock().toISOString(), contribution.id);
        refundedPulse += Number(contribution.accepted_amount);
        this.enqueueEvent("billing.refund_updated", "goal_contribution", contribution.id, { goalId: goal.id, contributionId: contribution.id, transactionId: refundLedger.transaction.id });
      }
      const timestamp = this.clock().toISOString();
      this.db.prepare("UPDATE room_goals SET status='refunded', closed_at=? WHERE id=?").run(timestamp, goal.id);
      this.enqueueEvent("billing.goal_refunded", "room_goal", goal.id, { goalId: goal.id, idempotencyKey: key, refundedPulse });
      return { goal: this.getGoal(goal.id), refundedPulse, duplicate: false };
    });
  },

  applyChargeback({ accountId, amount, referenceId, idempotencyKey, operationType = "chargeback" }) {
    const normalizedAmount = requirePositiveInt(amount, "amount");
    const account = this.getCloudAccount(accountId);
    if (!account) throw new BillingError("Cloud Account не найден.", "RESOURCE_NOT_FOUND", 404);
    return this.transaction(() => {
      const balance = this.getBalance(account.id);
      const reclaim = Math.min(balance, normalizedAmount);
      const shortfall = normalizedAmount - reclaim;
      const entries = [];
      const recovery = this.ensureLedgerAccount("system", "global", "chargeback_recovery", IMPULSE_CURRENCY);
      if (reclaim > 0) {
        const wallet = this.ensureLedgerAccount("cloud_account", account.id, "user_wallet", IMPULSE_CURRENCY);
        entries.push({ accountId: wallet.id, debit: reclaim, credit: 0 });
      }
      if (shortfall > 0) {
        const loss = this.ensureLedgerAccount("system", "global", "chargeback_loss", IMPULSE_CURRENCY);
        entries.push({ accountId: loss.id, debit: shortfall, credit: 0 });
      }
      entries.push({ accountId: recovery.id, debit: 0, credit: normalizedAmount });
      const ledger = this._postLedgerTransaction({
        operationType,
        referenceId,
        idempotencyKey,
        entries,
        metadata: { accountId: account.id, reclaim, shortfall },
      });
      if (shortfall > 0) this.setAccountStatus(account.id, "restricted", Number(account.debt_amount || 0) + shortfall);
      this.enqueueEvent("billing.wallet_updated", "wallet", account.id, { accountId: account.id, balance: this.getBalance(account.id), restricted: shortfall > 0 });
      return { transaction: ledger.transaction, balance: this.getBalance(account.id), reclaim, shortfall, duplicate: ledger.duplicate };
    });
  },

  revokeEntitlement(jti, reason = "operator") {
    const entitlement = this.db.prepare("SELECT * FROM entitlements WHERE jti=?").get(requireId(jti, "jti"));
    if (!entitlement) throw new BillingError("Entitlement не найден.", "RESOURCE_NOT_FOUND", 404);
    if (entitlement.status === "revoked") return serializeRow(entitlement);
    const timestamp = this.clock().toISOString();
    this.db.prepare("UPDATE entitlements SET status='revoked', revoked_at=? WHERE jti=?").run(timestamp, entitlement.jti);
    this.enqueueEvent("billing.entitlement_revoked", "entitlement", entitlement.jti, { jti: entitlement.jti, reason });
    return serializeRow(this.db.prepare("SELECT * FROM entitlements WHERE jti=?").get(entitlement.jti));
  },

  enqueueEvent(eventType, aggregateType, aggregateId, payload) {
    const eventId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO outbox_events(event_id, event_type, aggregate_type, aggregate_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(eventId, String(eventType), String(aggregateType), String(aggregateId), JSON.stringify(payload || {}), this.clock().toISOString());
    return eventId;
  },

  overview(serverId, localUserId) {
    const { account } = this.requireActiveLink(serverId, localUserId);
    const wallet = this.getWallet(account.id);
    const subscription = serializeRow(this.db.prepare(`
      SELECT * FROM subscriptions WHERE cloud_account_id=? AND product_code=? ORDER BY updated_at DESC LIMIT 1
    `).get(account.id, PLUS_PRODUCT));
    const entitlements = this.db.prepare(`
      SELECT * FROM entitlements
      WHERE cloud_account_id=? AND server_id=? AND status IN ('active','cancel_at_period_end') AND not_before <= ? AND expires_at > ?
      ORDER BY expires_at DESC
    `).all(account.id, requireId(serverId, "serverId"), this.clock().toISOString(), this.clock().toISOString()).map((row) => {
      const envelope = parseJson(row.envelope_json, {});
      return {
        id: row.id,
        jti: row.jti,
        productCode: row.product_code,
        status: row.status,
        startsAt: row.not_before,
        expiresAt: row.expires_at,
        keyId: row.key_id,
        envelope,
      };
    });
    return {
      cloudAccountId: account.id,
      serverId: requireId(serverId, "serverId"),
      userId: requireId(localUserId, "localUserId"),
      accountStatus: account.status,
      wallet: { currency: wallet.currency, balance: Number(wallet.balance) },
      subscription,
      entitlements,
    };
  },

  ledgerInvariant() {
    const rows = this.db.prepare(`
      SELECT transaction_id, SUM(debit) AS debit_total, SUM(credit) AS credit_total
      FROM ledger_entries GROUP BY transaction_id
      HAVING debit_total <> credit_total OR debit_total <= 0
    `).all();
    return { ok: rows.length === 0, failures: rows };
  },

  authenticateServerCredential(provided, expected) {
    return timingSafeEqualText(provided, expected);
  }
};
