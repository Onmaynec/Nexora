"use strict";

const crypto = require("node:crypto");
const dns = require("node:dns/promises");
const fs = require("node:fs/promises");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");

const express = require("express");

const { addNotification, appendEvent, eventVisibleTo } = require("./events.cjs");
const {
  canAccessConversation,
  canModerateConversation,
  findConversation,
  findUser,
  roomPermission,
  roomRole,
  serializeMessage,
} = require("./model.cjs");
const { hashToken, publicUser } = require("./security.cjs");

const BOT_SCOPES = new Set(["messages:write", "messages:read", "members:read", "webhooks:manage"]);
const ROLE_PERMISSIONS = new Set([
  "room.view", "room.send_messages", "room.upload_files", "room.send_voice", "room.pin_messages",
  "room.manage_members", "room.delete_messages", "room.manage_reports", "room.mention_everyone",
]);
const CHUNK_BYTES = 1024 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function cleanLine(value, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanText(value, max = 4_000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

function fail(response, status, error, code = "REQUEST_FAILED") {
  return response.status(status).json({ ok: false, error, code });
}

function activeRoomInvite(invite, now = Date.now()) {
  return !invite.revokedAt
    && (!invite.expiresAt || Date.parse(invite.expiresAt) > now)
    && (!invite.maxUses || Number(invite.useCount || 0) < Number(invite.maxUses));
}

function roomAuthority(state, roomId, userId, manage = false, permission = "room.manage_members") {
  const user = findUser(state, userId);
  const role = roomRole(state, roomId, userId);
  if (user?.role === "server_admin" || role === "owner") return true;
  if (manage) return false;
  return role === "moderator" || roomPermission(state, roomId, userId, permission);
}

function participantIds(state, conversation) {
  if (conversation.type === "dm") return conversation.userIds;
  return state.roomMembers.filter((member) => member.roomId === conversation.roomId).map((member) => member.userId);
}

function privateAddress(address) {
  let value = String(address || "").toLowerCase().split("%", 1)[0];
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    if (!net.isIPv4(mapped)) return true;
    value = mapped;
  }
  if (net.isIPv4(value)) {
    const [first, second, third] = value.split(".").map(Number);
    return first === 0 || first === 10 || first === 26 || first === 127 || first >= 224
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 192 && second === 0 && [0, 2].includes(third))
      || (first === 192 && second === 88 && third === 99)
      || (first === 198 && [18, 19].includes(second))
      || (first === 198 && second === 51 && third === 100)
      || (first === 203 && second === 0 && third === 113);
  }
  if (net.isIPv6(value)) {
    return value === "::" || value === "::1" || value.startsWith("fe8") || value.startsWith("fe9")
      || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("fc") || value.startsWith("fd")
      || value.startsWith("ff") || value.startsWith("2001:db8:");
  }
  return true;
}

async function publicWebhookTarget(value) {
  let url;
  try { url = new URL(String(value || "")); } catch { throw new Error("WEBHOOK_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("WEBHOOK_HTTPS_REQUIRED");
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("WEBHOOK_PRIVATE_TARGET");
  return { url, address: addresses[0].address, family: addresses[0].family };
}

function postJsonPinned(target, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const request = https.request({
      protocol: "https:", hostname: target.url.hostname, port: 443,
      path: `${target.url.pathname}${target.url.search}`,
      method: "POST", servername: target.url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      headers: { "Content-Type": "application/json", "Content-Length": payload.length, ...headers },
      timeout: 5_000,
    }, (response) => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.statusCode);
        else reject(new Error(`HTTP_${response.statusCode}`));
      });
    });
    request.on("timeout", () => request.destroy(new Error("WEBHOOK_TIMEOUT")));
    request.on("error", reject);
    request.end(payload);
  });
}

function sniffMime(buffer, claimed) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return /^audio\//.test(claimed) ? claimed : "video/webm";
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return /^audio\//.test(claimed) ? claimed : "application/ogg";
  if (/^(?:image|audio)\//i.test(claimed)) return "application/octet-stream";
  return cleanLine(claimed, 120) || "application/octet-stream";
}

function mountV3Features(options) {
  const {
    app, store, io, authRequired, serverAdminRequired, createTextMessage, emitMessage,
    roomPostingError, maintenance, conversationUsesMls = () => false, uploadsDir, incomingDir, maxFileBytes, secretService, log = () => {},
  } = options;
  let scheduling = false;
  const tokenRate = new Map();

  function auditIntegration(state, actorId, action, details = {}) {
    state.integrationAudit.push({ id: crypto.randomUUID(), actorId, action, details, createdAt: nowIso() });
  }

  async function dispatchEvent(event) {
    const webhooks = store.read((state) => state.webhooks.filter((item) => item.enabled !== false && (!item.roomId || item.roomId === event.roomId) && (!item.events?.length || item.events.includes(event.type))));
    await Promise.allSettled(webhooks.map(async (webhook) => {
      const target = await publicWebhookTarget(webhook.url);
      const body = { id: event.id, sequence: event.sequence, type: event.type, roomId: event.roomId, conversationId: event.conversationId, payload: event.payload, createdAt: event.createdAt };
      const serialized = JSON.stringify(body);
      const secret = secretService.decrypt(webhook.secretCiphertext);
      const signature = crypto.createHmac("sha256", secret).update(serialized).digest("hex");
      try {
        await postJsonPinned(target, body, { "X-Nexora-Event": event.type, "X-Nexora-Signature-256": `sha256=${signature}` });
        await store.mutate((state) => {
          const current = state.webhooks.find((item) => item.id === webhook.id);
          if (current) { current.lastDeliveredAt = nowIso(); current.lastError = null; }
          auditIntegration(state, webhook.createdBy, "webhook.delivered", { webhookId: webhook.id, eventId: event.id });
        });
      } catch (error) {
        await store.mutate((state) => {
          const current = state.webhooks.find((item) => item.id === webhook.id);
          if (current) { current.lastErrorAt = nowIso(); current.lastError = cleanLine(error.message, 160); }
          auditIntegration(state, webhook.createdBy, "webhook.failed", { webhookId: webhook.id, eventId: event.id, error: cleanLine(error.message, 160) });
        });
      }
    }));
  }

  async function processScheduled() {
    if (scheduling) return;
    scheduling = true;
    try {
      const due = store.read((state) => state.scheduledMessages
        .filter((item) => item.status === "pending" && Date.parse(item.scheduledAt) <= Date.now())
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, 25));
      for (const scheduled of due) {
        try {
          const result = await createTextMessage({
            senderId: scheduled.userId, conversationId: scheduled.conversationId, text: scheduled.text,
            replyToId: scheduled.replyToId, threadRootId: scheduled.threadRootId, silent: scheduled.silent, clientId: `scheduled_${scheduled.id}`,
          });
          await store.mutate((state) => {
            const current = state.scheduledMessages.find((item) => item.id === scheduled.id);
            if (current) Object.assign(current, { status: "sent", messageId: result.message.id, updatedAt: nowIso() });
          });
          emitMessage(result);
        } catch (error) {
          await store.mutate((state) => {
            const current = state.scheduledMessages.find((item) => item.id === scheduled.id);
            if (current) Object.assign(current, { status: "failed", error: cleanLine(error.message, 180), updatedAt: nowIso() });
          });
        }
      }
    } finally {
      scheduling = false;
    }
  }

  app.get("/api/v3/sync", authRequired, (request, response) => {
    const after = Math.max(0, Number(request.query.after) || 0);
    const limit = Math.max(1, Math.min(500, Number(request.query.limit) || 200));
    const state = store.read();
    const latestSequence = Number(state.meta.lastEventSequence || 0);
    const visible = state.events.filter((event) => eventVisibleTo(state, event, request.nexora.user.id));
    const firstRetainedSequence = state.events[0]?.sequence ?? latestSequence + 1;
    const resyncRequired = after > latestSequence || (after > 0 && firstRetainedSequence > after + 1);
    const events = resyncRequired ? [] : visible.filter((event) => event.sequence > after).slice(0, limit);
    response.json({
      ok: true, apiVersion: 3, events, resyncRequired, bootstrapUrl: resyncRequired ? "/api/bootstrap" : null,
      latestSequence, hasMore: !resyncRequired && visible.some((event) => event.sequence > (events.at(-1)?.sequence ?? after)),
    });
  });

  app.get("/api/notifications", authRequired, (request, response) => {
    const unreadOnly = String(request.query.unreadOnly || "") === "1";
    const events = store.read((state) => state.notificationEvents
      .filter((event) => event.userId === request.nexora.user.id && (!unreadOnly || !event.readAt))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 200));
    response.json({ ok: true, notifications: events, unreadCount: events.filter((event) => !event.readAt).length });
  });

  app.patch("/api/notifications/read", authRequired, async (request, response) => {
    const ids = new Set(Array.isArray(request.body?.ids) ? request.body.ids.map(String).slice(0, 200) : []);
    const readAt = nowIso();
    const count = await store.mutate((state) => {
      let changed = 0;
      for (const event of state.notificationEvents) {
        if (event.userId === request.nexora.user.id && !event.readAt && (request.body?.all || ids.has(event.id))) { event.readAt = readAt; changed += 1; }
      }
      return changed;
    });
    response.json({ ok: true, count });
  });

  app.patch("/api/users/me/preferences", authRequired, async (request, response) => {
    const mode = request.body?.notificationMode;
    if (mode != null && !["all", "mentions", "none"].includes(mode)) return fail(response, 400, "Неизвестный режим уведомлений.", "PREFERENCE_INVALID");
    const start = request.body?.quietHoursStart == null ? null : cleanLine(request.body.quietHoursStart, 5);
    const end = request.body?.quietHoursEnd == null ? null : cleanLine(request.body.quietHoursEnd, 5);
    if ([start, end].some((value) => value != null && value !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) return fail(response, 400, "Время укажите в формате HH:MM.", "PREFERENCE_INVALID");
    const user = await store.mutate((state) => {
      const current = findUser(state, request.nexora.user.id);
      if (mode != null) current.notificationMode = mode;
      if (start != null) current.quietHoursStart = start;
      if (end != null) current.quietHoursEnd = end;
      return current;
    });
    response.json({ ok: true, preferences: { notificationMode: user.notificationMode, quietHoursStart: user.quietHoursStart, quietHoursEnd: user.quietHoursEnd } });
  });

  app.get("/api/v3/drafts", authRequired, (request, response) => {
    const state = store.read();
    const drafts = state.drafts
      .filter((item) => item.userId === request.nexora.user.id && !conversationUsesMls(item.conversationId) && canAccessConversation(state, findConversation(state, item.conversationId), item.userId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    response.json({ ok: true, drafts });
  });

  app.put("/api/v3/drafts/:conversationId", authRequired, async (request, response) => {
    const text = cleanText(request.body?.text);
    const state = store.read();
    const conversation = findConversation(state, request.params.conversationId);
    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");
    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Черновик MLS хранится только в зашифрованном локальном хранилище.", "E2EE_DRAFT_LOCAL_ONLY");
    if (!text) return fail(response, 400, "Пустой черновик следует удалить.", "DRAFT_EMPTY");
    const draft = await store.mutate((current) => {
      const id = `${request.nexora.user.id}:${conversation.id}`;
      let item = current.drafts.find((candidate) => candidate.id === id);
      if (!item) {
        item = { id, userId: request.nexora.user.id, conversationId: conversation.id, text, createdAt: nowIso(), updatedAt: nowIso() };
        current.drafts.push(item);
      } else {
        item.text = text;
        item.updatedAt = nowIso();
      }
      appendEvent(current, { type: "draft.updated", actorId: item.userId, userIds: [item.userId], conversationId: conversation.id, payload: { updatedAt: item.updatedAt } });
      return item;
    });
    io.to(`user:${request.nexora.user.id}`).emit("data:refresh");
    response.json({ ok: true, draft });
  });

  app.delete("/api/v3/drafts/:conversationId", authRequired, async (request, response) => {
    const state = store.read();
    const conversation = findConversation(state, request.params.conversationId);
    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");
    const changed = await store.mutate((current) => {
      const before = current.drafts.length;
      current.drafts = current.drafts.filter((item) => !(item.userId === request.nexora.user.id && item.conversationId === conversation.id));
      if (current.drafts.length !== before) appendEvent(current, { type: "draft.deleted", actorId: request.nexora.user.id, userIds: [request.nexora.user.id], conversationId: conversation.id });
      return current.drafts.length !== before;
    });
    if (changed) io.to(`user:${request.nexora.user.id}`).emit("data:refresh");
    response.json({ ok: true, changed });
  });

  app.get("/api/messages/scheduled", authRequired, (request, response) => {
    const items = store.read((state) => state.scheduledMessages.filter((item) => item.userId === request.nexora.user.id).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)));
    response.json({ ok: true, scheduledMessages: items });
  });

  app.post("/api/messages/scheduled", authRequired, async (request, response) => {
    const text = cleanText(request.body?.text);
    const conversationId = cleanLine(request.body?.conversationId, 64);
    const scheduledAt = new Date(request.body?.scheduledAt).getTime();
    const state = store.read();
    const conversation = findConversation(state, conversationId);
    if (!text || !canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат или сообщение недоступны.", "FORBIDDEN");
    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Отложенная plaintext-отправка недоступна в MLS-диалоге.", "E2EE_SCHEDULE_UNSUPPORTED");
    if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + 10_000 || scheduledAt > Date.now() + 365 * 24 * 60 * 60 * 1000) return fail(response, 400, "Дата должна быть от 10 секунд до года в будущем.", "SCHEDULE_INVALID");
    const posting = roomPostingError(state, conversation, request.nexora.user.id, "text");
    if (posting) return fail(response, 403, posting.message, posting.code);
    const scheduled = await store.mutate((draft) => {
      const item = {
        id: crypto.randomUUID(), userId: request.nexora.user.id, conversationId, text,
        replyToId: cleanLine(request.body?.replyToId, 64) || null, silent: Boolean(request.body?.silent),
        threadRootId: cleanLine(request.body?.threadRootId, 64) || null,
        scheduledAt: new Date(scheduledAt).toISOString(), status: "pending", createdAt: nowIso(), updatedAt: nowIso(),
      };
      draft.scheduledMessages.push(item);
      appendEvent(draft, { type: "message.scheduled", actorId: item.userId, userIds: [item.userId], conversationId, payload: { scheduledMessageId: item.id, scheduledAt: item.scheduledAt } });
      return item;
    });
    response.status(201).json({ ok: true, scheduledMessage: scheduled });
  });

  app.delete("/api/messages/scheduled/:id", authRequired, async (request, response) => {
    const cancelled = await store.mutate((state) => {
      const item = state.scheduledMessages.find((candidate) => candidate.id === request.params.id && candidate.userId === request.nexora.user.id && candidate.status === "pending");
      if (!item) return false;
      Object.assign(item, { status: "cancelled", updatedAt: nowIso() });
      return true;
    });
    if (!cancelled) return fail(response, 404, "Отложенное сообщение не найдено.", "NOT_FOUND");
    response.json({ ok: true });
  });

  app.post("/api/conversations/:id/polls", authRequired, async (request, response) => {
    const question = cleanLine(request.body?.question, 240);
    const labels = (Array.isArray(request.body?.options) ? request.body.options : []).map((item) => cleanLine(item, 120)).filter(Boolean);
    const unique = [...new Set(labels.map((item) => item.toLocaleLowerCase("ru")))];
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");
    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Опросы требуют отдельного E2EE-формата и пока недоступны в MLS-диалоге.", "E2EE_POLL_UNSUPPORTED");
    if (question.length < 2 || labels.length < 2 || labels.length > 10 || unique.length !== labels.length) return fail(response, 400, "Опросу нужны вопрос и 2–10 уникальных вариантов.", "POLL_INVALID");
    const posting = roomPostingError(state, conversation, request.nexora.user.id, "text");
    if (posting) return fail(response, 403, posting.message, posting.code);
    const result = await store.mutate((draft) => {
      const createdAt = nowIso();
      const poll = { id: crypto.randomUUID(), conversationId: conversation.id, creatorId: request.nexora.user.id, question, options: labels.map((text) => ({ id: crypto.randomUUID(), text })), multiple: Boolean(request.body?.multiple), anonymous: Boolean(request.body?.anonymous), createdAt, closedAt: null };
      const message = { id: crypto.randomUUID(), conversationId: conversation.id, senderId: request.nexora.user.id, type: "poll", text: question, pollId: poll.id, fileId: null, replyToId: null, forwardedFromId: null, forwardedSnapshot: null, clientId: null, createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null };
      draft.polls.push(poll); draft.messages.push(message);
      const event = appendEvent(draft, { type: "poll.created", actorId: request.nexora.user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { pollId: poll.id, messageId: message.id } });
      return { poll, message, conversation, event };
    });
    emitMessage(result); dispatchEvent(result.event).catch(() => {});
    response.status(201).json({ ok: true, message: serializeMessage(store.read(), result.message, request.nexora.user.id) });
  });

  app.post("/api/polls/:id/votes", authRequired, async (request, response) => {
    const requested = new Set((Array.isArray(request.body?.optionIds) ? request.body.optionIds : []).map(String).slice(0, 10));
    let result;
    try {
      result = await store.mutate((state) => {
        const poll = state.polls.find((item) => item.id === request.params.id);
        const conversation = findConversation(state, poll?.conversationId);
        if (!poll || !canAccessConversation(state, conversation, request.nexora.user.id)) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        if (poll.closedAt) throw Object.assign(new Error("POLL_CLOSED"), { status: 409 });
        const valid = new Set(poll.options.map((item) => item.id));
        if (!requested.size || [...requested].some((id) => !valid.has(id)) || (!poll.multiple && requested.size !== 1)) throw Object.assign(new Error("POLL_VOTE_INVALID"), { status: 400 });
        state.pollVotes = state.pollVotes.filter((vote) => !(vote.pollId === poll.id && vote.userId === request.nexora.user.id));
        for (const optionId of requested) state.pollVotes.push({ id: crypto.randomUUID(), pollId: poll.id, optionId, userId: request.nexora.user.id, createdAt: nowIso() });
        const message = state.messages.find((item) => item.pollId === poll.id);
        const event = appendEvent(state, { type: "poll.voted", actorId: request.nexora.user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { pollId: poll.id, messageId: message.id } });
        return { message, conversation, event, isUpdate: true };
      });
    } catch (error) { return fail(response, error.status || 400, error.message === "POLL_CLOSED" ? "Опрос закрыт." : "Голос не принят.", error.message); }
    emitMessage(result); dispatchEvent(result.event).catch(() => {});
    response.json({ ok: true, message: serializeMessage(store.read(), result.message, request.nexora.user.id) });
  });

  app.post("/api/polls/:id/close", authRequired, async (request, response) => {
    let result;
    try {
      result = await store.mutate((state) => {
        const poll = state.polls.find((item) => item.id === request.params.id);
        const conversation = findConversation(state, poll?.conversationId);
        if (!poll || (poll.creatorId !== request.nexora.user.id && !canModerateConversation(state, conversation, request.nexora.user.id))) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        poll.closedAt ||= nowIso();
        const message = state.messages.find((item) => item.pollId === poll.id);
        return { message, conversation, isUpdate: true };
      });
    } catch (error) { return fail(response, error.status || 403, "Закрытие опроса недоступно.", error.message); }
    emitMessage(result);
    response.json({ ok: true });
  });

  app.get("/api/messages/:id/edits", authRequired, (request, response) => {
    const state = store.read();
    const message = state.messages.find((item) => item.id === request.params.id);
    if (!message || !canAccessConversation(state, findConversation(state, message.conversationId), request.nexora.user.id)) return fail(response, 404, "Сообщение не найдено.", "NOT_FOUND");
    response.json({ ok: true, edits: state.messageEdits.filter((item) => item.messageId === message.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((item) => ({ id: item.id, previousText: item.previousText, createdAt: item.createdAt })) });
  });

  app.get("/api/rooms/:roomId/invites", authRequired, (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    response.json({ ok: true, invites: state.roomInvites.filter((item) => item.roomId === request.params.roomId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) });
  });

  app.post("/api/rooms/:roomId/invites", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const hours = Math.max(0, Math.min(8_760, Number(request.body?.expiresInHours) || 0));
    const invite = await store.mutate((draft) => {
      const item = { id: crypto.randomUUID(), roomId: request.params.roomId, code: crypto.randomBytes(18).toString("base64url"), label: cleanLine(request.body?.label, 80) || "Приглашение", createdBy: request.nexora.user.id, createdAt: nowIso(), expiresAt: hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null, maxUses: Math.max(0, Math.min(100_000, Math.round(Number(request.body?.maxUses) || 0))), useCount: 0, revokedAt: null };
      draft.roomInvites.push(item);
      appendEvent(draft, { type: "room.invite.created", actorId: request.nexora.user.id, roomId: item.roomId, payload: { inviteId: item.id } });
      return item;
    });
    response.status(201).json({ ok: true, invite });
  });

  app.delete("/api/rooms/:roomId/invites/:id", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const revoked = await store.mutate((draft) => {
      const invite = draft.roomInvites.find((item) => item.id === request.params.id && item.roomId === request.params.roomId && !item.revokedAt);
      if (!invite) return false;
      invite.revokedAt = nowIso(); invite.revokedBy = request.nexora.user.id; return true;
    });
    if (!revoked) return fail(response, 404, "Приглашение не найдено.", "NOT_FOUND");
    response.json({ ok: true });
  });

  app.post("/api/messages/:id/report", authRequired, async (request, response) => {
    const state = store.read();
    const message = state.messages.find((item) => item.id === request.params.id && !item.deletedAt);
    const conversation = findConversation(state, message?.conversationId);
    if (!message || conversation?.type !== "room" || !canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 404, "Сообщение не найдено.", "NOT_FOUND");
    const reason = cleanText(request.body?.reason, 500);
    if (reason.length < 3) return fail(response, 400, "Опишите причину жалобы.", "REPORT_INVALID");
    const report = await store.mutate((draft) => {
      const existing = draft.roomReports.find((item) => item.messageId === message.id && item.reporterId === request.nexora.user.id && item.status === "pending");
      if (existing) return existing;
      const item = { id: crypto.randomUUID(), roomId: conversation.roomId, conversationId: conversation.id, messageId: message.id, reportedUserId: message.senderId, reporterId: request.nexora.user.id, reason, status: "pending", createdAt: nowIso() };
      draft.roomReports.push(item);
      for (const member of draft.roomMembers.filter((candidate) => candidate.roomId === conversation.roomId && ["owner", "moderator"].includes(candidate.role))) addNotification(draft, member.userId, "moderation.report", { roomId: conversation.roomId, reportId: item.id });
      return item;
    });
    response.status(201).json({ ok: true, report });
  });

  app.patch("/api/rooms/:roomId/reports/:id", authRequired, async (request, response) => {
    const decision = ["resolved", "rejected"].includes(request.body?.status) ? request.body.status : null;
    const state = store.read();
    if (!decision || !roomAuthority(state, request.params.roomId, request.nexora.user.id, false, "room.manage_reports")) return fail(response, 403, "Решение недоступно.", "FORBIDDEN");
    const report = await store.mutate((draft) => {
      const item = draft.roomReports.find((candidate) => candidate.id === request.params.id && candidate.roomId === request.params.roomId);
      if (!item) return null;
      Object.assign(item, { status: decision, resolution: cleanText(request.body?.resolution, 500), resolvedAt: nowIso(), resolvedBy: request.nexora.user.id });
      return item;
    });
    if (!report) return fail(response, 404, "Жалоба не найдена.", "NOT_FOUND");
    response.json({ ok: true, report });
  });

  app.post("/api/messages/:id/moderation", authRequired, async (request, response) => {
    const decision = request.body?.decision === "approve" ? "approve" : request.body?.decision === "reject" ? "reject" : null;
    let result;
    try {
      result = await store.mutate((state) => {
        const message = state.messages.find((item) => item.id === request.params.id && item.pendingApproval && !item.deletedAt);
        const conversation = findConversation(state, message?.conversationId);
        if (!decision || !message || !roomAuthority(state, conversation?.roomId, request.nexora.user.id, false, "room.manage_reports")) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        message.pendingApproval = false;
        if (decision === "reject") { message.deletedAt = nowIso(); message.updatedAt = message.deletedAt; }
        const event = appendEvent(state, { type: decision === "approve" ? "message.approved" : "message.rejected", actorId: request.nexora.user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id } });
        return { message, conversation, event, isUpdate: true };
      });
    } catch (error) { return fail(response, error.status || 403, "Решение модератора недоступно.", error.message); }
    emitMessage(result); dispatchEvent(result.event).catch(() => {});
    response.json({ ok: true, decision });
  });

  app.patch("/api/rooms/:roomId/members/:userId/restriction", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, false, "room.manage_members")) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const minutes = Math.max(0, Math.min(525_600, Math.round(Number(request.body?.minutes) || 0)));
    const updated = await store.mutate((draft) => {
      const member = draft.roomMembers.find((item) => item.roomId === request.params.roomId && item.userId === request.params.userId && item.role !== "owner");
      if (!member) return false;
      member.restrictedUntil = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
      appendEvent(draft, { type: minutes ? "room.member.restricted" : "room.member.unrestricted", actorId: request.nexora.user.id, roomId: request.params.roomId, userIds: [request.params.userId], payload: { restrictedUntil: member.restrictedUntil } });
      return true;
    });
    if (!updated) return fail(response, 404, "Участник не найден.", "NOT_FOUND");
    io.emit("data:refresh"); response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/appeals", authRequired, async (request, response) => {
    const reason = cleanText(request.body?.reason, 1_000);
    if (reason.length < 10) return fail(response, 400, "Апелляция слишком короткая.", "APPEAL_INVALID");
    const snapshot = store.read();
    const room = snapshot.rooms.find((item) => item.id === request.params.roomId);
    if (!room) return fail(response, 404, "Комната не найдена.", "NOT_FOUND");
    const member = snapshot.roomMembers.find((item) => item.roomId === room.id && item.userId === request.nexora.user.id);
    const hasActiveRestriction = Boolean(member?.restrictedUntil && Date.parse(member.restrictedUntil) > Date.now());
    const hasActiveBan = snapshot.roomBans.some((item) => item.roomId === room.id && item.userId === request.nexora.user.id && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
    if (!hasActiveBan && !hasActiveRestriction) return fail(response, 409, "Активное ограничение для апелляции не найдено.", "APPEAL_NOT_APPLICABLE");
    const appeal = await store.mutate((state) => {
      const existing = state.moderationAppeals.find((item) => item.roomId === request.params.roomId && item.userId === request.nexora.user.id && item.status === "pending");
      if (existing) return existing;
      const item = { id: crypto.randomUUID(), roomId: request.params.roomId, userId: request.nexora.user.id, reason, status: "pending", createdAt: nowIso() };
      state.moderationAppeals.push(item);
      for (const moderator of state.roomMembers.filter((item) => item.roomId === request.params.roomId && ["owner", "moderator"].includes(item.role))) addNotification(state, moderator.userId, "moderation.appeal", { roomId: request.params.roomId, appealId: item.id });
      return item;
    });
    response.status(201).json({ ok: true, appeal });
  });

  app.patch("/api/rooms/:roomId/appeals/:id", authRequired, async (request, response) => {
    const decision = ["accepted", "rejected"].includes(request.body?.status) ? request.body.status : null;
    const snapshot = store.read();
    if (!decision || !roomAuthority(snapshot, request.params.roomId, request.nexora.user.id, false, "room.manage_reports")) return fail(response, 403, "Решение по апелляции недоступно.", "FORBIDDEN");
    const appeal = await store.mutate((state) => {
      const item = state.moderationAppeals.find((candidate) => candidate.id === request.params.id && candidate.roomId === request.params.roomId && candidate.status === "pending");
      if (!item) return null;
      Object.assign(item, { status: decision, resolution: cleanText(request.body?.resolution, 500), resolvedAt: nowIso(), resolvedBy: request.nexora.user.id });
      if (decision === "accepted") {
        state.roomBans = state.roomBans.filter((ban) => !(ban.roomId === item.roomId && ban.userId === item.userId));
        const member = state.roomMembers.find((candidate) => candidate.roomId === item.roomId && candidate.userId === item.userId);
        if (member) member.restrictedUntil = null;
      }
      addNotification(state, item.userId, `moderation.appeal.${decision}`, { roomId: item.roomId, appealId: item.id });
      appendEvent(state, { type: `room.appeal.${decision}`, actorId: request.nexora.user.id, roomId: item.roomId, userIds: [item.userId], payload: { appealId: item.id } });
      return item;
    });
    if (!appeal) return fail(response, 404, "Апелляция не найдена.", "NOT_FOUND");
    io.emit("data:refresh"); response.json({ ok: true, appeal });
  });

  app.post("/api/rooms/:roomId/roles", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const name = cleanLine(request.body?.name, 48);
    const permissions = [...new Set((Array.isArray(request.body?.permissions) ? request.body.permissions : []).filter((item) => ROLE_PERMISSIONS.has(item)))];
    if (name.length < 2) return fail(response, 400, "Название роли слишком короткое.", "ROLE_INVALID");
    const role = await store.mutate((draft) => {
      const item = { id: crypto.randomUUID(), roomId: request.params.roomId, name, color: /^#[0-9a-f]{6}$/i.test(request.body?.color) ? request.body.color : "#9c6cff", permissions, createdBy: request.nexora.user.id, createdAt: nowIso() };
      draft.customRoles.push(item); return item;
    });
    response.status(201).json({ ok: true, role });
  });

  app.patch("/api/rooms/:roomId/members/:userId/custom-roles", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const roleIds = [...new Set((Array.isArray(request.body?.roleIds) ? request.body.roleIds : []).map(String))];
    const updated = await store.mutate((draft) => {
      const valid = new Set(draft.customRoles.filter((role) => role.roomId === request.params.roomId).map((role) => role.id));
      if (roleIds.some((id) => !valid.has(id))) return false;
      const member = draft.roomMembers.find((item) => item.roomId === request.params.roomId && item.userId === request.params.userId);
      if (!member) return false;
      member.customRoleIds = roleIds; return true;
    });
    if (!updated) return fail(response, 404, "Участник или роль не найдены.", "NOT_FOUND");
    io.emit("data:refresh"); response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/categories", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const name = cleanLine(request.body?.name, 56);
    if (name.length < 2) return fail(response, 400, "Название категории слишком короткое.", "CATEGORY_INVALID");
    const category = await store.mutate((draft) => {
      const item = { id: crypto.randomUUID(), roomId: request.params.roomId, name, position: Math.max(0, Number(request.body?.position) || 0), createdAt: nowIso() };
      draft.roomCategories.push(item);
      const room = draft.rooms.find((candidate) => candidate.id === request.params.roomId); if (room) room.categoryId = item.id;
      return item;
    });
    response.status(201).json({ ok: true, category });
  });

  app.get("/api/rooms/:roomId/integrations", authRequired, (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    response.json({ ok: true,
      bots: state.botAccounts.filter((item) => item.roomId === request.params.roomId && !item.disabledAt).map((item) => ({
        ...item, user: publicUser(findUser(state, item.userId)),
        tokens: state.apiTokens.filter((token) => token.botId === item.id).map(({ tokenHash, ...token }) => token),
      })),
      webhooks: state.webhooks.filter((item) => item.roomId === request.params.roomId && item.enabled !== false).map(({ secretCiphertext, ...item }) => item),
      audit: state.integrationAudit.filter((item) => item.details?.roomId === request.params.roomId).slice(-100).reverse(),
    });
  });

  app.post("/api/rooms/:roomId/bots", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const displayName = cleanLine(request.body?.displayName, 48);
    if (displayName.length < 2) return fail(response, 400, "Имя бота слишком короткое.", "BOT_INVALID");
    const result = await store.mutate((draft) => {
      let username = cleanLine(request.body?.username, 24).toLowerCase().replace(/[^a-z0-9_.-]/g, "");
      if (!/^[a-z0-9_.-]{3,24}$/.test(username)) username = `bot_${crypto.randomBytes(5).toString("hex")}`;
      while (draft.users.some((user) => user.username === username)) username = `bot_${crypto.randomBytes(5).toString("hex")}`;
      const user = { id: crypto.randomUUID(), username, displayName, status: "Бот", bio: cleanText(request.body?.description, 240), profileColor: "amethyst", avatarFrame: "none", plusBadgeVisible: false, avatarFileId: null, notificationSound: "none", passwordSalt: crypto.randomBytes(16).toString("base64url"), passwordHash: crypto.randomBytes(32).toString("base64url"), role: "user", isBot: true, createdAt: nowIso(), disabledAt: null };
      const bot = { id: crypto.randomUUID(), roomId: request.params.roomId, userId: user.id, ownerId: request.nexora.user.id, description: user.bio, createdAt: nowIso(), disabledAt: null };
      draft.users.push(user); draft.botAccounts.push(bot);
      draft.roomMembers.push({ roomId: request.params.roomId, userId: user.id, role: "member", customRoleIds: [], joinedAt: nowIso() });
      auditIntegration(draft, request.nexora.user.id, "bot.created", { roomId: request.params.roomId, botId: bot.id });
      return { bot, user };
    });
    io.emit("data:refresh"); response.status(201).json({ ok: true, bot: { ...result.bot, user: publicUser(result.user) } });
  });

  app.delete("/api/rooms/:roomId/bots/:id", authRequired, async (request, response) => {
    const snapshot = store.read();
    if (!roomAuthority(snapshot, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const changed = await store.mutate((state) => {
      const bot = state.botAccounts.find((item) => item.id === request.params.id && item.roomId === request.params.roomId && !item.disabledAt);
      if (!bot) return false;
      bot.disabledAt = nowIso();
      for (const token of state.apiTokens.filter((item) => item.botId === bot.id && !item.revokedAt)) token.revokedAt = bot.disabledAt;
      const user = findUser(state, bot.userId); if (user) user.disabledAt = bot.disabledAt;
      state.roomMembers = state.roomMembers.filter((item) => !(item.roomId === bot.roomId && item.userId === bot.userId));
      auditIntegration(state, request.nexora.user.id, "bot.disabled", { roomId: bot.roomId, botId: bot.id });
      return true;
    });
    if (!changed) return fail(response, 404, "Бот не найден.", "NOT_FOUND");
    io.emit("data:refresh"); response.json({ ok: true });
  });

  app.post("/api/bots/:id/tokens", authRequired, async (request, response) => {
    const state = store.read();
    const bot = state.botAccounts.find((item) => item.id === request.params.id && !item.disabledAt);
    if (!bot || !roomAuthority(state, bot.roomId, request.nexora.user.id, true)) return fail(response, 403, "Управление ботом недоступно.", "FORBIDDEN");
    const scopes = [...new Set((Array.isArray(request.body?.scopes) ? request.body.scopes : ["messages:write"]).filter((item) => BOT_SCOPES.has(item)))];
    const raw = `nxa_${crypto.randomBytes(32).toString("base64url")}`;
    const token = await store.mutate((draft) => {
      const item = { id: crypto.randomUUID(), botId: bot.id, tokenHash: hashToken(raw), name: cleanLine(request.body?.name, 80) || "API token", scopes, createdBy: request.nexora.user.id, createdAt: nowIso(), expiresAt: request.body?.expiresAt && Number.isFinite(Date.parse(request.body.expiresAt)) ? new Date(request.body.expiresAt).toISOString() : null, revokedAt: null, lastUsedAt: null };
      draft.apiTokens.push(item); auditIntegration(draft, request.nexora.user.id, "token.created", { roomId: bot.roomId, botId: bot.id, tokenId: item.id, scopes }); return item;
    });
    response.status(201).json({ ok: true, token: { id: token.id, name: token.name, scopes: token.scopes, expiresAt: token.expiresAt, value: raw } });
  });

  app.delete("/api/bots/:botId/tokens/:id", authRequired, async (request, response) => {
    const state = store.read();
    const bot = state.botAccounts.find((item) => item.id === request.params.botId);
    if (!bot || !roomAuthority(state, bot.roomId, request.nexora.user.id, true)) return fail(response, 403, "Управление ботом недоступно.", "FORBIDDEN");
    const changed = await store.mutate((draft) => { const token = draft.apiTokens.find((item) => item.id === request.params.id && item.botId === bot.id); if (!token) return false; token.revokedAt ||= nowIso(); return true; });
    if (!changed) return fail(response, 404, "Токен не найден.", "NOT_FOUND");
    response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/webhooks", authRequired, async (request, response) => {
    const state = store.read();
    if (!roomAuthority(state, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    try { await publicWebhookTarget(request.body?.url); } catch (error) { return fail(response, 400, "Webhook должен вести на публичный HTTPS-адрес.", error.message); }
    const secret = crypto.randomBytes(32).toString("base64url");
    const webhook = await store.mutate((draft) => {
      const item = { id: crypto.randomUUID(), roomId: request.params.roomId, name: cleanLine(request.body?.name, 80) || "Webhook", url: String(request.body.url), events: [...new Set((Array.isArray(request.body?.events) ? request.body.events : ["message.created"]).map((item) => cleanLine(item, 80)).slice(0, 20))], secretCiphertext: secretService.encrypt(secret), enabled: true, createdBy: request.nexora.user.id, createdAt: nowIso(), lastDeliveredAt: null, lastError: null };
      draft.webhooks.push(item); auditIntegration(draft, request.nexora.user.id, "webhook.created", { roomId: item.roomId, webhookId: item.id }); return item;
    });
    const { secretCiphertext, ...view } = webhook;
    response.status(201).json({ ok: true, webhook: view, signingSecret: secret });
  });

  app.delete("/api/rooms/:roomId/webhooks/:id", authRequired, async (request, response) => {
    const snapshot = store.read();
    if (!roomAuthority(snapshot, request.params.roomId, request.nexora.user.id, true)) return fail(response, 403, "Недостаточно прав.", "FORBIDDEN");
    const changed = await store.mutate((state) => {
      const webhook = state.webhooks.find((item) => item.id === request.params.id && item.roomId === request.params.roomId && item.enabled !== false);
      if (!webhook) return false;
      webhook.enabled = false; webhook.disabledAt = nowIso();
      auditIntegration(state, request.nexora.user.id, "webhook.disabled", { roomId: webhook.roomId, webhookId: webhook.id });
      return true;
    });
    if (!changed) return fail(response, 404, "Webhook не найден.", "NOT_FOUND");
    response.json({ ok: true });
  });

  function botAuthentication(request, response, next) {
    const raw = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!raw?.startsWith("nxa_")) return fail(response, 401, "Нужен API-токен бота.", "BOT_UNAUTHORIZED");
    const state = store.read();
    const token = state.apiTokens.find((item) => item.tokenHash === hashToken(raw) && !item.revokedAt && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
    const bot = token ? state.botAccounts.find((item) => item.id === token.botId && !item.disabledAt) : null;
    const user = bot ? findUser(state, bot.userId) : null;
    if (!token || !bot || !user) return fail(response, 401, "API-токен недействителен.", "BOT_UNAUTHORIZED");
    const recent = (tokenRate.get(token.id) || []).filter((value) => Date.now() - value < 60_000);
    if (recent.length >= 60) return fail(response, 429, "Лимит API-токена исчерпан.", "BOT_RATE_LIMIT");
    recent.push(Date.now()); tokenRate.set(token.id, recent);
    request.nexoraBot = { token, bot, user };
    next();
  }

  app.get("/api/v3/bot/me", botAuthentication, (request, response) => response.json({ ok: true, bot: { ...request.nexoraBot.bot, user: publicUser(request.nexoraBot.user) }, scopes: request.nexoraBot.token.scopes }));
  app.post("/api/v3/bot/messages", botAuthentication, async (request, response) => {
    if (!request.nexoraBot.token.scopes.includes("messages:write")) return fail(response, 403, "Токен не имеет messages:write.", "BOT_SCOPE_REQUIRED");
    const state = store.read();
    const conversation = findConversation(state, cleanLine(request.body?.conversationId, 64));
    if (!conversation || conversation.roomId !== request.nexoraBot.bot.roomId) return fail(response, 403, "Бот ограничен своей комнатой.", "BOT_ROOM_SCOPE");
    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Бот не имеет доверенного MLS-устройства и не может отправлять plaintext.", "E2EE_BOT_UNSUPPORTED");
    try {
      const result = await createTextMessage({ senderId: request.nexoraBot.user.id, conversationId: conversation.id, text: cleanText(request.body?.text), silent: Boolean(request.body?.silent), clientId: cleanLine(request.body?.clientId, 64) || `bot_${crypto.randomUUID()}` });
      emitMessage(result);
      await store.mutate((draft) => { const token = draft.apiTokens.find((item) => item.id === request.nexoraBot.token.id); if (token) token.lastUsedAt = nowIso(); auditIntegration(draft, request.nexoraBot.user.id, "bot.message", { roomId: conversation.roomId, botId: request.nexoraBot.bot.id, messageId: result.message.id }); });
      response.status(201).json({ ok: true, message: serializeMessage(store.read(), result.message, request.nexoraBot.user.id) });
    } catch (error) { fail(response, 400, error.message || "Сообщение не отправлено.", error.code || "BOT_MESSAGE_FAILED"); }
  });

  app.post("/api/conversations/:id/uploads", authRequired, async (request, response) => {
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    const size = Math.max(0, Number(request.body?.size) || 0);
    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");
    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Вложения в MLS-диалоге должны быть зашифрованы на клиенте.", "E2EE_ATTACHMENT_REQUIRED");
    if (!Number.isSafeInteger(size) || size < 1 || size > maxFileBytes) return fail(response, 413, "Файл превышает лимит.", "FILE_TOO_LARGE");
    if (size > store.stats().remainingBytes) return fail(response, 507, "Недостаточно места на сервере.", "STORAGE_QUOTA");
    const kind = ["file", "image", "voice"].includes(request.body?.kind) ? request.body.kind : "file";
    const posting = roomPostingError(state, conversation, request.nexora.user.id, kind === "voice" ? "voice" : "file");
    if (posting) return fail(response, 403, posting.message, posting.code);
    const id = crypto.randomUUID();
    const tempName = `upload-${id}.part`;
    await fs.writeFile(path.join(incomingDir, tempName), Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    const upload = await store.mutate((draft) => {
      const item = { id, userId: request.nexora.user.id, conversationId: conversation.id, originalName: path.basename(cleanLine(request.body?.name, 180) || "file"), mimeType: cleanLine(request.body?.mimeType, 120) || "application/octet-stream", kind, size, chunkSize: CHUNK_BYTES, totalChunks: Math.ceil(size / CHUNK_BYTES), receivedChunks: [], tempName, status: "uploading", createdAt: nowIso(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
      draft.uploadSessions.push(item); return item;
    });
    response.status(201).json({ ok: true, upload: { id: upload.id, chunkSize: upload.chunkSize, totalChunks: upload.totalChunks, receivedChunks: [] } });
  });

  app.get("/api/uploads/:id", authRequired, (request, response) => {
    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id));
    if (!upload) return fail(response, 404, "Загрузка не найдена.", "NOT_FOUND");
    response.json({ ok: true, upload: { id: upload.id, status: upload.status, size: upload.size, chunkSize: upload.chunkSize, totalChunks: upload.totalChunks, receivedChunks: upload.receivedChunks, expiresAt: upload.expiresAt } });
  });

  app.put("/api/uploads/:id/chunks/:index", authRequired, express.raw({ type: "application/octet-stream", limit: CHUNK_BYTES + 1024 }), async (request, response) => {
    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id && item.status === "uploading"));
    if (upload && conversationUsesMls(upload.conversationId)) return fail(response, 409, "Загрузка отменена: диалог переведён на MLS E2EE.", "E2EE_ATTACHMENT_REQUIRED");
    const index = Number(request.params.index);
    if (!upload || !Number.isInteger(index) || index < 0 || index >= upload.totalChunks) return fail(response, 404, "Сессия или часть не найдены.", "UPLOAD_CHUNK_INVALID");
    const expected = index === upload.totalChunks - 1 ? upload.size - index * upload.chunkSize : upload.chunkSize;
    if (!Buffer.isBuffer(request.body) || request.body.length !== expected) return fail(response, 400, "Размер части не совпадает.", "UPLOAD_CHUNK_SIZE");
    const expectedHash = cleanLine(request.headers["x-chunk-sha256"], 64).toLowerCase();
    const actualHash = crypto.createHash("sha256").update(request.body).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) return fail(response, 400, "Для части требуется SHA-256.", "UPLOAD_CHUNK_HASH_REQUIRED");
    if (expectedHash !== actualHash) return fail(response, 409, "Контрольная сумма части не совпадает.", "UPLOAD_CHUNK_HASH");
    await maintenance.withFileLock(async () => {
      const handle = await fs.open(path.join(incomingDir, upload.tempName), "r+");
      try { await handle.write(request.body, 0, request.body.length, index * upload.chunkSize); await handle.sync(); } finally { await handle.close(); }
      await store.mutate((state) => {
        const current = state.uploadSessions.find((item) => item.id === upload.id && item.status === "uploading");
        if (current && !current.receivedChunks.includes(index)) current.receivedChunks.push(index);
      });
    });
    response.json({ ok: true, index, sha256: actualHash });
  });

  app.post("/api/uploads/:id/complete", authRequired, async (request, response) => maintenance.withFileLock(async () => {
    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id && item.status === "uploading"));
    if (upload && conversationUsesMls(upload.conversationId)) {
      await fs.rm(path.join(incomingDir, upload.tempName), { force: true });
      await store.mutate((state) => { const current = state.uploadSessions.find((item) => item.id === upload.id); if (current) current.status = "cancelled"; });
      return fail(response, 409, "Загрузка отменена: диалог переведён на MLS E2EE.", "E2EE_ATTACHMENT_REQUIRED");
    }
    if (!upload || upload.receivedChunks.length !== upload.totalChunks || !Array.from({ length: upload.totalChunks }, (_, index) => index).every((index) => upload.receivedChunks.includes(index))) return fail(response, 409, "Получены не все части файла.", "UPLOAD_INCOMPLETE");
    const temporaryPath = path.join(incomingDir, upload.tempName);
    const stat = await fs.stat(temporaryPath);
    if (stat.size !== upload.size) return fail(response, 409, "Итоговый размер файла не совпадает.", "UPLOAD_SIZE_MISMATCH");
    const handle = await fs.open(temporaryPath, "r"); const head = Buffer.alloc(Math.min(32, upload.size));
    try { await handle.read(head, 0, head.length, 0); } finally { await handle.close(); }
    const mimeType = sniffMime(head, upload.mimeType);
    if (upload.kind === "image" && !mimeType.startsWith("image/")) return fail(response, 415, "Содержимое не является изображением.", "FILE_TYPE_MISMATCH");
    if (upload.kind === "voice" && !mimeType.startsWith("audio/")) return fail(response, 415, "Содержимое не является аудио.", "FILE_TYPE_MISMATCH");
    const storedName = `${crypto.randomUUID()}${path.extname(upload.originalName).slice(0, 12)}`;
    const finalPath = path.join(uploadsDir, storedName);
    await fs.rename(temporaryPath, finalPath);
    let result;
    try {
      result = await store.mutate((state) => {
        const current = state.uploadSessions.find((item) => item.id === upload.id && item.status === "uploading");
        const conversation = findConversation(state, upload.conversationId);
        if (!current || !canAccessConversation(state, conversation, upload.userId)) throw new Error("UPLOAD_SESSION_INVALID");
        const createdAt = nowIso();
        const file = { id: crypto.randomUUID(), conversationId: conversation.id, uploaderId: upload.userId, originalName: upload.originalName, storedName, mimeType, size: upload.size, kind: upload.kind, duration: null, waveform: [], createdAt, deletedAt: null };
        const message = { id: crypto.randomUUID(), conversationId: conversation.id, senderId: upload.userId, type: upload.kind, text: cleanText(request.body?.caption, 500), fileId: file.id, replyToId: null, forwardedFromId: null, forwardedSnapshot: null, clientId: null, createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null };
        state.files.push(file); state.messages.push(message); Object.assign(current, { status: "complete", fileId: file.id, messageId: message.id, completedAt: createdAt });
        const event = appendEvent(state, { type: "message.created", actorId: upload.userId, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id, type: message.type } });
        return { message, conversation, event };
      });
    } catch (error) { await fs.rename(finalPath, temporaryPath).catch(() => {}); throw error; }
    emitMessage(result); dispatchEvent(result.event).catch(() => {});
    response.status(201).json({ ok: true, message: serializeMessage(store.read(), result.message, upload.userId) });
  }));

  app.delete("/api/uploads/:id", authRequired, async (request, response) => {
    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id));
    if (!upload) return fail(response, 404, "Загрузка не найдена.", "NOT_FOUND");
    await maintenance.withFileLock(async () => {
      await fs.rm(path.join(incomingDir, upload.tempName), { force: true });
      await store.mutate((state) => { const current = state.uploadSessions.find((item) => item.id === upload.id); if (current && current.status === "uploading") current.status = "cancelled"; });
    });
    response.json({ ok: true });
  });

  app.patch("/api/admin/runtime", authRequired, serverAdminRequired, async (request, response) => {
    const settings = await store.mutate((state) => {
      if (request.body?.emergencyReadOnly != null) state.settings.emergencyReadOnly = Boolean(request.body.emergencyReadOnly);
      if (request.body?.updateChannel != null && ["stable", "preview"].includes(request.body.updateChannel)) state.settings.updateChannel = request.body.updateChannel;
      appendEvent(state, { type: "server.runtime.updated", actorId: request.nexora.user.id, global: true, payload: { emergencyReadOnly: state.settings.emergencyReadOnly, updateChannel: state.settings.updateChannel } });
      return { emergencyReadOnly: state.settings.emergencyReadOnly, updateChannel: state.settings.updateChannel };
    });
    log(`Режим сервера обновлён: readOnly=${settings.emergencyReadOnly}, channel=${settings.updateChannel}`);
    io.emit("data:refresh"); response.json({ ok: true, settings });
  });

  app.get("/api/admin/metrics", authRequired, serverAdminRequired, (_request, response) => {
    const state = store.read(); const stats = store.stats();
    response.json({ ok: true, metrics: { ...stats, onlineSockets: io.engine.clientsCount, scheduledPending: state.scheduledMessages.filter((item) => item.status === "pending").length, reportsPending: state.roomReports.filter((item) => item.status === "pending").length, activeBots: state.botAccounts.filter((item) => !item.disabledAt).length, webhookFailures: state.webhooks.filter((item) => item.lastError).length, eventSequence: state.meta.lastEventSequence, emergencyReadOnly: state.settings.emergencyReadOnly, updateChannel: state.settings.updateChannel } });
  });

  const timer = setInterval(() => processScheduled().catch((error) => log(`Отложенная отправка: ${error.message}`, "error")), 1_000);
  timer.unref?.();
  return { stop: () => clearInterval(timer), dispatchEvent, processScheduled, activeRoomInvite };
}

module.exports = { BOT_SCOPES, CHUNK_BYTES, ROLE_PERMISSIONS, activeRoomInvite, mountV3Features, privateAddress, sniffMime };
