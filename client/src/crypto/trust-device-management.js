import { api } from "../api";
import { ensureTrustDevice } from "./trust-client";
import { clearTrustScope } from "./trust-store";
import { toBase64 } from "./mls-engine";

const textEncoder = new TextEncoder();

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function proofBytes(purpose, values) {
  return textEncoder.encode(`NEXORA-TRUST-V1\n${purpose}\n${canonical(values)}`);
}

async function signProof(device, purpose, values) {
  if (!device?.identityPrivateKey) {
    throw Object.assign(new Error("Локальный ключ устройства недоступен."), { code: "TRUST_LOCAL_KEY_MISSING" });
  }
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, device.identityPrivateKey, proofBytes(purpose, values));
  return toBase64(new Uint8Array(signature));
}

async function requestChallenge(device, purpose, targetDevice) {
  const result = await api("/api/v4/trust/challenges", {
    method: "POST",
    headers: { "X-Nexora-Device-ID": device.id },
    body: JSON.stringify({ purpose, targetDeviceId: targetDevice.id }),
  });
  const challenge = result.challenge;
  if (!challenge?.id || challenge.targetDeviceId !== targetDevice.id) {
    throw Object.assign(new Error("Trust Core вернул challenge с неверной областью действия."), { code: "TRUST_CHALLENGE_SCOPE_MISMATCH" });
  }
  return challenge;
}

async function signedDeviceOperation(targetDevice, purpose, method, path) {
  const actor = await ensureTrustDevice();
  if (purpose === "verify_device" && actor.trustState !== "verified") {
    throw Object.assign(new Error("Подтверждать другие устройства может только уже доверенное устройство."), { code: "TRUST_DEVICE_UNVERIFIED" });
  }
  const challenge = await requestChallenge(actor, purpose, targetDevice);
  const values = {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    userId: actor.userId,
    purpose,
    targetDeviceId: targetDevice.id,
    context: challenge.context,
  };
  const proofSignature = await signProof(actor, purpose, values);
  const result = await api(path, {
    method,
    headers: { "X-Nexora-Device-ID": actor.id },
    body: JSON.stringify({ challengeId: challenge.id, proofSignature }),
  });
  return { actor, device: result.device };
}

export async function listTrustDevices() {
  const current = await ensureTrustDevice();
  const result = await api("/api/v4/trust/devices");
  return {
    current,
    devices: (result.devices || []).map((device) => ({ ...device, current: device.id === current.id })),
  };
}

export async function verifyTrustDevice(targetDevice) {
  return signedDeviceOperation(
    targetDevice,
    "verify_device",
    "POST",
    `/api/v4/trust/devices/${encodeURIComponent(targetDevice.id)}/verify`,
  );
}

export async function revokeTrustDevice(targetDevice, { serverId, userId } = {}) {
  const result = await signedDeviceOperation(
    targetDevice,
    "revoke_device",
    "DELETE",
    `/api/v4/trust/devices/${encodeURIComponent(targetDevice.id)}`,
  );
  const currentRevoked = result.actor.id === targetDevice.id;
  if (currentRevoked) {
    if (!serverId || !userId) throw Object.assign(new Error("Не удалось определить локальную область Trust Core."), { code: "TRUST_SCOPE_REQUIRED" });
    await clearTrustScope(serverId, userId);
  }
  return { ...result, currentRevoked };
}
