import { emitAck } from "./socket";

const activeFlushes = new Map();
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;
const MAX_ENTRIES = 500;
const PERMANENT_CODES = new Set([
  "AUTH_REQUIRED",
  "CACHE_SCOPE_MISMATCH",
  "FORBIDDEN",
  "LEGACY_READ_ONLY",
  "POLICY_RESTRICTED",
  "RESOURCE_NOT_FOUND",
  "STATE_CONFLICT",
  "VALIDATION_FAILED",
]);

function cleanPart(value, fallback) {
  const candidate = String(value || "").trim();
  return encodeURIComponent((candidate || fallback).slice(0, 200));
}

export function outboxScope(value, serverId = location.origin) {
  if (value && typeof value === "object") {
    return {
      origin: String(value.origin || location.origin),
      serverId: String(value.serverId || location.origin),
      userId: String(value.userId || "anonymous"),
    };
  }
  return { origin: location.origin, serverId: String(serverId || location.origin), userId: String(value || "anonymous") };
}

function key(value, serverId) {
  const scope = outboxScope(value, serverId);
  return `nexora:outbox:v2:${cleanPart(scope.origin, "origin")}:${cleanPart(scope.serverId, "server")}:${cleanPart(scope.userId, "anonymous")}`;
}

function legacyKey(userId) {
  return `nexora:outbox:${userId}`;
}

function legacyArchiveKey(scope) {
  return `nexora:legacy-outbox:v2:${cleanPart(scope.origin, "origin")}:${cleanPart(scope.serverId, "server")}:${cleanPart(scope.userId, "anonymous")}`;
}

function notify(scope) {
  window.dispatchEvent(new CustomEvent("nexora:outbox", { detail: scope }));
}

function parseEntries(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function migrateLegacy(scope) {
  const target = key(scope);
  if (localStorage.getItem(target) != null) return;
  const oldKey = legacyKey(scope.userId);
  const legacy = parseEntries(oldKey);
  if (!legacy.length) return;
  localStorage.setItem(target, JSON.stringify(legacy.map((entry) => ({ ...entry, serverId: scope.serverId })).slice(-MAX_ENTRIES)));
  localStorage.removeItem(oldKey);
}

function archiveLegacyEntries(scope, entries) {
  const legacy = entries.filter((entry) => entry?.kind === "mls-message");
  if (!legacy.length) return entries;
  const archived = parseEntries(legacyArchiveKey(scope));
  const byId = new Map([...archived, ...legacy].map((entry) => [String(entry.id), {
    ...entry,
    state: "retired",
    terminal: true,
    retiredAt: entry.retiredAt || new Date().toISOString(),
    error: "LEGACY_READ_ONLY",
    errorCode: "LEGACY_READ_ONLY",
  }]));
  localStorage.setItem(legacyArchiveKey(scope), JSON.stringify([...byId.values()].slice(-250)));
  const active = entries.filter((entry) => entry?.kind !== "mls-message");
  localStorage.setItem(key(scope), JSON.stringify(active.slice(-MAX_ENTRIES)));
  window.dispatchEvent(new CustomEvent("nexora:legacy-outbox-retired", { detail: { ...scope, count: legacy.length } }));
  return active;
}

export function readOutbox(value, serverId) {
  const scope = outboxScope(value, serverId);
  if (!scope.userId || scope.userId === "anonymous") return [];
  migrateLegacy(scope);
  return archiveLegacyEntries(scope, parseEntries(key(scope)));
}

export function readLegacyOutboxArchive(value, serverId) {
  const scope = outboxScope(value, serverId);
  if (!scope.userId || scope.userId === "anonymous") return [];
  return parseEntries(legacyArchiveKey(scope));
}

function writeOutbox(scope, entries) {
  localStorage.setItem(key(scope), JSON.stringify(entries.slice(-MAX_ENTRIES)));
  notify(scope);
  return entries;
}

function clientId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function baseEntry(scope, payload, kind) {
  const id = clientId();
  return {
    id,
    idempotencyKey: id,
    serverId: scope.serverId,
    userId: scope.userId,
    kind,
    conversationId: payload.conversationId,
    createdAt: new Date().toISOString(),
    state: "queued",
    error: null,
    errorCode: null,
    requestId: null,
    attempts: 0,
    nextAttemptAt: null,
    terminal: false,
  };
}

export function enqueueMessage(value, payload, serverId) {
  const scope = outboxScope(value, serverId);
  const entry = {
    ...baseEntry(scope, payload, "text"),
    text: payload.text,
    replyToId: payload.replyToId ?? null,
    silent: Boolean(payload.silent),
    threadRootId: payload.threadRootId ?? null,
  };
  writeOutbox(scope, [...readOutbox(scope), entry]);
  return entry;
}

export function enqueueForward(value, payload, serverId) {
  const scope = outboxScope(value, serverId);
  const entry = {
    ...baseEntry(scope, payload, "forward"),
    messageId: payload.messageId,
    previewText: payload.previewText ?? "Пересланное сообщение",
  };
  writeOutbox(scope, [...readOutbox(scope), entry]);
  return entry;
}

export function removeOutboxEntry(value, id, serverId) {
  const scope = outboxScope(value, serverId);
  writeOutbox(scope, readOutbox(scope).filter((entry) => entry.id !== id));
}

export function retryOutboxEntry(value, id, serverId) {
  const scope = outboxScope(value, serverId);
  writeOutbox(scope, readOutbox(scope).map((entry) => entry.id === id ? {
    ...entry,
    state: "queued",
    error: null,
    errorCode: null,
    requestId: null,
    attempts: 0,
    nextAttemptAt: null,
    terminal: false,
  } : entry));
}

function updateEntry(scope, id, patch) {
  writeOutbox(scope, readOutbox(scope).map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
}

function retryDelay(error, attempts) {
  const retryAfterMs = Number(error?.retryAfter || 0) * 1_000;
  if (retryAfterMs > 0) return Math.min(MAX_BACKOFF_MS, retryAfterMs);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempts - 1)) + jitter);
}

function terminalError(error, attempts) {
  return attempts >= MAX_ATTEMPTS || error?.retryable === false || PERMANENT_CODES.has(String(error?.code || ""));
}

function conversationQueues(entries) {
  const queues = new Map();
  for (const entry of entries.sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0))) {
    const conversationId = String(entry.conversationId || "unknown");
    if (!queues.has(conversationId)) queues.set(conversationId, []);
    queues.get(conversationId).push(entry);
  }
  return [...queues.values()];
}

async function sendEntry(socket, current) {
  if (current.kind === "forward") {
    return emitAck(socket, "message:forward", {
      messageId: current.messageId,
      conversationId: current.conversationId,
      clientId: current.idempotencyKey || current.id,
    }, 12_000);
  }
  if (current.kind === "text") {
    return emitAck(socket, "message:send", {
      conversationId: current.conversationId,
      text: current.text,
      replyToId: current.replyToId,
      threadRootId: current.threadRootId,
      silent: current.silent,
      clientId: current.idempotencyKey || current.id,
    }, 12_000);
  }
  const error = new Error("Неизвестный формат outbox entry.");
  error.code = "VALIDATION_FAILED";
  error.retryable = false;
  throw error;
}

export function flushOutbox(socket, value, options = {}) {
  const scope = outboxScope(value, options.serverId);
  if (!socket.connected || !scope.userId || scope.userId === "anonymous") return Promise.resolve({ sent: 0, failed: 0, deferred: 0, terminal: 0, blocked: 0 });
  const flushKey = key(scope);
  if (activeFlushes.has(flushKey)) return activeFlushes.get(flushKey);
  const operation = (async () => {
    if (typeof options.validateAccess === "function") {
      const validation = await options.validateAccess(scope);
      if (validation === false || validation?.ok === false) return { sent: 0, failed: 0, deferred: 0, terminal: 0, blocked: readOutbox(scope).length };
    }
    let sent = 0;
    let failed = 0;
    let deferred = 0;
    let terminal = 0;
    let blocked = 0;
    for (const queue of conversationQueues(readOutbox(scope))) {
      let conversationBlocked = false;
      for (const original of queue) {
        if (!socket.connected) break;
        const current = readOutbox(scope).find((entry) => entry.id === original.id);
        if (!current) continue;
        if (conversationBlocked) { blocked += 1; continue; }
        if (current.serverId && current.serverId !== scope.serverId) {
          updateEntry(scope, current.id, { state: "failed", terminal: true, error: "Outbox entry принадлежит другому server profile.", errorCode: "CACHE_SCOPE_MISMATCH" });
          terminal += 1;
          continue;
        }
        if (current.terminal) { terminal += 1; continue; }
        if (current.nextAttemptAt && Date.parse(current.nextAttemptAt) > Date.now()) {
          deferred += 1;
          conversationBlocked = true;
          continue;
        }
        const attempts = Number(current.attempts || 0) + 1;
        updateEntry(scope, current.id, { state: "sending", attempts, error: null, errorCode: null, requestId: null, nextAttemptAt: null });
        try {
          const acknowledged = await sendEntry(socket, current);
          removeOutboxEntry(scope, current.id);
          sent += 1;
          window.dispatchEvent(new CustomEvent("nexora:outbox-item-state", { detail: { ...scope, id: current.id, state: "accepted", messageId: acknowledged?.message?.id || null } }));
        } catch (error) {
          const isTerminal = terminalError(error, attempts);
          const delay = isTerminal ? null : retryDelay(error, attempts);
          updateEntry(scope, current.id, {
            state: "failed",
            error: error.message || "Не удалось отправить",
            errorCode: error.code || "TEMPORARY_UNAVAILABLE",
            requestId: error.requestId || null,
            terminal: isTerminal,
            nextAttemptAt: delay ? new Date(Date.now() + delay).toISOString() : null,
          });
          failed += 1;
          if (isTerminal) {
            terminal += 1;
            if (["AUTH_REQUIRED", "FORBIDDEN"].includes(String(error.code || ""))) options.onAccessLost?.(error);
          } else {
            conversationBlocked = true;
          }
          if (!socket.connected) break;
        }
      }
    }
    return { sent, failed, deferred, terminal, blocked };
  })().finally(() => activeFlushes.delete(flushKey));
  activeFlushes.set(flushKey, operation);
  return operation;
}

export function outboxDiagnostics(value, serverId) {
  const scope = outboxScope(value, serverId);
  const entries = readOutbox(scope);
  return {
    serverId: scope.serverId,
    userId: scope.userId,
    pending: entries.filter((entry) => !entry.terminal).length,
    terminal: entries.filter((entry) => entry.terminal).length,
    byConversation: Object.fromEntries(conversationQueues(entries).map((queue) => [queue[0]?.conversationId || "unknown", queue.length])),
  };
}
