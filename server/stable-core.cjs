"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const { appendEvent } = require("./events.cjs");
const { canAccessConversation, findConversation } = require("./model.cjs");

const LEGACY_WRITE_PATTERN = /^\/api\/v4\/(?:trust|e2ee)(?:\/|$)/;
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,160}$/;

function requestId(value) {
  const candidate = String(value || "");
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function stableError(response, status, code, message, id, details = {}) {
  return response.status(status).json({ ok: false, code, message, error: message, requestId: id, details });
}

function sessionDeviceId(session) {
  const candidate = String(session?.deviceId || "").trim();
  return SAFE_ID.test(candidate) ? candidate : `legacy-${session.id}`;
}

function latestIso(values) {
  return values.filter(Boolean).sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
}

function earliestIso(values) {
  return values.filter(Boolean).sort((left, right) => Date.parse(left) - Date.parse(right))[0] || null;
}

function publicDevice(sessions, currentSessionId) {
  const newest = [...sessions].sort((left, right) => Date.parse(right.lastSeenAt || right.createdAt) - Date.parse(left.lastSeenAt || left.createdAt))[0];
  return {
    deviceId: sessionDeviceId(newest),
    name: newest.deviceName || newest.name || "Nexora device",
    platform: newest.platform || "unknown",
    version: newest.clientVersion || null,
    createdAt: earliestIso(sessions.map((item) => item.createdAt)),
    lastSeenAt: latestIso(sessions.map((item) => item.lastSeenAt || item.createdAt)),
    expiresAt: latestIso(sessions.map((item) => item.expiresAt)),
    sessionCount: sessions.length,
    current: sessions.some((item) => item.id === currentSessionId),
  };
}

function deviceInventory(state, userId, currentSessionId) {
  const grouped = new Map();
  for (const session of state.sessions.filter((item) => item.userId === userId && Date.parse(item.expiresAt) > Date.now())) {
    const id = sessionDeviceId(session);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(session);
  }
  return [...grouped.values()]
    .map((sessions) => publicDevice(sessions, currentSessionId))
    .sort((left, right) => Number(right.current) - Number(left.current) || Date.parse(right.lastSeenAt || 0) - Date.parse(left.lastSeenAt || 0));
}

function legacyGroupRows(store) {
  try {
    return store.db.prepare(`
      SELECT id, conversation_id, group_id, ciphersuite, epoch, status, creator_device_id,
             public_state_hash, created_at, updated_at
      FROM mls_groups
      ORDER BY updated_at DESC
    `).all();
  } catch {
    return [];
  }
}

function legacyMessages(state, conversationId) {
  return state.messages
    .filter((message) => message.conversationId === conversationId && message.type === "encrypted")
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function publicLegacyMessage(message) {
  const envelope = message.mlsEnvelope || {};
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    clientId: message.clientId || null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt || null,
    deletedAt: message.deletedAt || null,
    contentType: message.encryptedContentType || "text",
    attachmentId: message.fileId || null,
    groupRecordId: envelope.groupRecordId || null,
    epoch: Number.isFinite(Number(envelope.epoch)) ? Number(envelope.epoch) : null,
    generation: Number.isFinite(Number(envelope.generation)) ? Number(envelope.generation) : null,
    ciphertext: envelope.ciphertext || envelope.message || null,
    messageHash: envelope.messageHash || null,
    authenticatedDataHash: envelope.authenticatedDataHash || null,
    readOnly: true,
  };
}

function mountStableCore({ app, store, io, authRequired, maintenance, log = () => {} } = {}) {
  if (!app || !store || !io || !authRequired || !maintenance) {
    throw new Error("Stable Core requires app, store, io, authRequired and maintenance.");
  }

  function withRequestId(request, response, next) {
    request.stableRequestId ||= request.pulseRequestId || requestId(request.headers["x-request-id"]);
    response.setHeader("X-Request-ID", request.stableRequestId);
    response.setHeader("Cache-Control", "no-store");
    next();
  }

  function currentAuth(request) {
    const auth = request.pulseAuth;
    if (!auth?.user || !auth?.session) throw Object.assign(new Error("AUTH_REQUIRED"), { code: "AUTH_REQUIRED", status: 401 });
    return auth;
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try {
        await handler(request, response);
      } catch (error) {
        const status = Number(error?.status || 500);
        const code = String(error?.code || "TEMPORARY_UNAVAILABLE");
        const expected = status < 500 || code === "BACKUP_INTEGRITY_FAILED";
        if (!expected) log(`Stable Core ${request.stableRequestId}: ${error.stack || error.message}`, "error");
        stableError(
          response,
          status,
          code,
          status >= 500 && code !== "BACKUP_INTEGRITY_FAILED" ? "Временная ошибка Local Server." : String(error?.message || "Операция не выполнена."),
          request.stableRequestId,
          error?.details || {},
        );
      }
    };
  }

  async function disconnectSessions(userId, sessions, reason) {
    for (const session of sessions) {
      io.to(`session:${session.id}`).emit("session.revoked", {
        sessionId: session.id,
        deviceId: sessionDeviceId(session),
        reason,
        revokedAt: new Date().toISOString(),
      });
      await io.to(`session:${session.id}`).disconnectSockets(true);
    }
    io.to(`user:${userId}`).emit("device.updated", { reason, deviceIds: [...new Set(sessions.map(sessionDeviceId))] });
  }

  app.get("/api/v3/devices", withRequestId, authRequired, (request, response) => {
    const auth = currentAuth(request);
    response.json({
      ok: true,
      requestId: request.stableRequestId,
      devices: deviceInventory(store.read(), auth.user.id, auth.session.id),
      currentDeviceId: sessionDeviceId(auth.session),
    });
  });

  app.delete("/api/v3/devices/sessions/others", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const currentDeviceId = sessionDeviceId(auth.session);
    const removed = await store.mutate((state) => {
      const sessions = state.sessions.filter((item) => item.userId === auth.user.id && item.id !== auth.session.id && sessionDeviceId(item) !== currentDeviceId);
      const ids = new Set(sessions.map((item) => item.id));
      state.sessions = state.sessions.filter((item) => !ids.has(item.id));
      appendEvent(state, {
        type: "session.revoked",
        actorId: auth.user.id,
        userIds: [auth.user.id],
        payload: { mode: "all_except_current", sessionCount: sessions.length },
      });
      return sessions;
    });
    await disconnectSessions(auth.user.id, removed, "revoke_all_except_current");
    response.json({ ok: true, requestId: request.stableRequestId, revokedSessions: removed.length });
  }));

  app.delete("/api/v3/devices/:deviceId/sessions", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    const targetDeviceId = String(request.params.deviceId || "");
    if (!SAFE_ID.test(targetDeviceId)) {
      throw Object.assign(new Error("Некорректный deviceId."), { code: "VALIDATION_FAILED", status: 400 });
    }
    const matching = store.read((state) => state.sessions.filter((item) => item.userId === auth.user.id && sessionDeviceId(item) === targetDeviceId));
    if (!matching.length) throw Object.assign(new Error("Устройство не найдено."), { code: "RESOURCE_NOT_FOUND", status: 404 });
    if (matching.some((item) => item.id === auth.session.id)) {
      throw Object.assign(new Error("Текущее устройство нельзя отозвать этим действием. Используйте выход из аккаунта."), {
        code: "STATE_CONFLICT",
        status: 409,
        details: { currentDevice: true, terminalAction: "logout" },
      });
    }
    const ids = new Set(matching.map((item) => item.id));
    await store.mutate((state) => {
      state.sessions = state.sessions.filter((item) => !ids.has(item.id));
      appendEvent(state, {
        type: "session.revoked",
        actorId: auth.user.id,
        userIds: [auth.user.id],
        payload: { deviceId: targetDeviceId, sessionCount: matching.length },
      });
    });
    await disconnectSessions(auth.user.id, matching, "device_revoked");
    response.json({ ok: true, requestId: request.stableRequestId, deviceId: targetDeviceId, revokedSessions: matching.length });
  }));

  app.post("/api/v3/admin/backups/verify", withRequestId, authRequired, asyncRoute(async (request, response) => {
    const auth = currentAuth(request);
    if (auth.user.role !== "server_admin") throw Object.assign(new Error("Недостаточно прав."), { code: "FORBIDDEN", status: 403 });
    const backupId = String(request.body?.backupId || "");
    if (!SAFE_ID.test(backupId)) throw Object.assign(new Error("Укажите корректный backupId."), { code: "VALIDATION_FAILED", status: 400 });
    const backup = (await maintenance.backupList()).find((item) => path.basename(item.directory) === backupId);
    if (!backup) throw Object.assign(new Error("Резервная копия не найдена."), { code: "RESOURCE_NOT_FOUND", status: 404 });
    try {
      const verification = await maintenance.verifyBackup(backup.directory, { passphrase: String(request.body?.passphrase || "") });
      response.json({ ok: true, requestId: request.stableRequestId, verification });
    } catch (error) {
      throw Object.assign(new Error("Резервная копия не прошла проверку целостности."), {
        code: "BACKUP_INTEGRITY_FAILED",
        status: 422,
        details: { backupId, reason: String(error?.code || "verification_failed") },
      });
    }
  }));

  app.get("/api/admin/release/signing-status", withRequestId, authRequired, (request, response) => {
    const auth = currentAuth(request);
    if (auth.user.role !== "server_admin") return stableError(response, 403, "FORBIDDEN", "Недостаточно прав.", request.stableRequestId);
    const certificateConfigured = Boolean(String(process.env.CSC_LINK || "").trim());
    const passwordConfigured = Boolean(String(process.env.CSC_KEY_PASSWORD || "").trim());
    response.json({
      ok: true,
      requestId: request.stableRequestId,
      signing: {
        credentialsConfigured: certificateConfigured && passwordConfigured,
        certificateConfigured,
        passwordConfigured,
        secretsExposed: false,
        clientSignatureVerification: true,
        serverSignatureVerification: true,
        channel: store.read((state) => state.settings.updateChannel || "stable"),
      },
    });
  });

  app.get("/api/v3/legacy-secure/conversations", withRequestId, authRequired, (request, response) => {
    const auth = currentAuth(request);
    const state = store.read();
    const conversations = legacyGroupRows(store)
      .map((group) => {
        const conversation = findConversation(state, group.conversation_id);
        if (!conversation || !canAccessConversation(state, conversation, auth.user.id)) return null;
        const messages = legacyMessages(state, conversation.id);
        return {
          conversationId: conversation.id,
          groupRecordId: group.id,
          groupId: group.group_id,
          epoch: Number(group.epoch),
          status: group.status,
          createdAt: group.created_at,
          updatedAt: group.updated_at,
          messageCount: messages.length,
          state: messages.length ? "exportable" : "unavailable",
          readOnly: true,
        };
      })
      .filter(Boolean);
    response.json({ ok: true, requestId: request.stableRequestId, conversations });
  });

  app.get("/api/v3/legacy-secure/conversations/:conversationId/messages", withRequestId, authRequired, (request, response) => {
    const auth = currentAuth(request);
    const state = store.read();
    const conversation = findConversation(state, request.params.conversationId);
    if (!conversation || !canAccessConversation(state, conversation, auth.user.id)) {
      return stableError(response, 404, "RESOURCE_NOT_FOUND", "Legacy conversation не найдена.", request.stableRequestId);
    }
    const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 100));
    const after = String(request.query.after || "");
    const all = legacyMessages(state, conversation.id);
    const start = after ? Math.max(0, all.findIndex((item) => item.id === after) + 1) : 0;
    const page = all.slice(start, start + limit);
    response.json({
      ok: true,
      requestId: request.stableRequestId,
      state: page.length ? "exportable" : "unavailable",
      readOnly: true,
      messages: page.map(publicLegacyMessage),
      nextCursor: start + page.length < all.length ? page.at(-1)?.id || null : null,
    });
  });

  app.post("/api/v3/legacy-secure/conversations/:conversationId/export", withRequestId, authRequired, (request, response) => {
    const auth = currentAuth(request);
    const state = store.read();
    const conversation = findConversation(state, request.params.conversationId);
    if (!conversation || !canAccessConversation(state, conversation, auth.user.id)) {
      return stableError(response, 404, "RESOURCE_NOT_FOUND", "Legacy conversation не найдена.", request.stableRequestId);
    }
    const group = legacyGroupRows(store).find((item) => item.conversation_id === conversation.id) || null;
    response.json({
      ok: true,
      requestId: request.stableRequestId,
      export: {
        format: "nexora-legacy-mls-export",
        version: 1,
        exportedAt: new Date().toISOString(),
        conversationId: conversation.id,
        group: group ? {
          id: group.id,
          groupId: group.group_id,
          ciphersuite: group.ciphersuite,
          epoch: Number(group.epoch),
          status: group.status,
          publicStateHash: group.public_state_hash,
          createdAt: group.created_at,
          updatedAt: group.updated_at,
        } : null,
        messages: legacyMessages(state, conversation.id).map(publicLegacyMessage),
        readOnly: true,
        serverDecrypted: false,
      },
    });
  });

  app.all(LEGACY_WRITE_PATTERN, withRequestId, authRequired, (request, response) => stableError(
    response,
    410,
    "LEGACY_READ_ONLY",
    "Trust/MLS runtime удалён. Legacy secure history доступна только для чтения и экспорта.",
    request.stableRequestId,
    { method: request.method, path: request.path },
  ));

  io.on("connection", (socket) => {
    const reject = (_payload, acknowledge = () => {}) => acknowledge({
      ok: false,
      code: "LEGACY_READ_ONLY",
      error: "Trust/MLS runtime удалён. Legacy secure history доступна только для чтения.",
      details: {},
    });
    socket.on("mls:message", reject);
    socket.on("mls:message-edit", reject);
    socket.emit("legacy_secure_history.state", { state: "read_only", writable: false });
  });

  log("Stable Core mounted: Trust/MLS write paths retired; legacy history is read-only", "info");
  return { status: () => ({ legacySecureHistory: "read_only", trustRuntime: "retired", deviceInventory: true, backupVerification: true }) };
}

module.exports = {
  LEGACY_WRITE_PATTERN,
  deviceInventory,
  mountStableCore,
  publicLegacyMessage,
  sessionDeviceId,
  stableError,
};
