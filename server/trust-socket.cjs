"use strict";

const { TrustCoreError } = require("./trust-core.cjs");

function trustDeviceRoom(deviceId) {
  return `trust-device:${String(deviceId || "").toLowerCase()}`;
}

function requestedDeviceId(socket) {
  return String(socket.handshake.auth?.deviceId || socket.request.headers["x-nexora-device-id"] || "").trim().toLowerCase();
}

function verifiedGroupRecipients(db, { conversationId = null, groupRecordId = null } = {}) {
  if (!db || (!conversationId && !groupRecordId)) return [];
  const rows = db.prepare(`
    SELECT DISTINCT gm.user_id, gm.device_id
    FROM mls_group_members gm
    JOIN mls_groups g ON g.id=gm.group_id
    JOIN trust_devices d ON d.id=gm.device_id AND d.user_id=gm.user_id
    WHERE g.status='active'
      AND gm.status='active'
      AND d.status='active'
      AND d.trust_state='verified'
      AND (? IS NULL OR g.conversation_id=?)
      AND (? IS NULL OR g.id=?)
    ORDER BY gm.user_id, gm.device_id
  `).all(
    conversationId == null ? null : String(conversationId),
    conversationId == null ? null : String(conversationId),
    groupRecordId == null ? null : String(groupRecordId).toLowerCase(),
    groupRecordId == null ? null : String(groupRecordId).toLowerCase(),
  );
  return rows.map((row) => ({ userId: String(row.user_id), deviceId: String(row.device_id).toLowerCase() }));
}

function verifiedGroupDeviceIds(db, scope) {
  return verifiedGroupRecipients(db, scope).map((item) => item.deviceId);
}

function emitToVerifiedGroupDevices(io, db, scope, event, payload) {
  const recipients = verifiedGroupRecipients(db, scope);
  for (const recipient of recipients) {
    const value = typeof payload === "function" ? payload(recipient) : payload;
    io.to(trustDeviceRoom(recipient.deviceId)).emit(event, value);
  }
  return recipients;
}

function disconnectTrustDevice(io, deviceId, payload = {}) {
  const normalized = String(deviceId || "").toLowerCase();
  if (!normalized) return 0;
  let disconnected = 0;
  for (const socket of io.sockets.sockets.values()) {
    if (String(socket.data.trustDevice?.id || "").toLowerCase() !== normalized) continue;
    socket.emit("trust.device_revoked", { deviceId: normalized, ...payload });
    socket.disconnect(true);
    disconnected += 1;
  }
  return disconnected;
}

function mountTrustSocketAuthorization({ io, trustCore, log = () => {} } = {}) {
  if (!io || !trustCore) throw new Error("Trust socket authorization requires io and trustCore.");

  io.use((socket, next) => {
    const deviceId = requestedDeviceId(socket);
    if (!deviceId) {
      socket.data.trustDevice = null;
      return next();
    }
    try {
      const user = socket.data.user;
      if (!user?.id) throw new TrustCoreError("Требуется вход в аккаунт.", "AUTH_REQUIRED", 401);
      socket.data.trustDevice = trustCore.requireDevice(user.id, deviceId, { verified: false });
      return next();
    } catch (error) {
      const code = error instanceof TrustCoreError ? error.code : "TRUST_SOCKET_AUTH_FAILED";
      log(`Trust socket rejected: ${code}`, "warn");
      const socketError = new Error(code);
      socketError.data = { code };
      return next(socketError);
    }
  });

  io.on("connection", (socket) => {
    if (socket.data.trustDevice?.id) socket.join(trustDeviceRoom(socket.data.trustDevice.id));
  });

  log("Trust device-scoped Socket.IO authorization mounted", "info");
}

module.exports = {
  disconnectTrustDevice,
  emitToVerifiedGroupDevices,
  mountTrustSocketAuthorization,
  requestedDeviceId,
  trustDeviceRoom,
  verifiedGroupDeviceIds,
  verifiedGroupRecipients,
};
