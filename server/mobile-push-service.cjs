"use strict";

const crypto = require("node:crypto");

const { canAccessConversation, findConversation, findUser } = require("./model.cjs");
const { notificationAllowed, parseTokenKey } = require("./mobile-continuity.cjs");

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const SCAN_LIMIT = 100;

function decryptSecret(value, key) {
  const bytes = Buffer.from(String(value || ""), "base64url");
  if (!Buffer.isBuffer(key) || key.length !== 32 || bytes.length < 29) {
    throw Object.assign(new Error("Encrypted push token is invalid."), { code: "PUSH_TOKEN_DECRYPT_FAILED", permanent: true });
  }
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(12, 28);
  const ciphertext = bytes.subarray(28);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw Object.assign(new Error("Encrypted push token cannot be authenticated."), { code: "PUSH_TOKEN_DECRYPT_FAILED", permanent: true });
  }
}

function participantIds(state, conversation) {
  if (!conversation) return [];
  if (conversation.type === "dm") return [...new Set(conversation.userIds || [])];
  return [...new Set((state.roomMembers || []).filter((member) => member.roomId === conversation.roomId).map((member) => member.userId))];
}

function messageKindLabel(message) {
  if (message?.type === "image") return "Изображение";
  if (message?.type === "voice") return "Голосовое сообщение";
  if (message?.fileId || message?.type === "file") return "Файл";
  return "Новое сообщение";
}

function buildPushDelivery(state, event, subscription, serverId) {
  const message = state.messages.find((item) => item.id === event.payload?.messageId && !item.deletedAt);
  const conversation = findConversation(state, event.conversationId || message?.conversationId);
  const recipientId = subscription.user_id;
  if (!message || !conversation || message.senderId === recipientId || message.pendingApproval) return null;
  if (!canAccessConversation(state, conversation, recipientId)) return null;

  const reply = message.replyToId ? state.messages.find((item) => item.id === message.replyToId) : null;
  const mention = Array.isArray(message.mentions) && message.mentions.includes(recipientId);
  const replied = reply?.senderId === recipientId;
  if (!notificationAllowed(state, recipientId, conversation.id, { mention, reply: replied, silent: Boolean(message.silent) })) return null;

  const sender = findUser(state, message.senderId);
  const senderName = String(sender?.displayName || "Пользователь").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 64) || "Пользователь";
  const policy = ["generic", "sender", "full"].includes(subscription.preview_policy) ? subscription.preview_policy : "generic";
  let body = "Новое сообщение";
  if (policy === "sender") body = `${senderName}: ${messageKindLabel(message)}`;
  if (policy === "full") {
    const preview = message.type === "text" && message.text
      ? String(message.text).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)
      : messageKindLabel(message);
    body = `${senderName}: ${preview || "Новое сообщение"}`;
  }

  return {
    deliveryId: crypto.createHash("sha256").update(`${event.id}:${subscription.id}`).digest("hex"),
    serverId,
    provider: subscription.provider,
    installationId: subscription.installation_id,
    notification: {
      title: "Nexora",
      body,
      tag: `conversation:${conversation.id}`,
      renotify: false,
    },
    data: {
      type: mention ? "message.mention" : replied ? "message.reply" : "message.new",
      conversationId: conversation.id,
      messageId: message.id,
    },
  };
}

function createMobilePushService({
  store,
  events,
  serverId,
  pushTokenKey,
  transport,
  clock = () => new Date(),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  log = () => {},
} = {}) {
  if (!store?.db || !events?.on || !events?.off || !serverId || !transport?.send || !transport?.status) {
    throw new Error("Mobile push service requires store, event emitter, serverId and a push transport.");
  }
  const tokenKey = parseTokenKey(pushTokenKey ?? process.env.NEXORA_PUSH_TOKEN_KEY);
  const attemptLimit = Math.max(1, Math.min(10, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS));
  const ageLimit = Math.max(60_000, Math.min(7 * 24 * 60 * 60 * 1000, Number(maxAgeMs) || DEFAULT_MAX_AGE_MS));
  let activationAt = clock().getTime();
  let started = false;
  let closed = false;
  let activeDrain = null;
  let rerunRequested = false;
  let scheduledTimer = null;
  let scheduledFor = Number.POSITIVE_INFINITY;
  let retryTimer = null;
  let deliveredCount = 0;
  let failedCount = 0;
  let lastDispatchAt = null;
  let lastErrorCode = null;

  function recordFor(state, eventId) {
    state.meta.mobilePushDispatch ||= {};
    state.meta.mobilePushDispatch[eventId] ||= { createdAt: clock().toISOString(), subscriptions: {}, completedAt: null };
    return state.meta.mobilePushDispatch[eventId];
  }

  async function saveOutcome(eventId, subscriptionId, outcome) {
    await store.mutate((state) => {
      const event = state.events.find((item) => item.id === eventId);
      if (!event) return;
      const record = recordFor(state, eventId);
      record.subscriptions[subscriptionId] = { ...record.subscriptions[subscriptionId], ...outcome };
      record.updatedAt = clock().toISOString();
    });
  }

  async function completeEvent(eventId) {
    await store.mutate((state) => {
      const event = state.events.find((item) => item.id === eventId);
      if (!event) return;
      const record = recordFor(state, eventId);
      record.completedAt ||= clock().toISOString();
      record.updatedAt = record.completedAt;
    });
  }

  function schedule(delayMs = 0) {
    if (closed || !started) return;
    const delay = Math.max(0, Number(delayMs) || 0);
    if (activeDrain && delay === 0) {
      rerunRequested = true;
      return;
    }
    const due = Date.now() + delay;
    if (scheduledTimer && scheduledFor <= due) return;
    if (scheduledTimer) clearTimeout(scheduledTimer);
    scheduledFor = due;
    scheduledTimer = setTimeout(() => {
      scheduledTimer = null;
      scheduledFor = Number.POSITIVE_INFINITY;
      drain().catch((error) => {
        lastErrorCode = String(error?.code || "PUSH_DISPATCH_FAILED");
        log(`Mobile push dispatch failed: ${lastErrorCode}`, "error");
      });
    }, delay);
    scheduledTimer.unref?.();
  }

  async function deliverEvent(snapshot, event) {
    const message = snapshot.messages.find((item) => item.id === event.payload?.messageId);
    const conversation = findConversation(snapshot, event.conversationId || message?.conversationId);
    if (!message || !conversation || message.deletedAt || message.pendingApproval || message.silent) {
      await completeEvent(event.id);
      return;
    }

    const record = snapshot.meta.mobilePushDispatch?.[event.id];
    const recipients = participantIds(snapshot, conversation).filter((userId) => userId !== message.senderId && canAccessConversation(snapshot, conversation, userId));
    const subscriptions = recipients.flatMap((userId) => store.db.prepare(
      "SELECT * FROM mobile_push_subscriptions WHERE user_id=? AND server_id=? AND revoked_at IS NULL ORDER BY updated_at DESC",
    ).all(userId, serverId));

    if (!subscriptions.length) {
      await completeEvent(event.id);
      return;
    }

    let pending = false;
    for (const subscription of subscriptions) {
      const previous = record?.subscriptions?.[subscription.id];
      if (["delivered", "permanent", "revoked", "suppressed"].includes(previous?.status)) continue;
      if (previous?.nextAttemptAt && Date.parse(previous.nextAttemptAt) > clock().getTime()) {
        pending = true;
        continue;
      }
      const delivery = buildPushDelivery(snapshot, event, subscription, serverId);
      if (!delivery) {
        await saveOutcome(event.id, subscription.id, { status: "suppressed", attempts: Number(previous?.attempts || 0), completedAt: clock().toISOString(), lastErrorCode: null });
        continue;
      }

      const attempts = Number(previous?.attempts || 0) + 1;
      try {
        delivery.token = decryptSecret(subscription.token_ciphertext, tokenKey);
        await transport.send(delivery);
        deliveredCount += 1;
        lastDispatchAt = clock().toISOString();
        lastErrorCode = null;
        await saveOutcome(event.id, subscription.id, { status: "delivered", attempts, deliveredAt: lastDispatchAt, nextAttemptAt: null, lastErrorCode: null });
      } catch (error) {
        failedCount += 1;
        const code = String(error?.code || "PUSH_GATEWAY_UNAVAILABLE");
        lastErrorCode = code;
        const permanent = Boolean(error?.permanent) || code === "PUSH_TOKEN_INVALID" || code === "PUSH_TOKEN_DECRYPT_FAILED" || attempts >= attemptLimit;
        if (code === "PUSH_TOKEN_INVALID" || code === "PUSH_TOKEN_DECRYPT_FAILED") {
          const revokedAt = clock().toISOString();
          store.db.prepare("UPDATE mobile_push_subscriptions SET revoked_at=COALESCE(revoked_at,?),updated_at=?,last_error_code=? WHERE id=?").run(revokedAt, revokedAt, code, subscription.id);
        } else {
          store.db.prepare("UPDATE mobile_push_subscriptions SET updated_at=?,last_error_code=? WHERE id=?").run(clock().toISOString(), code, subscription.id);
        }
        if (permanent) {
          await saveOutcome(event.id, subscription.id, { status: code === "PUSH_TOKEN_INVALID" || code === "PUSH_TOKEN_DECRYPT_FAILED" ? "revoked" : "permanent", attempts, completedAt: clock().toISOString(), nextAttemptAt: null, lastErrorCode: code });
        } else {
          const delay = Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** Math.max(0, attempts - 1));
          const nextAttemptAt = new Date(clock().getTime() + delay).toISOString();
          await saveOutcome(event.id, subscription.id, { status: "retry", attempts, nextAttemptAt, lastErrorCode: code });
          pending = true;
          schedule(delay);
        }
      }
    }

    const fresh = store.read();
    const freshRecord = fresh.meta.mobilePushDispatch?.[event.id];
    const terminal = subscriptions.every((subscription) => ["delivered", "permanent", "revoked", "suppressed"].includes(freshRecord?.subscriptions?.[subscription.id]?.status));
    if (terminal && !pending) await completeEvent(event.id);
  }

  async function pruneDispatchRecords() {
    await store.mutate((state) => {
      const records = state.meta.mobilePushDispatch;
      if (!records || typeof records !== "object") return;
      const retained = new Set(state.events.map((event) => event.id));
      for (const eventId of Object.keys(records)) if (!retained.has(eventId)) delete records[eventId];
    });
  }

  async function runDrain() {
    if (closed || !tokenKey || !transport.configured) return { processed: 0 };
    let processed = 0;
    const snapshot = store.read();
    const now = clock().getTime();
    const candidates = snapshot.events
      .filter((event) => event.type === "message.created" && Date.parse(event.createdAt) >= Math.max(activationAt, now - ageLimit))
      .filter((event) => !snapshot.meta.mobilePushDispatch?.[event.id]?.completedAt)
      .sort((left, right) => Number(left.sequence) - Number(right.sequence))
      .slice(0, SCAN_LIMIT);
    for (const event of candidates) {
      await deliverEvent(store.read(), event);
      processed += 1;
    }
    if (processed) await pruneDispatchRecords();
    return { processed };
  }

  function drain() {
    if (activeDrain) {
      rerunRequested = true;
      return activeDrain;
    }
    activeDrain = runDrain().finally(() => {
      activeDrain = null;
      if (rerunRequested && !closed) {
        rerunRequested = false;
        schedule(0);
      }
    });
    return activeDrain;
  }

  const onStats = () => schedule(0);

  async function start() {
    if (closed) throw new Error("Mobile push service is closed.");
    if (started) return status();
    if (!tokenKey || !transport.configured) return status();
    const activatedAt = await store.mutate((state) => {
      state.meta.mobilePushActivatedAt ||= clock().toISOString();
      state.meta.mobilePushDispatch ||= {};
      return state.meta.mobilePushActivatedAt;
    });
    activationAt = Date.parse(activatedAt);
    if (!Number.isFinite(activationAt)) activationAt = clock().getTime();
    started = true;
    events.on("stats", onStats);
    retryTimer = setInterval(() => schedule(0), 30_000);
    retryTimer.unref?.();
    schedule(0);
    return status();
  }

  async function close() {
    if (closed) return;
    closed = true;
    started = false;
    events.off("stats", onStats);
    clearInterval(retryTimer);
    retryTimer = null;
    if (scheduledTimer) clearTimeout(scheduledTimer);
    scheduledTimer = null;
    scheduledFor = Number.POSITIVE_INFINITY;
    rerunRequested = false;
    await activeDrain;
  }

  function status() {
    let queuedEvents = 0;
    try {
      const state = store.read();
      queuedEvents = state.events.filter((event) => event.type === "message.created" && !state.meta.mobilePushDispatch?.[event.id]?.completedAt).length;
    } catch {
      queuedEvents = 0;
    }
    return {
      configured: Boolean(tokenKey && transport.configured),
      started,
      tokenKeyConfigured: Boolean(tokenKey),
      transport: transport.status(),
      queuedEvents,
      deliveredCount,
      failedCount,
      lastDispatchAt,
      lastErrorCode,
      closed,
    };
  }

  return { start, drain, close, status };
}

module.exports = {
  buildPushDelivery,
  createMobilePushService,
  decryptSecret,
  participantIds,
};
