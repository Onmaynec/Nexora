import { emitAck } from "./socket";

const activeFlushes = new Map();

function key(userId) {
  return `nexora:outbox:${userId}`;
}

function notify(userId) {
  window.dispatchEvent(new CustomEvent("nexora:outbox", { detail: { userId } }));
}

export function readOutbox(userId) {
  if (!userId) return [];
  try {
    const value = JSON.parse(localStorage.getItem(key(userId)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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
    attempts: 0,
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
    attempts: 0,
  };
  writeOutbox(userId, [...readOutbox(userId), entry]);
  return entry;
}

export function removeOutboxEntry(userId, id) {
  writeOutbox(userId, readOutbox(userId).filter((entry) => entry.id !== id));
}

export function retryOutboxEntry(userId, id) {
  writeOutbox(userId, readOutbox(userId).map((entry) => entry.id === id ? { ...entry, state: "queued", error: null } : entry));
}

function updateEntry(userId, id, patch) {
  writeOutbox(userId, readOutbox(userId).map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
}

export function flushOutbox(socket, userId) {
  if (!socket.connected || !userId) return Promise.resolve({ sent: 0, failed: 0 });
  if (activeFlushes.has(userId)) return activeFlushes.get(userId);
  const operation = (async () => {
    let sent = 0;
    let failed = 0;
    for (const original of readOutbox(userId)) {
      if (!socket.connected) break;
      const current = readOutbox(userId).find((entry) => entry.id === original.id);
      if (!current) continue;
      updateEntry(userId, current.id, { state: "sending", attempts: Number(current.attempts || 0) + 1, error: null });
      try {
        if (current.kind === "forward") {
          await emitAck(socket, "message:forward", { messageId: current.messageId, conversationId: current.conversationId, clientId: current.id }, 12_000);
        } else {
          await emitAck(socket, "message:send", { conversationId: current.conversationId, text: current.text, replyToId: current.replyToId, threadRootId: current.threadRootId, silent: current.silent, clientId: current.id }, 12_000);
        }
        removeOutboxEntry(userId, current.id);
        sent += 1;
      } catch (error) {
        updateEntry(userId, current.id, { state: "failed", error: error.message || "Не удалось отправить" });
        failed += 1;
        if (!socket.connected) break;
      }
    }
    return { sent, failed };
  })().finally(() => activeFlushes.delete(userId));
  activeFlushes.set(userId, operation);
  return operation;
}
