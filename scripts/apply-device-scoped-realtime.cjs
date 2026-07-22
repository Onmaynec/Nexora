"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function patch(relativePath, replacements) {
  const file = path.join(root, relativePath);
  let source = fs.readFileSync(file, "utf8");
  for (const { before, after, label } of replacements) {
    const first = source.indexOf(before);
    const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
    if (first < 0 || second >= 0) throw new Error(`${relativePath}: expected exactly one ${label}`);
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  fs.writeFileSync(file, source, "utf8");
}

patch("server/trust-routes.cjs", [
  {
    label: "trust socket import",
    before: 'const { MLS_CIPHERSUITE, TrustCoreError, canonical, hash } = require("./trust-core.cjs");',
    after: 'const { MLS_CIPHERSUITE, TrustCoreError, canonical, hash } = require("./trust-core.cjs");\nconst { disconnectTrustDevice, emitToVerifiedGroupDevices } = require("./trust-socket.cjs");',
  },
  {
    label: "conversation emitter",
    before: `  function emitConversation(conversationId, type, payload) {
    io.to(\`conversation:\${conversationId}\`).emit(type, payload);
    io.to(\`conversation:\${conversationId}\`).emit("trust:event", { type, payload });
  }`,
    after: `  function emitConversation(conversationId, type, payload) {
    emitToVerifiedGroupDevices(io, store.db, { conversationId }, type, payload);
    emitToVerifiedGroupDevices(io, store.db, { conversationId }, "trust:event", { type, payload });
  }`,
  },
  {
    label: "revocation disconnect",
    before: `    emitUser(request.trustAuth.user.id, "trust.device_revoked", device);
    response.json({ ok: true, requestId: request.trustRequestId, device });`,
    after: `    emitUser(request.trustAuth.user.id, "trust.device_revoked", device);
    disconnectTrustDevice(io, device.id, { reason: "revoked", revokedAt: device.revokedAt });
    response.json({ ok: true, requestId: request.trustRequestId, device });`,
  },
]);

patch("server/mls-transport.cjs", [
  {
    label: "group device emitter import",
    before: 'const { TrustCoreError } = require("./trust-core.cjs");',
    after: 'const { TrustCoreError } = require("./trust-core.cjs");\nconst { emitToVerifiedGroupDevices, trustDeviceRoom } = require("./trust-socket.cjs");',
  },
  {
    label: "secure message emitter",
    before: `  function emitMessage(result, eventName = "message:new") {
    const state = store.read();
    const recipients = usersForConversation(state, result.conversation);
    for (const participantId of recipients) {
      io.to(userRoom(participantId)).emit(eventName, serializeMessage(state, result.message, participantId));
      io.to(userRoom(participantId)).emit("data:refresh");
    }
  }`,
    after: `  function emitMessage(result, eventName = "message:new") {
    const state = store.read();
    const scope = {
      conversationId: result.conversation.id,
      groupRecordId: result.message.mlsEnvelope?.groupRecordId || null,
    };
    const recipients = emitToVerifiedGroupDevices(io, store.db, scope, eventName, ({ userId }) => serializeMessage(state, result.message, userId));
    for (const recipient of recipients) io.to(trustDeviceRoom(recipient.deviceId)).emit("data:refresh");
  }`,
  },
  {
    label: "message socket device binding",
    before: `      const deviceId = cleanId(payload?.deviceId);
      const contentType = String(payload?.contentType || "text");`,
    after: `      const deviceId = cleanId(payload?.deviceId);
      const socketDevice = socket.data.trustDevice;
      if (!socketDevice || socketDevice.id !== deviceId || socketDevice.userId !== user.id || socketDevice.trustState !== "verified") {
        return acknowledge({ ok: false, code: "TRUST_SOCKET_DEVICE_MISMATCH", error: "Secure Socket.IO session не привязан к подтверждённому устройству." });
      }
      const contentType = String(payload?.contentType || "text");`,
  },
  {
    label: "edit socket device binding",
    before: `      const messageId = cleanId(payload?.messageId);
      const deviceId = cleanId(payload?.deviceId);
      if (!messageId || !deviceId || String(payload?.contentType || "text") !== "text") return acknowledge({ ok: false, code: "MLS_ENVELOPE_INVALID", error: "MLS edit envelope недействителен." });`,
    after: `      const messageId = cleanId(payload?.messageId);
      const deviceId = cleanId(payload?.deviceId);
      const socketDevice = socket.data.trustDevice;
      if (!socketDevice || socketDevice.id !== deviceId || socketDevice.userId !== user.id || socketDevice.trustState !== "verified") {
        return acknowledge({ ok: false, code: "TRUST_SOCKET_DEVICE_MISMATCH", error: "Secure Socket.IO session не привязан к подтверждённому устройству." });
      }
      if (!messageId || !deviceId || String(payload?.contentType || "text") !== "text") return acknowledge({ ok: false, code: "MLS_ENVELOPE_INVALID", error: "MLS edit envelope недействителен." });`,
  },
]);

patch("client/src/crypto/trust-client.js", [
  {
    label: "clearTrustScope import",
    before: `  cleanupKeyPackages,
  deleteGroupState,`,
    after: `  cleanupKeyPackages,
  clearTrustScope,
  deleteGroupState,`,
  },
  {
    label: "remote revocation handler",
    before: `export function trustConfigured() {
  return Boolean(configuration?.serverId && configuration?.userId);
}

export async function resolveTrustedDevice`,
    after: `export function trustConfigured() {
  return Boolean(configuration?.serverId && configuration?.userId);
}

export async function handleTrustDeviceRevoked(deviceId) {
  const { serverId, userId } = current();
  const local = await loadDevice(serverId, userId);
  if (!local || String(local.id) !== String(deviceId)) return false;
  await clearTrustScope(serverId, userId);
  devicePromise = null;
  refillPromise = null;
  deviceDirectory.clear();
  conversationQueues.clear();
  return true;
}

export async function resolveTrustedDevice`,
  },
]);

patch("client/src/App.jsx", [
  {
    label: "client version import",
    before: 'import { api, clearCsrfToken, post } from "./api";',
    after: 'import { api, clearCsrfToken, CLIENT_VERSION, post } from "./api";',
  },
  {
    label: "remote revocation import",
    before: 'import { configureTrust, ensureTrustDevice, processCommitEvent } from "./crypto/trust-client";',
    after: 'import { configureTrust, ensureTrustDevice, handleTrustDeviceRevoked, processCommitEvent } from "./crypto/trust-client";',
  },
  {
    label: "socket trust guard",
    before: `  useEffect(() => {
    if (!me || me.mustChangePassword) return undefined;
    refresh();
    socket.connect();`,
    after: `  useEffect(() => {
    const deviceId = trustState.device?.id;
    if (!me || me.mustChangePassword || !deviceId) return undefined;
    if (socket.connected && socket.auth?.deviceId !== deviceId) socket.disconnect();
    socket.auth = { ...(socket.auth || {}), deviceId, clientVersion: CLIENT_VERSION };
    refresh();
    socket.connect();`,
  },
  {
    label: "connect error and revoke handlers",
    before: `    const onConnectError = (error) => {
      if (error.message === "UNAUTHORIZED") {
        setMe(null);
        setBootstrap(null);
        setAuthState("anonymous");
      }
    };`,
    after: `    const onConnectError = async (error) => {
      setServerOnline(false);
      const code = error.data?.code || error.message;
      if (["TRUST_DEVICE_REVOKED", "TRUST_DEVICE_NOT_FOUND", "TRUST_SOCKET_AUTH_FAILED"].includes(code)) {
        await handleTrustDeviceRevoked(deviceId).catch(() => {});
        setTrustState({ status: "error", device: null, error: "Доверие этого устройства отозвано. Выполните повторный вход и регистрацию устройства." });
        socket.disconnect();
        showToast("Доверие устройства отозвано; локальные ключи удалены.", "error");
        return;
      }
      if (code === "UNAUTHORIZED") {
        setMe(null);
        setBootstrap(null);
        bootstrapRef.current = null;
        setAuthState("anonymous");
      }
    };
    const onTrustDeviceRevoked = async (event) => {
      if (String(event?.deviceId || "") !== String(deviceId)) return;
      await handleTrustDeviceRevoked(deviceId).catch(() => {});
      setTrustState({ status: "error", device: null, error: "Доверие этого устройства отозвано. Локальные ключи и MLS state удалены." });
      socket.disconnect();
      showToast("Доверие устройства отозвано; защищённая доставка остановлена.", "error");
    };`,
  },
  {
    label: "revoke listener registration",
    before: `    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);`,
    after: `    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("trust.device_revoked", onTrustDeviceRevoked);`,
  },
  {
    label: "revoke listener cleanup",
    before: `      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [me?.id, me?.mustChangePassword, refresh, socket, showToast]);`,
    after: `      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("trust.device_revoked", onTrustDeviceRevoked);
    };
  }, [me?.id, me?.mustChangePassword, refresh, socket, showToast, trustState.device?.id]);`,
  },
]);
