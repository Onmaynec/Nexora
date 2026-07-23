import { emitAck } from "./socket";

const activeFlushes = new Map();
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;
const PERMANENT_CODES = new Set([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "LEGACY_READ_ONLY",
  "POLICY_RESTRICTED",
  "RESOURCE_NOT_FOUND",
  "STATE_CONFLICT",
  "VALIDATION_FAILED",
]);

function key(userId) {
  return `nexora:outbox:${userId}`;
}

function legacyKey(userId) {
  return `nexora:legacy-outbox:${userId}`;
}

function notify(userId) {
  window.dispatchEvent(new CustomEvent("nexora:outbox", { detail: { userId } }));
}

function parseEntries(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function archiveLegacyEntries(userId, entries) {
  const legacy = entries.filter((entry) => entry?.kind === "mls-message");
  if (!legacy.length) return entries;
  const archived = parseEntries(legacyKey(userId));
  const byId = new Map([...archived, ...legacy].map((entry) => [String(entry.id), {
    ...entry,
    state: "retired",
    terminal: true,
    retiredAt: entry.retiredAt || new Date().toISOString(),
    error: "LEGACY_READ_ONLY",
  }]));
  localStorage.setItem(legacyKey(userId), JSON.stringify([...byId.values()].slice(-250)));
  const active = entries.filter((entry) => entry?.kind !== "mls-message");
  localStorage.setItem(key(userId), JSON.stringify(active.slice(-250)));
  window.dispatchEvent(new CustomEvent("nexora:legacy-outbox-retired", { detail: { userId, count: legacy.length } }));
  return active;
}

export function readOutbox(userId) {
  if (!userId) return [];
  return archiveLegacyEntries(userId, parseEntries(key(userId)));
}

export function readLegacyOutboxArchive(userId) {
  if (!userId) return [];
  return parseEntries(legacyKey(userId));
}

function writeOutbox(userId, entries) {
  localStorage.setItem(key(userId), JSON.stringify(entries.slice(-250)));
  notify(userId);
  return entries;
}

function clientId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function enqueueMessage(userId, payload) {
  const entry = {
    id: clientId(),
    kind: "text",
    conversationId: payload.conversationId,
    text: payload.text,
    replyToId: payload.replyToId ?? null,
    silent: Boolean(payload.silent),
    threadRootId: payload.threadRootId ?? null,
    createdAt: new Date().toISOString(),
    state: "queued",
    error: null,
    errorCode: null,
    attempts: 0,
    nextAttemptAt: null,
    terminal: false,
  };
  writeOutbox(userId, [...readOutbox(userId), entry]);
  return entry;
}

export function enqueueForward(userId, payload) {
  const entry = {
    id: clientId(),
    kind: "forward",
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    previewText: payload.previewText ?? "Пересланное сообщение",
    createdAt: new Date().toISOString(),
    state: "queued",
    error: null,
    errorCode: null,
    attempts: 0,
    nextAttemptAt: null,
    terminal: false,
  };
  writeOutbox(userId, [...readOutbox(userId), entry]);
  return entry;
}

export function removeOutboxEntry(userId, id) {
  writeOutbox(userId, readOutbox(userId).filter((entry) => entry.id !== id));
}

export function retryOutboxEntry(userId, id) {
  writeOutbox(userId, readOutbox(userId).map((entry) => entry.id === id ? {
    ...entry,
    state: "queued",
    error: null,
    errorCode: null,
    attempts: 0,
    nextAttemptAt: null,
    terminal: false,
  } : entry));
}

function updateEntry(userId, id, patch) {
  writeOutbox(userId, readOutbox(userId).map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
}

function retryDelay(error, attempts) {
  const retryAfterMs = Number(error?.retryAfter || 0) * 1_000;
  if (retryAfterMs > 0) return Math.min(MAX_BACKOFF_MS, retryAfterMs);
  return Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempts - 1)));
}

function terminalError(error, attempts) {
  return attempts >= MAX_ATTEMPTS || error?.retryable === false || PERMANENT_CODES.has(String(error?.code || ""));
}

export function flushOutbox(socket, userId) {
  if (!socket.connected || !userId) return Promise.resolve({ sent: 0, failed: 0, deferred: 0, terminal: 0 });
  if (activeFlushes.has(userId)) return activeFlushes.get(userId);
  const operation = (async () => {
    let sent = 0;
    let failed = 0;
    let deferred = 0;
    let terminal = 0;
    for (const original of readOutbox(userId)) {
      if (!socket.connected) break;
      const current = readOutbox(userId).find((entry) => entry.id === original.id);
      if (!current) continue;
      if (current.terminal) {
        terminal += 1;
        continue;
      }
      if (current.nextAttemptAt && Date.parse(current.nextAttemptAt) > Date.now()) {
        deferred += 1;
        continue;
      }
      const attempts = Number(current.attempts || 0) + 1;
      updateEntry(userId, current.id, {
        state: "sending",
        attempts,
        error: null,
        errorCode: null,
        nextAttemptAt: null,
      });
      try {
        if (current.kind === "forward") {
          await emitAck(socket, "message:forward", {
            messageId: current.messageId,
            conversationId: current.conversationId,
            clientId: current.id,
          }, 12_000);
        } else if (current.kind === "text") {
          await emitAck(socket, "message:send", {
            conversationId: current.conversationId,
            text: current.text,
            replyToId: current.replyToId,
            threadRootId: current.threadRootId,
            silent: current.silent,
            clientId: current.id,
          }, 12_000);
        } else {
          const error = new Error("Неизвестный формат outbox entry.");
          error.code = "VALIDATION_FAILED";
          error.retryable = false;
          throw error;
        }
        removeOutboxEntry(userId, current.id);
        sent += 1;
      } catch (error) {
        const isTerminal = terminalError(error, attempts);
        const delay = isTerminal ? null : retryDelay(error, attempts);
        updateEntry(userId, current.id, {
          state: "failed",
          error: error.message || "Не удалось отправить",
          errorCode: error.code || "TEMPORARY_UNAVAILABLE",
          requestId: error.requestId || null,
          terminal: isTerminal,
          nextAttemptAt: delay ? new Date(Date.now() + delay).toISOString() : null,
        });
        failed += 1;
        if (isTerminal) terminal += 1;
        if (!socket.connected) break;
      }
    }
    return { sent, failed, deferred, terminal };
  })().finally(() => activeFlushes.delete(userId));
  activeFlushes.set(userId, operation);
  return operation;
}
