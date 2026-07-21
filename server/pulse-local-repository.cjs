"use strict";

const crypto = require("node:crypto");

class PulseRepositoryError extends Error {
  constructor(message, code = "PULSE_LOCAL_STORE_ERROR", status = 500, details = {}) {
    super(message);
    this.name = "PulseRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nowIso(clock) {
  return clock().toISOString();
}

function hash(value) {
  const input = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

class PulseLocalRepository {
  constructor(store, { clock = () => new Date() } = {}) {
    if (!store?.db) throw new PulseRepositoryError("SQLite store недоступен.", "PULSE_LOCAL_STORE_UNAVAILABLE");
    this.store = store;
    this.clock = clock;
  }

  get db() {
    if (!this.store.db) throw new PulseRepositoryError("SQLite store закрыт.", "PULSE_LOCAL_STORE_UNAVAILABLE");
    return this.store.db;
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch (rollbackError) { error.rollbackError = rollbackError; }
      throw error;
    }
  }

  createLinkSession(localUserId, { ttlMs = 5 * 60 * 1000 } = {}) {
    const userId = String(localUserId || "").trim();
    if (!userId) throw new PulseRepositoryError("Local User ID обязателен.", "VALIDATION_FAILED", 400);
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + Math.max(60_000, Math.min(10 * 60_000, Number(ttlMs) || 300_000)));
    const session = {
      id: crypto.randomUUID(),
      localUserId: userId,
      nonce: crypto.randomBytes(32).toString("base64url"),
      status: "pending",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    this.transaction(() => {
      this.db.prepare(`
        UPDATE pulse_link_sessions SET status='expired'
        WHERE status='pending' AND expires_at <= ?
      `).run(now.toISOString());
      this.db.prepare(`
        UPDATE pulse_link_sessions SET status='cancelled'
        WHERE local_user_id=? AND status='pending'
      `).run(userId);
      this.db.prepare(`
        INSERT INTO pulse_link_sessions(id, local_user_id, nonce, status, created_at, expires_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `).run(session.id, userId, session.nonce, session.createdAt, session.expiresAt);
    });
    return session;
  }

  getLinkSession(id) {
    const row = this.db.prepare("SELECT * FROM pulse_link_sessions WHERE id=?").get(String(id || ""));
    return row ? {
      id: row.id,
      localUserId: row.local_user_id,
      nonce: row.nonce,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    } : null;
  }

  completeLinkSession({ linkId, localUserId, nonce, cloudAccountId, cloudSubject }) {
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      const session = this.db.prepare("SELECT * FROM pulse_link_sessions WHERE id=?").get(String(linkId || ""));
      if (!session || session.local_user_id !== String(localUserId || "")) {
        throw new PulseRepositoryError("Link session не найдена.", "LINK_ATTESTATION_INVALID", 400);
      }
      if (session.status === "consumed") throw new PulseRepositoryError("Link attestation уже использована.", "LINK_ATTESTATION_REPLAYED", 409);
      if (session.status !== "pending" || Date.parse(session.expires_at) <= this.clock().getTime()) {
        this.db.prepare("UPDATE pulse_link_sessions SET status='expired' WHERE id=?").run(session.id);
        throw new PulseRepositoryError("Link session истекла.", "LINK_ATTESTATION_EXPIRED", 410);
      }
      if (session.nonce !== String(nonce || "")) throw new PulseRepositoryError("Nonce link attestation не совпадает.", "LINK_ATTESTATION_INVALID", 400);
      const accountId = String(cloudAccountId || "").trim();
      if (!accountId) throw new PulseRepositoryError("Cloud Account ID отсутствует.", "LINK_ATTESTATION_INVALID", 400);
      const subjectHash = hash(String(cloudSubject || accountId));
      const existing = this.db.prepare("SELECT * FROM cloud_account_links WHERE local_user_id=?").get(session.local_user_id);
      const id = existing?.id || crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO cloud_account_links(
          id, local_user_id, cloud_account_id, link_status, linked_at, unlinked_at,
          last_verified_at, cloud_subject_hash, created_at, updated_at
        ) VALUES (?, ?, ?, 'linked', ?, NULL, ?, ?, ?, ?)
        ON CONFLICT(local_user_id) DO UPDATE SET
          cloud_account_id=excluded.cloud_account_id,
          link_status='linked',
          linked_at=excluded.linked_at,
          unlinked_at=NULL,
          last_verified_at=excluded.last_verified_at,
          cloud_subject_hash=excluded.cloud_subject_hash,
          updated_at=excluded.updated_at
      `).run(id, session.local_user_id, accountId, timestamp, timestamp, subjectHash, existing?.created_at || timestamp, timestamp);
      this.db.prepare("UPDATE pulse_link_sessions SET status='consumed', consumed_at=? WHERE id=?").run(timestamp, session.id);
      return this.getLink(session.local_user_id);
    });
  }

  getLink(localUserId) {
    const row = this.db.prepare("SELECT * FROM cloud_account_links WHERE local_user_id=?").get(String(localUserId || ""));
    if (!row) return null;
    return {
      id: row.id,
      localUserId: row.local_user_id,
      cloudAccountId: row.cloud_account_id,
      status: row.link_status,
      linkedAt: row.linked_at,
      unlinkedAt: row.unlinked_at,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  requireLinked(localUserId) {
    const link = this.getLink(localUserId);
    if (!link || link.status !== "linked") throw new PulseRepositoryError("Cloud Account не подключён.", "CLOUD_ACCOUNT_NOT_LINKED", 409);
    return link;
  }

  unlink(localUserId) {
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      const result = this.db.prepare(`
        UPDATE cloud_account_links
        SET link_status='unlinked', unlinked_at=?, updated_at=?
        WHERE local_user_id=? AND link_status='linked'
      `).run(timestamp, timestamp, String(localUserId || ""));
      this.db.prepare(`
        UPDATE pulse_link_sessions SET status='cancelled'
        WHERE local_user_id=? AND status='pending'
      `).run(String(localUserId || ""));
      return Number(result.changes || 0) > 0;
    });
  }

  trustPublicKey({ keyId, publicKey, algorithm = "Ed25519", source = "configuration", notBefore = null, expiresAt = null }) {
    const id = String(keyId || "").trim();
    const pem = String(publicKey || "").trim().replace(/\\n/g, "\n");
    if (!/^[A-Za-z0-9_.:-]{2,80}$/.test(id) || !pem.includes("BEGIN PUBLIC KEY")) {
      throw new PulseRepositoryError("Public key имеет неверный формат.", "PULSE_KEY_INVALID", 500);
    }
    if (algorithm !== "Ed25519") throw new PulseRepositoryError("Поддерживается только Ed25519.", "PULSE_KEY_INVALID", 500);
    const keyHash = hash(pem);
    const existing = this.db.prepare("SELECT * FROM billing_key_registry WHERE key_id=?").get(id);
    if (existing && existing.public_key_hash !== keyHash && !existing.revoked_at) {
      throw new PulseRepositoryError("Key ID уже связан с другим публичным ключом.", "PULSE_KEY_CONFLICT", 409);
    }
    this.db.prepare(`
      INSERT INTO billing_key_registry(key_id, algorithm, public_key_pem, public_key_hash, trusted_at, not_before, expires_at, revoked_at, source)
      VALUES (?, 'Ed25519', ?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(key_id) DO UPDATE SET
        public_key_pem=excluded.public_key_pem,
        public_key_hash=excluded.public_key_hash,
        not_before=excluded.not_before,
        expires_at=excluded.expires_at,
        source=excluded.source
    `).run(id, pem, keyHash, nowIso(this.clock), notBefore, expiresAt, String(source));
    return { keyId: id, publicKey: pem, algorithm: "Ed25519", hash: keyHash };
  }

  revokePublicKey(keyId) {
    const result = this.db.prepare("UPDATE billing_key_registry SET revoked_at=? WHERE key_id=? AND revoked_at IS NULL")
      .run(nowIso(this.clock), String(keyId || ""));
    return Number(result.changes || 0) > 0;
  }

  keyRegistry() {
    const now = this.clock().getTime();
    const entries = this.db.prepare("SELECT * FROM billing_key_registry WHERE revoked_at IS NULL").all()
      .filter((row) => (!row.not_before || Date.parse(row.not_before) <= now) && (!row.expires_at || Date.parse(row.expires_at) > now))
      .map((row) => [row.key_id, row.public_key_pem]);
    return new Map(entries);
  }

  cacheEntitlement(localUserId, envelope, payload, syncCursor = null) {
    const payloadJson = JSON.stringify(payload);
    const scopeType = payload.roomId ? "room" : payload.cloudAccountId ? "user" : "server";
    const scopeId = payload.roomId || localUserId || payload.serverId;
    const timestamp = nowIso(this.clock);
    this.db.prepare(`
      INSERT INTO billing_entitlement_cache(
        id, jti, scope_type, scope_id, product_code, status, issued_at, not_before,
        expires_at, verified_at, key_id, payload_hash, payload_json, signature, revoked_at, sync_cursor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jti) DO UPDATE SET
        status=excluded.status,
        expires_at=excluded.expires_at,
        verified_at=excluded.verified_at,
        payload_hash=excluded.payload_hash,
        payload_json=excluded.payload_json,
        signature=excluded.signature,
        revoked_at=excluded.revoked_at,
        sync_cursor=excluded.sync_cursor
    `).run(
      String(payload.id || payload.jti), String(payload.jti), scopeType, String(scopeId), String(payload.productCode),
      String(payload.status || "active"), String(payload.issuedAt), String(payload.notBefore || payload.issuedAt), String(payload.expiresAt),
      timestamp, String(envelope.keyId || payload.keyId), hash(payloadJson), payloadJson, String(envelope.signature || ""),
      payload.status === "revoked" ? timestamp : null, syncCursor,
    );
    if (payload.roomId) {
      this.db.prepare(`
        INSERT INTO room_product_state(room_id, product_code, entitlement_jti, status, activated_at, expires_at, settings_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{}', ?)
        ON CONFLICT(room_id, product_code) DO UPDATE SET
          entitlement_jti=excluded.entitlement_jti,
          status=excluded.status,
          activated_at=excluded.activated_at,
          expires_at=excluded.expires_at,
          updated_at=excluded.updated_at
      `).run(payload.roomId, payload.productCode, payload.jti, payload.status || "active", payload.notBefore || payload.issuedAt, payload.expiresAt, timestamp);
    }
  }

  cacheOverview(localUserId, overview, { requestId = null, syncCursor = null } = {}) {
    const timestamp = nowIso(this.clock);
    const json = JSON.stringify(overview);
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO pulse_sync_state(local_user_id, cursor, last_success_at, last_attempt_at, last_error_code, overview_json, overview_hash, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(local_user_id) DO UPDATE SET
          cursor=excluded.cursor,
          last_success_at=excluded.last_success_at,
          last_attempt_at=excluded.last_attempt_at,
          last_error_code=NULL,
          overview_json=excluded.overview_json,
          overview_hash=excluded.overview_hash,
          updated_at=excluded.updated_at
      `).run(String(localUserId), syncCursor, timestamp, timestamp, json, hash(json), timestamp);
      for (const item of overview.entitlements || []) {
        if (!item?.envelope || !item?.verifiedPayload) continue;
        this.cacheEntitlement(localUserId, item.envelope, item.verifiedPayload, syncCursor);
      }
      if (requestId) this.enqueueLocalEvent("billing.overview_updated", { localUserId, requestId }, { localUserId });
    });
    return this.getCachedOverview(localUserId);
  }

  recordSyncFailure(localUserId, code) {
    const timestamp = nowIso(this.clock);
    this.db.prepare(`
      INSERT INTO pulse_sync_state(local_user_id, last_attempt_at, last_error_code, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(local_user_id) DO UPDATE SET
        last_attempt_at=excluded.last_attempt_at,
        last_error_code=excluded.last_error_code,
        updated_at=excluded.updated_at
    `).run(String(localUserId), timestamp, String(code || "PULSE_CLOUD_OFFLINE"), timestamp);
  }

  getCachedOverview(localUserId) {
    const row = this.db.prepare("SELECT * FROM pulse_sync_state WHERE local_user_id=?").get(String(localUserId || ""));
    if (!row?.overview_json) return null;
    return {
      overview: parseJson(row.overview_json, null),
      cursor: row.cursor,
      cachedAt: row.last_success_at,
      lastAttemptAt: row.last_attempt_at,
      lastErrorCode: row.last_error_code,
    };
  }

  cacheCheckout(localUserId, productCode, checkout, requestId = null) {
    const timestamp = nowIso(this.clock);
    this.db.prepare(`
      INSERT INTO billing_checkout_cache(checkout_id, local_user_id, order_id, product_code, status, url, expires_at, created_at, updated_at, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(checkout_id) DO UPDATE SET
        status=excluded.status,
        url=excluded.url,
        expires_at=excluded.expires_at,
        updated_at=excluded.updated_at,
        request_id=excluded.request_id
    `).run(
      String(checkout.checkoutId), String(localUserId), checkout.orderId || null, String(productCode),
      String(checkout.status || "pending"), checkout.url || null, checkout.expiresAt || null,
      timestamp, timestamp, requestId,
    );
    return this.getCheckout(localUserId, checkout.checkoutId);
  }

  getCheckout(localUserId, checkoutId) {
    const row = this.db.prepare("SELECT * FROM billing_checkout_cache WHERE checkout_id=? AND local_user_id=?")
      .get(String(checkoutId || ""), String(localUserId || ""));
    return row ? {
      checkoutId: row.checkout_id,
      orderId: row.order_id,
      productCode: row.product_code,
      status: row.status,
      url: row.url,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requestId: row.request_id,
    } : null;
  }

  cacheTransactions(localUserId, transactions, requestId = null) {
    const insert = this.db.prepare(`
      INSERT INTO billing_transaction_cache(
        transaction_id, local_user_id, operation_type, amount, currency, status,
        balance_before, balance_after, reference_id, receipt_id, created_at, payload_json, request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        status=excluded.status,
        balance_before=excluded.balance_before,
        balance_after=excluded.balance_after,
        receipt_id=excluded.receipt_id,
        payload_json=excluded.payload_json,
        request_id=excluded.request_id
    `);
    this.transaction(() => {
      for (const item of transactions || []) {
        if (!item?.id) continue;
        insert.run(
          String(item.id), String(localUserId), String(item.operationType || item.operation_type || "unknown"),
          Number.isFinite(Number(item.amount)) ? Math.trunc(Number(item.amount)) : null,
          String(item.currency || "IMPULSE"), String(item.status || "completed"),
          Number.isFinite(Number(item.balanceBefore)) ? Math.trunc(Number(item.balanceBefore)) : null,
          Number.isFinite(Number(item.balanceAfter)) ? Math.trunc(Number(item.balanceAfter)) : null,
          item.referenceId || item.reference_id || null, item.receiptId || item.receipt_id || null,
          item.createdAt || item.created_at || nowIso(this.clock), JSON.stringify(item), requestId,
        );
      }
    });
    return this.listTransactions(localUserId);
  }

  listTransactions(localUserId, { limit = 50, before = null } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
    const rows = before
      ? this.db.prepare("SELECT * FROM billing_transaction_cache WHERE local_user_id=? AND created_at < ? ORDER BY created_at DESC LIMIT ?").all(String(localUserId), String(before), safeLimit)
      : this.db.prepare("SELECT * FROM billing_transaction_cache WHERE local_user_id=? ORDER BY created_at DESC LIMIT ?").all(String(localUserId), safeLimit);
    return rows.map((row) => parseJson(row.payload_json, {
      id: row.transaction_id,
      operationType: row.operation_type,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      balanceBefore: row.balance_before,
      balanceAfter: row.balance_after,
      createdAt: row.created_at,
    }));
  }

  getTransaction(localUserId, transactionId) {
    const row = this.db.prepare("SELECT * FROM billing_transaction_cache WHERE transaction_id=? AND local_user_id=?")
      .get(String(transactionId || ""), String(localUserId || ""));
    return row ? parseJson(row.payload_json, null) : null;
  }

  recordInboxEvent({ eventId, eventType, payload }) {
    const id = String(eventId || "").trim();
    if (!id) throw new PulseRepositoryError("Event ID обязателен.", "VALIDATION_FAILED", 400);
    const payloadHash = hash(payload);
    const existing = this.db.prepare("SELECT * FROM pulse_event_inbox WHERE event_id=?").get(id);
    if (existing) {
      if (existing.event_type !== String(eventType) || existing.payload_hash !== payloadHash) {
        throw new PulseRepositoryError("Event ID повторно использован с другим payload.", "IDEMPOTENCY_CONFLICT", 409);
      }
      return { duplicate: true, status: existing.status };
    }
    this.db.prepare(`
      INSERT INTO pulse_event_inbox(event_id, event_type, received_at, status, attempt_count, payload_hash)
      VALUES (?, ?, ?, 'received', 0, ?)
    `).run(id, String(eventType), nowIso(this.clock), payloadHash);
    return { duplicate: false, status: "received" };
  }

  markInboxEvent(eventId, status, errorCode = null) {
    if (!["processing", "processed", "failed"].includes(status)) throw new PulseRepositoryError("Неизвестный статус inbox event.", "VALIDATION_FAILED", 400);
    const result = this.db.prepare(`
      UPDATE pulse_event_inbox SET
        status=?,
        attempt_count=attempt_count+1,
        processed_at=CASE WHEN ?='processed' THEN ? ELSE processed_at END,
        last_error_code=?
      WHERE event_id=?
    `).run(status, status, nowIso(this.clock), errorCode, String(eventId || ""));
    return Number(result.changes || 0) > 0;
  }

  enqueueLocalEvent(eventType, payload, { localUserId = null, roomId = null } = {}) {
    const event = {
      id: crypto.randomUUID(),
      type: String(eventType),
      payload: payload || {},
      createdAt: nowIso(this.clock),
    };
    this.db.prepare(`
      INSERT INTO pulse_event_outbox(event_id, event_type, local_user_id, room_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event.id, event.type, localUserId, roomId, JSON.stringify(event.payload), event.createdAt);
    return event;
  }
}

module.exports = {
  PulseLocalRepository,
  PulseRepositoryError,
  hash,
};
