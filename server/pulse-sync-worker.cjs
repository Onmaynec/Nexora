"use strict";

const crypto = require("node:crypto");

const SERVER_CURSOR_ID = "__pulse_server_events__";

function payloadHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value || {}), "utf8").digest("hex");
}

class PulseSyncWorker {
  constructor({ client, repository, store, io, serverId, log = () => {}, intervalMs = 15_000 } = {}) {
    this.client = client;
    this.repository = repository;
    this.store = store;
    this.io = io;
    this.serverId = serverId;
    this.log = log;
    this.intervalMs = Math.max(5_000, Math.min(5 * 60_000, Number(intervalMs) || 15_000));
    this.timer = null;
    this.running = false;
    this.lastErrorCode = null;
    this.lastSuccessAt = null;
  }

  status() {
    return { running: Boolean(this.timer), inProgress: this.running, intervalMs: this.intervalMs, lastErrorCode: this.lastErrorCode, lastSuccessAt: this.lastSuccessAt };
  }

  cursor() {
    return this.repository.db.prepare("SELECT cursor FROM pulse_sync_state WHERE local_user_id=?").get(SERVER_CURSOR_ID)?.cursor || null;
  }

  saveCursor(cursor, errorCode = null) {
    const now = new Date().toISOString();
    this.repository.db.prepare(`
      INSERT INTO pulse_sync_state(local_user_id,cursor,last_success_at,last_attempt_at,last_error_code,updated_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(local_user_id) DO UPDATE SET cursor=excluded.cursor,last_success_at=excluded.last_success_at,last_attempt_at=excluded.last_attempt_at,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at
    `).run(SERVER_CURSOR_ID, cursor || null, errorCode ? null : now, now, errorCode, now);
  }

  linkedUsersForAccount(accountId) {
    return this.repository.db.prepare("SELECT local_user_id FROM cloud_account_links WHERE cloud_account_id=? AND link_status='linked'").all(String(accountId || "")).map((row) => row.local_user_id);
  }

  emitUser(userId, type, payload) {
    this.io.to(`user:${userId}`).emit(type, payload);
    this.io.to(`user:${userId}`).emit("billing:event", { type, payload });
  }

  emitRoom(roomId, type, payload) {
    const state = this.store.read();
    const conversationId = state.conversations.find((item) => item.roomId === roomId)?.id;
    if (conversationId) this.io.to(`conversation:${conversationId}`).emit(type, payload);
  }

  processEvent(event) {
    const hash = payloadHash(event);
    const existing = this.repository.db.prepare("SELECT * FROM pulse_event_inbox WHERE event_id=?").get(event.eventId);
    if (existing) {
      if (existing.payload_hash !== hash || existing.event_type !== event.type) throw Object.assign(new Error("Cloud event ID reused with another payload."), { code: "IDEMPOTENCY_CONFLICT" });
      if (existing.status === "processed") return false;
    } else {
      this.repository.db.prepare("INSERT INTO pulse_event_inbox(event_id,event_type,received_at,status,attempt_count,payload_hash) VALUES (?,?,?,'received',0,?)")
        .run(event.eventId, event.type, new Date().toISOString(), hash);
    }
    this.repository.db.prepare("UPDATE pulse_event_inbox SET status='processing', attempt_count=attempt_count+1, last_error_code=NULL WHERE event_id=?").run(event.eventId);
    try {
      const payload = event.payload || {};
      if (event.type === "billing.entitlement_revoked" && payload.jti) {
        const now = new Date().toISOString();
        this.repository.db.prepare("UPDATE billing_entitlement_cache SET status='revoked', revoked_at=?, verified_at=? WHERE jti=?").run(now, now, payload.jti);
        this.repository.db.prepare("UPDATE room_product_state SET status='revoked', updated_at=? WHERE entitlement_jti=?").run(now, payload.jti);
      }
      const userIds = payload.accountId ? this.linkedUsersForAccount(payload.accountId) : payload.userId ? [payload.userId] : [];
      for (const userId of userIds) this.emitUser(userId, event.type, payload);
      if (payload.roomId) this.emitRoom(payload.roomId, event.type, payload);
      this.repository.db.prepare("UPDATE pulse_event_inbox SET status='processed', processed_at=?, last_error_code=NULL WHERE event_id=?").run(new Date().toISOString(), event.eventId);
      return true;
    } catch (error) {
      this.repository.db.prepare("UPDATE pulse_event_inbox SET status='failed', last_error_code=? WHERE event_id=?").run(String(error.code || "INTERNAL_ERROR"), event.eventId);
      throw error;
    }
  }

  async runOnce() {
    if (this.running || this.client.mode !== "production") return { skipped: true, reason: this.running ? "in_progress" : "not_production" };
    this.running = true;
    try {
      const after = this.cursor();
      const query = new URLSearchParams({ limit: "100" });
      if (after) query.set("after", after);
      const result = await this.client.request(`/v1/servers/${encodeURIComponent(this.serverId)}/events?${query}`, { requestId: crypto.randomUUID() });
      let processed = 0;
      for (const event of result.payload.events || []) if (this.processEvent(event)) processed += 1;
      this.saveCursor(result.payload.cursor || after, null);
      this.lastSuccessAt = new Date().toISOString();
      this.lastErrorCode = null;
      return { processed, cursor: result.payload.cursor || after, hasMore: Boolean(result.payload.hasMore) };
    } catch (error) {
      this.lastErrorCode = String(error.code || "PULSE_CLOUD_OFFLINE");
      this.saveCursor(this.cursor(), this.lastErrorCode);
      this.log(`Pulse event sync failed: ${this.lastErrorCode}`, "warn");
      return { processed: 0, errorCode: this.lastErrorCode };
    } finally {
      this.running = false;
    }
  }

  start() {
    if (this.timer || this.client.mode !== "production") return this.status();
    const tick = () => this.runOnce().then((result) => { if (result.hasMore) queueMicrotask(tick); }).catch((error) => this.log(`Pulse sync tick failed: ${error.message}`, "warn"));
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref?.();
    tick();
    return this.status();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { PulseSyncWorker, SERVER_CURSOR_ID, payloadHash };
