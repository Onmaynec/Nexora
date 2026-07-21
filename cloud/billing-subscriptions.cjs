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
} = require("./billing-common.cjs");

module.exports = {
  _createEntitlement({ cloudAccountId = null, serverId, roomId = null, productCode, durationDays = DEFAULT_ENTITLEMENT_DAYS, status = "active" }) {
    if (!this.entitlementSigner) {
      throw new BillingError("Entitlement signer не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
    }
    const issuedAt = this.clock();
    const expiresAt = new Date(issuedAt.getTime() + requirePositiveInt(durationDays, "durationDays", 3650) * 24 * 60 * 60 * 1000);
    const payload = {
      jti: crypto.randomUUID(),
      serverId: requireId(serverId, "serverId"),
      roomId: roomId ? requireId(roomId, "roomId") : null,
      cloudAccountId: cloudAccountId ? requireId(cloudAccountId, "cloudAccountId") : null,
      productCode: requireId(productCode, "productCode"),
      status,
      issuedAt: issuedAt.toISOString(),
      notBefore: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const envelope = this.entitlementSigner(payload);
    if (!envelope?.payload || !envelope?.signature || !envelope?.keyId) {
      throw new BillingError("Entitlement signer вернул неверный envelope.", "PULSE_CLOUD_MISCONFIGURED", 503);
    }
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO entitlements(id, jti, cloud_account_id, server_id, room_id, product_code, status, issued_at, not_before, expires_at, key_id, envelope_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, payload.jti, payload.cloudAccountId, payload.serverId, payload.roomId, payload.productCode, status, payload.issuedAt, payload.notBefore, payload.expiresAt, envelope.keyId, JSON.stringify(envelope));
    return { id, ...payload, keyId: envelope.keyId, envelope };
  },

  activatePlusPeriod({ accountId, serverId, providerSubscriptionId, periodStart, periodEnd, status = "active" }) {
    const account = this.getCloudAccount(accountId);
    if (!account) throw new BillingError("Cloud Account не найден.", "RESOURCE_NOT_FOUND", 404);
    const normalizedSubscriptionId = requireId(providerSubscriptionId, "providerSubscriptionId");
    const normalizedPeriodStart = new Date(periodStart).toISOString();
    const normalizedPeriodEnd = new Date(periodEnd).toISOString();
    return this.transaction(() => {
      let subscription = this.db.prepare("SELECT * FROM subscriptions WHERE provider_subscription_id = ?").get(normalizedSubscriptionId);
      if (!subscription) {
        const id = crypto.randomUUID();
        this.db.prepare(`
          INSERT INTO subscriptions(id, cloud_account_id, product_code, provider_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(id, account.id, PLUS_PRODUCT, normalizedSubscriptionId, status, normalizedPeriodStart, normalizedPeriodEnd, this.clock().toISOString());
        subscription = this.db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id);
      } else {
        this.db.prepare(`
          UPDATE subscriptions SET status=?, current_period_start=?, current_period_end=?, updated_at=? WHERE id=?
        `).run(status, normalizedPeriodStart, normalizedPeriodEnd, this.clock().toISOString(), subscription.id);
        subscription = this.db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(subscription.id);
      }

      const existingPeriod = this.db.prepare(`
        SELECT * FROM subscription_periods WHERE subscription_id=? AND period_start=? AND grant_type='plus_monthly_grant'
      `).get(subscription.id, normalizedPeriodStart);
      let grantDuplicate = Boolean(existingPeriod);
      if (!existingPeriod) {
        const issuance = this.ensureLedgerAccount("system", "global", "impulse_issuance", IMPULSE_CURRENCY);
        const wallet = this.ensureLedgerAccount("cloud_account", account.id, "user_wallet", IMPULSE_CURRENCY);
        const grant = this._postLedgerTransaction({
          operationType: "plus_monthly_grant",
          referenceId: subscription.id,
          idempotencyKey: `plus-grant:${subscription.id}:${normalizedPeriodStart}`,
          entries: [
            { accountId: issuance.id, debit: MONTHLY_PLUS_IMPULSES, credit: 0 },
            { accountId: wallet.id, debit: 0, credit: MONTHLY_PLUS_IMPULSES },
          ],
          metadata: { subscriptionId: subscription.id, periodStart: normalizedPeriodStart },
        });
        this.db.prepare(`
          INSERT INTO subscription_periods(id, subscription_id, period_start, grant_type, ledger_transaction_id, created_at)
          VALUES (?, ?, ?, 'plus_monthly_grant', ?, ?)
        `).run(crypto.randomUUID(), subscription.id, normalizedPeriodStart, grant.transaction.id, this.clock().toISOString());
      }

      let entitlement = this.db.prepare(`
        SELECT * FROM entitlements WHERE cloud_account_id=? AND product_code=? AND status IN ('active','cancel_at_period_end') AND expires_at > ?
        ORDER BY expires_at DESC LIMIT 1
      `).get(account.id, PLUS_PRODUCT, this.clock().toISOString());
      if (!entitlement || entitlement.expires_at < normalizedPeriodEnd) {
        entitlement = this._createEntitlement({
          cloudAccountId: account.id,
          serverId,
          productCode: PLUS_PRODUCT,
          durationDays: Math.max(1, Math.ceil((Date.parse(normalizedPeriodEnd) - this.clock().getTime()) / 86_400_000)),
        });
      } else {
        entitlement = serializeRow(entitlement);
      }
      this.enqueueEvent("billing.subscription_updated", "subscription", subscription.id, { accountId: account.id, status, periodStart: normalizedPeriodStart, periodEnd: normalizedPeriodEnd });
      this.enqueueEvent("billing.wallet_updated", "wallet", account.id, { accountId: account.id, balance: this.getBalance(account.id) });
      return { subscription: serializeRow(subscription), grantDuplicate, balance: this.getBalance(account.id), entitlement };
    });
  },

  completeImpulseOrder({ orderId, providerPaymentId, amountMinor, currency, provider = "stripe", receiptUrl = null }) {
    const normalizedOrderId = requireId(orderId, "orderId");
    const paymentId = requireId(providerPaymentId, "providerPaymentId");
    const existingPayment = this.db.prepare("SELECT * FROM payments WHERE provider_payment_id = ?").get(paymentId);
    if (existingPayment) return { payment: serializeRow(existingPayment), duplicate: true };
    return this.transaction(() => {
      const order = this.db.prepare(`
        SELECT orders.*, products.product_type, products.impulse_amount
        FROM orders JOIN products ON products.code=orders.product_code WHERE orders.id=?
      `).get(normalizedOrderId);
      if (!order) throw new BillingError("Order не найден.", "RESOURCE_NOT_FOUND", 404);
      if (order.product_type !== "impulse_pack") throw new BillingError("Order имеет другой тип продукта.", "PAYMENT_SCOPE_MISMATCH", 409);
      if (Number(order.amount_minor) !== Math.trunc(Number(amountMinor)) || order.currency !== String(currency).toUpperCase()) {
        throw new BillingError("Сумма или валюта provider payment не совпадает с order.", "PAYMENT_AMOUNT_MISMATCH", 409);
      }
      const timestamp = this.clock().toISOString();
      const paymentRecordId = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO payments(id, order_id, provider, provider_payment_id, amount_minor, currency, status, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, '{}')
      `).run(paymentRecordId, order.id, provider, paymentId, order.amount_minor, order.currency, timestamp, timestamp);
      const issuance = this.ensureLedgerAccount("system", "global", "impulse_issuance", IMPULSE_CURRENCY);
      const wallet = this.ensureLedgerAccount("cloud_account", order.cloud_account_id, "user_wallet", IMPULSE_CURRENCY);
      const ledger = this._postLedgerTransaction({
        operationType: "impulse_pack_purchase",
        referenceId: paymentRecordId,
        idempotencyKey: `payment:${provider}:${paymentId}`,
        entries: [
          { accountId: issuance.id, debit: Number(order.impulse_amount), credit: 0 },
          { accountId: wallet.id, debit: 0, credit: Number(order.impulse_amount) },
        ],
        metadata: { orderId: order.id, providerPaymentId: paymentId },
      });
      this.db.prepare("UPDATE orders SET status='paid', updated_at=? WHERE id=?").run(timestamp, order.id);
      const receiptId = crypto.randomUUID();
      const receiptNumber = `NX-${timestamp.slice(0, 10).replace(/-/g, "")}-${receiptId.slice(0, 8).toUpperCase()}`;
      this.db.prepare(`
        INSERT INTO receipts(id, order_id, payment_id, receipt_number, amount_minor, currency, tax_minor, status, provider_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'paid', ?, ?)
      `).run(receiptId, order.id, paymentRecordId, receiptNumber, order.amount_minor, order.currency, receiptUrl, timestamp);
      this.enqueueEvent("billing.transaction_created", "ledger_transaction", ledger.transaction.id, { accountId: order.cloud_account_id, operationType: "impulse_pack_purchase" });
      this.enqueueEvent("billing.wallet_updated", "wallet", order.cloud_account_id, { accountId: order.cloud_account_id, balance: this.getBalance(order.cloud_account_id) });
      return {
        payment: serializeRow(this.db.prepare("SELECT * FROM payments WHERE id=?").get(paymentRecordId)),
        receipt: serializeRow(this.db.prepare("SELECT * FROM receipts WHERE id=?").get(receiptId)),
        transaction: ledger.transaction,
        balance: this.getBalance(order.cloud_account_id),
        duplicate: false,
      };
    });
  }
};
