"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const express = require("express");

const {
  canAccessConversation,
  findConversation,
  isRoomBanned,
} = require("./model.cjs");
const { TrustCoreError } = require("./trust-core.cjs");
const { stableError } = require("./trust-routes.cjs");

const E2EE_ATTACHMENT_TTL_MS = 24 * 60 * 60_000;
const AES_GCM_TAG_BYTES = 16;
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function safeHashEqual(expected, actual) {
  if (!SHA256.test(expected) || !SHA256.test(actual)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

function publicAttachment(file) {
  return {
    id: file.id,
    size: Number(file.size),
    plaintextSize: Number(file.plaintextSize),
    ciphertextSha256: file.ciphertextSha256,
    url: `/api/files/${file.id}`,
    expiresAt: file.expiresAt,
    claimedAt: file.claimedAt || null,
  };
}

function requirePendingAttachment(state, { attachmentId, conversationId, uploaderId }) {
  const file = state.files.find((item) => item.id === attachmentId && item.kind === "encrypted" && !item.deletedAt);
  if (!file) throw new TrustCoreError("E2EE attachment не найден.", "E2EE_ATTACHMENT_NOT_FOUND", 404);
  if (file.conversationId !== String(conversationId) || file.uploaderId !== String(uploaderId)) {
    throw new TrustCoreError("E2EE attachment не соответствует отправителю или диалогу.", "E2EE_ATTACHMENT_SCOPE_INVALID", 403);
  }
  if (!file.pendingE2ee || file.claimedAt || file.messageId) {
    throw new TrustCoreError("E2EE attachment уже использован.", "E2EE_ATTACHMENT_ALREADY_CLAIMED", 409);
  }
  if (file.expiresAt && Date.parse(file.expiresAt) <= Date.now()) {
    throw new TrustCoreError("E2EE attachment истёк.", "E2EE_ATTACHMENT_EXPIRED", 410);
  }
  return file;
}

function claimE2eeAttachment(state, { attachmentId, conversationId, uploaderId, messageId, claimedAt = new Date().toISOString() }) {
  const file = requirePendingAttachment(state, { attachmentId, conversationId, uploaderId });
  file.pendingE2ee = false;
  file.claimedAt = claimedAt;
  file.messageId = String(messageId);
  return file;
}

function encryptedMediaAllowed(state, conversation) {
  if (conversation.type !== "room") return true;
  const room = state.rooms.find((item) => item.id === conversation.roomId);
  if (!room) return false;
  return room.allowFiles !== false && room.allowImages !== false && room.allowVoice !== false;
}

function createRateLimiter({ windowMs = 60_000, limit = 30 } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    buckets.set(key, recent);
    return true;
  };
}

function mountE2eeAttachmentRoutes({
  app,
  store,
  authRequired,
  dataDir,
  maxPlaintextBytes,
  postingError,
  log = () => {},
} = {}) {
  if (!app || !store || !authRequired || !dataDir || !maxPlaintextBytes || !postingError) {
    throw new Error("E2EE attachment routes require app, store, authRequired, dataDir, maxPlaintextBytes and postingError.");
  }
  const uploadsDir = path.join(dataDir, "uploads");
  const incomingDir = path.join(uploadsDir, ".incoming");
  const maxCiphertextBytes = Number(maxPlaintextBytes) + AES_GCM_TAG_BYTES;
  const uploadRate = createRateLimiter({ windowMs: 60_000, limit: 20 });

  async function cleanupExpired() {
    const now = Date.now();
    const expired = store.read((state) => state.files.filter((file) =>
      file.kind === "encrypted" && file.pendingE2ee && !file.claimedAt && file.expiresAt && Date.parse(file.expiresAt) <= now,
    ).map((file) => ({ id: file.id, storedName: file.storedName })));
    if (!expired.length) return 0;
    const ids = new Set(expired.map((item) => item.id));
    await store.mutate((state) => { state.files = state.files.filter((file) => !ids.has(file.id)); });
    await Promise.all(expired.map((file) => fs.rm(path.join(uploadsDir, file.storedName), { force: true })));
    return expired.length;
  }

  app.post(
    "/api/v4/e2ee/conversations/:conversationId/attachments",
    authRequired,
    express.raw({ type: "application/octet-stream", limit: maxCiphertextBytes }),
    async (request, response) => {
      const requestId = String(request.headers["x-request-id"] || crypto.randomUUID());
      response.setHeader("X-Request-ID", requestId);
      response.setHeader("Cache-Control", "no-store");
      try {
        const userId = request.trustAuth.user.id;
        if (!uploadRate(userId)) throw new TrustCoreError("Слишком много E2EE upload-запросов.", "RATE_LIMITED", 429);
        const attachmentId = String(request.headers["x-nexora-attachment-id"] || "").toLowerCase();
        const expectedHash = String(request.headers["x-nexora-ciphertext-sha256"] || "").toLowerCase();
        const plaintextSize = Number(request.headers["x-nexora-plaintext-size"]);
        if (!ATTACHMENT_ID.test(attachmentId)) throw new TrustCoreError("Неверный attachment ID.", "E2EE_ATTACHMENT_ID_INVALID", 400);
        if (!SHA256.test(expectedHash)) throw new TrustCoreError("Нужен SHA-256 ciphertext.", "E2EE_ATTACHMENT_HASH_REQUIRED", 400);
        if (!Number.isSafeInteger(plaintextSize) || plaintextSize < 1 || plaintextSize > maxPlaintextBytes) {
          throw new TrustCoreError("Размер plaintext attachment недопустим.", "E2EE_ATTACHMENT_SIZE_INVALID", 413);
        }
        if (!Buffer.isBuffer(request.body) || request.body.length !== plaintextSize + AES_GCM_TAG_BYTES) {
          throw new TrustCoreError("Размер AES-GCM ciphertext не соответствует plaintext size.", "E2EE_ATTACHMENT_CIPHERTEXT_SIZE_INVALID", 400);
        }
        const actualHash = crypto.createHash("sha256").update(request.body).digest("hex");
        if (!safeHashEqual(expectedHash, actualHash)) throw new TrustCoreError("SHA-256 ciphertext не совпадает.", "E2EE_ATTACHMENT_HASH_MISMATCH", 409);

        const state = store.read();
        const conversation = findConversation(state, request.params.conversationId);
        if (!conversation || !canAccessConversation(state, conversation, userId)) throw new TrustCoreError("Диалог не найден.", "RESOURCE_NOT_FOUND", 404);
        if (conversation.type === "room" && isRoomBanned(state, conversation.roomId, userId)) throw new TrustCoreError("Пользователь заблокирован в комнате.", "ROOM_BANNED", 403);
        if (!store.db.prepare("SELECT 1 FROM mls_groups WHERE conversation_id=? AND status='active'").get(conversation.id)) {
          throw new TrustCoreError("E2EE attachment разрешён только для активного MLS-диалога.", "E2EE_REQUIRED", 409);
        }
        const posting = postingError(state, conversation, userId);
        if (posting) throw new TrustCoreError(posting.message, posting.code, posting.code === "RATE_LIMITED" ? 429 : 403, { retryAfter: posting.retryAfter });
        if (!encryptedMediaAllowed(state, conversation)) {
          throw new TrustCoreError("В комнате ограничен один или несколько типов медиа; зашифрованные вложения блокируются fail-closed.", "E2EE_MEDIA_POLICY_RESTRICTED", 403);
        }

        const existing = state.files.find((file) => file.id === attachmentId && !file.deletedAt);
        if (existing) {
          if (existing.kind === "encrypted" && existing.conversationId === conversation.id && existing.uploaderId === userId
            && existing.ciphertextSha256 === actualHash && Number(existing.size) === request.body.length) {
            return response.status(200).json({ ok: true, duplicate: true, attachment: publicAttachment(existing) });
          }
          throw new TrustCoreError("Attachment ID уже используется другим payload.", "E2EE_ATTACHMENT_ID_CONFLICT", 409);
        }
        if (request.body.length > store.stats().remainingBytes) throw new TrustCoreError("Недостаточно места на сервере.", "STORAGE_QUOTA", 507);

        await fs.mkdir(incomingDir, { recursive: true });
        const temporaryName = `e2ee-${attachmentId}.part`;
        const storedName = `${attachmentId}.e2ee`;
        const temporaryPath = path.join(incomingDir, temporaryName);
        const finalPath = path.join(uploadsDir, storedName);
        await fs.writeFile(temporaryPath, request.body, { flag: "wx", mode: 0o600 });
        await fs.rename(temporaryPath, finalPath);
        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.parse(createdAt) + E2EE_ATTACHMENT_TTL_MS).toISOString();
        let file;
        try {
          file = await store.mutate((draft) => {
            const usedBytes = draft.files.filter((item) => !item.deletedAt).reduce((total, item) => total + Number(item.size || 0), 0);
            if (usedBytes + request.body.length > Number(draft.settings.storageQuotaBytes)) {
              throw Object.assign(new Error("STORAGE_QUOTA"), { code: "STORAGE_QUOTA" });
            }
            const item = {
              id: attachmentId,
              conversationId: conversation.id,
              uploaderId: userId,
              originalName: `e2ee-${attachmentId}.bin`,
              storedName,
              mimeType: "application/octet-stream",
              size: request.body.length,
              plaintextSize,
              kind: "encrypted",
              encrypted: true,
              ciphertextSha256: actualHash,
              pendingE2ee: true,
              claimedAt: null,
              messageId: null,
              expiresAt,
              duration: null,
              waveform: [],
              createdAt,
              deletedAt: null,
            };
            draft.files.push(item);
            return item;
          });
        } catch (error) {
          await fs.rm(finalPath, { force: true });
          if (error.code === "STORAGE_QUOTA") throw new TrustCoreError("Недостаточно места на сервере.", "STORAGE_QUOTA", 507);
          throw error;
        }
        response.status(201).json({ ok: true, duplicate: false, attachment: publicAttachment(file) });
      } catch (error) {
        if (!(error instanceof TrustCoreError)) log(`E2EE attachment upload failed: ${error.stack || error.message}`, "error");
        stableError(response, error, requestId);
      }
    },
  );

  app.delete("/api/v4/e2ee/attachments/:attachmentId", authRequired, async (request, response) => {
    const requestId = String(request.headers["x-request-id"] || crypto.randomUUID());
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("Cache-Control", "no-store");
    try {
      const attachmentId = String(request.params.attachmentId || "").toLowerCase();
      if (!ATTACHMENT_ID.test(attachmentId)) throw new TrustCoreError("Неверный attachment ID.", "E2EE_ATTACHMENT_ID_INVALID", 400);
      const userId = request.trustAuth.user.id;
      let removed = null;
      await store.mutate((state) => {
        const file = state.files.find((item) => item.id === attachmentId && item.kind === "encrypted" && !item.deletedAt);
        if (!file || file.uploaderId !== userId) throw new TrustCoreError("E2EE attachment не найден.", "E2EE_ATTACHMENT_NOT_FOUND", 404);
        if (!file.pendingE2ee || file.claimedAt || file.messageId) throw new TrustCoreError("Привязанный attachment нельзя отозвать отдельно от сообщения.", "E2EE_ATTACHMENT_ALREADY_CLAIMED", 409);
        removed = { storedName: file.storedName };
        state.files = state.files.filter((item) => item.id !== attachmentId);
      });
      await fs.rm(path.join(uploadsDir, removed.storedName), { force: true });
      response.json({ ok: true, deleted: true });
    } catch (error) {
      if (!(error instanceof TrustCoreError)) log(`E2EE attachment delete failed: ${error.stack || error.message}`, "error");
      stableError(response, error, requestId);
    }
  });

  log("E2EE opaque attachment API mounted", "info");
  return { cleanupExpired, uploadsDir };
}

module.exports = {
  AES_GCM_TAG_BYTES,
  E2EE_ATTACHMENT_TTL_MS,
  claimE2eeAttachment,
  encryptedMediaAllowed,
  mountE2eeAttachmentRoutes,
  publicAttachment,
  requirePendingAttachment,
};
