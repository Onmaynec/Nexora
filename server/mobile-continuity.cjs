"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const express = require("express");

const { appendEvent } = require("./events.cjs");
const { canAccessConversation, findConversation, serializeMessage } = require("./model.cjs");
const { sessionDeviceId } = require("./stable-core.cjs");

const SAFE_ID = /^[A-Za-z0-9_.:-]{8,160}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const CHUNK_BYTES = 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVE_UPLOAD_STATUSES = new Set(["active"]);
const EXECUTABLE_EXTENSIONS = new Set([".apk", ".app", ".bat", ".bin", ".cmd", ".com", ".cpl", ".dll", ".dmg", ".exe", ".hta", ".jar", ".js", ".jse", ".lnk", ".msi", ".msp", ".ps1", ".reg", ".scr", ".sh", ".vbs", ".vbe", ".wsf"]);

function nowIso() {
  return new Date().toISOString();
}

function cleanLine(value, max = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeFilename(value) {
  const cleaned = cleanLine(value, 180).replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");
  return cleaned || "file";
}

function requestId(value) {
  const candidate = String(value || "");
  return SAFE_ID.test(candidate) ? candidate : crypto.randomUUID();
}

function stableError(response, status, code, message, id, details = {}) {
  return response.status(status).json({ ok: false, code, message, error: message, requestId: id, details });
}

function currentAuth(request) {
  const auth = request.pulseAuth;
  if (!auth?.user || !auth?.session) throw Object.assign(new Error("Требуется действующая сессия."), { code: "AUTH_REQUIRED", status: 401 });
  return auth;
}

function parseTokenKey(value) {
  const source = String(value || "").trim();
  if (source.length < 32) return null;
  return crypto.createHash("sha256").update(source).digest();
}

function encryptSecret(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizePushSubscription(input, auth, serverId) {
  const provider = cleanLine(input?.provider, 16).toLowerCase();
  const token = String(input?.token || "").trim();
  const installationId = cleanLine(input?.installationId, 160);
  const previewPolicy = ["generic", "sender", "full"].includes(input?.previewPolicy) ? input.previewPolicy : "generic";
  if (!["webpush", "fcm", "apns"].includes(provider)) throw Object.assign(new Error("Неизвестный push provider."), { code: "VALIDATION_FAILED", status: 400 });
  if (!SAFE_ID.test(installationId)) throw Object.assign(new Error("Некорректный installationId."), { code: "VALIDATION_FAILED", status: 400 });
  if (token.length < 16 || token.length > 8_192) throw Object.assign(new Error("Push token имеет недопустимый размер."), { code: "PUSH_TOKEN_INVALID", status: 400 });
  return {
    provider,
    token,
    installationId,
    previewPolicy,
    userId: auth.user.id,
    deviceId: sessionDeviceId(auth.session),
    serverId,
  };
}

function quietHoursActive(preferences, date = new Date()) {
  const start = String(preferences?.quietHoursStart || "");
  const end = String(preferences?.quietHoursEnd || "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const from = startHour * 60 + startMinute;
  const until = endHour * 60 + endMinute;
  return from < until ? minutes >= from && minutes < until : minutes >= from || minutes < until;
}

function notificationAllowed(state, userId, conversationId, { mention = false, reply = false, silent = false, date = new Date() } = {}) {
  if (silent) return false;
  const user = state.users.find((item) => item.id === userId && !item.disabledAt);
  if (!user || quietHoursActive(user, date)) return false;
  const settings = state.conversationSettings.find((item) => item.userId === userId && item.conversationId === conversationId);
  if (settings?.muted || settings?.notificationMode === "none" || user.notificationMode === "none") return false;
  const mode = settings?.notificationMode || user.notificationMode || "all";
  return mode !== "mentions" || mention || reply;
}

function sniffMime(buffer, claimed = "") {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return /^audio\//i.test(claimed) ? "audio/webm" : "video/webm";
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return /^audio\//i.test(claimed) ? "audio/ogg" : "application/ogg";
  if (buffer.subarray(0, 4).toString("ascii") === "PK\u0003\u0004") return "application/zip";
  if (buffer.subarray(0, 2).toString("ascii") === "MZ" || buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return "application/x-executable";
  if (/^(?:image|audio)\//i.test(claimed)) return "application/octet-stream";
  return cleanLine(claimed, 120) || "application/octet-stream";
}

function postingError(state, conversation, userId, kind) {
  if (!conversation || !canAccessConversation(state, conversation, userId)) return { status: 403, code: "FORBIDDEN", message: "Чат недоступен." };
  if (conversation.type !== "room") return null;
  const room = state.rooms.find((item) => item.id === conversation.roomId);
  if (!room) return { status: 404, code: "RESOURCE_NOT_FOUND", message: "Комната не найдена." };
  if (room.readOnly) return { status: 403, code: "POLICY_RESTRICTED", message: "Комната работает только для чтения." };
  if (kind === "voice" && room.allowVoice === false) return { status: 403, code: "POLICY_RESTRICTED", message: "Голосовые сообщения запрещены настройками комнаты." };
  if (kind === "image" && (room.allowImages === false || room.allowFiles === false)) return { status: 403, code: "POLICY_RESTRICTED", message: "Изображения запрещены настройками комнаты." };
  if (kind === "file" && room.allowFiles === false) return { status: 403, code: "POLICY_RESTRICTED", message: "Файлы запрещены настройками комнаты." };
  return null;
}

function publicPush(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    serverId: row.server_id,
    installationId: row.installation_id,
    provider: row.provider,
    previewPolicy: row.preview_policy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    lastErrorCode: row.last_error_code,
  };
}

function publicUpload(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    name: row.original_name,
    claimedMime: row.claimed_mime,
    kind: row.kind,
    expectedSize: Number(row.expected_size),
    confirmedOffset: Number(row.confirmed_offset),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageId: row.message_id,
    errorCode: row.error_code,
  };
}

async function fileSha256(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.alloc(1024 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

function mountMobileContinuity({ app, store, io, authRequired, maintenance, dataDir, maxFileBytes, serverId, pushTokenKey, log = () => {} } = {}) {
  if (!app || !store?.db || !io || !authRequired || !maintenance || !dataDir || !serverId) {
    throw new Error("Mobile Continuity requires app, SQLite store, io, authRequired, maintenance, dataDir and serverId.");
  }
  const resumableDir = path.join(dataDir, "resumable-uploads");
  const uploadsDir = path.join(dataDir, "uploads");
  const tokenKey = parseTokenKey(pushTokenKey ?? process.env.NEXORA_PUSH_TOKEN_KEY);
  const chunkParser = express.raw({ type: "application/octet-stream", limit: CHUNK_BYTES });
  let cleanupTimer = null;
  let lastStatus = {
    enabled: true,
    schemaVersion: 9,
    activeUploads: 0,
    pushSubscriptions: 0,
    pushTokenKeyConfigured: Boolean(tokenKey),
    tokenPlaintextStored: false,
    closed: false,
  };

  function withRequestId(request, response, next) {
    request.mobileRequestId ||= request.pulseRequestId || requestId(request.headers["x-request-id"]);
    request.pulseRequestId ||= request.mobileRequestId;
    response.setHeader("X-Request-ID", request.mobileRequestId);
    response.setHeader("Cache-Control", "no-store");
    next();
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try {
        await handler(request, response);
      } catch (error) {
        const status = Number(error?.status || 500);
        const code = String(error?.code || "TEMPORARY_UNAVAILABLE");
        if (status >= 500) log(`Mobile Continuity ${request.mobileRequestId}: ${error.stack || error.message}`, "error");
        stableError(response, status, code, status >= 500 ? "Временная ошибка Local Server." : String(error?.message || "Операция не выполнена."), request.mobileRequestId, error?.details || {});
      }
    };
  }

  function ownedUpload(auth, sessionId) {
    if (!SAFE_ID.test(String(sessionId || ""))) throw Object.assign(new Error("Некорректный upload session id."), { code: "VALIDATION_FAILED", status: 400 });
    const row = store.db.prepare("SELECT * FROM mobile_upload_sessions WHERE id=? AND user_id=? AND device_id=?").get(sessionId, auth.user.id, sessionDeviceId(auth.session));
    if (!row) throw Object.assign(new Error("Upload session не найдена."), { code: "RESOURCE_NOT_FOUND", status: 404 });
    return row;
  }

  async function cleanupExpired() {
    const expired = store.db.prepare("SELECT id,temp_name FROM mobile_upload_sessions WHERE status='active' AND expires_at<=?").all(nowIso());
    if (!expired.length) return 0;
    store.db.exec("BEGIN IMMEDIATE");
    try {
      const update = store.db.prepare("UPDATE mobile_upload_sessions SET status='expired',error_code='UPLOAD_EXPIRED',updated_at=? WHERE id=? AND status='active'");
      for (const row of expired) update.run(nowIso(), row.id);
      store.db.exec("COMMIT");
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
    await Promise.allSettled(expired.map((row) => fs.unlink(path.join(resumableDir, row.temp_name))));
    return expired.length;
  }

  app.post("/api/v3/devices/push-subscriptions", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    if (!tokenKey) throw Object.assign(new Error("Push registration отключена: NEXORA_PUSH_TOKEN_KEY не настроен."), { code: "TEMPORARY_UNAVAILABLE", status: 503 });
    const idempotencyKey = String(request.headers["idempotency-key"] || "").trim();
    if (!SAFE_ID.test(idempotencyKey)) throw Object.assign(new Error("Требуется корректный Idempotency-Key."), { code: "VALIDATION_FAILED", status: 400 });
    const value = normalizePushSubscription(request.body, auth, serverId);
    const tokenHash = hashValue(value.token);
    const idempotencyHash = hashValue(`${auth.user.id}:${idempotencyKey}`);
    const existing = store.db.prepare("SELECT * FROM mobile_push_subscriptions WHERE user_id=? AND idempotency_key_hash=?").get(auth.user.id, idempotencyHash);
    if (existing) return response.json({ ok: true, requestId: request.mobileRequestId, duplicate: true, subscription: publicPush(existing) });

    const timestamp = nowIso();
    const id = crypto.randomUUID();
    const encrypted = encryptSecret(value.token, tokenKey);
    store.db.prepare(`
      INSERT INTO mobile_push_subscriptions(
        id,user_id,device_id,server_id,installation_id,provider,token_ciphertext,token_hash,
        idempotency_key_hash,preview_policy,created_at,updated_at,revoked_at,last_error_code
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)
      ON CONFLICT(user_id,device_id,server_id,installation_id,provider) DO UPDATE SET
        token_ciphertext=excluded.token_ciphertext,
        token_hash=excluded.token_hash,
        idempotency_key_hash=excluded.idempotency_key_hash,
        preview_policy=excluded.preview_policy,
        updated_at=excluded.updated_at,
        revoked_at=NULL,
        last_error_code=NULL
    `).run(id, value.userId, value.deviceId, value.serverId, value.installationId, value.provider, encrypted, tokenHash, idempotencyHash, value.previewPolicy, timestamp, timestamp);
    const saved = store.db.prepare("SELECT * FROM mobile_push_subscriptions WHERE user_id=? AND device_id=? AND server_id=? AND installation_id=? AND provider=?").get(value.userId, value.deviceId, value.serverId, value.installationId, value.provider);
    await store.mutate((state) => appendEvent(state, { type: "device.push_state", actorId: auth.user.id, userIds: [auth.user.id], payload: { subscriptionId: saved.id, deviceId: value.deviceId, state: "registered" } }));
    io.to(`user:${auth.user.id}`).emit("device.push_state", { id: saved.id, state: "registered", deviceId: value.deviceId });
    response.status(201).json({ ok: true, requestId: request.mobileRequestId, duplicate: false, subscription: publicPush(saved) });
  }));

  app.delete("/api/v3/devices/push-subscriptions/:id", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const id = String(request.params.id || "");
    if (!SAFE_ID.test(id)) throw Object.assign(new Error("Некорректный subscription id."), { code: "VALIDATION_FAILED", status: 400 });
    const timestamp = nowIso();
    const result = store.db.prepare("UPDATE mobile_push_subscriptions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE id=? AND user_id=?").run(timestamp, timestamp, id, auth.user.id);
    if (!result.changes) throw Object.assign(new Error("Push subscription не найдена."), { code: "RESOURCE_NOT_FOUND", status: 404 });
    await store.mutate((state) => appendEvent(state, { type: "device.push_state", actorId: auth.user.id, userIds: [auth.user.id], payload: { subscriptionId: id, state: "revoked" } }));
    io.to(`user:${auth.user.id}`).emit("device.push_state", { id, state: "revoked" });
    response.json({ ok: true, requestId: request.mobileRequestId, revoked: true });
  }));

  app.get("/api/v3/sync/diagnostics", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const deviceId = sessionDeviceId(auth.session);
    const state = store.read();
    const push = store.db.prepare("SELECT * FROM mobile_push_subscriptions WHERE user_id=? AND device_id=? ORDER BY updated_at DESC LIMIT 20").all(auth.user.id, deviceId);
    const uploads = store.db.prepare("SELECT * FROM mobile_upload_sessions WHERE user_id=? AND device_id=? AND status='active' ORDER BY updated_at DESC LIMIT 50").all(auth.user.id, deviceId);
    response.json({
      ok: true,
      requestId: request.mobileRequestId,
      diagnostics: {
        serverId,
        userIdHash: hashValue(auth.user.id).slice(0, 16),
        deviceId,
        latestSequence: Number(state.meta.lastEventSequence || 0),
        firstRetainedSequence: state.events[0]?.sequence ?? Number(state.meta.lastEventSequence || 0) + 1,
        retainedEventCount: state.events.length,
        activeUploads: uploads.map(publicUpload),
        push: push.map(publicPush),
        generatedAt: nowIso(),
        contentIncluded: false,
      },
    });
  }));

  app.post("/api/conversations/:id/uploads/init", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const idempotencyKey = String(request.headers["idempotency-key"] || "").trim();
    if (!SAFE_ID.test(idempotencyKey)) throw Object.assign(new Error("Требуется корректный Idempotency-Key."), { code: "VALIDATION_FAILED", status: 400 });
    const expectedSize = Number(request.body?.size);
    const name = safeFilename(request.body?.name);
    const claimedMime = cleanLine(request.body?.mimeType, 120) || "application/octet-stream";
    const kind = ["file", "image", "voice"].includes(request.body?.kind) ? request.body.kind : "file";
    const expectedSha256 = request.body?.sha256 ? String(request.body.sha256).toLowerCase() : null;
    if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > Number(maxFileBytes || 25 * 1024 * 1024)) {
      throw Object.assign(new Error("Размер файла недопустим."), { code: "VALIDATION_FAILED", status: 400 });
    }
    if (expectedSha256 && !SHA256.test(expectedSha256)) throw Object.assign(new Error("Некорректный SHA-256."), { code: "VALIDATION_FAILED", status: 400 });
    if (EXECUTABLE_EXTENSIONS.has(path.extname(name).toLowerCase())) throw Object.assign(new Error("Исполняемые и опасные файлы запрещены."), { code: "POLICY_RESTRICTED", status: 415 });
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    const blocked = postingError(state, conversation, auth.user.id, kind);
    if (blocked) throw Object.assign(new Error(blocked.message), { code: blocked.code, status: blocked.status });
    const stats = store.stats();
    if (expectedSize > stats.remainingBytes) throw Object.assign(new Error("Лимит хранилища исчерпан."), { code: "POLICY_RESTRICTED", status: 507 });

    await fs.mkdir(resumableDir, { recursive: true });
    const sessionId = hashValue(`${auth.user.id}:${idempotencyKey}`).slice(0, 32);
    const existing = store.db.prepare("SELECT * FROM mobile_upload_sessions WHERE id=? AND user_id=?").get(sessionId, auth.user.id);
    if (existing) return response.json({ ok: true, requestId: request.mobileRequestId, duplicate: true, upload: publicUpload(existing), chunkBytes: CHUNK_BYTES });
    const timestamp = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const tempName = `${sessionId}.part`;
    await fs.writeFile(path.join(resumableDir, tempName), Buffer.alloc(0), { flag: "wx" }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    store.db.prepare(`
      INSERT INTO mobile_upload_sessions(
        id,user_id,device_id,conversation_id,original_name,claimed_mime,kind,expected_size,
        confirmed_offset,expected_sha256,temp_name,status,expires_at,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,0,?,?, 'active',?,?,?)
    `).run(sessionId, auth.user.id, sessionDeviceId(auth.session), conversation.id, name, claimedMime, kind, expectedSize, expectedSha256, tempName, expiresAt, timestamp, timestamp);
    const row = store.db.prepare("SELECT * FROM mobile_upload_sessions WHERE id=?").get(sessionId);
    io.to(`user:${auth.user.id}`).emit("upload.session_state", { id: sessionId, state: "active", confirmedOffset: 0, expectedSize });
    response.status(201).json({ ok: true, requestId: request.mobileRequestId, duplicate: false, upload: publicUpload(row), chunkBytes: CHUNK_BYTES });
  }));

  app.put("/api/conversations/:id/uploads/:sessionId/chunks", withRequestId, authRequired, chunkParser, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    let row = ownedUpload(auth, request.params.sessionId);
    if (row.conversation_id !== request.params.id) throw Object.assign(new Error("Upload session относится к другому чату."), { code: "FORBIDDEN", status: 403 });
    if (!ACTIVE_UPLOAD_STATUSES.has(row.status) || Date.parse(row.expires_at) <= Date.now()) throw Object.assign(new Error("Upload session завершена или просрочена."), { code: "STATE_CONFLICT", status: 409 });
    const offset = Number(request.headers["upload-offset"]);
    const chunk = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    if (!Number.isSafeInteger(offset) || offset < 0 || !chunk.length || chunk.length > CHUNK_BYTES) throw Object.assign(new Error("Некорректный upload chunk."), { code: "VALIDATION_FAILED", status: 400 });
    const current = Number(row.confirmed_offset);
    const tempPath = path.join(resumableDir, row.temp_name);
    if (offset < current && offset + chunk.length <= current) {
      const handle = await fs.open(tempPath, "r");
      try {
        const existing = Buffer.alloc(chunk.length);
        const read = await handle.read(existing, 0, existing.length, offset);
        if (read.bytesRead === chunk.length && crypto.timingSafeEqual(existing, chunk)) {
          return response.json({ ok: true, requestId: request.mobileRequestId, duplicate: true, confirmedOffset: current });
        }
      } finally {
        await handle.close();
      }
    }
    if (offset !== current) throw Object.assign(new Error("Client offset отличается от подтверждённого server offset."), { code: "UPLOAD_OFFSET_MISMATCH", status: 409, details: { confirmedOffset: current } });
    if (offset + chunk.length > Number(row.expected_size)) throw Object.assign(new Error("Chunk превышает ожидаемый размер файла."), { code: "VALIDATION_FAILED", status: 400 });

    const handle = await fs.open(tempPath, "r+");
    try {
      const written = await handle.write(chunk, 0, chunk.length, offset);
      if (written.bytesWritten !== chunk.length) throw Object.assign(new Error("Chunk записан не полностью."), { code: "TEMPORARY_UNAVAILABLE", status: 503 });
      await handle.sync();
    } finally {
      await handle.close();
    }
    const confirmedOffset = offset + chunk.length;
    const result = store.db.prepare("UPDATE mobile_upload_sessions SET confirmed_offset=?,updated_at=? WHERE id=? AND confirmed_offset=? AND status='active'").run(confirmedOffset, nowIso(), row.id, current);
    if (!result.changes) throw Object.assign(new Error("Upload session была изменена параллельным запросом."), { code: "STATE_CONFLICT", status: 409 });
    io.to(`user:${auth.user.id}`).emit("upload.session_state", { id: row.id, state: "active", confirmedOffset, expectedSize: Number(row.expected_size) });
    response.json({ ok: true, requestId: request.mobileRequestId, duplicate: false, confirmedOffset });
  }));

  app.post("/api/conversations/:id/uploads/:sessionId/complete", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const row = ownedUpload(auth, request.params.sessionId);
    if (row.conversation_id !== request.params.id) throw Object.assign(new Error("Upload session относится к другому чату."), { code: "FORBIDDEN", status: 403 });
    if (row.status === "completed" && row.message_id) {
      const message = store.read((state) => state.messages.find((item) => item.id === row.message_id));
      return response.json({ ok: true, requestId: request.mobileRequestId, duplicate: true, message: message ? serializeMessage(store.read(), message, auth.user.id) : null });
    }
    if (row.status !== "active" || Date.parse(row.expires_at) <= Date.now()) throw Object.assign(new Error("Upload session завершена или просрочена."), { code: "STATE_CONFLICT", status: 409 });
    if (Number(row.confirmed_offset) !== Number(row.expected_size)) throw Object.assign(new Error("Файл загружен не полностью."), { code: "UPLOAD_OFFSET_MISMATCH", status: 409, details: { confirmedOffset: Number(row.confirmed_offset), expectedSize: Number(row.expected_size) } });

    const state = store.read();
    const conversation = findConversation(state, row.conversation_id);
    const blocked = postingError(state, conversation, auth.user.id, row.kind);
    if (blocked) throw Object.assign(new Error(blocked.message), { code: blocked.code, status: blocked.status });
    const tempPath = path.join(resumableDir, row.temp_name);
    const stat = await fs.stat(tempPath);
    if (stat.size !== Number(row.expected_size)) throw Object.assign(new Error("Размер временного файла не совпадает с контрактом."), { code: "UPLOAD_OFFSET_MISMATCH", status: 409 });
    const digest = await fileSha256(tempPath);
    if (row.expected_sha256 && digest !== row.expected_sha256) {
      store.db.prepare("UPDATE mobile_upload_sessions SET status='failed',error_code='UPLOAD_HASH_MISMATCH',updated_at=? WHERE id=?").run(nowIso(), row.id);
      await fs.unlink(tempPath).catch(() => {});
      throw Object.assign(new Error("SHA-256 загруженного файла не совпадает."), { code: "VALIDATION_FAILED", status: 422 });
    }
    const probeHandle = await fs.open(tempPath, "r");
    const probe = Buffer.alloc(Math.min(64, stat.size));
    try { await probeHandle.read(probe, 0, probe.length, 0); } finally { await probeHandle.close(); }
    const detectedMime = sniffMime(probe, row.claimed_mime);
    if (detectedMime === "application/x-executable" || EXECUTABLE_EXTENSIONS.has(path.extname(row.original_name).toLowerCase())) {
      await fs.unlink(tempPath).catch(() => {});
      store.db.prepare("UPDATE mobile_upload_sessions SET status='failed',error_code='POLICY_RESTRICTED',updated_at=? WHERE id=?").run(nowIso(), row.id);
      throw Object.assign(new Error("Исполняемые и опасные файлы запрещены."), { code: "POLICY_RESTRICTED", status: 415 });
    }
    if (row.kind === "image" && !detectedMime.startsWith("image/")) throw Object.assign(new Error("Содержимое файла не является изображением."), { code: "VALIDATION_FAILED", status: 415 });
    if (row.kind === "voice" && !detectedMime.startsWith("audio/")) throw Object.assign(new Error("Содержимое файла не является аудио."), { code: "VALIDATION_FAILED", status: 415 });

    await fs.mkdir(uploadsDir, { recursive: true });
    const storedName = `${crypto.randomUUID()}${path.extname(row.original_name).slice(0, 12)}`;
    const finalPath = path.join(uploadsDir, storedName);
    await fs.rename(tempPath, finalPath);
    let result;
    try {
      result = await maintenance.withFileLock(async () => store.mutate((mutable) => {
        const freshConversation = findConversation(mutable, row.conversation_id);
        const policy = postingError(mutable, freshConversation, auth.user.id, row.kind);
        if (policy) throw Object.assign(new Error(policy.message), { code: policy.code, status: policy.status });
        const usedBytes = mutable.files.filter((file) => !file.deletedAt).reduce((total, file) => total + Number(file.size || 0), 0);
        if (usedBytes + stat.size > Number(mutable.settings.storageQuotaBytes)) throw Object.assign(new Error("Лимит хранилища исчерпан."), { code: "POLICY_RESTRICTED", status: 507 });
        const createdAt = nowIso();
        const durationValue = Number(request.body?.duration);
        const duration = row.kind === "voice" ? Math.max(1, Math.min(Number.isFinite(durationValue) ? Math.round(durationValue) : 1, 60 * 60)) : null;
        const waveform = row.kind === "voice" ? (Array.isArray(request.body?.waveform) ? request.body.waveform : String(request.body?.waveform || "").split(","))
          .map(Number).filter(Number.isFinite).slice(0, 192).map((value) => Math.max(0, Math.min(100, value))) : [];
        const file = { id: crypto.randomUUID(), conversationId: freshConversation.id, uploaderId: auth.user.id, originalName: row.original_name, storedName, mimeType: detectedMime, size: stat.size, kind: row.kind, duration, waveform, sha256: digest, createdAt, deletedAt: null };
        const message = { id: crypto.randomUUID(), conversationId: freshConversation.id, senderId: auth.user.id, type: row.kind, text: cleanLine(request.body?.caption, 500), fileId: file.id, replyToId: null, forwardedFromId: null, forwardedSnapshot: null, clientId: row.id, createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null };
        mutable.files.push(file);
        mutable.messages.push(message);
        const event = appendEvent(mutable, { type: "message.created", actorId: auth.user.id, conversationId: freshConversation.id, roomId: freshConversation.roomId, payload: { messageId: message.id, resumable: true, uploadSessionId: row.id } });
        return { file, message, conversation: freshConversation, event };
      }));
    } catch (error) {
      await fs.unlink(finalPath).catch(() => {});
      throw error;
    }
    store.db.prepare("UPDATE mobile_upload_sessions SET status='completed',confirmed_offset=expected_size,completed_at=?,updated_at=?,message_id=?,error_code=NULL WHERE id=?").run(nowIso(), nowIso(), result.message.id, row.id);
    const freshState = store.read();
    for (const user of freshState.users) {
      if (!canAccessConversation(freshState, result.conversation, user.id)) continue;
      io.to(`user:${user.id}`).emit("message:new", serializeMessage(freshState, result.message, user.id));
    }
    io.to(`user:${auth.user.id}`).emit("upload.session_state", { id: row.id, state: "completed", confirmedOffset: stat.size, messageId: result.message.id });
    response.status(201).json({ ok: true, requestId: request.mobileRequestId, duplicate: false, message: serializeMessage(freshState, result.message, auth.user.id), sha256: digest });
  }));

  app.delete("/api/conversations/:id/uploads/:sessionId", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const row = ownedUpload(auth, request.params.sessionId);
    if (row.conversation_id !== request.params.id) throw Object.assign(new Error("Upload session относится к другому чату."), { code: "FORBIDDEN", status: 403 });
    if (row.status === "completed") throw Object.assign(new Error("Завершённую загрузку нельзя отменить."), { code: "STATE_CONFLICT", status: 409 });
    const timestamp = nowIso();
    store.db.prepare("UPDATE mobile_upload_sessions SET status='cancelled',cancelled_at=?,updated_at=?,error_code=NULL WHERE id=? AND status!='completed'").run(timestamp, timestamp, row.id);
    await fs.unlink(path.join(resumableDir, row.temp_name)).catch(() => {});
    io.to(`user:${auth.user.id}`).emit("upload.session_state", { id: row.id, state: "cancelled" });
    response.json({ ok: true, requestId: request.mobileRequestId, cancelled: true });
  }));

  cleanupTimer = setInterval(() => cleanupExpired().catch((error) => log(`Resumable upload cleanup failed: ${error.message}`, "error")), 15 * 60 * 1000);
  cleanupTimer.unref?.();

  return {
    status() {
      if (!store.db) return { ...lastStatus, closed: true };
      try {
        const activeUploads = Number(store.db.prepare("SELECT COUNT(*) AS count FROM mobile_upload_sessions WHERE status='active'").get()?.count || 0);
        const pushSubscriptions = Number(store.db.prepare("SELECT COUNT(*) AS count FROM mobile_push_subscriptions WHERE revoked_at IS NULL").get()?.count || 0);
        lastStatus = { enabled: true, schemaVersion: 9, activeUploads, pushSubscriptions, pushTokenKeyConfigured: Boolean(tokenKey), tokenPlaintextStored: false, closed: false };
        return lastStatus;
      } catch (error) {
        if (!store.db) return { ...lastStatus, closed: true };
        throw error;
      }
    },
    cleanupExpired,
    close() {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    },
  };
}

module.exports = {
  CHUNK_BYTES,
  SESSION_TTL_MS,
  encryptSecret,
  mountMobileContinuity,
  normalizePushSubscription,
  notificationAllowed,
  parseTokenKey,
  quietHoursActive,
  safeFilename,
  sniffMime,
};
