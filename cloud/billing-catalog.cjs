"use strict";

const crypto = require("node:crypto");
const { catalogItem, publicCatalog } = require("../shared/pulse-catalog.cjs");
const { BillingError, IMPULSE_CURRENCY, requireId, serializeRow } = require("./billing-common.cjs");

module.exports = {
  catalog({ serverId, localUserId, roomId = null }) {
    const normalizedServerId = requireId(serverId, "serverId");
    const normalizedUserId = requireId(localUserId, "localUserId");
    const { account } = this.requireActiveLink(normalizedServerId, normalizedUserId);
    const scopeRoomId = roomId ? requireId(roomId, "roomId") : null;
    const current = this.clock().toISOString();
    const owned = new Set(this.db.prepare(`
      SELECT product_code FROM entitlements
      WHERE status='active' AND expires_at>? AND (
        (cloud_account_id=? AND room_id IS NULL)
        OR (? IS NOT NULL AND server_id=? AND room_id=?)
      )
    `).all(current, account.id, scopeRoomId, normalizedServerId, scopeRoomId).map((row) => row.product_code));
    return publicCatalog().map((item) => ({ ...item, owned: owned.has(item.code) }));
  },

  purchaseCatalogProduct({ serverId, localUserId, productCode, roomId = null, idempotencyKey }) {
    const normalizedServerId = requireId(serverId, "serverId");
    const normalizedUserId = requireId(localUserId, "localUserId");
    const normalizedCode = requireId(productCode, "productCode");
    const key = requireId(idempotencyKey, "idempotencyKey");
    const product = catalogItem(normalizedCode);
    if (!product) throw new BillingError("Товар недоступен.", "PRODUCT_UNAVAILABLE", 404);
    const normalizedRoomId = product.scope === "room" ? requireId(roomId, "roomId") : null;
    if (product.scope === "user" && roomId) throw new BillingError("Персональный товар нельзя применить к комнате.", "PULSE_SCOPE_MISMATCH", 409);

    return this.transaction(() => {
      const { account } = this.requireActiveLink(normalizedServerId, normalizedUserId);
      const existing = this.db.prepare("SELECT * FROM impulse_purchases WHERE idempotency_key=?").get(key);
      if (existing) {
        if (existing.server_id !== normalizedServerId || existing.local_user_id !== normalizedUserId || existing.product_code !== normalizedCode || (existing.room_id || null) !== normalizedRoomId) {
          throw new BillingError("Idempotency key уже использован для другой покупки.", "IDEMPOTENCY_CONFLICT", 409);
        }
        const entitlement = serializeRow(this.db.prepare("SELECT * FROM entitlements WHERE id=?").get(existing.entitlement_id));
        return { duplicate: true, purchase: serializeRow(existing), entitlement, balance: this.getBalance(account.id), walletBalance: this.getBalance(account.id) };
      }

      const active = this.db.prepare(`
        SELECT * FROM entitlements
        WHERE product_code=? AND status='active' AND expires_at>? AND server_id=?
          AND ((? IS NULL AND cloud_account_id=? AND room_id IS NULL) OR (? IS NOT NULL AND room_id=?))
        ORDER BY expires_at DESC LIMIT 1
      `).get(normalizedCode, this.clock().toISOString(), normalizedServerId, normalizedRoomId, account.id, normalizedRoomId, normalizedRoomId);
      if (active) {
        return { duplicate: true, alreadyOwned: true, entitlement: serializeRow(active), balance: this.getBalance(account.id), walletBalance: this.getBalance(account.id) };
      }

      const balanceBefore = this.getBalance(account.id);
      if (balanceBefore < product.priceImpulses) {
        throw new BillingError("Недостаточно Импульсов.", "WALLET_INSUFFICIENT_FUNDS", 409, { required: product.priceImpulses, balance: balanceBefore });
      }
      const wallet = this.ensureLedgerAccount("cloud_account", account.id, "user_wallet", IMPULSE_CURRENCY);
      const revenue = this.ensureLedgerAccount("system", "global", "impulse_catalog_revenue", IMPULSE_CURRENCY);
      const purchaseId = crypto.randomUUID();
      const ledger = this._postLedgerTransaction({
        operationType: "impulse_product_purchase",
        referenceId: purchaseId,
        idempotencyKey: `catalog:${key}`,
        entries: [
          { accountId: wallet.id, debit: product.priceImpulses, credit: 0 },
          { accountId: revenue.id, debit: 0, credit: product.priceImpulses },
        ],
        metadata: { productCode: normalizedCode, serverId: normalizedServerId, localUserId: normalizedUserId, roomId: normalizedRoomId },
      });
      const entitlement = this._createEntitlement({
        cloudAccountId: product.scope === "user" ? account.id : null,
        serverId: normalizedServerId,
        roomId: normalizedRoomId,
        productCode: normalizedCode,
        durationDays: product.durationDays,
      });
      const timestamp = this.clock().toISOString();
      this.db.prepare(`
        INSERT INTO impulse_purchases(id, cloud_account_id, server_id, local_user_id, room_id, product_code, price_impulses, status, idempotency_key, ledger_transaction_id, entitlement_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
      `).run(purchaseId, account.id, normalizedServerId, normalizedUserId, normalizedRoomId, normalizedCode, product.priceImpulses, key, ledger.transaction.id, entitlement.id, timestamp);
      this.enqueueEvent("billing.catalog_purchase", "impulse_purchase", purchaseId, { purchaseId, accountId: account.id, productCode: normalizedCode, roomId: normalizedRoomId });
      this.enqueueEvent("billing.wallet_updated", "wallet", account.id, { accountId: account.id, balance: this.getBalance(account.id) });
      this.enqueueEvent("billing.entitlement_updated", "entitlement", entitlement.jti, { jti: entitlement.jti, productCode: normalizedCode, roomId: normalizedRoomId });
      return {
        duplicate: false,
        purchase: serializeRow(this.db.prepare("SELECT * FROM impulse_purchases WHERE id=?").get(purchaseId)),
        entitlement,
        balance: this.getBalance(account.id),
        walletBalance: this.getBalance(account.id),
      };
    });
  },
};
