"use strict";

const crypto = require("node:crypto");
const { claimE2eeAttachment } = require("./e2ee-attachments.cjs");
const { addNotification, appendEvent } = require("./events.cjs");
const {
  canAccessConversation,
  canModerateConversation,
  dmPeer,
  findConversation,
  findUser,
  isBlockedEither,
  isRoomBanned,
  roomPermission,
  roomRole,
  serializeMessage,
} = require("./model.cjs");
const { TrustCoreError } = require("./trust-core.cjs");

function userRoom(userId) { return `user:${userId}`; }

function usersForConversation(state, conversation) {
  if (conversation.type === "dm") return conversation.userIds;
  return state.roomMembers.filter((member) => member.roomId === conversation.roomId).map((member) => member.userId);
}

function createRateLimiter({ windowMs = 5_000, limit = 12 } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const current = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (current.length >= limit) return false;
    current.push(now);
    buckets.set(key, current);
    return true;
  };
}

function cleanId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(text) ? text : null;
}

function postingError(state, conversation, userId) {
  if (!conversation || !canAccessConversation(state, conversation, userId)) return { code: "FORBIDDEN", message: "Чат недоступен." };
  if (conversation.type === "dm") {
    const peer = dmPeer(state, conversation, userId);
    if (peer && isBlockedEither(state, userId, peer.id)) return { code: "CONTACT_BLOCKED", message: "Отправка недоступна из-за блокировки." };
    return null;
  }
  if (isRoomBanned(state, conversation.roomId, userId)) return { code: "ROOM_BANNED", message: "Вы заблокированы в комнате." };
  const room = state.rooms.find((item) => item.id === conversation.roomId);
  const member = state.roomMembers.find((item) => item.roomId === conversation.roomId && item.userId === userId);
  if (!room || !member) return { code: "FORBIDDEN", message: "Комната недоступна." };
  const moderator = canModerateConversation(state, conversation, userId) || roomPermission(state, conversation.roomId, userId, "room.send_messages");
  if (room.readOnly && !["owner", "moderator"].includes(member.role) && findUser(state, userId)?.role !== "server_admin") {
    return { code: "ROOM_READ_ONLY", message: "Комната работает только для чтения." };
  }
  if (room.announcementOnly && !["owner", "moderator"].includes(member.role) && findUser(state, userId)?.role !== "server_admin") {
    return { code: "ROOM_ANNOUNCEMENT_ONLY", message: "Публиковать могут только модераторы." };
  }
  if (member.restrictedUntil && Date.parse(member.restrictedUntil) > Date.now()) {
    return { code: "ROOM_MEMBER_RESTRICTED", message: "Отправка временно ограничена.", retryAfter: Math.ceil((Date.parse(member.restrictedUntil) - Date.now()) / 1000) };
  }
  if (room.preapproveMessages && !moderator) {
    return { code: "E2EE_PREAPPROVAL_UNSUPPORTED", message: "Предварительная модерация несовместима с E2EE: сервер не видит содержимое." };
  }
  const slowSeconds = Number(room.slowModeSeconds || 0);
  if (slowSeconds > 0 && !["owner", "moderator"].includes(member.role) && findUser(state, userId)?.role !== "server_admin") {
    const last = state.messages.filter((message) => message.conversationId === conversation.id && message.senderId === userId && !message.deletedAt)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    const retryAfter = last ? Math.ceil((Date.parse(last.createdAt) + slowSeconds * 1000 - Date.now()) / 1000) : 0;
    if (retryAfter > 0) return { code: "ROOM_SLOW_MODE", message: `Медленный режим: повторите через ${retryAfter} сек.`, retryAfter };
  }
  return null;
}

function mountMlsTransport({ io, store, trustCore, dispatchEvent = () => {}, log = () => {} } = {}) {
  if (!io || !store || !trustCore) throw new Error("MLS transport requires io, store and trustCore.");
  const messageRate = createRateLimiter({ windowMs: 5_000, limit: 12 });

  function emitMessage(result, eventName = "message:new") {
    const state = store.read();
    const recipients = usersForConversation(state, result.conversation);
    for (const participantId of recipients) {
      io.to(userRoom(participantId)).emit(eventName, serializeMessage(state, result.message, participantId));
      io.to(userRoom(participantId)).emit("data:refresh");
    }
  }

  io.on("connection", (socket) => {
    const user = socket.data.user;
    if (!user) return;

    socket.on("mls:message", async (payload, acknowledge = () => {}) => {
      if (!messageRate(`${user.id}:${socket.id}`)) return acknowledge({ ok: false, code: "RATE_LIMITED", error: "Слишком много сообщений. Сделайте паузу." });
      const conversationId = cleanId(payload?.conversationId);
      const clientId = cleanId(payload?.clientId);
      const deviceId = cleanId(payload?.deviceId);
      const contentType = String(payload?.contentType || "text");
      const attachmentId = payload?.attachmentId ? cleanId(payload.attachmentId) : null;
      const attachmentShapeValid = contentType === "attachment" ? Boolean(attachmentId) : contentType === "text" && !attachmentId;
      if (!conversationId || !clientId || !deviceId || !attachmentShapeValid) {
        return acknowledge({ ok: false, code: "MLS_ENVELOPE_INVALID", error: "MLS envelope содержит неверные идентификаторы или attachment binding." });
      }

      const initial = store.read();
      const conversation = findConversation(initial, conversationId);
      const posting = postingError(initial, conversation, user.id);
      if (posting) return acknowledge({ ok: false, ...posting, error: posting.message });
      const existing = initial.messages.find((message) => message.senderId === user.id && message.clientId === clientId);
      if (existing) {
        if ((existing.fileId || null) !== (attachmentId || null)) return acknowledge({ ok: false, code: "MLS_CLIENT_ID_CONFLICT", error: "Client ID уже связан с другим attachment." });
        return acknowledge({ ok: true, duplicate: true, message: serializeMessage(initial, existing, user.id) });
      }

      let reservation;
      try {
        reservation = trustCore.reserveMessage({
          groupRecordId: payload?.groupRecordId,
          conversationId,
          epoch: payload?.epoch,
          senderUserId: user.id,
          senderDeviceId: deviceId,
          message: payload?.message,
          authenticatedDataHash: payload?.authenticatedDataHash,
          generation: payload?.generation,
        });
        const result = await store.mutate((state) => {
          const freshConversation = findConversation(state, conversationId);
          const freshPosting = postingError(state, freshConversation, user.id);
          if (freshPosting) throw Object.assign(new Error(freshPosting.message), freshPosting);
          const duplicate = state.messages.find((message) => message.senderId === user.id && message.clientId === clientId);
          if (duplicate) {
            if ((duplicate.fileId || null) !== (attachmentId || null)) throw Object.assign(new Error("Client ID уже связан с другим attachment."), { code: "MLS_CLIENT_ID_CONFLICT", status: 409 });
            return { message: duplicate, conversation: freshConversation, duplicate: true, event: null };
          }
          const createdAt = new Date().toISOString();
          const messageId = crypto.randomUUID();
          const file = attachmentId ? claimE2eeAttachment(state, {
            attachmentId,
            conversationId,
            uploaderId: user.id,
            messageId,
            claimedAt: createdAt,
          }) : null;
          const message = {
            id: messageId,
            conversationId,
            senderId: user.id,
            type: "encrypted",
            encryptedContentType: contentType,
            text: "",
            fileId: file?.id || null,
            replyToId: null,
            threadRootId: null,
            forwardedFromId: null,
            forwardedSnapshot: null,
            clientId,
            silent: Boolean(payload?.silent),
            mentions: [],
            pendingApproval: false,
            mlsEnvelope: reservation,
            createdAt,
            updatedAt: null,
            deletedAt: null,
            pinnedAt: null,
            pinnedBy: null,
          };
          state.messages.push(message);
          const recipients = usersForConversation(state, freshConversation);
          if (!message.silent) {
            for (const recipientId of recipients.filter((id) => id !== user.id)) {
              addNotification(state, recipientId, "message.encrypted", { conversationId, messageId: message.id, senderId: user.id, hasAttachment: Boolean(file) });
            }
          }
          const event = appendEvent(state, {
            type: "message.created",
            actorId: user.id,
            conversationId,
            roomId: freshConversation.roomId,
            payload: { messageId: message.id, type: "encrypted", epoch: reservation.epoch, messageHash: reservation.messageHash, attachmentId: file?.id || null },
          });
          return { message, conversation: freshConversation, duplicate: false, event };
        });
        if (result.duplicate) {
          trustCore.releaseMessage(reservation.messageHash);
          return acknowledge({ ok: true, duplicate: true, message: serializeMessage(store.read(), result.message, user.id) });
        }
        emitMessage(result);
        Promise.resolve(dispatchEvent(result.event)).catch(() => {});
        acknowledge({ ok: true, duplicate: false, message: serializeMessage(store.read(), result.message, user.id) });
      } catch (error) {
        if (reservation?.messageHash) trustCore.releaseMessage(reservation.messageHash);
        const known = error instanceof TrustCoreError || error?.code;
        if (!known) log(`MLS message failed: ${error.stack || error.message}`, "error");
        acknowledge({ ok: false, code: error.code || "MLS_MESSAGE_FAILED", error: error.message || "Защищённое сообщение не отправлено.", retryAfter: error.retryAfter, details: error.details || {} });
      }
    });

    socket.on("mls:message-edit", async (payload, acknowledge = () => {}) => {
      const messageId = cleanId(payload?.messageId);
      const deviceId = cleanId(payload?.deviceId);
      if (!messageId || !deviceId || String(payload?.contentType || "text") !== "text") return acknowledge({ ok: false, code: "MLS_ENVELOPE_INVALID", error: "MLS edit envelope недействителен." });
      const snapshot = store.read();
      const target = snapshot.messages.find((item) => item.id === messageId && item.senderId === user.id && item.type === "encrypted" && !item.deletedAt && !item.fileId);
      const conversation = findConversation(snapshot, target?.conversationId);
      if (!target || !conversation || !canAccessConversation(snapshot, conversation, user.id)) return acknowledge({ ok: false, code: "FORBIDDEN", error: "Редактирование недоступно." });

      let reservation;
      try {
        reservation = trustCore.reserveMessage({
          groupRecordId: payload?.groupRecordId,
          conversationId: conversation.id,
          epoch: payload?.epoch,
          senderUserId: user.id,
          senderDeviceId: deviceId,
          message: payload?.message,
          authenticatedDataHash: payload?.authenticatedDataHash,
          generation: payload?.generation,
        });
        const result = await store.mutate((state) => {
          const candidate = state.messages.find((item) => item.id === messageId && item.senderId === user.id && item.type === "encrypted" && !item.deletedAt && !item.fileId);
          if (!candidate) throw Object.assign(new Error("Редактирование недоступно."), { code: "FORBIDDEN" });
          state.messageEdits.push({
            id: crypto.randomUUID(), messageId: candidate.id, editorId: user.id,
            previousText: "", previousMlsEnvelope: candidate.mlsEnvelope, createdAt: new Date().toISOString(),
          });
          candidate.mlsEnvelope = reservation;
          candidate.encryptedContentType = "text";
          candidate.updatedAt = new Date().toISOString();
          const currentConversation = findConversation(state, candidate.conversationId);
          const event = appendEvent(state, {
            type: "message.edited", actorId: user.id, conversationId: currentConversation.id, roomId: currentConversation.roomId,
            payload: { messageId: candidate.id, encrypted: true, epoch: reservation.epoch, messageHash: reservation.messageHash },
          });
          return { message: candidate, conversation: currentConversation, event };
        });
        emitMessage(result, "message:updated");
        Promise.resolve(dispatchEvent(result.event)).catch(() => {});
        acknowledge({ ok: true, message: serializeMessage(store.read(), result.message, user.id) });
      } catch (error) {
        if (reservation?.messageHash) trustCore.releaseMessage(reservation.messageHash);
        acknowledge({ ok: false, code: error.code || "MLS_EDIT_FAILED", error: error.message || "Редактирование недоступно.", details: error.details || {} });
      }
    });
  });

  log("MLS ciphertext transport mounted", "info");
  return { postingError, usersForConversation };
}

module.exports = { mountMlsTransport, postingError, usersForConversation };
