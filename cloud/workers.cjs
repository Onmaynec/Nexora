"use strict";

const crypto = require("node:crypto");
const { BillingError } = require("./billing-core.cjs");

const WORKER_SCHEMA = `
CREATE TABLE IF NOT EXISTS cloud_worker_leases (
  name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  leased_until TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  checked_count INTEGER NOT NULL DEFAULT 0,
  repaired_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
`;

function ensureHttps(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { throw new BillingError(`${label} имеет неверный URL.`, "PULSE_CLOUD_MISCONFIGURED", 503); }
  if (url.protocol !== "https:") throw new BillingError(`${label} должен использовать HTTPS.`, "PULSE_CLOUD_MISCONFIGURED", 503);
  if (url.username || url.password) throw new BillingError(`${label} не должен содержать credentials.`, "PULSE_CLOUD_MISCONFIGURED", 503);
  return url.toString();
}

function safeErrorCode(error) {
  return String(error?.code || error?.name || "DELIVERY_FAILED").replace(/[^A-Z0-9_.:-]/gi, "_").slice(0, 80);
}

class HttpEmailSender {
  constructor({ endpoint, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
    this.endpoint = ensureHttps(endpoint, "CLOUD_EMAIL_DELIVERY_URL");
    this.apiKey = String(apiKey || "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1_000, Math.min(30_000, Number(timeoutMs) || 10_000));
    if (!this.endpoint || this.apiKey.length < 24) throw new BillingError("Email delivery provider не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }

  async deliver(message) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.id },
        body: JSON.stringify({ id: message.id, to: message.recipient, template: message.template, variables: message.payload }),
      });
      if (!response.ok) throw Object.assign(new Error("Email provider rejected delivery."), { code: `EMAIL_PROVIDER_${response.status}` });
      return { delivered: true };
    } finally {
      clearTimeout(timer);
    }
  }
}

class SignedEventPublisher {
  constructor({ endpoint, secret, fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
    this.endpoint = ensureHttps(endpoint, "CLOUD_EVENT_SINK_URL");
    this.secret = String(secret || "");
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1_000, Math.min(30_000, Number(timeoutMs) || 10_000));
    if (!this.endpoint || this.secret.length < 32) throw new BillingError("Event sink не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }

  async publish(event) {
    const body = Buffer.from(JSON.stringify(event));
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac("sha256", this.secret).update(`${timestamp}.`).update(body).digest("hex");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Nexora-Event-ID": event.eventId,
          "X-Nexora-Timestamp": String(timestamp),
          "X-Nexora-Signature": `v1=${signature}`,
          "Idempotency-Key": event.eventId,
        },
        body,
      });
      if (!response.ok) throw Object.assign(new Error("Event sink rejected delivery."), { code: `EVENT_SINK_${response.status}` });
      return { published: true };
    } finally {
      clearTimeout(timer);
    }
  }
}

class BillingWorkers {
  constructor({ database, provider, emailSender = null, eventPublisher = null, clock = () => new Date(), log = () => {}, ownerId = crypto.randomUUID(), leaseMs = 60_000 } = {}) {
    if (!database?.db) throw new Error("BillingWorkers require BillingDatabase.");
    this.database = database;
    this.db = database.db;
    this.provider = provider;
    this.emailSender = emailSender;
    this.eventPublisher = eventPublisher;
    this.clock = clock;
    this.log = log;
    this.ownerId = ownerId;
    this.leaseMs = Math.max(10_000, Math.min(5 * 60_000, Number(leaseMs) || 60_000));
    this.timer = null;
    this.running = false;
    this.db.exec(WORKER_SCHEMA);
  }

  now() { return this.clock(); }
  nowIso() { return this.now().toISOString(); }

  acquireLease(name) {
    const now = this.now();
    const until = new Date(now.getTime() + this.leaseMs).toISOString();
    return this.database.transaction(() => {
      const current = this.db.prepare("SELECT * FROM cloud_worker_leases WHERE name=?").get(name);
      if (current && current.owner_id !== this.ownerId && Date.parse(current.leased_until) > now.getTime()) return false;
      this.db.prepare(`
        INSERT INTO cloud_worker_leases(name,owner_id,leased_until,updated_at) VALUES (?,?,?,?)
        ON CONFLICT(name) DO UPDATE SET owner_id=excluded.owner_id,leased_until=excluded.leased_until,updated_at=excluded.updated_at
      `).run(name, this.ownerId, until, now.toISOString());
      return true;
    });
  }

  releaseLease(name) {
    this.db.prepare("DELETE FROM cloud_worker_leases WHERE name=? AND owner_id=?").run(name, this.ownerId);
  }

  async processEmailOutbox(limit = 25) {
    if (!this.emailSender) return { checked: 0, sent: 0, failed: 0, disabled: true };
    const now = this.nowIso();
    const rows = this.db.prepare(`
      SELECT * FROM identity_email_outbox WHERE status IN ('pending','failed') AND available_at<=? ORDER BY created_at LIMIT ?
    `).all(now, Math.max(1, Math.min(100, Number(limit) || 25)));
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      const claimed = this.db.prepare("UPDATE identity_email_outbox SET status='sending',locked_at=?,attempt_count=attempt_count+1 WHERE id=? AND status IN ('pending','failed')").run(now, row.id);
      if (!claimed.changes) continue;
      try {
        const payload = JSON.parse(row.payload_json || "{}");
        await this.emailSender.deliver({ id: row.id, accountId: row.account_id, recipient: row.recipient, template: row.template, payload });
        this.db.prepare("UPDATE identity_email_outbox SET status='sent',sent_at=?,locked_at=NULL,last_error_code=NULL,payload_json='{}' WHERE id=?").run(this.nowIso(), row.id);
        sent += 1;
      } catch (error) {
        const attempts = Number(row.attempt_count || 0) + 1;
        const delayMs = Math.min(6 * 60 * 60_000, 30_000 * (2 ** Math.min(8, attempts - 1)));
        this.db.prepare("UPDATE identity_email_outbox SET status='failed',available_at=?,locked_at=NULL,last_error_code=? WHERE id=?")
          .run(new Date(this.now().getTime() + delayMs).toISOString(), safeErrorCode(error), row.id);
        failed += 1;
      }
    }
    return { checked: rows.length, sent, failed, disabled: false };
  }

  async processEventOutbox(limit = 100) {
    if (!this.eventPublisher) return { checked: 0, published: 0, failed: 0, disabled: true };
    const rows = this.db.prepare("SELECT * FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT ?")
      .all(Math.max(1, Math.min(500, Number(limit) || 100)));
    let published = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.eventPublisher.publish({
          eventId: row.event_id,
          type: row.event_type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          payload: JSON.parse(row.payload_json || "{}"),
          createdAt: row.created_at,
        });
        this.db.prepare("UPDATE outbox_events SET published_at=?,attempt_count=attempt_count+1 WHERE event_id=? AND published_at IS NULL")
          .run(this.nowIso(), row.event_id);
        published += 1;
      } catch (error) {
        this.db.prepare("UPDATE outbox_events SET attempt_count=attempt_count+1 WHERE event_id=?").run(row.event_id);
        this.log(`Outbox event ${row.event_id} failed: ${safeErrorCode(error)}`, "warn");
        failed += 1;
      }
    }
    return { checked: rows.length, published, failed, disabled: false };
  }

  expireGoals(limit = 100) {
    const now = this.nowIso();
    const rows = this.db.prepare("SELECT id,server_id,room_id FROM room_goals WHERE status='active' AND expires_at<=? LIMIT ?")
      .all(now, Math.max(1, Math.min(500, Number(limit) || 100)));
    for (const row of rows) {
      this.database.transaction(() => {
        const updated = this.db.prepare("UPDATE room_goals SET status='expired',closed_at=? WHERE id=? AND status='active'").run(now, row.id);
        if (updated.changes) this.database.enqueueEvent("billing.goal_expired", "room_goal", row.id, { serverId: row.server_id, roomId: row.room_id, goalId: row.id });
      });
    }
    return { expired: rows.length };
  }

  async reconcileCheckouts(limit = 50) {
    if (!this.provider?.request) return { checked: 0, repaired: 0, disabled: true };
    const runId = crypto.randomUUID();
    const startedAt = this.nowIso();
    this.db.prepare("INSERT INTO reconciliation_runs(id,started_at,status) VALUES (?,?,'running')").run(runId, startedAt);
    let checked = 0;
    let repaired = 0;
    try {
      const cutoff = new Date(this.now().getTime() - 2 * 60_000).toISOString();
      const rows = this.db.prepare(`
        SELECT sessions.*, orders.product_code, orders.cloud_account_id, orders.server_id, orders.local_user_id,
          orders.amount_minor, orders.currency, products.product_type
        FROM checkout_sessions sessions
        JOIN orders ON orders.id=sessions.order_id
        JOIN products ON products.code=orders.product_code
        WHERE sessions.status='open' AND sessions.created_at<=?
        ORDER BY sessions.created_at LIMIT ?
      `).all(cutoff, Math.max(1, Math.min(200, Number(limit) || 50)));
      for (const row of rows) {
        checked += 1;
        let session;
        try { session = await this.provider.request(`/v1/checkout/sessions/${encodeURIComponent(row.provider_session_id)}`, {}, { method: "GET" }); }
        catch (error) { this.log(`Checkout reconciliation ${row.id} failed: ${safeErrorCode(error)}`, "warn"); continue; }
        if (session.status === "expired") {
          this.database.transaction(() => {
            this.db.prepare("UPDATE checkout_sessions SET status='expired',updated_at=? WHERE id=? AND status='open'").run(this.nowIso(), row.id);
            this.db.prepare("UPDATE orders SET status='expired',updated_at=? WHERE id=? AND status='checkout_open'").run(this.nowIso(), row.order_id);
          });
          repaired += 1;
          continue;
        }
        if (session.status !== "complete" || session.payment_status !== "paid") continue;
        if (row.product_type === "impulse_pack" && session.payment_intent) {
          this.database.completeImpulseOrder({
            orderId: row.order_id,
            providerPaymentId: session.payment_intent,
            amountMinor: session.amount_total,
            currency: session.currency,
            provider: "stripe",
          });
          this.db.prepare("UPDATE checkout_sessions SET status='complete',updated_at=? WHERE id=?").run(this.nowIso(), row.id);
          repaired += 1;
        } else if (row.product_type === "subscription" && session.subscription) {
          const subscription = await this.provider.retrieveSubscription(session.subscription);
          const metadata = subscription.metadata || {};
          if (metadata.order_id !== row.order_id || metadata.cloud_account_id !== row.cloud_account_id || metadata.server_id !== row.server_id) {
            throw new BillingError("Subscription reconciliation scope mismatch.", "PAYMENT_SCOPE_MISMATCH", 409);
          }
          this.database.activatePlusPeriod({
            accountId: row.cloud_account_id,
            serverId: row.server_id,
            providerSubscriptionId: subscription.id,
            periodStart: new Date(Number(subscription.current_period_start) * 1000),
            periodEnd: new Date(Number(subscription.current_period_end) * 1000),
            status: subscription.status || "active",
          });
          this.db.prepare("UPDATE checkout_sessions SET status='complete',updated_at=? WHERE id=?").run(this.nowIso(), row.id);
          this.db.prepare("UPDATE orders SET status='paid',updated_at=? WHERE id=?").run(this.nowIso(), row.order_id);
          repaired += 1;
        }
      }
      this.db.prepare("UPDATE reconciliation_runs SET completed_at=?,status='completed',checked_count=?,repaired_count=? WHERE id=?")
        .run(this.nowIso(), checked, repaired, runId);
      return { runId, checked, repaired, disabled: false };
    } catch (error) {
      this.db.prepare("UPDATE reconciliation_runs SET completed_at=?,status='failed',checked_count=?,repaired_count=?,error_code=? WHERE id=?")
        .run(this.nowIso(), checked, repaired, safeErrorCode(error), runId);
      throw error;
    }
  }

  async runOnce() {
    if (!this.acquireLease("billing-workers")) return { skipped: true, reason: "lease_held" };
    try {
      const [email, events, reconciliation] = await Promise.all([
        this.processEmailOutbox(),
        this.processEventOutbox(),
        this.reconcileCheckouts(),
      ]);
      const goals = this.expireGoals();
      return { skipped: false, email, events, reconciliation, goals, completedAt: this.nowIso() };
    } finally {
      this.releaseLease("billing-workers");
    }
  }

  start(intervalMs = 30_000) {
    if (this.timer) return;
    const interval = Math.max(5_000, Math.min(5 * 60_000, Number(intervalMs) || 30_000));
    const tick = async () => {
      if (this.running) return;
      this.running = true;
      try { await this.runOnce(); } catch (error) { this.log(`Billing worker failed: ${safeErrorCode(error)}`, "error"); }
      finally { this.running = false; }
    };
    this.timer = setInterval(tick, interval);
    this.timer.unref?.();
    tick();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
    this.releaseLease("billing-workers");
  }

  status() {
    const lastRun = this.db.prepare("SELECT * FROM reconciliation_runs ORDER BY started_at DESC LIMIT 1").get();
    const pendingEmail = this.db.prepare("SELECT COUNT(*) AS count FROM identity_email_outbox WHERE status IN ('pending','failed')").get();
    const pendingEvents = this.db.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE published_at IS NULL").get();
    return { running: Boolean(this.timer), active: this.running, pendingEmail: Number(pendingEmail?.count || 0), pendingEvents: Number(pendingEvents?.count || 0), lastReconciliation: lastRun || null };
  }
}

module.exports = {
  BillingWorkers,
  HttpEmailSender,
  SignedEventPublisher,
  WORKER_SCHEMA,
  ensureHttps,
  safeErrorCode,
};
