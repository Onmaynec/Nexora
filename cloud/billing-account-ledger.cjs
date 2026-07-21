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
  createCloudAccount({ id = crypto.randomUUID(), country = null } = {}) {
    const accountId = requireId(id, "accountId");
    const timestamp = this.clock().toISOString();
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO cloud_accounts(id, status, country, debt_amount, created_at, updated_at)
        VALUES (?, 'active', ?, 0, ?, ?)
      `).run(accountId, country ? String(country).slice(0, 2).toUpperCase() : null, timestamp, timestamp);
      const walletId = crypto.randomUUID();
      this.db.prepare(`INSERT INTO wallets(id, cloud_account_id, currency, balance, updated_at) VALUES (?, ?, ?, 0, ?)`)
        .run(walletId, accountId, IMPULSE_CURRENCY, timestamp);
      this.ensureLedgerAccount("cloud_account", accountId, "user_wallet", IMPULSE_CURRENCY);
    });
    return this.getCloudAccount(accountId);
  },

  getCloudAccount(accountId) {
    return serializeRow(this.db.prepare("SELECT * FROM cloud_accounts WHERE id = ?").get(requireId(accountId, "accountId")));
  },

  setAccountStatus(accountId, status, debtAmount = null) {
    if (!["active", "restricted", "frozen", "closed"].includes(status)) {
      throw new BillingError("Неизвестный статус аккаунта.", "VALIDATION_FAILED");
    }
    const account = this.getCloudAccount(accountId);
    if (!account) throw new BillingError("Cloud Account не найден.", "RESOURCE_NOT_FOUND", 404);
    const debt = debtAmount == null ? Number(account.debt_amount || 0) : Math.max(0, Math.trunc(Number(debtAmount) || 0));
    this.db.prepare("UPDATE cloud_accounts SET status = ?, debt_amount = ?, updated_at = ? WHERE id = ?")
      .run(status, debt, this.clock().toISOString(), account.id);
  },

  linkLocalAccount({ accountId, serverId, localUserId, id = crypto.randomUUID() }) {
    const account = this.getCloudAccount(accountId);
    if (!account) throw new BillingError("Cloud Account не найден.", "RESOURCE_NOT_FOUND", 404);
    if (account.status !== "active") throw new BillingError("Cloud Account ограничен.", "CLOUD_ACCOUNT_RESTRICTED", 403);
    const timestamp = this.clock().toISOString();
    const normalizedServerId = requireId(serverId, "serverId");
    const normalizedUserId = requireId(localUserId, "localUserId");
    this.db.prepare(`
      INSERT INTO local_account_links(id, cloud_account_id, server_id, local_user_id, status, linked_at, unlinked_at, last_verified_at)
      VALUES (?, ?, ?, ?, 'linked', ?, NULL, ?)
      ON CONFLICT(server_id, local_user_id) DO UPDATE SET
        cloud_account_id=excluded.cloud_account_id,
        status='linked',
        unlinked_at=NULL,
        last_verified_at=excluded.last_verified_at
    `).run(requireId(id, "linkId"), account.id, normalizedServerId, normalizedUserId, timestamp, timestamp);
    return this.getLink(normalizedServerId, normalizedUserId);
  },

  unlinkLocalAccount(serverId, localUserId) {
    const timestamp = this.clock().toISOString();
    const result = this.db.prepare(`
      UPDATE local_account_links SET status='unlinked', unlinked_at=?, last_verified_at=?
      WHERE server_id=? AND local_user_id=? AND status='linked'
    `).run(timestamp, timestamp, requireId(serverId, "serverId"), requireId(localUserId, "localUserId"));
    return Number(result.changes || 0) > 0;
  },

  getLink(serverId, localUserId) {
    return serializeRow(this.db.prepare(`
      SELECT * FROM local_account_links WHERE server_id = ? AND local_user_id = ?
    `).get(requireId(serverId, "serverId"), requireId(localUserId, "localUserId")));
  },

  requireActiveLink(serverId, localUserId) {
    const link = this.getLink(serverId, localUserId);
    if (!link || link.status !== "linked") {
      throw new BillingError("Cloud Account не подключён.", "CLOUD_ACCOUNT_NOT_LINKED", 409);
    }
    const account = this.getCloudAccount(link.cloud_account_id);
    if (!account || account.status !== "active") {
      throw new BillingError("Cloud Account ограничен.", "CLOUD_ACCOUNT_RESTRICTED", 403);
    }
    return { link, account };
  },

  upsertPrice({ id, productCode, providerPriceId, currency, amountMinor, region = "*", taxMode = "exclusive", active = true }) {
    const product = this.db.prepare("SELECT * FROM products WHERE code = ?").get(requireId(productCode, "productCode"));
    if (!product) throw new BillingError("Продукт не найден.", "RESOURCE_NOT_FOUND", 404);
    const amount = Math.max(0, Math.trunc(Number(amountMinor)));
    if (!Number.isSafeInteger(amount)) throw new BillingError("Цена имеет неверный формат.", "VALIDATION_FAILED");
    this.db.prepare(`
      INSERT INTO prices(id, product_code, provider_price_id, currency, amount_minor, region, tax_mode, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        product_code=excluded.product_code,
        provider_price_id=excluded.provider_price_id,
        currency=excluded.currency,
        amount_minor=excluded.amount_minor,
        region=excluded.region,
        tax_mode=excluded.tax_mode,
        active=excluded.active
    `).run(requireId(id, "priceId"), product.code, requireId(providerPriceId, "providerPriceId"), String(currency).toUpperCase(), amount, String(region || "*"), String(taxMode), active ? 1 : 0);
  },

  getPriceForProduct(productCode, currency, region = "*") {
    return serializeRow(this.db.prepare(`
      SELECT prices.*, products.product_type, products.impulse_amount, products.entitlement_duration_days
      FROM prices JOIN products ON products.code = prices.product_code
      WHERE prices.product_code = ? AND prices.currency = ? AND prices.active = 1 AND products.active = 1
        AND prices.region IN (?, '*')
      ORDER BY CASE WHEN prices.region = ? THEN 0 ELSE 1 END
      LIMIT 1
    `).get(requireId(productCode, "productCode"), String(currency).toUpperCase(), String(region || "*"), String(region || "*")));
  },

  ensureLedgerAccount(ownerType, ownerId, kind, currency = IMPULSE_CURRENCY) {
    const normalizedOwnerType = requireId(ownerType, "ownerType");
    const normalizedOwnerId = requireId(ownerId, "ownerId");
    const normalizedKind = requireId(kind, "kind");
    const normalizedCurrency = String(currency).toUpperCase();
    let row = this.db.prepare(`
      SELECT * FROM ledger_accounts WHERE owner_type = ? AND owner_id = ? AND kind = ? AND currency = ?
    `).get(normalizedOwnerType, normalizedOwnerId, normalizedKind, normalizedCurrency);
    if (!row) {
      const id = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO ledger_accounts(id, owner_type, owner_id, kind, currency, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, normalizedOwnerType, normalizedOwnerId, normalizedKind, normalizedCurrency, this.clock().toISOString());
      row = this.db.prepare("SELECT * FROM ledger_accounts WHERE id = ?").get(id);
    }
    return serializeRow(row);
  },

  getWallet(accountId) {
    return serializeRow(this.db.prepare("SELECT * FROM wallets WHERE cloud_account_id = ?").get(requireId(accountId, "accountId")));
  },

  getBalance(accountId) {
    const wallet = this.getWallet(accountId);
    if (!wallet) throw new BillingError("Wallet не найден.", "RESOURCE_NOT_FOUND", 404);
    return Number(wallet.balance || 0);
  },

  _postLedgerTransaction({ operationType, referenceId = null, idempotencyKey, currency = IMPULSE_CURRENCY, entries, metadata = {} }) {
    const key = requireId(idempotencyKey, "idempotencyKey");
    const existing = this.db.prepare("SELECT * FROM ledger_transactions WHERE idempotency_key = ?").get(key);
    if (existing) return { transaction: serializeRow(existing), duplicate: true };
    if (!Array.isArray(entries) || entries.length < 2) {
      throw new BillingError("Ledger transaction должна содержать минимум две записи.", "LEDGER_INVARIANT_FAILED", 500);
    }
    const normalizedCurrency = String(currency).toUpperCase();
    let debitTotal = 0;
    let creditTotal = 0;
    const normalizedEntries = entries.map((entry) => {
      const debit = Math.trunc(Number(entry.debit || 0));
      const credit = Math.trunc(Number(entry.credit || 0));
      if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) {
        throw new BillingError("Ledger entry имеет неверную сторону или сумму.", "LEDGER_INVARIANT_FAILED", 500);
      }
      const account = this.db.prepare("SELECT * FROM ledger_accounts WHERE id = ?").get(requireId(entry.accountId, "ledgerAccountId"));
      if (!account || account.currency !== normalizedCurrency) {
        throw new BillingError("Ledger account не найден или использует другую валюту.", "LEDGER_INVARIANT_FAILED", 500);
      }
      debitTotal += debit;
      creditTotal += credit;
      return { account, debit, credit };
    });
    if (debitTotal <= 0 || debitTotal !== creditTotal) {
      throw new BillingError("Ledger transaction не сбалансирована.", "LEDGER_INVARIANT_FAILED", 500, { debitTotal, creditTotal });
    }

    const timestamp = this.clock().toISOString();
    const transactionId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO ledger_transactions(id, operation_type, reference_id, idempotency_key, currency, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, requireId(operationType, "operationType"), referenceId ? String(referenceId) : null, key, normalizedCurrency, timestamp, JSON.stringify(metadata || {}));

    for (const entry of normalizedEntries) {
      this.db.prepare(`
        INSERT INTO ledger_entries(id, transaction_id, account_id, debit, credit, currency, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), transactionId, entry.account.id, entry.debit, entry.credit, normalizedCurrency, timestamp);
      if (entry.account.kind === "user_wallet") {
        const delta = entry.credit - entry.debit;
        const wallet = this.db.prepare("SELECT * FROM wallets WHERE cloud_account_id = ?").get(entry.account.owner_id);
        if (!wallet) throw new BillingError("Wallet ledger account не связан с wallet.", "LEDGER_INVARIANT_FAILED", 500);
        const next = Number(wallet.balance || 0) + delta;
        if (!Number.isSafeInteger(next) || next < 0) {
          throw new BillingError("Баланс wallet не может стать отрицательным.", "WALLET_INSUFFICIENT_FUNDS", 409);
        }
        this.db.prepare("UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?").run(next, timestamp, wallet.id);
      }
    }

    const transaction = serializeRow(this.db.prepare("SELECT * FROM ledger_transactions WHERE id = ?").get(transactionId));
    return { transaction, duplicate: false };
  },

  postLedgerTransaction(input) {
    return this.transaction(() => this._postLedgerTransaction(input));
  },

  grantImpulses(accountId, amount, { operationType = "promotional_grant", referenceId = null, idempotencyKey, metadata = {} } = {}) {
    const normalizedAmount = requirePositiveInt(amount, "amount");
    const account = this.getCloudAccount(accountId);
    if (!account) throw new BillingError("Cloud Account не найден.", "RESOURCE_NOT_FOUND", 404);
    return this.transaction(() => {
      const issuance = this.ensureLedgerAccount("system", "global", "impulse_issuance", IMPULSE_CURRENCY);
      const wallet = this.ensureLedgerAccount("cloud_account", account.id, "user_wallet", IMPULSE_CURRENCY);
      const result = this._postLedgerTransaction({
        operationType,
        referenceId,
        idempotencyKey,
        entries: [
          { accountId: issuance.id, debit: normalizedAmount, credit: 0 },
          { accountId: wallet.id, debit: 0, credit: normalizedAmount },
        ],
        metadata,
      });
      return { ...result, balance: this.getBalance(account.id) };
    });
  },

  createOrder({ serverId, localUserId, productCode, currency, region = "*", idempotencyKey }) {
    const { account } = this.requireActiveLink(serverId, localUserId);
    const existing = this.db.prepare("SELECT * FROM orders WHERE idempotency_key = ?").get(requireId(idempotencyKey, "idempotencyKey"));
    if (existing) return { order: serializeRow(existing), duplicate: true };
    const price = this.getPriceForProduct(productCode, currency, region);
    if (!price) throw new BillingError("Продукт недоступен в этом регионе.", "PRODUCT_UNAVAILABLE", 409);
    const timestamp = this.clock().toISOString();
    const order = {
      id: crypto.randomUUID(),
      cloudAccountId: account.id,
      serverId: requireId(serverId, "serverId"),
      localUserId: requireId(localUserId, "localUserId"),
      productCode: price.product_code,
      priceId: price.id,
      amountMinor: Number(price.amount_minor),
      currency: price.currency,
      status: "created",
      createdAt: timestamp,
      updatedAt: timestamp,
      idempotencyKey: requireId(idempotencyKey, "idempotencyKey"),
    };
    this.db.prepare(`
      INSERT INTO orders(id, cloud_account_id, server_id, local_user_id, product_code, price_id, amount_minor, currency, status, created_at, updated_at, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order.id, order.cloudAccountId, order.serverId, order.localUserId, order.productCode, order.priceId, order.amountMinor, order.currency, order.status, order.createdAt, order.updatedAt, order.idempotencyKey);
    return { order, price, duplicate: false };
  },

  attachCheckoutSession({ orderId, provider, providerSessionId, url, expiresAt }) {
    const order = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(requireId(orderId, "orderId"));
    if (!order) throw new BillingError("Order не найден.", "RESOURCE_NOT_FOUND", 404);
    if (!/^https:\/\//i.test(String(url || ""))) throw new BillingError("Provider вернул небезопасный checkout URL.", "CHECKOUT_INVALID", 502);
    const timestamp = this.clock().toISOString();
    const existing = this.db.prepare("SELECT * FROM checkout_sessions WHERE provider_session_id = ?").get(requireId(providerSessionId, "providerSessionId"));
    if (existing) return serializeRow(existing);
    const id = crypto.randomUUID();
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO checkout_sessions(id, order_id, provider, provider_session_id, status, url, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)
      `).run(id, order.id, String(provider), providerSessionId, url, String(expiresAt), timestamp, timestamp);
      this.db.prepare("UPDATE orders SET status='checkout_open', updated_at=? WHERE id=?").run(timestamp, order.id);
    });
    return serializeRow(this.db.prepare("SELECT * FROM checkout_sessions WHERE id = ?").get(id));
  },

  recordProviderEvent({ provider, eventId, eventType, payloadHash }) {
    const id = requireId(eventId, "providerEventId");
    const normalizedProvider = String(provider);
    const normalizedType = String(eventType);
    const normalizedHash = String(payloadHash);
    const existing = this.db.prepare("SELECT * FROM provider_events WHERE provider_event_id = ?").get(id);
    if (existing) {
      if (existing.provider !== normalizedProvider || existing.event_type !== normalizedType || existing.payload_hash !== normalizedHash) {
        throw new BillingError("Provider event ID повторно использован с другим payload.", "IDEMPOTENCY_CONFLICT", 409);
      }
      if (existing.status === "processed") return { event: serializeRow(existing), duplicate: true, retry: false };
      if (existing.status === "received") return { event: serializeRow(existing), duplicate: true, inProgress: true, retry: false };
      this.db.prepare(`
        UPDATE provider_events SET status='received', processed_at=NULL, error_code=NULL, received_at=?
        WHERE provider_event_id=?
      `).run(this.clock().toISOString(), id);
      return {
        event: serializeRow(this.db.prepare("SELECT * FROM provider_events WHERE provider_event_id = ?").get(id)),
        duplicate: false,
        retry: true,
      };
    }
    const receivedAt = this.clock().toISOString();
    this.db.prepare(`
      INSERT INTO provider_events(provider_event_id, provider, event_type, payload_hash, status, received_at)
      VALUES (?, ?, ?, ?, 'received', ?)
    `).run(id, normalizedProvider, normalizedType, normalizedHash, receivedAt);
    return { event: serializeRow(this.db.prepare("SELECT * FROM provider_events WHERE provider_event_id = ?").get(id)), duplicate: false, retry: false };
  },

  markProviderEvent(eventId, status, errorCode = null) {
    this.db.prepare(`
      UPDATE provider_events SET status=?, processed_at=?, error_code=? WHERE provider_event_id=?
    `).run(String(status), this.clock().toISOString(), errorCode ? String(errorCode) : null, requireId(eventId, "providerEventId"));
  }
};
