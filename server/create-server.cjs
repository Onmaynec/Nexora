"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const express = require("express");
const multer = require("multer");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const { ensureCertificates, networkAddresses } = require("./certificates.cjs");
const {
  accessibleFiles,
  areContacts,
  canAccessConversation,
  canModerateConversation,
  contactState,
  conversationList,
  dmPeer,
  findConversation,
  findUser,
  isBlockedEither,
  isRoomBanned,
  roomPermission,
  roomRole,
  roomView,
  safeDownloadName,
  serializeConversation,
  serializeMessage,
} = require("./model.cjs");
const {
  SESSION_DURATION_MS,
  clearSessionCookie,
  createCsrfToken,
  createSessionToken,
  hashPassword,
  hashToken,
  parseSessionToken,
  publicUser,
  sessionUser,
  setSessionCookie,
  passwordPolicy,
  validatePassword,
  verifyPassword,
} = require("./security.cjs");
const { MaintenanceService } = require("./maintenance.cjs");
const { addNotification, appendEvent, mentionedUsers } = require("./events.cjs");
const { MAX_ACTIVE_GOALS, ROOM_CATALOG, PulseError, activeEntitlement, createPulseService } = require("./pulse.cjs");
const { SqliteStore } = require("./store.cjs");
const { createTotpService } = require("./totp.cjs");
const { activeRoomInvite, mountV3Features, sniffMime } = require("./v3-features.cjs");
const { version: APP_VERSION } = require("../package.json");
const { createOperationalRuntime } = require("./operational-runtime.cjs");

const LIMITS = Object.freeze({
  displayName: 48,
  username: 24,
  password: 128,
  message: 4_000,
  roomName: 56,
  fileBytes: 25 * 1024 * 1024,
  voiceSeconds: 5 * 60,
  historyPage: 100,
  avatarBytes: 5 * 1024 * 1024,
  status: 80,
  bio: 240,
});

const REACTIONS = new Set(["👍", "❤️", "🔥", "😂", "👀", "🎉"]);
const PLUS_REACTIONS = new Set(["✨", "💜", "⚡", "🫡", "🤝", "🚀"]);
const COMPATIBILITY = Object.freeze({ minClientVersion: "2.0.0", minClientMajor: 2, maxClientMajor: 3, apiVersion: 3 });

function nowIso() {
  return new Date().toISOString();
}

function cleanLine(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanText(value, max = LIMITS.message) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function normalizeUsername(value) {
  return cleanLine(value, LIMITS.username).toLowerCase();
}

function normalizeRoomSlug(value) {
  return cleanLine(value, LIMITS.roomName)
    .toLocaleLowerCase("ru")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "") || `room-${crypto.randomBytes(3).toString("hex")}`;
}

function apiError(response, status, error, code = "REQUEST_FAILED") {
  response.status(status).json({ ok: false, error, code });
}

function majorVersion(value) {
  const match = String(value || "").match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function compatibleClientVersion(value) {
  const major = majorVersion(value);
  return major != null && major >= COMPATIBILITY.minClientMajor && major <= COMPATIBILITY.maxClientMajor;
}

function certificateFingerprint(certificate) {
  try { return new crypto.X509Certificate(certificate).fingerprint256; } catch { return null; }
}

function createMemoryRateLimiter({ windowMs, limit }) {
  const buckets = new Map();
  return (key) => {
    const timestamp = Date.now();
    const values = (buckets.get(key) ?? []).filter((item) => timestamp - item < windowMs);
    if (values.length >= limit) return false;
    values.push(timestamp);
    buckets.set(key, values);
    return true;
  };
}

function conversationSocketRoom(conversationId) {
  return `conversation:${conversationId}`;
}

function userSocketRoom(userId) {
  return `user:${userId}`;
}

function sessionSocketRoom(sessionId) {
  return `session:${sessionId}`;
}

async function createNexoraServer(options = {}) {
  const host = options.host ?? "0.0.0.0";
  const port = Number(options.port ?? 3443);
  const redirectPort = Number(options.redirectPort ?? 3080);
  const tlsEnabled = options.tls !== false;
  const dataDir = path.resolve(options.dataDir ?? path.join(process.cwd(), "data"));
  const clientDir = path.resolve(options.clientDir ?? path.join(__dirname, "..", "client", "dist"));
  const databaseFile = path.join(dataDir, "nexora.sqlite");
  const legacyJsonFile = path.join(dataDir, "nexora.json");
  const uploadsDir = path.join(dataDir, "uploads");
  const incomingDir = path.join(uploadsDir, ".incoming");
  const certificatesDir = path.join(dataDir, "certificates");
  const secretsDir = path.join(dataDir, "secrets");

  await Promise.all([
    fs.mkdir(uploadsDir, { recursive: true }),
    fs.mkdir(incomingDir, { recursive: true }),
    fs.mkdir(secretsDir, { recursive: true }),
  ]);

  const events = new EventEmitter();
  const store = new SqliteStore(databaseFile, { legacyJsonPath: legacyJsonFile });
  store.on("log", (entry) => events.emit("log", entry));
  store.on("changed", () => events.emit("stats", store.stats()));
  await store.init();
  const totp = await createTotpService({ keyFile: path.join(secretsDir, "local-secrets.key"), issuer: "Nexora" });
  const totpChallenges = new Map();
  const pendingTotp = new Map();

  let certificates = null;
  if (tlsEnabled) certificates = await ensureCertificates(certificatesDir);
  const serverId = store.read((state) => state.meta.serverId);
  const fingerprint = certificates?.cert ? certificateFingerprint(certificates.cert) : null;

  function originAllowed(headers = {}) {
    const origin = headers.origin;
    if (!origin) return true;
    try {
      const parsed = new URL(origin);
      const hostHeader = String(headers.host || "").toLowerCase();
      const configured = new Set((options.allowedOrigins ?? []).map((item) => String(item).toLowerCase()));
      return configured.has(origin.toLowerCase())
        || (parsed.protocol === (tlsEnabled ? "https:" : "http:") && parsed.host.toLowerCase() === hostHeader);
    } catch {
      return false;
    }
  }

  const app = express();
  const operational = createOperationalRuntime({
    service: "nexora-local-server",
    version: APP_VERSION,
    metricsToken: options.metricsToken ?? process.env.NEXORA_METRICS_TOKEN ?? "",
    healthProvider: async () => {
      const stats = store.stats();
      return { ready: stats.integrity === "ok", checks: { sqlite: stats.integrity, schemaVersion: stats.schemaVersion, emergencyReadOnly: store.read((state) => Boolean(state.settings.emergencyReadOnly)) } };
    },
    log: (message, level = "info") => {
      const entry = { level, message, createdAt: nowIso() };
      events.emit("log", entry);
      if (!options.quiet) console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[Nexora] ${message}`);
    },
  });
  operational.mount(app);
  const server = tlsEnabled
    ? https.createServer({ key: certificates.key, cert: certificates.cert }, app)
    : http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 128 * 1024,
    pingTimeout: 20_000,
    pingInterval: 25_000,
    allowRequest: (request, callback) => callback(null, originAllowed(request.headers)),
  });
  let redirectServer = null;
  const onlineSockets = new Map();
  const messageRate = createMemoryRateLimiter({ windowMs: 5_000, limit: 10 });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => callback(null, incomingDir),
      filename: (_request, _file, callback) => callback(null, crypto.randomUUID()),
    }),
    limits: { fileSize: LIMITS.fileBytes, files: 1 },
  });
  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: (_request, _file, callback) => callback(null, incomingDir),
      filename: (_request, _file, callback) => callback(null, crypto.randomUUID()),
    }),
    limits: { fileSize: LIMITS.avatarBytes, files: 1 },
  });

  function log(message, level = "info") {
    const entry = { level, message, createdAt: nowIso() };
    events.emit("log", entry);
    if (!options.quiet) console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[Nexora] ${message}`);
  }

  const maintenance = await new MaintenanceService({
    store,
    dataDir,
    uploadsDir,
    appVersion: APP_VERSION,
    log,
  }).init();
  const pulse = createPulseService({
    store,
    serverId,
    mode: options.pulseMode ?? process.env.NEXORA_PULSE_MODE ?? "disabled",
    cloudUrl: options.pulseCloudUrl ?? process.env.NEXORA_PULSE_CLOUD_URL ?? "",
    apiKey: options.pulseApiKey ?? process.env.NEXORA_PULSE_API_KEY ?? "",
    publicKey: options.pulsePublicKey ?? process.env.NEXORA_PULSE_PUBLIC_KEY ?? "",
    log,
  });

  function onlineUserIds() {
    return new Set([...onlineSockets.entries()].filter(([, sockets]) => sockets.size > 0).map(([userId]) => userId));
  }

  function broadcastPresence() {
    io.emit("presence:update", [...onlineUserIds()]);
    events.emit("stats", store.stats());
  }

  function refreshUsers(userIds) {
    for (const userId of new Set(userIds.filter(Boolean))) io.to(userSocketRoom(userId)).emit("data:refresh");
  }

  function usersForConversation(state, conversation) {
    if (conversation.type === "dm") return conversation.userIds;
    return state.roomMembers.filter((member) => member.roomId === conversation.roomId).map((member) => member.userId);
  }

  function addRoomAudit(state, roomId, actorId, action, targetUserId = null, details = {}) {
    const entry = {
      id: crypto.randomUUID(), roomId, actorId, action, targetUserId,
      details: structuredClone(details), createdAt: nowIso(),
    };
    state.roomAuditLog.push(entry);
    return entry;
  }

  function displayNameFor(state, userId) {
    return findUser(state, userId)?.displayName ?? "Пользователь";
  }

  function addSystemMessage(state, conversation, actorId, event, text, targetUserId = null) {
    const message = {
      id: crypto.randomUUID(), conversationId: conversation.id, senderId: actorId,
      type: "system", text: cleanText(text, 500), systemEvent: event, targetUserId,
      fileId: null, replyToId: null, forwardedFromId: null, forwardedSnapshot: null,
      clientId: null, createdAt: nowIso(), updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null,
    };
    state.messages.push(message);
    return message;
  }

  function ensureSavedConversation(state, userId) {
    let conversation = state.conversations.find(
      (item) => item.type === "dm" && item.userIds.length === 1 && item.userIds[0] === userId,
    );
    if (!conversation) {
      conversation = {
        id: crypto.randomUUID(), type: "dm", userIds: [userId], roomId: null,
        savedMessages: true, createdAt: nowIso(),
      };
      state.conversations.push(conversation);
    }
    return conversation;
  }

  function roomManagement(state, roomId, viewerId) {
    const room = state.rooms.find((candidate) => candidate.id === roomId);
    const conversation = state.conversations.find((candidate) => candidate.roomId === roomId);
    const role = roomRole(state, roomId, viewerId);
    const serverAdmin = findUser(state, viewerId)?.role === "server_admin";
    const builtInModerator = Boolean(room && conversation && (serverAdmin || ["owner", "moderator"].includes(role)));
    const canManageMembers = Boolean(room && roomPermission(state, roomId, viewerId, "room.manage_members"));
    const canManageReports = Boolean(room && roomPermission(state, roomId, viewerId, "room.manage_reports"));
    return {
      room, conversation, role, serverAdmin,
      canConfigure: builtInModerator,
      canManageMembers,
      canManageReports,
      canModerate: builtInModerator || canManageMembers || canManageReports,
      canManage: Boolean(room && conversation && (serverAdmin || role === "owner")),
    };
  }

  function roomPostingError(state, conversation, userId, kind = "text") {
    if (state.settings.emergencyReadOnly) return { code: "SERVER_READ_ONLY", message: "Сервер временно работает только для чтения." };
    if (conversation?.type !== "room") return null;
    const room = state.rooms.find((candidate) => candidate.id === conversation.roomId);
    if (!room) return { code: "ROOM_NOT_FOUND", message: "Комната не найдена." };
    if (isRoomBanned(state, room.id, userId)) return { code: "ROOM_BANNED", message: "Вы заблокированы в этой комнате." };
    const privileged = canModerateConversation(state, conversation, userId);
    const member = state.roomMembers.find((item) => item.roomId === room.id && item.userId === userId);
    if (member?.restrictedUntil && Date.parse(member.restrictedUntil) > Date.now()) return { code: "MEMBER_RESTRICTED", message: "Отправка временно ограничена модератором." };
    if (room.readOnly && !privileged) return { code: "ROOM_READ_ONLY", message: "Комната работает в режиме «только чтение»." };
    if (room.announcementOnly && !privileged) return { code: "ROOM_ANNOUNCEMENTS_ONLY", message: "Публиковать в канале объявлений могут только модераторы." };
    if (!roomPermission(state, room.id, userId, "room.send_messages")) return { code: "ROOM_PERMISSION_DENIED", message: "У вашей роли нет права отправлять сообщения." };
    if (kind === "file" && room.allowFiles === false) return { code: "ROOM_FILES_DISABLED", message: "Отправка файлов в этой комнате отключена." };
    if (kind === "image" && room.allowImages === false) return { code: "ROOM_IMAGES_DISABLED", message: "Отправка изображений в этой комнате отключена." };
    if (kind === "voice" && room.allowVoice === false) return { code: "ROOM_VOICE_DISABLED", message: "Голосовые сообщения в этой комнате отключены." };
    const slowSeconds = Number(room.slowModeSeconds || 0);
    if (slowSeconds > 0 && !privileged) {
      const last = state.messages
        .filter((message) => message.conversationId === conversation.id && message.senderId === userId && message.type !== "system" && !message.deletedAt)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      const retryAfter = last ? Math.ceil((Date.parse(last.createdAt) + slowSeconds * 1000 - Date.now()) / 1000) : 0;
      if (retryAfter > 0) return { code: "ROOM_SLOW_MODE", message: `Медленный режим: повторите через ${retryAfter} сек.`, retryAfter };
    }
    return null;
  }

  let v3Features = null;

  function conversationUsesMls(conversationId) {
    try {
      return Boolean(store.db?.prepare("SELECT 1 FROM mls_groups WHERE conversation_id=? AND status='active'").get(String(conversationId)));
    } catch {
      return false;
    }
  }

  function notificationAllowed(state, recipientId, conversationId, mentioned) {
    const recipient = findUser(state, recipientId);
    const setting = state.conversationSettings.find((item) => item.userId === recipientId && item.conversationId === conversationId);
    const mode = setting?.muted ? "none" : setting?.notificationMode ?? recipient?.notificationMode ?? "all";
    return mode === "all" || (mode === "mentions" && mentioned);
  }

  async function createTextMessage({ senderId, conversationId, text: rawText, replyToId = null, clientId = null, silent = false, threadRootId = null }) {
    const normalizedConversationId = cleanLine(conversationId, 64);
    if (conversationUsesMls(normalizedConversationId)) {
      throw Object.assign(new Error("Диалог защищён MLS. Используйте E2EE transport."), { code: "E2EE_REQUIRED", status: 409 });
    }
    const text = cleanText(rawText);
    if (!text) throw Object.assign(new Error("Сообщение пустое."), { code: "MESSAGE_EMPTY" });
    const safeClientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(clientId ?? "")) ? String(clientId) : null;
    const result = await store.mutate((state) => {
      const sender = findUser(state, senderId);
      const conversation = findConversation(state, normalizedConversationId);
      if (!sender || !canAccessConversation(state, conversation, senderId)) throw Object.assign(new Error("Чат недоступен."), { code: "FORBIDDEN" });
      const posting = roomPostingError(state, conversation, senderId, "text");
      if (posting) throw Object.assign(new Error(posting.message), { code: posting.code, retryAfter: posting.retryAfter });
      const duplicate = safeClientId ? state.messages.find((message) => message.senderId === senderId && message.clientId === safeClientId) : null;
      if (duplicate) return { message: duplicate, conversation, duplicate: true, recipients: usersForConversation(state, conversation), event: null };
      const peer = dmPeer(state, conversation, senderId);
      if (peer && isBlockedEither(state, senderId, peer.id)) throw Object.assign(new Error("Отправка недоступна из-за блокировки."), { code: "CONTACT_BLOCKED" });
      const reply = replyToId ? state.messages.find((message) => message.id === replyToId && message.conversationId === conversation.id && !message.deletedAt) : null;
      if (replyToId && !reply) throw Object.assign(new Error("Исходное сообщение не найдено."), { code: "REPLY_NOT_FOUND" });
      const root = threadRootId ? state.messages.find((message) => message.id === threadRootId && message.conversationId === conversation.id && !message.deletedAt) : null;
      if (threadRootId && !root) throw Object.assign(new Error("Ветка обсуждения не найдена."), { code: "THREAD_NOT_FOUND" });
      const recipients = usersForConversation(state, conversation);
      const mentions = mentionedUsers(state, text, recipients).map((user) => user.id);
      const room = conversation.type === "room" ? state.rooms.find((item) => item.id === conversation.roomId) : null;
      const canReview = conversation.type === "room" && (canModerateConversation(state, conversation, senderId) || roomPermission(state, conversation.roomId, senderId, "room.manage_reports"));
      const pendingApproval = Boolean(room?.preapproveMessages && !canReview);
      const createdAt = nowIso();
      const message = {
        id: crypto.randomUUID(), conversationId: conversation.id, senderId, type: "text", text,
        fileId: null, replyToId: reply?.id ?? null, threadRootId: root?.id ?? null,
        forwardedFromId: null, forwardedSnapshot: null, clientId: safeClientId,
        silent: Boolean(silent), mentions, pendingApproval,
        createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null,
      };
      state.messages.push(message);
      const event = appendEvent(state, { type: pendingApproval ? "message.awaiting_approval" : "message.created", actorId: senderId, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id, type: message.type, silent: message.silent } });
      if (!silent && !pendingApproval) {
        for (const recipientId of recipients.filter((id) => id !== senderId)) {
          const mentioned = mentions.includes(recipientId);
          const replied = reply?.senderId === recipientId;
          if (!notificationAllowed(state, recipientId, conversation.id, mentioned || replied)) continue;
          addNotification(state, recipientId, mentioned ? "message.mention" : replied ? "message.reply" : "message.new", { conversationId: conversation.id, messageId: message.id, senderId });
        }
      }
      const visibleRecipients = pendingApproval
        ? recipients.filter((id) => id === senderId || canModerateConversation(state, conversation, id) || roomPermission(state, conversation.roomId, id, "room.manage_reports"))
        : recipients;
      return { message, conversation, duplicate: false, recipients: visibleRecipients, event };
    });
    if (result.event) v3Features?.dispatchEvent(result.event).catch(() => {});
    return result;
  }

  function emitMessage(result) {
    const state = store.read();
    const recipients = result.recipients ?? usersForConversation(state, result.conversation);
    const eventName = result.isUpdate ? "message:updated" : "message:new";
    for (const participantId of recipients) io.to(userSocketRoom(participantId)).emit(eventName, serializeMessage(state, result.message, participantId));
    refreshUsers(recipients);
  }

  async function joinConversationSockets(userId, conversationId) {
    await io.in(userSocketRoom(userId)).socketsJoin(conversationSocketRoom(conversationId));
  }

  async function leaveConversationSockets(userId, conversationId) {
    await io.in(userSocketRoom(userId)).socketsLeave(conversationSocketRoom(conversationId));
  }

  function sessionFromRequest(request) {
    const token = parseSessionToken(request.headers.cookie);
    const tokenHash = token ? hashToken(token) : null;
    const session = tokenHash ? store.read((state) => state.sessions.find(
      (item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now(),
    )) : null;
    return { token, tokenHash, session, user: sessionUser(store, token) };
  }

  async function consumePersistentRateLimit(key, limit, windowMs) {
    const now = Date.now();
    return store.mutate((state) => {
      let bucket = state.rateLimits.find((item) => item.key === key);
      if (!bucket || now - Date.parse(bucket.windowStartedAt) >= windowMs) {
        bucket = { key, windowStartedAt: new Date(now).toISOString(), hits: 0 };
        state.rateLimits = state.rateLimits.filter((item) => item.key !== key);
        state.rateLimits.push(bucket);
      }
      if (bucket.hits >= limit) return false;
      bucket.hits += 1;
      return true;
    });
  }

  function loginLockStatus(username, ip) {
    const state = store.read();
    const maxAttempts = Number(state.settings.loginMaxAttempts) || 5;
    const lockMs = (Number(state.settings.loginLockMinutes) || 15) * 60 * 1000;
    const cutoff = Date.now() - lockMs;
    const attempts = state.loginAttempts
      .filter((item) => item.username === username && item.ip === ip && Date.parse(item.createdAt) >= cutoff)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const lastSuccess = attempts.findLastIndex((item) => item.success);
    const failures = attempts.slice(lastSuccess + 1).filter((item) => !item.success);
    if (failures.length < maxAttempts) return { locked: false, remaining: maxAttempts - failures.length };
    const lockedUntil = Date.parse(failures.at(-1).createdAt) + lockMs;
    return { locked: lockedUntil > Date.now(), lockedUntil, remaining: 0 };
  }

  async function recordLoginAttempt({ username, ip, userId = null, success, reason, userAgent = "" }) {
    await store.mutate((state) => {
      state.loginAttempts.push({
        id: crypto.randomUUID(), username, ip, userId, success: Boolean(success),
        reason: cleanLine(reason, 64), userAgent: cleanLine(userAgent, 180), createdAt: nowIso(),
      });
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      state.loginAttempts = state.loginAttempts.filter((item) => Date.parse(item.createdAt) >= cutoff).slice(-20_000);
    });
  }

  async function establishSession(user, request, response) {
    const token = createSessionToken();
    const csrfToken = createCsrfToken();
    const createdAt = nowIso();
    const userAgent = cleanLine(request.headers["user-agent"], 180);
    const ip = cleanLine(request.ip, 64);
    await store.mutate((state) => {
      ensureSavedConversation(state, user.id);
      const knownDevice = state.sessions.some((session) => session.userId === user.id && session.userAgent === userAgent);
      const session = {
        id: crypto.randomUUID(), userId: user.id, tokenHash: hashToken(token), csrfToken,
        createdAt, expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(), lastSeenAt: createdAt,
        userAgent, ip,
      };
      state.sessions.push(session);
      if (!knownDevice && state.sessions.some((candidate) => candidate.userId === user.id && candidate.id !== session.id)) {
        addNotification(state, user.id, "security.new_device", { sessionId: session.id, ip, userAgent });
      }
      appendEvent(state, { type: "session.created", actorId: user.id, userIds: [user.id], payload: { sessionId: session.id, newDevice: !knownDevice } });
    });
    await recordLoginAttempt({ username: user.username, ip, userId: user.id, success: true, reason: "success", userAgent });
    setSessionCookie(response, token, tlsEnabled);
    return { ok: true, user: publicUser(store.read((state) => findUser(state, user.id))), csrfToken, serverId, fingerprint };
  }

  function verifySecondFactor(user, code) {
    const recoveryHash = totp.recoveryCodeHash(code);
    const recoveryIndex = (user.recoveryCodeHashes ?? []).findIndex((value) => value === recoveryHash);
    if (recoveryIndex >= 0) return { ok: true, recoveryHash };
    if (!user.totpSecret) return { ok: false };
    try { return { ok: totp.verify(totp.decrypt(user.totpSecret), code), recoveryHash: null }; } catch { return { ok: false }; }
  }

  function passwordError(password) {
    const validation = validatePassword(password, store.read((state) => state.settings));
    return validation.ok ? null : `Пароль не соответствует политике: ${validation.errors.join(", ")}.`;
  }

  function authRequired(request, response, next) {
    const { token, tokenHash, session, user } = sessionFromRequest(request);
    if (!user) {
      apiError(response, 401, "Требуется вход в аккаунт.", "UNAUTHORIZED");
      return;
    }
    request.nexora = { token, tokenHash, session, user };
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const supplied = String(request.headers["x-nexora-csrf"] || "");
      const expected = String(session?.csrfToken || "");
      if (!supplied || !expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        apiError(response, 403, "Запрос отклонён защитой CSRF. Обновите клиент.", "CSRF_INVALID");
        return;
      }
    }
    const passwordAllowed = request.path === "/api/users/me/password" || request.path === "/api/auth/logout";
    if (user.mustChangePassword && !passwordAllowed) {
      apiError(response, 428, "Перед продолжением необходимо изменить временный пароль.", "PASSWORD_CHANGE_REQUIRED");
      return;
    }
    const emergencyAllowed = request.path === "/api/auth/logout" || request.path === "/api/admin/runtime";
    if (store.read((state) => state.settings.emergencyReadOnly) && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !emergencyAllowed) {
      apiError(response, 503, "Сервер временно работает только для чтения.", "SERVER_READ_ONLY");
      return;
    }
    next();
  }

  function serverAdminRequired(request, response, next) {
    if (request.nexora?.user?.role !== "server_admin") {
      apiError(response, 403, "Недостаточно прав.", "FORBIDDEN");
      return;
    }
    next();
  }

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.use("/api", (request, response, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !originAllowed(request.headers)) {
      return apiError(response, 403, "Origin запроса не разрешён.", "ORIGIN_REJECTED");
    }
    const clientVersion = request.headers["x-nexora-client-version"];
    if (clientVersion && !compatibleClientVersion(clientVersion)) {
      return apiError(response, 426, `Клиент ${clientVersion} несовместим с сервером ${APP_VERSION}.`, "CLIENT_VERSION_INCOMPATIBLE");
    }
    next();
  });
  app.use(express.json({ limit: "96kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true, service: "nexora", version: APP_VERSION, tls: tlsEnabled, now: nowIso(),
      serverId, fingerprint, compatibility: COMPATIBILITY,
      passwordPolicy: passwordPolicy(store.read((state) => state.settings)),
    });
  });

  app.get("/api/auth/me", (request, response) => {
    const { user, session } = sessionFromRequest(request);
    response.json({ ok: true, user: publicUser(user), csrfToken: session?.csrfToken ?? null, serverId, fingerprint });
  });

  app.post("/api/auth/register", async (request, response) => {
    if (!(await consumePersistentRateLimit(`register:${request.ip}`, 8, 60 * 60 * 1000))) {
      return apiError(response, 429, "Слишком много регистраций с этого адреса.", "RATE_LIMIT");
    }
    const username = normalizeUsername(request.body?.username);
    const displayName = cleanLine(request.body?.displayName, LIMITS.displayName);
    const password = String(request.body?.password ?? "");
    if (!/^[a-z0-9_.-]{3,24}$/.test(username)) {
      return apiError(response, 400, "Username: 3–24 латинских символа, цифры, точка, дефис или подчёркивание.");
    }
    if (displayName.length < 2) return apiError(response, 400, "Отображаемое имя должно содержать минимум 2 символа.");
    const registrationPasswordError = passwordError(password);
    if (registrationPasswordError) return apiError(response, 400, registrationPasswordError, "PASSWORD_POLICY");

    const passwordData = await hashPassword(password);
    const token = createSessionToken();
    let createdUser;
    try {
      createdUser = await store.mutate((state) => {
        if (state.users.some((user) => user.username === username)) throw Object.assign(new Error("USERNAME_EXISTS"), { code: "USERNAME_EXISTS" });
        const createdAt = nowIso();
        const user = {
          id: crypto.randomUUID(),
          username,
          displayName,
          status: "",
          bio: "",
          profileColor: "violet",
          avatarFrame: "none",
          plusBadgeVisible: true,
          avatarFileId: null,
          notificationSound: "subtle",
          passwordSalt: passwordData.salt,
          passwordHash: passwordData.hash,
          role: state.users.length === 0 ? "server_admin" : "user",
          createdAt,
          disabledAt: null,
        };
        state.users.push(user);
        ensureSavedConversation(state, user.id);
        state.sessions.push({
          id: crypto.randomUUID(),
          userId: user.id,
          tokenHash: hashToken(token),
          csrfToken: createCsrfToken(),
          createdAt,
          expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
          lastSeenAt: createdAt,
          userAgent: cleanLine(request.headers["user-agent"], 180),
          ip: cleanLine(request.ip, 64),
        });

        let general = state.rooms.find((room) => room.slug === "general");
        if (!general) {
          general = {
            id: crypto.randomUUID(),
            name: "Общий",
            slug: "general",
            privacy: "public",
            ownerId: user.id,
            inviteCode: crypto.randomBytes(8).toString("base64url"),
            inviteExpiresAt: null,
            inviteMaxUses: 0,
            inviteUseCount: 0,
            joinPolicy: "open",
            readOnly: false,
            slowModeSeconds: 0,
            allowFiles: true,
            allowImages: true,
            allowVoice: true,
            description: "",
            rules: "",
            categoryId: null,
            announcementOnly: false,
            preapproveMessages: false,
            createdAt,
          };
          state.rooms.push(general);
          state.conversations.push({ id: crypto.randomUUID(), type: "room", roomId: general.id, userIds: [], createdAt });
        }
        if (!state.roomMembers.some((member) => member.roomId === general.id && member.userId === user.id)) {
          state.roomMembers.push({ roomId: general.id, userId: user.id, role: general.ownerId === user.id ? "owner" : "member", joinedAt: createdAt });
          const generalConversation = state.conversations.find((candidate) => candidate.roomId === general.id);
          if (general.ownerId !== user.id && generalConversation) {
            addSystemMessage(state, generalConversation, user.id, "member.joined", `${user.displayName} присоединился(-ась) к комнате`, user.id);
            addRoomAudit(state, general.id, user.id, "member.joined", user.id, { source: "registration" });
          }
        }
        return user;
      });
    } catch (error) {
      if (error.code === "USERNAME_EXISTS") return apiError(response, 409, "Этот username уже занят.", "USERNAME_EXISTS");
      throw error;
    }

    setSessionCookie(response, token, tlsEnabled);
    log(`Зарегистрирован @${createdUser.username}${createdUser.role === "server_admin" ? " (администратор)" : ""}`);
    const session = store.read((state) => state.sessions.find((item) => item.tokenHash === hashToken(token)));
    response.status(201).json({ ok: true, user: publicUser(createdUser), firstAdmin: createdUser.role === "server_admin", csrfToken: session.csrfToken, serverId, fingerprint });
  });

  app.post("/api/auth/login", async (request, response) => {
    const username = normalizeUsername(request.body?.username);
    const password = String(request.body?.password ?? "");
    const ip = cleanLine(request.ip, 64);
    if (!(await consumePersistentRateLimit(`login:${ip}`, 30, 15 * 60 * 1000))) {
      await recordLoginAttempt({ username, ip, success: false, reason: "rate_limit", userAgent: request.headers["user-agent"] });
      return apiError(response, 429, "Слишком много попыток входа. Повторите позже.", "RATE_LIMIT");
    }
    const lock = loginLockStatus(username, ip);
    if (lock.locked) {
      await recordLoginAttempt({ username, ip, success: false, reason: "temporary_lock", userAgent: request.headers["user-agent"] });
      return response.status(423).json({ ok: false, error: "Вход временно заблокирован после серии неверных паролей.", code: "LOGIN_LOCKED", lockedUntil: new Date(lock.lockedUntil).toISOString() });
    }
    const user = store.read((state) => state.users.find((candidate) => candidate.username === username));
    if (!user || user.disabledAt || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      await recordLoginAttempt({ username, ip, userId: user?.id ?? null, success: false, reason: user?.disabledAt ? "disabled" : "invalid_credentials", userAgent: request.headers["user-agent"] });
      return apiError(response, 401, "Неверный username или пароль.", "INVALID_CREDENTIALS");
    }
    if (user.totpEnabled) {
      const challengeId = crypto.randomBytes(32).toString("base64url");
      totpChallenges.set(challengeId, { userId: user.id, ip, userAgent: cleanLine(request.headers["user-agent"], 180), expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
      return response.status(202).json({ ok: true, requiresTotp: true, challengeId, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    }
    response.json(await establishSession(user, request, response));
  });

  app.post("/api/auth/login/totp", async (request, response) => {
    const challengeId = cleanLine(request.body?.challengeId, 100);
    const challenge = totpChallenges.get(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
      totpChallenges.delete(challengeId);
      return apiError(response, 401, "Проверка истекла. Введите пароль ещё раз.", "TOTP_CHALLENGE_EXPIRED");
    }
    challenge.attempts += 1;
    const user = store.read((state) => findUser(state, challenge.userId));
    const verification = user ? verifySecondFactor(user, request.body?.code) : { ok: false };
    if (!verification.ok) {
      await recordLoginAttempt({ username: user?.username ?? "", ip: challenge.ip, userId: user?.id ?? null, success: false, reason: "invalid_totp", userAgent: challenge.userAgent });
      return apiError(response, 401, "Неверный одноразовый или резервный код.", "TOTP_INVALID");
    }
    totpChallenges.delete(challengeId);
    if (verification.recoveryHash) {
      await store.mutate((state) => {
        const current = findUser(state, user.id);
        current.recoveryCodeHashes = (current.recoveryCodeHashes ?? []).filter((value) => value !== verification.recoveryHash);
        addNotification(state, user.id, "security.recovery_code_used", {});
      });
    }
    response.json(await establishSession(user, request, response));
  });

  app.post("/api/auth/logout", authRequired, async (request, response) => {
    const tokenHash = request.nexora.tokenHash;
    const sessionId = request.nexora.session?.id;
    await store.mutate((state) => {
      state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
    });
    clearSessionCookie(response, tlsEnabled);
    response.json({ ok: true });
    if (sessionId) setImmediate(() => io.to(sessionSocketRoom(sessionId)).disconnectSockets(true));
  });

  app.get("/api/bootstrap", authRequired, (request, response) => {
    const viewerId = request.nexora.user.id;
    const online = onlineUserIds();
    const state = store.read();
    const contacts = contactState(state, viewerId, online);
    const blocked = state.blocks
      .filter((block) => block.blockerId === viewerId)
      .map((block) => publicUser(findUser(state, block.blockedId)))
      .filter(Boolean);
    response.json({
      ok: true,
      version: APP_VERSION,
      csrfToken: request.nexora.session.csrfToken,
      server: { id: serverId, fingerprint, version: APP_VERSION, compatibility: COMPATIBILITY },
      me: publicUser(request.nexora.user),
      preferences: {
        notificationSound: request.nexora.user.notificationSound ?? "subtle",
        notificationMode: request.nexora.user.notificationMode ?? "all",
        quietHoursStart: request.nexora.user.quietHoursStart ?? "",
        quietHoursEnd: request.nexora.user.quietHoursEnd ?? "",
      },
      conversations: conversationList(state, viewerId, online),
      rooms: state.rooms
        .filter((room) => room.privacy === "public" || roomRole(state, room.id, viewerId))
        .map((room) => roomView(state, room, viewerId, online)),
      contacts: contacts.contacts,
      contactRequests: contacts.requests,
      blocked,
      files: accessibleFiles(state, viewerId).slice(0, 200),
      onlineUserIds: [...online],
      limits: LIMITS,
      passwordPolicy: passwordPolicy(state.settings),
      pulse: pulse.localOverview(viewerId),
      notificationCount: state.notificationEvents.filter((event) => event.userId === viewerId && !event.readAt).length,
      drafts: state.drafts.filter((draft) => draft.userId === viewerId && canAccessConversation(state, findConversation(state, draft.conversationId), viewerId)),
      sync: { apiVersion: 3, latestSequence: Number(state.meta.lastEventSequence || 0) },
      capabilities: {
        offlineSync: true, scheduledMessages: true, polls: true, communities: true,
        resumableUploads: true, bots: true, pwa: true, android: true, totp: true,
      },
    });
  });

  app.get("/api/pulse/overview", authRequired, async (request, response) => {
    try {
      const overview = await pulse.syncCloudOverview(request.nexora.user.id);
      response.json({ ok: true, ...overview });
    } catch (error) {
      if (!(error instanceof PulseError)) throw error;
      const cached = pulse.localOverview(request.nexora.user.id, {
        cached: true,
        warning: { code: error.code, message: error.message },
      });
      response.json({ ok: true, ...cached });
    }
  });

  app.post("/api/pulse/checkout", authRequired, async (request, response) => {
    try {
      response.status(201).json({ ok: true, ...(await pulse.createCheckout(request.nexora.user.id)) });
    } catch (error) {
      if (error instanceof PulseError) return apiError(response, error.status, error.message, error.code);
      throw error;
    }
  });

  app.post("/api/pulse/sandbox/activate-plus", authRequired, async (request, response) => {
    try {
      const overview = await pulse.activateSandboxPlus(request.nexora.user.id);
      io.to(userSocketRoom(request.nexora.user.id)).emit("data:refresh");
      response.status(201).json({ ok: true, ...overview });
    } catch (error) {
      if (error instanceof PulseError) return apiError(response, error.status, error.message, error.code);
      throw error;
    }
  });

  app.get("/api/pulse/rooms/:roomId/goals", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    await pulse.reconcileExpiredGoals(request.params.roomId);
    const state = store.read();
    const conversation = state.conversations.find((item) => item.roomId === request.params.roomId);
    if (!canAccessConversation(state, conversation, viewerId)) return apiError(response, 403, "Комната недоступна.", "FORBIDDEN");
    const goals = state.pulseGoals
      .filter((item) => item.roomId === request.params.roomId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((goal) => ({
        ...goal,
        contributionCount: state.pulseContributions.filter((item) => item.goalId === goal.id).length,
        contributedByMe: state.pulseContributions.filter((item) => item.goalId === goal.id && item.userId === viewerId).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      }));
    response.json({ ok: true, goals, catalog: ROOM_CATALOG });
  });

  app.post("/api/pulse/rooms/:roomId/goals", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    if (!pulse.status().enabled) return apiError(response, 503, "Nexora Pulse не подключён.", "PULSE_DISABLED");
    const product = ROOM_CATALOG.find((item) => item.code === request.body?.productCode);
    if (!product) return apiError(response, 400, "Неизвестная цель Pulse.", "PULSE_PRODUCT_UNKNOWN");
    if (!product.available) return apiError(response, 409, product.availabilityReason || "Эта возможность пока недоступна на сервере.", "GOAL_CAPABILITY_UNAVAILABLE");
    let goal;
    try {
      goal = await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.room || management.room.ownerId !== viewerId) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        if (state.pulseGoals.filter((item) => item.roomId === management.room.id && item.status === "active").length >= MAX_ACTIVE_GOALS) {
          throw Object.assign(new Error("GOAL_LIMIT"), { status: 409 });
        }
        if (state.pulseGoals.some((item) => item.roomId === management.room.id && item.productCode === product.code && item.status === "active")) {
          throw Object.assign(new Error("GOAL_EXISTS"), { status: 409 });
        }
        const created = {
          id: crypto.randomUUID(), roomId: management.room.id, productCode: product.code,
          title: product.title, description: product.description, targetAmount: product.target,
          currentAmount: 0, status: "active", createdBy: viewerId, createdAt: nowIso(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        state.pulseGoals.push(created);
        addRoomAudit(state, management.room.id, viewerId, "pulse.goal_created", null, { productCode: product.code });
        return created;
      });
    } catch (error) {
      const messages = { FORBIDDEN: "Только владелец комнаты может открыть цель.", GOAL_EXISTS: "Такая цель уже активна.", GOAL_LIMIT: `В комнате может быть не больше ${MAX_ACTIVE_GOALS} активных целей.` };
      return apiError(response, error.status ?? 400, messages[error.message] ?? "Не удалось создать цель.", error.message);
    }
    io.emit("data:refresh");
    response.status(201).json({ ok: true, goal });
  });

  app.post("/api/pulse/goals/:goalId/contributions", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const goal = state.pulseGoals.find((item) => item.id === request.params.goalId);
    const conversation = state.conversations.find((item) => item.roomId === goal?.roomId);
    if (!goal || !canAccessConversation(state, conversation, viewerId)) return apiError(response, 404, "Цель не найдена.", "PULSE_GOAL_NOT_FOUND");
    try {
      const result = await pulse.contribute({
        userId: viewerId,
        goalId: goal.id,
        amount: request.body?.amount,
        idempotencyKey: String(request.headers["idempotency-key"] || request.body?.idempotencyKey || ""),
      });
      io.emit("data:refresh");
      response.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof PulseError) return apiError(response, error.status, error.message, error.code);
      throw error;
    }
  });

  app.post("/api/pulse/goals/:goalId/cancel", authRequired, async (request, response) => {
    try {
      const result = await pulse.cancelGoal({
        userId: request.nexora.user.id,
        goalId: request.params.goalId,
        idempotencyKey: String(request.headers["idempotency-key"] || request.body?.idempotencyKey || ""),
      });
      io.emit("data:refresh");
      response.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof PulseError) return apiError(response, error.status, error.message, error.code);
      throw error;
    }
  });

  app.patch("/api/users/me", authRequired, async (request, response) => {
    const displayName = request.body?.displayName == null ? null : cleanLine(request.body.displayName, LIMITS.displayName);
    const status = request.body?.status == null ? null : cleanLine(request.body.status, LIMITS.status);
    const bio = request.body?.bio == null ? null : cleanText(request.body.bio, LIMITS.bio);
    const profileColor = request.body?.profileColor == null ? null : cleanLine(request.body.profileColor, 24);
    const avatarFrame = request.body?.avatarFrame == null ? null : cleanLine(request.body.avatarFrame, 24);
    const plusBadgeVisible = request.body?.plusBadgeVisible == null ? null : Boolean(request.body.plusBadgeVisible);
    const notificationSound = request.body?.notificationSound == null ? null : cleanLine(request.body.notificationSound, 24);
    if (displayName != null && displayName.length < 2) return apiError(response, 400, "Имя должно содержать минимум 2 символа.");
    if (notificationSound != null && !["none", "subtle", "pulse", "chime"].includes(notificationSound)) {
      return apiError(response, 400, "Неизвестный звук уведомления.");
    }
    if (profileColor != null && !["violet", "amethyst", "rose", "ocean", "graphite", "emerald"].includes(profileColor)) {
      return apiError(response, 400, "Неизвестный цвет профиля.");
    }
    if (avatarFrame != null && !["none", "pulse", "orbit", "prism"].includes(avatarFrame)) {
      return apiError(response, 400, "Неизвестная рамка аватара.");
    }
    const hasPlus = Boolean(activeEntitlement(store.read(), "user", request.nexora.user.id, "nexora_plus"));
    if (!hasPlus && ((profileColor != null && profileColor !== "violet") || (avatarFrame != null && avatarFrame !== "none"))) {
      return apiError(response, 402, "Этот вариант оформления входит в Nexora Plus.", "PLUS_REQUIRED");
    }
    const updated = await store.mutate((state) => {
      const user = findUser(state, request.nexora.user.id);
      if (displayName != null) user.displayName = displayName;
      if (status != null) user.status = status;
      if (bio != null) user.bio = bio;
      if (profileColor != null) user.profileColor = profileColor;
      if (avatarFrame != null) user.avatarFrame = avatarFrame;
      if (plusBadgeVisible != null) user.plusBadgeVisible = plusBadgeVisible;
      if (notificationSound != null) user.notificationSound = notificationSound;
      return user;
    });
    io.emit("data:refresh");
    response.json({ ok: true, user: publicUser(updated) });
  });

  app.get("/api/users/:id/profile", authRequired, (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const user = findUser(state, request.params.id);
    if (!user) return apiError(response, 404, "Пользователь не найден.", "USER_NOT_FOUND");
    const requestItem = state.contactRequests.find(
      (item) => item.status === "pending" && [item.fromUserId, item.toUserId].includes(viewerId) && [item.fromUserId, item.toUserId].includes(user.id),
    );
    const conversation = state.conversations.find(
      (item) => item.type === "dm" && item.userIds.includes(viewerId) && item.userIds.includes(user.id)
        && (viewerId !== user.id || item.userIds.length === 1),
    );
    const sharedRooms = state.rooms.filter((room) => roomRole(state, room.id, viewerId) && roomRole(state, room.id, user.id));
    const entitlement = state.billingEntitlements.find(
      (item) => item.scopeType === "user" && item.scopeId === user.id && item.productCode === "nexora_plus"
        && item.status !== "revoked" && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()),
    );
    response.json({
      ok: true,
      user: { ...publicUser(user), plus: Boolean(entitlement) },
      relationship: {
        self: viewerId === user.id,
        contact: viewerId !== user.id && areContacts(state, viewerId, user.id),
        blockedByMe: state.blocks.some((block) => block.blockerId === viewerId && block.blockedId === user.id),
        blockedMe: state.blocks.some((block) => block.blockerId === user.id && block.blockedId === viewerId),
        requestDirection: requestItem ? (requestItem.fromUserId === viewerId ? "outgoing" : "incoming") : null,
        conversationId: conversation?.id ?? null,
        sharedRooms: sharedRooms.slice(0, 12).map((room) => ({ id: room.id, name: room.name })),
      },
    });
  });

  app.post("/api/users/me/avatar", authRequired, (request, response, next) => {
    avatarUpload.single("avatar")(request, response, (error) => {
      if (error?.code === "LIMIT_FILE_SIZE") return apiError(response, 413, "Аватар превышает лимит 5 МБ.", "AVATAR_TOO_LARGE");
      if (error) return apiError(response, 400, "Не удалось принять аватар.", "UPLOAD_FAILED");
      next();
    });
  }, async (request, response) => {
    if (!request.file) return apiError(response, 400, "Изображение не выбрано.");
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(request.file.mimetype)) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 415, "Поддерживаются JPG, PNG, WEBP и GIF.", "UNSUPPORTED_AVATAR");
    }
    return maintenance.withFileLock(async () => {
    if (store.stats().bytes + request.file.size > store.stats().quotaBytes) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 507, "На сервере закончился доступный объём хранилища.", "STORAGE_QUOTA");
    }
    const extension = request.file.mimetype === "image/jpeg" ? ".jpg" : request.file.mimetype === "image/png" ? ".png" : request.file.mimetype === "image/gif" ? ".gif" : ".webp";
    const storedName = `${crypto.randomUUID()}${extension}`;
    const finalPath = path.join(uploadsDir, storedName);
    await fs.rename(request.file.path, finalPath);
    let previousFile = null;
    let updated;
    try {
      updated = await store.mutate((state) => {
        const user = findUser(state, request.nexora.user.id);
        previousFile = state.files.find((file) => file.id === user.avatarFileId) ?? null;
        const usedBytes = state.files.filter((file) => !file.deletedAt).reduce((total, file) => total + Number(file.size || 0), 0);
        const nextBytes = usedBytes - Number(previousFile?.size || 0) + Number(request.file.size || 0);
        if (nextBytes > Number(state.settings.storageQuotaBytes)) {
          throw Object.assign(new Error("STORAGE_QUOTA"), { code: "STORAGE_QUOTA" });
        }
        if (previousFile) previousFile.deletedAt = nowIso();
        const file = {
          id: crypto.randomUUID(), conversationId: null, uploaderId: user.id,
          originalName: `avatar-${user.username}${extension}`, storedName,
          mimeType: request.file.mimetype, size: request.file.size, kind: "avatar",
          duration: null, createdAt: nowIso(), deletedAt: null,
        };
        state.files.push(file);
        user.avatarFileId = file.id;
        return user;
      });
    } catch (error) {
      await fs.unlink(finalPath).catch(() => {});
      if (error.code === "STORAGE_QUOTA") return apiError(response, 507, "На сервере закончился доступный объём хранилища.", "STORAGE_QUOTA");
      throw error;
    }
    if (previousFile) await fs.unlink(path.join(uploadsDir, previousFile.storedName)).catch(() => {});
    io.emit("data:refresh");
    response.status(201).json({ ok: true, user: publicUser(updated) });
    });
  });

  app.get("/api/avatars/:id", authRequired, (request, response) => {
    const file = store.read((state) => state.files.find((candidate) => candidate.id === request.params.id && candidate.kind === "avatar" && !candidate.deletedAt));
    if (!file) return apiError(response, 404, "Аватар не найден.");
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Cache-Control", "private, max-age=86400");
    response.sendFile(path.join(uploadsDir, file.storedName));
  });

  app.post("/api/users/me/password", authRequired, async (request, response) => {
    const currentPassword = String(request.body?.currentPassword ?? "");
    const newPassword = String(request.body?.newPassword ?? "");
    const user = store.read((state) => findUser(state, request.nexora.user.id));
    if (!(await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash))) {
      return apiError(response, 403, "Текущий пароль указан неверно.", "INVALID_PASSWORD");
    }
    const nextPasswordError = passwordError(newPassword);
    if (nextPasswordError) return apiError(response, 400, nextPasswordError, "PASSWORD_POLICY");
    const nextPassword = await hashPassword(newPassword);
    const currentTokenHash = request.nexora.tokenHash;
    const revokedSessionIds = await store.mutate((state) => {
      const mutable = findUser(state, user.id);
      mutable.passwordSalt = nextPassword.salt;
      mutable.passwordHash = nextPassword.hash;
      mutable.mustChangePassword = false;
      const revoked = state.sessions.filter((session) => session.userId === user.id && session.tokenHash !== currentTokenHash).map((session) => session.id);
      state.sessions = state.sessions.filter((session) => session.userId !== user.id || session.tokenHash === currentTokenHash);
      return revoked;
    });
    for (const sessionId of revokedSessionIds) io.to(sessionSocketRoom(sessionId)).disconnectSockets(true);
    refreshUsers([user.id]);
    response.json({ ok: true, user: publicUser(store.read((state) => findUser(state, user.id))) });
  });

  app.post("/api/users/me/totp/setup", authRequired, async (request, response) => {
    const user = store.read((state) => findUser(state, request.nexora.user.id));
    if (user.totpEnabled) return apiError(response, 409, "Двухфакторная защита уже включена.", "TOTP_ALREADY_ENABLED");
    const setup = totp.generate(user.username);
    pendingTotp.set(user.id, { secret: setup.secret, expiresAt: Date.now() + 10 * 60 * 1000 });
    const qrCode = await QRCode.toDataURL(setup.uri, { width: 240, margin: 1, errorCorrectionLevel: "M" });
    response.json({ ok: true, secret: setup.secret, uri: setup.uri, qrCode, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  });

  app.post("/api/users/me/totp/enable", authRequired, async (request, response) => {
    const pending = pendingTotp.get(request.nexora.user.id);
    if (!pending || pending.expiresAt <= Date.now()) {
      pendingTotp.delete(request.nexora.user.id);
      return apiError(response, 410, "Настройка истекла. Создайте новый QR-код.", "TOTP_SETUP_EXPIRED");
    }
    if (!totp.verify(pending.secret, request.body?.code)) return apiError(response, 400, "Неверный код приложения-аутентификатора.", "TOTP_INVALID");
    const recoveryCodes = totp.createRecoveryCodes();
    await store.mutate((state) => {
      const user = findUser(state, request.nexora.user.id);
      user.totpSecret = totp.encrypt(pending.secret);
      user.totpEnabled = true;
      user.recoveryCodeHashes = recoveryCodes.map(totp.recoveryCodeHash);
      appendEvent(state, { type: "security.totp.enabled", actorId: user.id, userIds: [user.id] });
    });
    pendingTotp.delete(request.nexora.user.id);
    response.json({ ok: true, recoveryCodes });
  });

  app.post("/api/users/me/totp/recovery-codes", authRequired, async (request, response) => {
    const user = store.read((state) => findUser(state, request.nexora.user.id));
    const verification = user?.totpEnabled ? verifySecondFactor(user, request.body?.code) : { ok: false };
    if (!verification.ok) return apiError(response, 401, "Подтвердите действие одноразовым кодом.", "TOTP_INVALID");
    const recoveryCodes = totp.createRecoveryCodes();
    await store.mutate((state) => {
      const current = findUser(state, user.id);
      current.recoveryCodeHashes = recoveryCodes.map(totp.recoveryCodeHash);
      appendEvent(state, { type: "security.recovery_codes.rotated", actorId: user.id, userIds: [user.id] });
    });
    response.json({ ok: true, recoveryCodes });
  });

  app.delete("/api/users/me/totp", authRequired, async (request, response) => {
    const user = store.read((state) => findUser(state, request.nexora.user.id));
    if (!user?.totpEnabled) return apiError(response, 409, "Двухфакторная защита уже выключена.", "TOTP_NOT_ENABLED");
    if (!(await verifyPassword(String(request.body?.password ?? ""), user.passwordSalt, user.passwordHash))) return apiError(response, 401, "Неверный пароль.", "INVALID_CREDENTIALS");
    const verification = verifySecondFactor(user, request.body?.code);
    if (!verification.ok) return apiError(response, 401, "Неверный одноразовый или резервный код.", "TOTP_INVALID");
    await store.mutate((state) => {
      const current = findUser(state, user.id);
      current.totpEnabled = false;
      current.totpSecret = null;
      current.recoveryCodeHashes = [];
      appendEvent(state, { type: "security.totp.disabled", actorId: user.id, userIds: [user.id] });
    });
    response.json({ ok: true });
  });

  app.get("/api/sessions", authRequired, (request, response) => {
    const currentHash = hashToken(request.nexora.token);
    const sessions = store.read((state) => state.sessions
      .filter((session) => session.userId === request.nexora.user.id && Date.parse(session.expiresAt) > Date.now())
      .sort((a, b) => Date.parse(b.lastSeenAt ?? b.createdAt) - Date.parse(a.lastSeenAt ?? a.createdAt))
      .map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt ?? session.createdAt,
        userAgent: session.userAgent || "Неизвестное устройство",
        ip: session.ip || "—",
        current: session.tokenHash === currentHash,
      })));
    response.json({ ok: true, sessions });
  });

  app.delete("/api/sessions/:id", authRequired, async (request, response) => {
    const currentHash = request.nexora.tokenHash;
    let currentEnded = false;
    const removed = await store.mutate((state) => {
      const session = state.sessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id);
      if (!session) return false;
      currentEnded = session.tokenHash === currentHash;
      state.sessions = state.sessions.filter((item) => item.id !== session.id);
      return true;
    });
    if (!removed) return apiError(response, 404, "Сессия не найдена.");
    if (currentEnded) clearSessionCookie(response, tlsEnabled);
    response.json({ ok: true, currentEnded });
    setImmediate(() => io.to(sessionSocketRoom(request.params.id)).disconnectSockets(true));
  });

  app.post("/api/sessions/revoke-all", authRequired, async (request, response) => {
    const userId = request.nexora.user.id;
    await store.mutate((state) => { state.sessions = state.sessions.filter((session) => session.userId !== userId); });
    clearSessionCookie(response, tlsEnabled);
    response.json({ ok: true });
    setImmediate(() => io.to(userSocketRoom(userId)).disconnectSockets(true));
  });

  app.get("/api/users/search", authRequired, (request, response) => {
    const query = cleanLine(request.query.q, 48).toLowerCase().replace(/^@/, "");
    if (query.length < 2) return response.json({ ok: true, users: [] });
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const users = state.users
      .filter((user) => !user.disabledAt && user.id !== viewerId && (user.username.includes(query) || user.displayName.toLowerCase().includes(query)))
      .slice(0, 20)
      .map((user) => {
        const requestItem = state.contactRequests.find(
          (item) => item.status === "pending" && [item.fromUserId, item.toUserId].includes(viewerId) && [item.fromUserId, item.toUserId].includes(user.id),
        );
        return {
          ...publicUser(user),
          contact: areContacts(state, viewerId, user.id),
          requestDirection: requestItem ? (requestItem.fromUserId === viewerId ? "outgoing" : "incoming") : null,
          blockedByMe: state.blocks.some((block) => block.blockerId === viewerId && block.blockedId === user.id),
        };
      });
    response.json({ ok: true, users });
  });

  app.post("/api/contacts/requests", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const targetId = cleanLine(request.body?.userId, 64);
    try {
      const contactRequest = await store.mutate((state) => {
        if (targetId === viewerId || !findUser(state, targetId)) throw Object.assign(new Error("USER_NOT_FOUND"), { status: 404 });
        if (isBlockedEither(state, viewerId, targetId)) throw Object.assign(new Error("CONTACT_BLOCKED"), { status: 403 });
        if (areContacts(state, viewerId, targetId)) throw Object.assign(new Error("ALREADY_CONTACTS"), { status: 409 });
        const existing = state.contactRequests.find(
          (item) => item.status === "pending" && [item.fromUserId, item.toUserId].includes(viewerId) && [item.fromUserId, item.toUserId].includes(targetId),
        );
        if (existing) throw Object.assign(new Error("REQUEST_EXISTS"), { status: 409 });
        const created = { id: crypto.randomUUID(), fromUserId: viewerId, toUserId: targetId, status: "pending", createdAt: nowIso() };
        state.contactRequests.push(created);
        return created;
      });
      io.to(userSocketRoom(targetId)).emit("contact:request", { id: contactRequest.id, from: publicUser(request.nexora.user) });
      refreshUsers([viewerId, targetId]);
      response.status(201).json({ ok: true, requestId: contactRequest.id });
    } catch (error) {
      const messages = {
        USER_NOT_FOUND: "Пользователь не найден.",
        CONTACT_BLOCKED: "Заявка недоступна из-за блокировки.",
        ALREADY_CONTACTS: "Пользователь уже в контактах.",
        REQUEST_EXISTS: "Заявка уже существует.",
      };
      apiError(response, error.status ?? 400, messages[error.message] ?? "Не удалось отправить заявку.", error.message);
    }
  });

  app.post("/api/contacts/requests/:id/accept", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const item = state.contactRequests.find((requestItem) => requestItem.id === request.params.id && requestItem.status === "pending");
        if (!item || item.toUserId !== viewerId) throw Object.assign(new Error("REQUEST_NOT_FOUND"), { status: 404 });
        if (isBlockedEither(state, item.fromUserId, item.toUserId)) throw Object.assign(new Error("CONTACT_BLOCKED"), { status: 403 });
        item.status = "accepted";
        item.resolvedAt = nowIso();
        const [userAId, userBId] = [item.fromUserId, item.toUserId].sort();
        if (!areContacts(state, userAId, userBId)) state.contacts.push({ id: crypto.randomUUID(), userAId, userBId, createdAt: nowIso() });
        let conversation = state.conversations.find(
          (candidate) => candidate.type === "dm" && candidate.userIds.includes(userAId) && candidate.userIds.includes(userBId),
        );
        if (!conversation) {
          conversation = { id: crypto.randomUUID(), type: "dm", userIds: [userAId, userBId], roomId: null, createdAt: nowIso() };
          state.conversations.push(conversation);
        }
        return { conversation, userIds: [userAId, userBId] };
      });
      await Promise.all(result.userIds.map((userId) => joinConversationSockets(userId, result.conversation.id)));
      refreshUsers(result.userIds);
      io.to(userSocketRoom(result.userIds.find((id) => id !== viewerId))).emit("contact:accepted", { by: publicUser(request.nexora.user) });
      response.json({ ok: true, conversationId: result.conversation.id });
    } catch (error) {
      apiError(response, error.status ?? 400, error.message === "CONTACT_BLOCKED" ? "Контакт недоступен из-за блокировки." : "Заявка не найдена.", error.message);
    }
  });

  app.post("/api/contacts/requests/:id/reject", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let otherUserId = null;
    const removed = await store.mutate((state) => {
      const index = state.contactRequests.findIndex((item) => item.id === request.params.id && item.status === "pending" && item.toUserId === viewerId);
      if (index < 0) return false;
      otherUserId = state.contactRequests[index].fromUserId;
      state.contactRequests.splice(index, 1);
      return true;
    });
    if (!removed) return apiError(response, 404, "Заявка не найдена.");
    refreshUsers([viewerId, otherUserId]);
    response.json({ ok: true });
  });

  app.post("/api/blocks/:userId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const targetId = request.params.userId;
    if (viewerId === targetId) return apiError(response, 400, "Нельзя заблокировать себя.");
    await store.mutate((state) => {
      if (!findUser(state, targetId)) throw Object.assign(new Error("USER_NOT_FOUND"), { status: 404 });
      if (!state.blocks.some((block) => block.blockerId === viewerId && block.blockedId === targetId)) {
        state.blocks.push({ id: crypto.randomUUID(), blockerId: viewerId, blockedId: targetId, createdAt: nowIso() });
      }
      state.contactRequests = state.contactRequests.filter(
        (item) => !([item.fromUserId, item.toUserId].includes(viewerId) && [item.fromUserId, item.toUserId].includes(targetId)),
      );
      state.contacts = state.contacts.filter(
        (contact) => !([contact.userAId, contact.userBId].includes(viewerId) && [contact.userAId, contact.userBId].includes(targetId)),
      );
    }).catch((error) => {
      if (error.status) apiError(response, error.status, "Пользователь не найден.");
      else throw error;
    });
    if (response.headersSent) return;
    refreshUsers([viewerId, targetId]);
    response.json({ ok: true });
  });

  app.delete("/api/blocks/:userId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    await store.mutate((state) => {
      state.blocks = state.blocks.filter((block) => !(block.blockerId === viewerId && block.blockedId === request.params.userId));
    });
    refreshUsers([viewerId]);
    response.json({ ok: true });
  });

  app.delete("/api/contacts/:userId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const targetId = request.params.userId;
    const removed = await store.mutate((state) => {
      const before = state.contacts.length;
      state.contacts = state.contacts.filter(
        (contact) => !([contact.userAId, contact.userBId].includes(viewerId) && [contact.userAId, contact.userBId].includes(targetId)),
      );
      state.contactRequests = state.contactRequests.filter(
        (item) => !([item.fromUserId, item.toUserId].includes(viewerId) && [item.fromUserId, item.toUserId].includes(targetId)),
      );
      return state.contacts.length !== before;
    });
    if (!removed) return apiError(response, 404, "Контакт не найден.");
    refreshUsers([viewerId, targetId]);
    response.json({ ok: true });
  });

  app.post("/api/rooms", authRequired, async (request, response) => {
    const name = cleanLine(request.body?.name, LIMITS.roomName);
    const privacy = request.body?.privacy === "private" ? "private" : "public";
    if (name.length < 2) return apiError(response, 400, "Название комнаты слишком короткое.");
    const viewerId = request.nexora.user.id;
    const result = await store.mutate((state) => {
      const baseSlug = normalizeRoomSlug(name);
      let slug = baseSlug;
      let suffix = 2;
      while (state.rooms.some((room) => room.slug === slug)) slug = `${baseSlug}-${suffix++}`;
      const room = {
        id: crypto.randomUUID(), name, slug, privacy, ownerId: viewerId,
        inviteCode: crypto.randomBytes(8).toString("base64url"),
        inviteExpiresAt: null, inviteMaxUses: 0, inviteUseCount: 0,
        joinPolicy: privacy === "private" ? "invite" : "open",
        readOnly: false, slowModeSeconds: 0, allowFiles: true, allowImages: true, allowVoice: true,
        description: cleanText(request.body?.description, 500), rules: cleanText(request.body?.rules, 2_000),
        categoryId: null, announcementOnly: false, preapproveMessages: false,
        createdAt: nowIso(),
      };
      const conversation = { id: crypto.randomUUID(), type: "room", roomId: room.id, userIds: [], createdAt: nowIso() };
      state.rooms.push(room);
      state.conversations.push(conversation);
      state.roomMembers.push({ roomId: room.id, userId: viewerId, role: "owner", joinedAt: nowIso() });
      addRoomAudit(state, room.id, viewerId, "room.created", null, { name, privacy });
      addSystemMessage(state, conversation, viewerId, "room.created", `${displayNameFor(state, viewerId)} создал(а) комнату`);
      return { room, conversation };
    });
    await joinConversationSockets(viewerId, result.conversation.id);
    refreshUsers([viewerId]);
    log(`@${request.nexora.user.username} создал комнату «${name}»`);
    response.status(201).json({ ok: true, room: roomView(store.read(), result.room, viewerId, onlineUserIds()) });
  });

  app.post("/api/rooms/:id/join", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const room = state.rooms.find((candidate) => candidate.id === request.params.id);
        if (!room) throw Object.assign(new Error("ROOM_NOT_FOUND"), { status: 404 });
        if (room.privacy !== "public") throw Object.assign(new Error("PRIVATE_ROOM"), { status: 403 });
        if (isRoomBanned(state, room.id, viewerId)) throw Object.assign(new Error("ROOM_BANNED"), { status: 403 });
        const conversation = state.conversations.find((candidate) => candidate.roomId === room.id);
        if (roomRole(state, room.id, viewerId)) return { conversation, alreadyJoined: true };
        if (room.joinPolicy === "request") {
          let joinRequest = state.roomJoinRequests.find((item) => item.roomId === room.id && item.userId === viewerId && item.status === "pending");
          if (!joinRequest) {
            joinRequest = { id: crypto.randomUUID(), roomId: room.id, userId: viewerId, status: "pending", createdAt: nowIso() };
            state.roomJoinRequests.push(joinRequest);
            addRoomAudit(state, room.id, viewerId, "join.requested", viewerId);
          }
          return { conversation, pending: true, requestId: joinRequest.id };
        }
        state.roomMembers.push({ roomId: room.id, userId: viewerId, role: "member", joinedAt: nowIso() });
        const systemMessage = addSystemMessage(state, conversation, viewerId, "member.joined", `${displayNameFor(state, viewerId)} присоединился(-ась) к комнате`, viewerId);
        addRoomAudit(state, room.id, viewerId, "member.joined", viewerId, { source: "public" });
        return { conversation, systemMessage };
      });
    } catch (error) {
      const messages = { PRIVATE_ROOM: "Нужен код приглашения.", ROOM_BANNED: "Вы заблокированы в этой комнате.", ROOM_NOT_FOUND: "Комната не найдена." };
      return apiError(response, error.status ?? 400, messages[error.message] ?? "Не удалось присоединиться.", error.message);
    }
    if (result.pending) {
      refreshUsers(usersForConversation(store.read(), result.conversation));
      return response.status(202).json({ ok: true, pending: true, requestId: result.requestId });
    }
    await joinConversationSockets(viewerId, result.conversation.id);
    io.to(conversationSocketRoom(result.conversation.id)).emit("room:member-joined", { user: publicUser(request.nexora.user) });
    if (result.systemMessage) {
      const fresh = store.read();
      for (const participantId of usersForConversation(fresh, result.conversation)) {
        io.to(userSocketRoom(participantId)).emit("message:new", serializeMessage(fresh, result.systemMessage, participantId));
      }
    }
    refreshUsers(usersForConversation(store.read(), result.conversation));
    response.json({ ok: true, conversationId: result.conversation.id });
  });

  app.post("/api/rooms/join-by-code", authRequired, async (request, response) => {
    const code = cleanLine(request.body?.code, 64);
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const multipleInvite = state.roomInvites.find((candidate) => candidate.code === code && activeRoomInvite(candidate));
        const room = state.rooms.find((candidate) => candidate.inviteCode === code || candidate.id === multipleInvite?.roomId);
        if (!room) throw Object.assign(new Error("INVALID_CODE"), { status: 404 });
        if (isRoomBanned(state, room.id, viewerId)) throw Object.assign(new Error("ROOM_BANNED"), { status: 403 });
        if (!multipleInvite && room.inviteExpiresAt && Date.parse(room.inviteExpiresAt) <= Date.now()) throw Object.assign(new Error("INVITE_EXPIRED"), { status: 410 });
        if (!multipleInvite && Number(room.inviteMaxUses || 0) > 0 && Number(room.inviteUseCount || 0) >= Number(room.inviteMaxUses)) {
          throw Object.assign(new Error("INVITE_EXHAUSTED"), { status: 410 });
        }
        const conversation = state.conversations.find((candidate) => candidate.roomId === room.id);
        let systemMessage = null;
        if (!roomRole(state, room.id, viewerId)) {
          state.roomMembers.push({ roomId: room.id, userId: viewerId, role: "member", joinedAt: nowIso() });
          if (!multipleInvite) room.inviteUseCount = Number(room.inviteUseCount || 0) + 1;
          if (multipleInvite) multipleInvite.useCount = Number(multipleInvite.useCount || 0) + 1;
          state.roomJoinRequests = state.roomJoinRequests.filter((item) => !(item.roomId === room.id && item.userId === viewerId));
          systemMessage = addSystemMessage(state, conversation, viewerId, "member.joined", `${displayNameFor(state, viewerId)} присоединился(-ась) по приглашению`, viewerId);
          addRoomAudit(state, room.id, viewerId, "member.joined", viewerId, { source: "invite" });
        }
        return { room, conversation, systemMessage };
      });
    } catch (error) {
      const messages = {
        INVALID_CODE: "Код приглашения не найден.", ROOM_BANNED: "Вы заблокированы в этой комнате.",
        INVITE_EXPIRED: "Срок действия приглашения истёк.", INVITE_EXHAUSTED: "Лимит использований приглашения исчерпан.",
      };
      return apiError(response, error.status ?? 400, messages[error.message] ?? "Приглашение недоступно.", error.message);
    }
    await joinConversationSockets(viewerId, result.conversation.id);
    if (result.systemMessage) {
      const fresh = store.read();
      for (const participantId of usersForConversation(fresh, result.conversation)) {
        io.to(userSocketRoom(participantId)).emit("message:new", serializeMessage(fresh, result.systemMessage, participantId));
      }
    }
    refreshUsers(usersForConversation(store.read(), result.conversation));
    response.json({ ok: true, conversationId: result.conversation.id });
  });

  app.delete("/api/rooms/:roomId/members/:userId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const room = state.rooms.find((candidate) => candidate.id === request.params.roomId);
        const candidate = state.conversations.find((item) => item.roomId === room?.id);
        if (!room || !candidate) throw Object.assign(new Error("ROOM_NOT_FOUND"), { status: 404 });
        if (!canModerateConversation(state, candidate, viewerId) && !roomPermission(state, room.id, viewerId, "room.manage_members")) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        if (request.params.userId === room.ownerId) throw Object.assign(new Error("OWNER"), { status: 400 });
        const viewerRole = roomRole(state, room.id, viewerId);
        const viewerAdmin = findUser(state, viewerId)?.role === "server_admin";
        const targetRole = roomRole(state, room.id, request.params.userId);
        if (!targetRole) throw Object.assign(new Error("MEMBER_NOT_FOUND"), { status: 404 });
        if (["owner", "moderator"].includes(targetRole) && !viewerAdmin && viewerRole !== "owner") throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        if (viewerRole === "moderator" && targetRole === "moderator") throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        const targetName = displayNameFor(state, request.params.userId);
        state.roomMembers = state.roomMembers.filter((member) => !(member.roomId === room.id && member.userId === request.params.userId));
        const systemMessage = addSystemMessage(state, candidate, viewerId, "member.removed", `${targetName} удалён(а) из комнаты`, request.params.userId);
        addRoomAudit(state, room.id, viewerId, "member.removed", request.params.userId);
        return { conversation: candidate, systemMessage };
      });
    } catch (error) {
      return apiError(response, error.status ?? 400, error.message === "FORBIDDEN" ? "Недостаточно прав." : "Нельзя удалить этого участника.", error.message);
    }
    await leaveConversationSockets(request.params.userId, result.conversation.id);
    const fresh = store.read();
    for (const participantId of usersForConversation(fresh, result.conversation)) {
      io.to(userSocketRoom(participantId)).emit("message:new", serializeMessage(fresh, result.systemMessage, participantId));
    }
    refreshUsers([viewerId, request.params.userId, ...usersForConversation(fresh, result.conversation)]);
    io.to(userSocketRoom(request.params.userId)).emit("room:removed", { conversationId: result.conversation.id });
    response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/leave", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.room || !management.conversation || !management.role) throw Object.assign(new Error("ROOM_NOT_FOUND"), { status: 404 });
        if (management.room.ownerId === viewerId) throw Object.assign(new Error("OWNER_TRANSFER_REQUIRED"), { status: 409 });
        state.roomMembers = state.roomMembers.filter((member) => !(member.roomId === management.room.id && member.userId === viewerId));
        const systemMessage = addSystemMessage(state, management.conversation, viewerId, "member.left", `${displayNameFor(state, viewerId)} покинул(а) комнату`, viewerId);
        addRoomAudit(state, management.room.id, viewerId, "member.left", viewerId);
        return { conversation: management.conversation, systemMessage };
      });
    } catch (error) {
      const message = error.message === "OWNER_TRANSFER_REQUIRED" ? "Сначала передайте владение комнатой." : "Комната недоступна.";
      return apiError(response, error.status ?? 400, message, error.message);
    }
    await leaveConversationSockets(viewerId, result.conversation.id);
    const fresh = store.read();
    for (const participantId of usersForConversation(fresh, result.conversation)) {
      io.to(userSocketRoom(participantId)).emit("message:new", serializeMessage(fresh, result.systemMessage, participantId));
    }
    refreshUsers([viewerId, ...usersForConversation(fresh, result.conversation)]);
    response.json({ ok: true });
  });

  app.patch("/api/rooms/:roomId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canConfigure) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        const changed = {};
        if (request.body?.name != null) {
          const name = cleanLine(request.body.name, LIMITS.roomName);
          if (name.length < 2) throw Object.assign(new Error("ROOM_NAME"), { status: 400 });
          if (name !== management.room.name) { changed.name = { from: management.room.name, to: name }; management.room.name = name; }
        }
        if (request.body?.readOnly != null) { management.room.readOnly = Boolean(request.body.readOnly); changed.readOnly = management.room.readOnly; }
        if (request.body?.allowFiles != null) { management.room.allowFiles = Boolean(request.body.allowFiles); changed.allowFiles = management.room.allowFiles; }
        if (request.body?.allowImages != null) { management.room.allowImages = Boolean(request.body.allowImages); changed.allowImages = management.room.allowImages; }
        if (request.body?.allowVoice != null) { management.room.allowVoice = Boolean(request.body.allowVoice); changed.allowVoice = management.room.allowVoice; }
        if (request.body?.description != null) { management.room.description = cleanText(request.body.description, 500); changed.description = true; }
        if (request.body?.rules != null) { management.room.rules = cleanText(request.body.rules, 2_000); changed.rules = true; }
        if (request.body?.announcementOnly != null) { management.room.announcementOnly = Boolean(request.body.announcementOnly); changed.announcementOnly = management.room.announcementOnly; }
        if (request.body?.preapproveMessages != null) { management.room.preapproveMessages = Boolean(request.body.preapproveMessages); changed.preapproveMessages = management.room.preapproveMessages; }
        if (request.body?.slowModeSeconds != null) {
          management.room.slowModeSeconds = Math.max(0, Math.min(3600, Math.round(Number(request.body.slowModeSeconds) || 0)));
          changed.slowModeSeconds = management.room.slowModeSeconds;
        }
        if (request.body?.joinPolicy != null) {
          const allowed = management.room.privacy === "private" ? ["invite", "request"] : ["open", "request", "invite"];
          if (!allowed.includes(request.body.joinPolicy)) throw Object.assign(new Error("JOIN_POLICY"), { status: 400 });
          management.room.joinPolicy = request.body.joinPolicy;
          changed.joinPolicy = management.room.joinPolicy;
        }
        addRoomAudit(state, management.room.id, viewerId, "room.settings_updated", null, changed);
        return management.conversation;
      });
    } catch (error) {
      return apiError(response, error.status ?? 400, error.message === "FORBIDDEN" ? "Недостаточно прав." : "Настройки комнаты не сохранены.", error.message);
    }
    refreshUsers(usersForConversation(store.read(), result));
    response.json({ ok: true, conversation: serializeConversation(store.read(), result, viewerId, onlineUserIds()) });
  });

  app.patch("/api/rooms/:roomId/members/:userId/role", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const role = request.body?.role === "moderator" ? "moderator" : request.body?.role === "member" ? "member" : null;
    if (!role) return apiError(response, 400, "Допустимы роли member и moderator.", "INVALID_ROLE");
    try {
      await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canManage) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        const member = state.roomMembers.find((item) => item.roomId === management.room.id && item.userId === request.params.userId);
        if (!member || member.role === "owner") throw Object.assign(new Error("MEMBER_NOT_FOUND"), { status: 404 });
        member.role = role;
        addRoomAudit(state, management.room.id, viewerId, role === "moderator" ? "moderator.assigned" : "moderator.removed", member.userId);
      });
    } catch (error) {
      return apiError(response, error.status ?? 400, error.message === "FORBIDDEN" ? "Только владелец может назначать модераторов." : "Участник не найден.", error.message);
    }
    io.emit("data:refresh");
    response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/transfer", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const targetUserId = cleanLine(request.body?.userId, 64);
    try {
      await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canManage || (!management.serverAdmin && management.room.ownerId !== viewerId)) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        if (targetUserId === management.room.ownerId) return;
        const currentOwner = state.roomMembers.find((item) => item.roomId === management.room.id && item.userId === management.room.ownerId);
        const target = state.roomMembers.find((item) => item.roomId === management.room.id && item.userId === targetUserId);
        if (!target) throw Object.assign(new Error("MEMBER_NOT_FOUND"), { status: 404 });
        const previousOwnerId = management.room.ownerId;
        if (currentOwner) currentOwner.role = "moderator";
        target.role = "owner";
        management.room.ownerId = targetUserId;
        addRoomAudit(state, management.room.id, viewerId, "owner.transferred", targetUserId, { previousOwnerId });
        addSystemMessage(state, management.conversation, viewerId, "owner.transferred", `${displayNameFor(state, targetUserId)} теперь владелец комнаты`, targetUserId);
      });
    } catch (error) {
      return apiError(response, error.status ?? 400, error.message === "FORBIDDEN" ? "Передача владения недоступна." : "Участник не найден.", error.message);
    }
    io.emit("data:refresh");
    response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/bans/:userId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canManageMembers) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        const targetRole = roomRole(state, management.room.id, request.params.userId);
        if (request.params.userId === management.room.ownerId || (management.role === "moderator" && targetRole === "moderator")) {
          throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        }
        if (!findUser(state, request.params.userId)) throw Object.assign(new Error("USER_NOT_FOUND"), { status: 404 });
        let ban = state.roomBans.find((item) => item.roomId === management.room.id && item.userId === request.params.userId);
        const durationMinutes = Math.max(0, Math.min(525_600, Math.round(Number(request.body?.durationMinutes) || 0)));
        const expiresAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60_000).toISOString() : null;
        if (!ban) {
          ban = { id: crypto.randomUUID(), roomId: management.room.id, userId: request.params.userId, byUserId: viewerId, reason: cleanLine(request.body?.reason, 180), expiresAt, createdAt: nowIso() };
          state.roomBans.push(ban);
        } else Object.assign(ban, { byUserId: viewerId, reason: cleanLine(request.body?.reason, 180), expiresAt, createdAt: nowIso() });
        state.roomMembers = state.roomMembers.filter((member) => !(member.roomId === management.room.id && member.userId === request.params.userId));
        state.roomJoinRequests = state.roomJoinRequests.filter((item) => !(item.roomId === management.room.id && item.userId === request.params.userId));
        const systemMessage = addSystemMessage(state, management.conversation, viewerId, "member.banned", `${displayNameFor(state, request.params.userId)} заблокирован(а) в комнате`, request.params.userId);
        addRoomAudit(state, management.room.id, viewerId, "member.banned", request.params.userId, { reason: ban.reason });
        return { conversation: management.conversation, systemMessage };
      });
    } catch (error) {
      return apiError(response, error.status ?? 400, error.message === "FORBIDDEN" ? "Нельзя заблокировать этого участника." : "Пользователь не найден.", error.message);
    }
    await leaveConversationSockets(request.params.userId, result.conversation.id);
    io.to(userSocketRoom(request.params.userId)).emit("room:removed", { conversationId: result.conversation.id, banned: true });
    io.emit("data:refresh");
    response.status(201).json({ ok: true });
  });

  app.delete("/api/rooms/:roomId/bans/:userId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    try {
      await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canManageMembers) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        state.roomBans = state.roomBans.filter((item) => !(item.roomId === management.room.id && item.userId === request.params.userId));
        addRoomAudit(state, management.room.id, viewerId, "member.unbanned", request.params.userId);
      });
    } catch (error) {
      return apiError(response, error.status ?? 403, "Недостаточно прав.", error.message);
    }
    refreshUsers([viewerId, request.params.userId]);
    response.json({ ok: true });
  });

  app.post("/api/rooms/:roomId/invite", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const action = request.body?.action === "revoke" ? "revoke" : "rotate";
    let room;
    try {
      room = await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canManage) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        if (action === "revoke") {
          management.room.inviteCode = null;
          management.room.inviteExpiresAt = null;
          management.room.inviteMaxUses = 0;
          management.room.inviteUseCount = 0;
        } else {
          const hours = Math.max(0, Math.min(8760, Number(request.body?.expiresInHours) || 0));
          management.room.inviteCode = crypto.randomBytes(12).toString("base64url");
          management.room.inviteExpiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
          management.room.inviteMaxUses = Math.max(0, Math.min(100_000, Math.round(Number(request.body?.maxUses) || 0)));
          management.room.inviteUseCount = 0;
        }
        addRoomAudit(state, management.room.id, viewerId, action === "revoke" ? "invite.revoked" : "invite.rotated", null, {
          expiresAt: management.room.inviteExpiresAt, maxUses: management.room.inviteMaxUses,
        });
        return management.room;
      });
    } catch (error) {
      return apiError(response, error.status ?? 403, "Управление приглашением недоступно.", error.message);
    }
    refreshUsers(usersForConversation(store.read(), store.read((state) => state.conversations.find((item) => item.roomId === room.id))));
    response.json({ ok: true, inviteCode: room.inviteCode, inviteExpiresAt: room.inviteExpiresAt, inviteMaxUses: room.inviteMaxUses, inviteUseCount: room.inviteUseCount });
  });

  app.patch("/api/rooms/:roomId/join-requests/:requestId", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const decision = request.body?.decision === "accept" ? "accepted" : request.body?.decision === "reject" ? "rejected" : null;
    if (!decision) return apiError(response, 400, "Укажите accept или reject.", "INVALID_DECISION");
    let result;
    try {
      result = await store.mutate((state) => {
        const management = roomManagement(state, request.params.roomId, viewerId);
        if (!management.canManageMembers) throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        const joinRequest = state.roomJoinRequests.find((item) => item.id === request.params.requestId && item.roomId === management.room.id && item.status === "pending");
        if (!joinRequest) throw Object.assign(new Error("REQUEST_NOT_FOUND"), { status: 404 });
        if (isRoomBanned(state, management.room.id, joinRequest.userId)) throw Object.assign(new Error("ROOM_BANNED"), { status: 409 });
        joinRequest.status = decision;
        joinRequest.resolvedAt = nowIso();
        joinRequest.resolvedBy = viewerId;
        let systemMessage = null;
        if (decision === "accepted" && !roomRole(state, management.room.id, joinRequest.userId)) {
          state.roomMembers.push({ roomId: management.room.id, userId: joinRequest.userId, role: "member", joinedAt: nowIso() });
          systemMessage = addSystemMessage(state, management.conversation, joinRequest.userId, "member.joined", `${displayNameFor(state, joinRequest.userId)} присоединился(-ась) к комнате`, joinRequest.userId);
        }
        addRoomAudit(state, management.room.id, viewerId, `join.${decision}`, joinRequest.userId);
        return { conversation: management.conversation, userId: joinRequest.userId, systemMessage };
      });
    } catch (error) {
      return apiError(response, error.status ?? 400, error.message === "FORBIDDEN" ? "Недостаточно прав." : "Заявка не найдена.", error.message);
    }
    if (decision === "accepted") await joinConversationSockets(result.userId, result.conversation.id);
    io.emit("data:refresh");
    response.json({ ok: true, decision });
  });

  app.get("/api/conversations/:id/messages", authRequired, (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    if (!canAccessConversation(state, conversation, viewerId)) return apiError(response, 403, "Чат недоступен.", "FORBIDDEN");
    const canReview = canModerateConversation(state, conversation, viewerId)
      || (conversation.type === "room" && roomPermission(state, conversation.roomId, viewerId, "room.manage_reports"));
    const allMessages = state.messages
      .filter((message) => message.conversationId === conversation.id && (!message.pendingApproval || canReview || message.senderId === viewerId))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const aroundId = cleanLine(request.query.around, 64);
    if (aroundId) {
      const index = allMessages.findIndex((message) => message.id === aroundId);
      if (index < 0) return apiError(response, 404, "Сообщение не найдено.");
      const start = Math.max(0, index - Math.floor(LIMITS.historyPage / 2));
      const end = Math.min(allMessages.length, start + LIMITS.historyPage);
      return response.json({
        ok: true,
        messages: allMessages.slice(start, end).map((message) => serializeMessage(state, message, viewerId)),
        hasMore: start > 0,
        hasMoreAfter: end < allMessages.length,
        anchorId: aroundId,
      });
    }
    const before = request.query.before ? Date.parse(request.query.before) : Number.POSITIVE_INFINITY;
    const candidates = allMessages.filter((message) => Date.parse(message.createdAt) < before);
    const messages = candidates.slice(-LIMITS.historyPage).map((message) => serializeMessage(state, message, viewerId));
    response.json({ ok: true, messages, hasMore: candidates.length > messages.length, hasMoreAfter: false });
  });

  app.get("/api/search/messages", authRequired, (request, response) => {
    const query = cleanText(request.query.q, 120).toLocaleLowerCase("ru");
    if (query.length < 2) return response.json({ ok: true, results: [] });
    const viewerId = request.nexora.user.id;
    const requestedConversationId = cleanLine(request.query.conversationId, 64);
    const requestedUserId = cleanLine(request.query.userId, 64);
    const requestedType = cleanLine(request.query.type, 24);
    const before = request.query.before ? Date.parse(request.query.before) : Number.POSITIVE_INFINITY;
    const after = request.query.after ? Date.parse(request.query.after) : Number.NEGATIVE_INFINITY;
    const state = store.read();
    if (requestedConversationId && !canAccessConversation(state, findConversation(state, requestedConversationId), viewerId)) {
      return apiError(response, 403, "Чат недоступен.", "FORBIDDEN");
    }
    const conversations = new Map(conversationList(state, viewerId, onlineUserIds()).map((conversation) => [conversation.id, conversation]));
    const indexedIds = new Set(store.searchMessageIds(query, { conversationId: requestedConversationId || null, limit: 160 }));
    const results = state.messages
      .filter((message) => !message.deletedAt && !message.pendingApproval && (!requestedConversationId || message.conversationId === requestedConversationId))
      .filter((message) => !requestedUserId || message.senderId === requestedUserId)
      .filter((message) => !requestedType || message.type === requestedType || (requestedType === "media" && ["image", "file", "voice"].includes(message.type)))
      .filter((message) => Date.parse(message.createdAt) < before && Date.parse(message.createdAt) > after)
      .filter((message) => {
        if (!conversations.has(message.conversationId)) return false;
        const file = message.fileId ? state.files.find((item) => item.id === message.fileId) : null;
        return indexedIds.has(message.id) || String(file?.originalName || "").toLocaleLowerCase("ru").includes(query);
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 80)
      .map((message) => {
        const conversationView = conversations.get(message.conversationId);
        return {
          message: serializeMessage(state, message, viewerId),
          conversation: { id: conversationView.id, title: conversationView.title, type: conversationView.type },
        };
      });
    response.json({ ok: true, results });
  });

  app.patch("/api/conversations/:id/settings", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const conversation = findConversation(store.read(), request.params.id);
    if (!canAccessConversation(store.read(), conversation, viewerId)) return apiError(response, 403, "Чат недоступен.");
    const updates = {};
    if (request.body?.muted != null) updates.muted = Boolean(request.body.muted);
    if (request.body?.pinned != null) updates.pinned = Boolean(request.body.pinned);
    if (request.body?.archived != null) updates.archived = Boolean(request.body.archived);
    if (request.body?.compact != null) updates.compact = Boolean(request.body.compact);
    if (request.body?.background != null) {
      const background = cleanLine(request.body.background, 24);
      if (!["default", "midnight", "nebula", "graphite"].includes(background)) return apiError(response, 400, "Неизвестный фон чата.");
      updates.background = background;
    }
    if (request.body?.notificationMode != null) {
      if (!["all", "mentions", "none"].includes(request.body.notificationMode)) return apiError(response, 400, "Неизвестный режим уведомлений.");
      updates.notificationMode = request.body.notificationMode;
    }
    if (request.body?.folder != null) {
      const folder = cleanLine(request.body.folder, 24);
      if (!["all", "personal", "rooms", "work"].includes(folder)) return apiError(response, 400, "Неизвестная папка чата.");
      updates.folder = folder;
    }
    const setting = await store.mutate((state) => {
      let item = state.conversationSettings.find((candidate) => candidate.userId === viewerId && candidate.conversationId === conversation.id);
      if (!item) {
        item = { userId: viewerId, conversationId: conversation.id, muted: false, pinned: false, archived: false, folder: "all", background: "default", compact: false, notificationMode: "all", updatedAt: nowIso() };
        state.conversationSettings.push(item);
      }
      Object.assign(item, updates);
      item.updatedAt = nowIso();
      return item;
    });
    refreshUsers([viewerId]);
    response.json({ ok: true, settings: {
      muted: Boolean(setting.muted), pinned: Boolean(setting.pinned), archived: Boolean(setting.archived), folder: setting.folder ?? "all",
      background: setting.background ?? "default", compact: Boolean(setting.compact), notificationMode: setting.notificationMode ?? "all",
    } });
  });

  app.get("/api/bookmarks", authRequired, (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const conversations = new Map(conversationList(state, viewerId, onlineUserIds()).map((item) => [item.id, item]));
    const bookmarks = state.messageBookmarks
      .filter((item) => item.userId === viewerId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((item) => {
        const message = state.messages.find((candidate) => candidate.id === item.messageId && !candidate.deletedAt);
        const conversationView = conversations.get(message?.conversationId);
        return message && conversationView ? {
          id: item.id, createdAt: item.createdAt,
          message: serializeMessage(state, message, viewerId),
          conversation: { id: conversationView.id, title: conversationView.title, type: conversationView.type },
        } : null;
      })
      .filter(Boolean);
    response.json({ ok: true, bookmarks });
  });

  app.post("/api/messages/:id/bookmark", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let bookmarked;
    try {
      bookmarked = await store.mutate((state) => {
        const message = state.messages.find((item) => item.id === request.params.id && !item.deletedAt);
        if (!message || !canAccessConversation(state, findConversation(state, message.conversationId), viewerId)) throw new Error("NOT_FOUND");
        const existing = state.messageBookmarks.find((item) => item.userId === viewerId && item.messageId === message.id);
        if (existing) {
          state.messageBookmarks = state.messageBookmarks.filter((item) => item.id !== existing.id);
          return false;
        }
        state.messageBookmarks.push({ id: crypto.randomUUID(), userId: viewerId, messageId: message.id, createdAt: nowIso() });
        return true;
      });
    } catch {
      return apiError(response, 404, "Сообщение не найдено.", "NOT_FOUND");
    }
    response.json({ ok: true, bookmarked });
  });

  app.get("/api/conversations/:id/upload-capacity", authRequired, (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    if (!canAccessConversation(state, conversation, viewerId)) return apiError(response, 403, "Чат недоступен.");
    const kind = request.query.kind === "voice" ? "voice" : "file";
    if (conversationUsesMls(conversation.id)) {
      return response.status(409).json({ ok: false, allowed: false, code: "E2EE_ATTACHMENT_REQUIRED", message: "Вложения в MLS-диалоге должны быть зашифрованы на клиенте." });
    }
    const posting = roomPostingError(state, conversation, viewerId, kind);
    if (posting) return apiError(response, 403, posting.message, posting.code);
    const requestedBytes = Math.max(0, Number(request.query.bytes) || 0);
    const stats = store.stats();
    response.json({
      ok: true, allowed: requestedBytes <= LIMITS.fileBytes && requestedBytes <= stats.remainingBytes,
      maxFileBytes: LIMITS.fileBytes, remainingBytes: stats.remainingBytes, quotaBytes: stats.quotaBytes,
    });
  });

  app.get("/api/conversations/:id/media", authRequired, (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    if (!canAccessConversation(state, conversation, viewerId)) return apiError(response, 403, "Чат недоступен.");
    const media = state.messages
      .filter((message) => message.conversationId === conversation.id && !message.deletedAt && !message.attachmentExpiredAt && message.fileId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 500)
      .map((message) => serializeMessage(state, message, viewerId));
    response.json({ ok: true, media });
  });

  app.post("/api/conversations/:id/upload", authRequired, (request, response, next) => {
    upload.single("file")(request, response, (error) => {
      if (error) {
        if (error.code === "LIMIT_FILE_SIZE") return apiError(response, 413, "Файл превышает лимит 25 МБ.", "FILE_TOO_LARGE");
        return apiError(response, 400, "Не удалось принять файл.", "UPLOAD_FAILED");
      }
      next();
    });
  }, async (request, response) => {
    const viewerId = request.nexora.user.id;
    if (!request.file) return apiError(response, 400, "Файл не выбран.");
    const state = store.read();
    const conversation = findConversation(state, request.params.id);
    if (!canAccessConversation(state, conversation, viewerId)) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 403, "Чат недоступен.");
    }
    if (conversationUsesMls(conversation.id)) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 409, "Вложения в MLS-диалоге должны быть зашифрованы на клиенте.", "E2EE_ATTACHMENT_REQUIRED");
    }
    if (conversation.type === "dm" && isBlockedEither(state, viewerId, dmPeer(state, conversation, viewerId)?.id)) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 403, "Отправка недоступна из-за блокировки.", "CONTACT_BLOCKED");
    }
    const requestedKind = ["voice", "image", "file"].includes(request.body?.kind) ? request.body.kind : "file";
    const probeHandle = await fs.open(request.file.path, "r");
    const probe = Buffer.alloc(Math.min(32, request.file.size));
    try { await probeHandle.read(probe, 0, probe.length, 0); } finally { await probeHandle.close(); }
    const detectedMime = sniffMime(probe, request.file.mimetype);
    if (requestedKind === "image" && !detectedMime.startsWith("image/")) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 415, "Содержимое файла не является изображением.", "FILE_TYPE_MISMATCH");
    }
    if (requestedKind === "voice" && !detectedMime.startsWith("audio/")) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 415, "Содержимое файла не является аудио.", "FILE_TYPE_MISMATCH");
    }
    const kind = requestedKind === "voice" && detectedMime.startsWith("audio/")
      ? "voice"
      : requestedKind === "image" && detectedMime.startsWith("image/")
        ? "image"
        : detectedMime.startsWith("image/") ? "image" : "file";
    const posting = roomPostingError(state, conversation, viewerId, kind === "voice" ? "voice" : kind === "image" ? "image" : "file");
    if (posting) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 403, posting.message, posting.code);
    }
    return maintenance.withFileLock(async () => {
    const storage = store.stats();
    if (storage.bytes + request.file.size > storage.quotaBytes) {
      await fs.unlink(request.file.path).catch(() => {});
      return apiError(response, 507, "Лимит общего хранилища сервера исчерпан.", "STORAGE_QUOTA");
    }

    const requestedDuration = Number(request.body?.duration);
    const duration = kind === "voice"
      ? Math.max(1, Math.min(Number.isFinite(requestedDuration) ? Math.round(requestedDuration) : 1, LIMITS.voiceSeconds))
      : null;
    const storedName = `${crypto.randomUUID()}${path.extname(request.file.originalname).slice(0, 12)}`;
    const finalPath = path.join(uploadsDir, storedName);
    await fs.rename(request.file.path, finalPath);

    let result;
    try {
      result = await store.mutate((mutable) => {
        const usedBytes = mutable.files.filter((file) => !file.deletedAt).reduce((total, file) => total + Number(file.size || 0), 0);
        if (usedBytes + Number(request.file.size || 0) > Number(mutable.settings.storageQuotaBytes)) {
          throw Object.assign(new Error("STORAGE_QUOTA"), { code: "STORAGE_QUOTA" });
        }
        const createdAt = nowIso();
        const waveform = kind === "voice" ? String(request.body?.waveform || "").split(",")
          .map(Number).filter(Number.isFinite).slice(0, 96).map((value) => Math.max(0, Math.min(100, value))) : [];
        const file = {
          id: crypto.randomUUID(), conversationId: conversation.id, uploaderId: viewerId,
          originalName: cleanLine(request.file.originalname, 180) || "file",
          storedName, mimeType: detectedMime,
          size: request.file.size, kind, duration, waveform, createdAt, deletedAt: null,
        };
        const message = {
          id: crypto.randomUUID(), conversationId: conversation.id, senderId: viewerId,
          type: kind, text: cleanText(request.body?.caption, 500), fileId: file.id,
          replyToId: null, forwardedFromId: null, forwardedSnapshot: null, clientId: null,
          createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null,
        };
        mutable.files.push(file);
        mutable.messages.push(message);
        const event = appendEvent(mutable, { type: "message.created", actorId: viewerId, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id, type: message.type } });
        return { message, conversation, event };
      });
    } catch (error) {
      await fs.unlink(finalPath).catch(() => {});
      if (error.code === "STORAGE_QUOTA") return apiError(response, 507, "Лимит общего хранилища сервера исчерпан.", "STORAGE_QUOTA");
      throw error;
    }
    const freshState = store.read();
    emitMessage(result);
    v3Features?.dispatchEvent(result.event).catch(() => {});
    response.status(201).json({ ok: true, message: serializeMessage(freshState, result.message, viewerId) });
    });
  });

  app.get("/api/files/:id", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    const state = store.read();
    const file = state.files.find((candidate) => candidate.id === request.params.id && !candidate.deletedAt && candidate.kind !== "avatar");
    const relatedMessage = state.messages.find((message) => message.fileId === file?.id && !message.deletedAt && canAccessConversation(state, findConversation(state, message.conversationId), viewerId));
    if (!file || !relatedMessage) return apiError(response, 404, "Файл не найден.");
    const previewable = file.mimeType === "application/pdf" || file.mimeType.startsWith("text/")
      || ["application/json", "application/xml"].includes(file.mimeType);
    const preview = request.query.preview === "1" && previewable;
    const disposition = ["image", "voice"].includes(file.kind) || preview ? "inline" : "attachment";
    if (preview) {
      response.setHeader("X-Frame-Options", "SAMEORIGIN");
      response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox");
    }
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Length", file.size);
    response.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(safeDownloadName(file.originalName))}`);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.sendFile(path.join(uploadsDir, file.storedName));
  });

  app.post("/api/messages/:id/listened", authRequired, async (request, response) => {
    const viewerId = request.nexora.user.id;
    let result;
    try {
      result = await store.mutate((state) => {
        const message = state.messages.find((item) => item.id === request.params.id && item.type === "voice" && !item.deletedAt);
        const conversation = findConversation(state, message?.conversationId);
        if (!message || !canAccessConversation(state, conversation, viewerId)) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        if (!state.voiceListens.some((item) => item.messageId === message.id && item.userId === viewerId)) {
          state.voiceListens.push({ messageId: message.id, userId: viewerId, listenedAt: nowIso() });
        }
        return { message, conversation };
      });
    } catch (error) {
      return apiError(response, error.status ?? 404, "Голосовое сообщение не найдено.");
    }
    const fresh = store.read();
    for (const participantId of usersForConversation(fresh, result.conversation)) {
      io.to(userSocketRoom(participantId)).emit("message:updated", serializeMessage(fresh, result.message, participantId));
    }
    response.json({ ok: true });
  });

  app.get("/api/admin/stats", authRequired, serverAdminRequired, (_request, response) => {
    response.json({ ok: true, stats: store.stats() });
  });

  v3Features = mountV3Features({
    app,
    store,
    io,
    authRequired,
    serverAdminRequired,
    createTextMessage,
    emitMessage,
    roomPostingError,
    maintenance,
    uploadsDir,
    incomingDir,
    maxFileBytes: LIMITS.fileBytes,
    secretService: totp,
    log,
  });

  io.use((socket, next) => {
    const clientVersion = socket.handshake.auth?.clientVersion;
    if (clientVersion && !compatibleClientVersion(clientVersion)) return next(new Error("CLIENT_VERSION_INCOMPATIBLE"));
    const token = parseSessionToken(socket.request.headers.cookie);
    const user = sessionUser(store, token);
    if (!user) return next(new Error("UNAUTHORIZED"));
    if (user.mustChangePassword) return next(new Error("PASSWORD_CHANGE_REQUIRED"));
    const tokenHash = hashToken(token);
    const session = store.read((state) => state.sessions.find(
      (item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > Date.now(),
    ));
    if (!session) return next(new Error("UNAUTHORIZED"));
    socket.data.user = user;
    socket.data.sessionId = session.id;
    next();
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user;
    if (!onlineSockets.has(user.id)) onlineSockets.set(user.id, new Set());
    onlineSockets.get(user.id).add(socket.id);
    socket.join(userSocketRoom(user.id));
    socket.join(sessionSocketRoom(socket.data.sessionId));
    await store.mutate((state) => {
      const session = state.sessions.find((item) => item.id === socket.data.sessionId);
      if (session) session.lastSeenAt = nowIso();
    });
    const available = store.read((state) => state.conversations.filter((conversation) => canAccessConversation(state, conversation, user.id)));
    await Promise.all(available.map((conversation) => socket.join(conversationSocketRoom(conversation.id))));
    broadcastPresence();

    socket.on("message:send", async (payload, acknowledge = () => {}) => {
      if (!messageRate(user.id)) return acknowledge({ ok: false, error: "Слишком много сообщений. Сделайте паузу." });
      try {
        const result = await createTextMessage({
          senderId: user.id,
          conversationId: payload?.conversationId,
          text: payload?.text,
          replyToId: cleanLine(payload?.replyToId, 64) || null,
          threadRootId: cleanLine(payload?.threadRootId, 64) || null,
          clientId: payload?.clientId,
          silent: Boolean(payload?.silent),
        });
        if (!result.duplicate) emitMessage(result);
        acknowledge({ ok: true, message: serializeMessage(store.read(), result.message, user.id), duplicate: result.duplicate });
      } catch (error) {
        acknowledge({ ok: false, error: error.message || "Сообщение не отправлено.", code: error.code, retryAfter: error.retryAfter });
      }
    });

    socket.on("message:forward", async (payload, acknowledge = () => {}) => {
      const sourceId = cleanLine(payload?.messageId, 64);
      const targetConversationId = cleanLine(payload?.conversationId, 64);
      const clientId = /^[a-zA-Z0-9_-]{8,64}$/.test(String(payload?.clientId ?? "")) ? String(payload.clientId) : null;
      const state = store.read();
      const source = state.messages.find((message) => message.id === sourceId && !message.deletedAt && !message.attachmentExpiredAt);
      const sourceConversation = findConversation(state, source?.conversationId);
      const targetConversation = findConversation(state, targetConversationId);
      if (!source || !canAccessConversation(state, sourceConversation, user.id) || !canAccessConversation(state, targetConversation, user.id)) {
        return acknowledge({ ok: false, error: "Пересылка недоступна." });
      }
      const postingKind = source.type === "voice" ? "voice" : source.fileId ? "file" : "text";
      const posting = roomPostingError(state, targetConversation, user.id, postingKind);
      if (posting) return acknowledge({ ok: false, error: posting.message, code: posting.code, retryAfter: posting.retryAfter });
      const peer = dmPeer(state, targetConversation, user.id);
      if (peer && isBlockedEither(state, user.id, peer.id)) return acknowledge({ ok: false, error: "Отправка недоступна из-за блокировки." });
      const duplicate = clientId ? state.messages.find((message) => message.senderId === user.id && message.clientId === clientId) : null;
      if (duplicate) return acknowledge({ ok: true, message: serializeMessage(state, duplicate, user.id), duplicate: true });
      const sourceSender = findUser(state, source.senderId);
      const sourceFile = source.fileId ? state.files.find((file) => file.id === source.fileId && !file.deletedAt) : null;
      if (source.fileId && !sourceFile) return acknowledge({ ok: false, error: "Исходное вложение больше недоступно." });
      const result = await store.mutate((draft) => {
        const duplicateInQueue = clientId ? draft.messages.find((message) => message.senderId === user.id && message.clientId === clientId) : null;
        if (duplicateInQueue) return { message: duplicateInQueue, duplicate: true };
        const created = {
          id: crypto.randomUUID(), conversationId: targetConversation.id, senderId: user.id,
          type: source.type, text: source.text, fileId: sourceFile?.id ?? null, replyToId: null,
          forwardedFromId: source.id,
          forwardedSnapshot: {
            senderName: sourceSender?.displayName ?? "Удалённый пользователь",
            senderUsername: sourceSender?.username ?? "deleted",
            originalCreatedAt: source.createdAt,
            originalConversationId: source.conversationId,
          },
          clientId, createdAt: nowIso(), updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null,
        };
        draft.messages.push(created);
        const event = appendEvent(draft, { type: "message.created", actorId: user.id, conversationId: targetConversation.id, roomId: targetConversation.roomId, payload: { messageId: created.id, forwarded: true } });
        return { message: created, duplicate: false, event };
      });
      const freshState = store.read();
      if (result.duplicate) return acknowledge({ ok: true, message: serializeMessage(freshState, result.message, user.id), duplicate: true });
      for (const participantId of usersForConversation(freshState, targetConversation)) {
        io.to(userSocketRoom(participantId)).emit("message:new", serializeMessage(freshState, result.message, participantId));
      }
      refreshUsers(usersForConversation(freshState, targetConversation));
      v3Features?.dispatchEvent(result.event).catch(() => {});
      acknowledge({ ok: true, message: serializeMessage(freshState, result.message, user.id) });
    });

    socket.on("message:edit", async (payload, acknowledge = () => {}) => {
      const text = cleanText(payload?.text);
      if (!text) return acknowledge({ ok: false, error: "Сообщение пустое." });
      let result;
      try {
        result = await store.mutate((state) => {
          const candidate = state.messages.find((item) => item.id === payload?.messageId);
          if (!candidate || candidate.senderId !== user.id || candidate.deletedAt || candidate.type !== "text") throw new Error("FORBIDDEN");
          state.messageEdits.push({ id: crypto.randomUUID(), messageId: candidate.id, editorId: user.id, previousText: candidate.text, createdAt: nowIso() });
          candidate.text = text;
          candidate.updatedAt = nowIso();
          const conversation = findConversation(state, candidate.conversationId);
          candidate.mentions = mentionedUsers(state, text, usersForConversation(state, conversation)).map((mentioned) => mentioned.id);
          const event = appendEvent(state, { type: "message.edited", actorId: user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: candidate.id } });
          return { message: candidate, conversation, event, isUpdate: true };
        });
      } catch {
        return acknowledge({ ok: false, error: "Редактирование недоступно." });
      }
      emitMessage(result);
      v3Features?.dispatchEvent(result.event).catch(() => {});
      acknowledge({ ok: true });
    });

    socket.on("message:delete", async (payload, acknowledge = () => {}) => {
      return maintenance.withFileLock(async () => {
      let result;
      try {
        result = await store.mutate((state) => {
          const message = state.messages.find((item) => item.id === payload?.messageId);
          const conversation = findConversation(state, message?.conversationId);
          if (!message || message.deletedAt || (message.senderId !== user.id && !(conversation?.type === "room" && roomPermission(state, conversation.roomId, user.id, "room.delete_messages")))) throw new Error("FORBIDDEN");
          message.deletedAt = nowIso();
          message.updatedAt = message.deletedAt;
          message.pinnedAt = null;
          message.pinnedBy = null;
          const file = message.fileId ? state.files.find((candidate) => candidate.id === message.fileId) : null;
          const fileStillReferenced = file && state.messages.some((candidate) => candidate.id !== message.id && candidate.fileId === file.id && !candidate.deletedAt);
          if (file && !fileStillReferenced) file.deletedAt = message.deletedAt;
          const event = appendEvent(state, { type: "message.deleted", actorId: user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id } });
          return { message, file: fileStillReferenced ? null : file, conversation, event };
        });
      } catch {
        return acknowledge({ ok: false, error: "Удаление недоступно." });
      }
      if (result.file) await fs.unlink(path.join(uploadsDir, result.file.storedName)).catch(() => {});
      for (const participantId of usersForConversation(store.read(), result.conversation)) {
        io.to(userSocketRoom(participantId)).emit("message:updated", serializeMessage(store.read(), result.message, participantId));
      }
      v3Features?.dispatchEvent(result.event).catch(() => {});
      acknowledge({ ok: true });
      });
    });

    socket.on("message:react", async (payload, acknowledge = () => {}) => {
      const emoji = String(payload?.emoji ?? "");
      if (!REACTIONS.has(emoji) && !PLUS_REACTIONS.has(emoji)) return acknowledge({ ok: false, error: "Эта реакция недоступна." });
      let result;
      try {
        result = await store.mutate((state) => {
          const message = state.messages.find((item) => item.id === payload?.messageId && !item.deletedAt);
          const conversation = findConversation(state, message?.conversationId);
          if (!message || !canAccessConversation(state, conversation, user.id)) throw new Error("FORBIDDEN");
          const plusAllowed = Boolean(activeEntitlement(state, "user", user.id, "nexora_plus"));
          const roomPackAllowed = conversation?.type === "room" && Boolean(activeEntitlement(state, "room", conversation.roomId, "room_reaction_pack"));
          if (PLUS_REACTIONS.has(emoji) && !plusAllowed && !roomPackAllowed) throw new Error("PLUS_REQUIRED");
          const index = state.reactions.findIndex((reaction) => reaction.messageId === message.id && reaction.userId === user.id && reaction.emoji === emoji);
          if (index >= 0) state.reactions.splice(index, 1);
          else state.reactions.push({ id: crypto.randomUUID(), messageId: message.id, userId: user.id, emoji, createdAt: nowIso() });
          const event = appendEvent(state, { type: "message.reaction", actorId: user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id, emoji } });
          return { message, conversation, event };
        });
      } catch (error) {
        return acknowledge({ ok: false, error: error.message === "PLUS_REQUIRED" ? "Эта реакция входит в Nexora Plus или пакет комнаты." : "Реакция недоступна.", code: error.message });
      }
      for (const participantId of usersForConversation(store.read(), result.conversation)) {
        io.to(userSocketRoom(participantId)).emit("message:updated", serializeMessage(store.read(), result.message, participantId));
      }
      v3Features?.dispatchEvent(result.event).catch(() => {});
      acknowledge({ ok: true });
    });

    socket.on("message:pin", async (payload, acknowledge = () => {}) => {
      let result;
      try {
        result = await store.mutate((state) => {
          const message = state.messages.find((item) => item.id === payload?.messageId && !item.deletedAt);
          const conversation = findConversation(state, message?.conversationId);
          if (!message || conversation?.type !== "room" || !roomPermission(state, conversation.roomId, user.id, "room.pin_messages")) throw new Error("FORBIDDEN");
          if (message.pinnedAt) {
            message.pinnedAt = null;
            message.pinnedBy = null;
          } else {
            message.pinnedAt = nowIso();
            message.pinnedBy = user.id;
          }
          const event = appendEvent(state, { type: message.pinnedAt ? "message.pinned" : "message.unpinned", actorId: user.id, conversationId: conversation.id, roomId: conversation.roomId, payload: { messageId: message.id } });
          return { message, conversation, event };
        });
      } catch {
        return acknowledge({ ok: false, error: "Закрепление недоступно." });
      }
      for (const participantId of usersForConversation(store.read(), result.conversation)) {
        io.to(userSocketRoom(participantId)).emit("message:updated", serializeMessage(store.read(), result.message, participantId));
      }
      v3Features?.dispatchEvent(result.event).catch(() => {});
      acknowledge({ ok: true });
    });

    socket.on("conversation:read", async (payload, acknowledge = () => {}) => {
      const conversationId = cleanLine(payload?.conversationId, 64);
      const state = store.read();
      const conversation = findConversation(state, conversationId);
      if (!canAccessConversation(state, conversation, user.id)) return acknowledge({ ok: false });
      const lastReadAt = nowIso();
      await store.mutate((mutable) => {
        const read = mutable.reads.find((item) => item.conversationId === conversationId && item.userId === user.id);
        if (read) read.lastReadAt = lastReadAt;
        else mutable.reads.push({ conversationId, userId: user.id, lastReadAt });
      });
      io.to(conversationSocketRoom(conversationId)).emit("conversation:read", { conversationId, userId: user.id, lastReadAt });
      acknowledge({ ok: true });
    });

    socket.on("typing:set", (payload) => {
      const conversation = findConversation(store.read(), cleanLine(payload?.conversationId, 64));
      if (!canAccessConversation(store.read(), conversation, user.id)) return;
      socket.to(conversationSocketRoom(conversation.id)).emit("typing:update", {
        conversationId: conversation.id,
        user: publicUser(user),
        isTyping: Boolean(payload?.isTyping),
      });
    });

    socket.on("disconnect", () => {
      const sockets = onlineSockets.get(user.id);
      sockets?.delete(socket.id);
      if (!sockets?.size) onlineSockets.delete(user.id);
      broadcastPresence();
    });
  });

  const clientIndex = path.join(clientDir, "index.html");
  app.use(express.static(clientDir, { index: false, maxAge: options.development ? 0 : "1h" }));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/") || request.path.startsWith("/socket.io/")) return next();
    response.sendFile(clientIndex, (error) => {
      if (error && !response.headersSent) response.status(503).send("Nexora web client is not built. Run npm run build:web.");
    });
  });

  app.use((error, _request, response, _next) => {
    log(error.stack || error.message, "error");
    if (!response.headersSent) apiError(response, 500, "Внутренняя ошибка сервера.", "INTERNAL_ERROR");
  });

  async function listen() {
    if (server.listening) return status();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    const actualPort = server.address().port;
    if (tlsEnabled && options.redirect !== false) {
      redirectServer = http.createServer((request, response) => {
        const hostname = String(request.headers.host || "localhost").split(":")[0];
        response.writeHead(302, { Location: `https://${hostname}:${actualPort}${request.url}` });
        response.end();
      });
      redirectServer.on("error", (error) => log(`HTTP redirect не запущен: ${error.message}`, "warn"));
      redirectServer.listen(redirectPort, host);
    }
    operational.markReady();
    log(`Сервер запущен: ${tlsEnabled ? "https" : "http"}://localhost:${actualPort}`);
    events.emit("status", status());
    return status();
  }

  function status() {
    const actualPort = server.listening ? server.address().port : port;
    return {
      running: server.listening,
      host,
      port: actualPort,
      redirectPort,
      tls: tlsEnabled,
      localUrl: `${tlsEnabled ? "https" : "http"}://localhost:${actualPort}`,
      addresses: networkAddresses(actualPort),
      caCertificate: certificates?.caCertificate ?? null,
      serverId,
      fingerprint,
      compatibility: COMPATIBILITY,
      pulse: pulse.status(),
      operations: operational.snapshot(),
      emergencyReadOnly: store.read((state) => Boolean(state.settings.emergencyReadOnly)),
      dataDir,
      databaseFile,
      backupsDir: maintenance.backupsDir,
      stats: store.stats(),
    };
  }

  async function close() {
    operational.beginDrain();
    v3Features?.stop();
    maintenance.stop();
    if (redirectServer?.listening) await new Promise((resolve) => redirectServer.close(resolve));
    if (server.listening) await new Promise((resolve) => io.close(resolve));
    await store.close();
    operational.close();
    events.emit("status", status());
  }

  async function listAdminData() {
    const state = store.read();
    return {
      stats: store.stats(),
      users: state.users.map((user) => ({ ...publicUser(user), disabledAt: user.disabledAt, sessions: state.sessions.filter((session) => session.userId === user.id).length })),
      rooms: state.rooms.map((room) => ({
        ...roomView(state, room, room.ownerId, onlineUserIds()),
        messageCount: state.messages.filter((message) => findConversation(state, message.conversationId)?.roomId === room.id && !message.deletedAt).length,
      })),
      loginAttempts: state.loginAttempts.slice(-500).reverse().map((attempt) => ({
        ...attempt,
        user: publicUser(findUser(state, attempt.userId)),
      })),
      securitySettings: {
        ...passwordPolicy(state.settings),
        loginMaxAttempts: state.settings.loginMaxAttempts,
        loginLockMinutes: state.settings.loginLockMinutes,
      },
    };
  }

  async function setUserDisabled(userId, disabled) {
    await store.mutate((state) => {
      const user = state.users.find((candidate) => candidate.id === userId);
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.role === "server_admin") throw new Error("ADMIN_PROTECTED");
      user.disabledAt = disabled ? nowIso() : null;
      if (disabled) state.sessions = state.sessions.filter((session) => session.userId !== userId);
    });
    if (disabled) io.to(userSocketRoom(userId)).disconnectSockets(true);
    refreshUsers([userId]);
    log(`${disabled ? "Отключён" : "Восстановлен"} пользователь ${userId}`);
    return listAdminData();
  }

  async function deleteRoom(roomId) {
    return maintenance.withFileLock(async () => {
    let filePaths = [];
    let conversationId;
    await store.mutate((state) => {
      const room = state.rooms.find((candidate) => candidate.id === roomId);
      if (!room || room.slug === "general") throw new Error("ROOM_PROTECTED");
      const conversation = state.conversations.find((candidate) => candidate.roomId === roomId);
      conversationId = conversation?.id;
      const messageIds = state.messages.filter((message) => message.conversationId === conversationId).map((message) => message.id);
      const roomFiles = state.files.filter((file) => file.conversationId === conversationId);
      const fileIds = roomFiles.filter((file) => !state.messages.some(
        (message) => message.conversationId !== conversationId && message.fileId === file.id && !message.deletedAt,
      )).map((file) => file.id);
      for (const file of roomFiles) {
        if (fileIds.includes(file.id)) continue;
        file.conversationId = state.messages.find(
          (message) => message.conversationId !== conversationId && message.fileId === file.id && !message.deletedAt,
        )?.conversationId ?? null;
      }
      filePaths = state.files.filter((file) => fileIds.includes(file.id)).map((file) => path.join(uploadsDir, file.storedName));
      state.rooms = state.rooms.filter((candidate) => candidate.id !== roomId);
      state.roomMembers = state.roomMembers.filter((member) => member.roomId !== roomId);
      state.roomBans = state.roomBans.filter((ban) => ban.roomId !== roomId);
      state.roomJoinRequests = state.roomJoinRequests.filter((item) => item.roomId !== roomId);
      state.roomAuditLog = state.roomAuditLog.filter((item) => item.roomId !== roomId);
      state.conversations = state.conversations.filter((candidate) => candidate.id !== conversationId);
      state.messages = state.messages.filter((message) => !messageIds.includes(message.id));
      state.reactions = state.reactions.filter((reaction) => !messageIds.includes(reaction.messageId));
      state.voiceListens = state.voiceListens.filter((item) => !messageIds.includes(item.messageId));
      state.reads = state.reads.filter((read) => read.conversationId !== conversationId);
      state.files = state.files.filter((file) => !fileIds.includes(file.id));
    });
    await Promise.all(filePaths.map((filePath) => fs.unlink(filePath).catch(() => {})));
    if (conversationId) await io.in(conversationSocketRoom(conversationId)).socketsLeave(conversationSocketRoom(conversationId));
    io.emit("data:refresh");
    log(`Удалена комната ${roomId}`);
    return listAdminData();
    });
  }

  async function createBackup(passphrase = "") {
    const backup = await maintenance.createBackup({ automatic: false, passphrase: String(passphrase || "") });
    events.emit("stats", store.stats());
    return backup;
  }

  async function listBackups() {
    return maintenance.backupList();
  }

  async function restoreBackup(directory, passphrase = "") {
    const manifest = await maintenance.restoreBackup(directory, { passphrase: String(passphrase || "") });
    io.disconnectSockets(true);
    events.emit("stats", store.stats());
    events.emit("status", status());
    return { manifest, stats: store.stats() };
  }

  async function cleanupStorage() {
    const result = await maintenance.cleanupFiles();
    events.emit("stats", store.stats());
    return { ...result, stats: store.stats() };
  }

  async function updateStorageSettings({ storageQuotaBytes, fileRetentionDays }) {
    const quota = Math.max(256 * 1024 * 1024, Math.min(1024 * 1024 * 1024 * 1024, Number(storageQuotaBytes) || store.stats().quotaBytes));
    const retention = Math.max(0, Math.min(3650, Math.round(Number(fileRetentionDays) || 0)));
    await store.mutate((state) => {
      state.settings.storageQuotaBytes = quota;
      state.settings.fileRetentionDays = retention;
    });
    await maintenance.cleanupFiles();
    log(`Настройки хранилища обновлены: квота ${quota} байт, срок ${retention || "без ограничения"}`);
    return store.stats();
  }

  async function exportRoom(roomId) {
    const state = store.read();
    const room = state.rooms.find((candidate) => candidate.id === roomId);
    const conversation = state.conversations.find((candidate) => candidate.roomId === roomId);
    if (!room || !conversation) throw new Error("ROOM_NOT_FOUND");
    return {
      format: "nexora-room-export",
      version: 1,
      exportedAt: nowIso(),
      room: { id: room.id, name: room.name, slug: room.slug, privacy: room.privacy, createdAt: room.createdAt },
      messages: state.messages
        .filter((message) => message.conversationId === conversation.id)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map((message) => ({
          ...serializeMessage(state, message, room.ownerId),
          sender: publicUser(findUser(state, message.senderId)),
        })),
    };
  }

  async function resetUserPassword(userId, password) {
    const validation = validatePassword(String(password), store.read((state) => state.settings));
    if (!validation.ok) throw Object.assign(new Error("PASSWORD_POLICY"), { details: validation.errors });
    const passwordData = await hashPassword(String(password));
    const updated = await store.mutate((state) => {
      const user = state.users.find((candidate) => candidate.id === userId);
      if (!user) throw new Error("USER_NOT_FOUND");
      user.passwordSalt = passwordData.salt;
      user.passwordHash = passwordData.hash;
      user.mustChangePassword = true;
      state.sessions = state.sessions.filter((session) => session.userId !== userId);
      return user;
    });
    io.to(userSocketRoom(userId)).disconnectSockets(true);
    log(`Администратор сбросил пароль @${updated.username}`);
    return listAdminData();
  }

  async function updateSecuritySettings(settings = {}) {
    await store.mutate((state) => {
      state.settings.passwordMinLength = Math.max(8, Math.min(64, Math.round(Number(settings.passwordMinLength ?? settings.minLength) || state.settings.passwordMinLength || 10)));
      const aliases = {
        passwordRequireUpper: "requireUpper", passwordRequireLower: "requireLower",
        passwordRequireNumber: "requireNumber", passwordRequireSymbol: "requireSymbol",
      };
      for (const [key, alias] of Object.entries(aliases)) {
        const value = settings[key] ?? settings[alias];
        if (value != null) state.settings[key] = Boolean(value);
      }
      state.settings.loginMaxAttempts = Math.max(3, Math.min(20, Math.round(Number(settings.loginMaxAttempts) || state.settings.loginMaxAttempts || 5)));
      state.settings.loginLockMinutes = Math.max(1, Math.min(1440, Math.round(Number(settings.loginLockMinutes) || state.settings.loginLockMinutes || 15)));
    });
    log("Политика паролей и блокировки входа обновлена");
    return listAdminData();
  }

  return {
    app,
    server,
    io,
    store,
    events,
    operational,
    dataDir,
    certificates,
    listen,
    close,
    status,
    listAdminData,
    setUserDisabled,
    deleteRoom,
    createBackup,
    listBackups,
    restoreBackup,
    cleanupStorage,
    updateStorageSettings,
    exportRoom,
    resetUserPassword,
    updateSecuritySettings,
  };
}

module.exports = { LIMITS, REACTIONS, createNexoraServer };
