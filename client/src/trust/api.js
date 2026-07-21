import { api } from "../api.js";

function encode(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function idempotencyKey(prefix = "trust") {
  return `${prefix}:${crypto.randomUUID()}`;
}

function request(path, options = {}) {
  return api(path, {
    ...options,
    headers: {
      ...(options.deviceId ? { "X-Nexora-Device-ID": options.deviceId } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      ...(options.headers || {}),
    },
  });
}

function json(method, body, options = {}) {
  return {
    method,
    body: JSON.stringify(body || {}),
    ...options,
  };
}

export const trustApi = {
  status: () => request("/api/v4/trust/status"),
  devices: () => request("/api/v4/trust/devices"),
  registerDevice: (device) => request("/api/v4/trust/devices", json("POST", device)),
  revokeDevice: (deviceId, actorDeviceId) => request(`/api/v4/trust/devices/${encodeURIComponent(deviceId)}`, json("DELETE", {}, { deviceId: actorDeviceId })),
  publishKeyPackage: (deviceId, id, packageBytes, expiresAt) => request("/api/v4/trust/key-packages", json("POST", {
    id,
    deviceId,
    packageData: encode(packageBytes),
    expiresAt,
  }, { deviceId })),
  claimKeyPackage: (deviceId, groupId, targetUserId) => request("/api/v4/trust/key-packages/claim", json("POST", {
    requesterDeviceId: deviceId,
    groupId,
    targetUserId,
  }, { deviceId })),
  createGroup: (deviceId, id, conversationId) => request("/api/v4/trust/groups", json("POST", {
    id,
    conversationId,
    creatorDeviceId: deviceId,
  }, { deviceId })),
  conversation: (conversationId, deviceId) => request(`/api/v4/trust/conversations/${encodeURIComponent(conversationId)}?deviceId=${encodeURIComponent(deviceId)}`, { deviceId }),
  conversationDevices: (conversationId, deviceId) => request(`/api/v4/trust/conversations/${encodeURIComponent(conversationId)}/devices`, { deviceId }),
  group: (groupId, deviceId) => request(`/api/v4/trust/groups/${encodeURIComponent(groupId)}?deviceId=${encodeURIComponent(deviceId)}`, { deviceId }),
  envelopes: async (groupId, deviceId, after = 0, limit = 200) => {
    const result = await request(`/api/v4/trust/groups/${encodeURIComponent(groupId)}/envelopes?deviceId=${encodeURIComponent(deviceId)}&after=${encodeURIComponent(after)}&limit=${encodeURIComponent(limit)}`, { deviceId });
    return {
      ...result,
      envelopes: (result.envelopes || []).map((envelope) => ({ ...envelope, payloadBytes: decode(envelope.payloadData) })),
    };
  },
  sendEnvelope: (groupId, deviceId, epoch, payloadBytes, type = "application", key = idempotencyKey("envelope")) => request(`/api/v4/trust/groups/${encodeURIComponent(groupId)}/envelopes`, json("POST", {
    id: crypto.randomUUID(),
    senderDeviceId: deviceId,
    epoch,
    type,
    payloadData: encode(payloadBytes),
  }, { deviceId, idempotencyKey: key })),
  submitCommit: (groupId, deviceId, targetEpoch, payloadBytes, mutations, commitId = crypto.randomUUID(), key = idempotencyKey("commit")) => request(`/api/v4/trust/groups/${encodeURIComponent(groupId)}/commits`, json("POST", {
    id: commitId,
    senderDeviceId: deviceId,
    targetEpoch,
    payloadData: encode(payloadBytes),
    mutations: (mutations || []).map((mutation) => ({
      ...mutation,
      ...(mutation.welcomeBytes ? { welcomeData: encode(mutation.welcomeBytes) } : {}),
      ...(mutation.ratchetTreeBytes ? { ratchetTreeData: encode(mutation.ratchetTreeBytes) } : {}),
      welcomeBytes: undefined,
      ratchetTreeBytes: undefined,
    })),
  }, { deviceId, idempotencyKey: key })),
  welcomes: async (deviceId) => {
    const result = await request(`/api/v4/trust/devices/${encodeURIComponent(deviceId)}/welcomes`, { deviceId });
    return {
      ...result,
      welcomes: (result.welcomes || []).map((welcome) => ({
        ...welcome,
        welcomeBytes: decode(welcome.welcomeData),
        ratchetTreeBytes: decode(welcome.ratchetTreeData),
      })),
    };
  },
  acknowledgeWelcome: (deviceId, welcomeId) => request(`/api/v4/trust/welcomes/${encodeURIComponent(welcomeId)}/ack`, json("POST", { deviceId }, { deviceId })),
  transparencyRoot: () => request("/api/v4/trust/transparency/root"),
  transparencyProof: (index) => request(`/api/v4/trust/transparency/proof/${encodeURIComponent(index)}`),
};

export const trustEncoding = Object.freeze({ decode, encode, idempotencyKey });
