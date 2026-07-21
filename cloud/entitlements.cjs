"use strict";

const crypto = require("node:crypto");
const { BillingError } = require("./billing-core.cjs");

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parsePem(value, label) {
  const normalized = String(value || "").trim().replace(/\\n/g, "\n");
  if (!normalized.includes("BEGIN")) {
    throw new BillingError(`${label} не настроен.`, "PULSE_CLOUD_MISCONFIGURED", 503);
  }
  return normalized;
}

function createEntitlementSigner({ keyId, privateKey }) {
  const normalizedKeyId = String(keyId || "").trim();
  if (!/^[A-Za-z0-9_.:-]{2,80}$/.test(normalizedKeyId)) {
    throw new BillingError("ENTITLEMENT_SIGNING_KEY_ID имеет неверный формат.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }
  const pem = parsePem(privateKey, "ENTITLEMENT_SIGNING_PRIVATE_KEY");
  const key = crypto.createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new BillingError("Entitlement signing key должен быть Ed25519.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }
  return (payload) => {
    const complete = { ...payload, keyId: normalizedKeyId };
    const encoded = base64urlJson(complete);
    const signature = crypto.sign(null, Buffer.from(encoded, "base64url"), key).toString("base64url");
    return { payload: encoded, signature, keyId: normalizedKeyId };
  };
}

function createResponseSigner({ keyId, privateKey, ttlMs = 30_000 }) {
  const signEntitlement = createEntitlementSigner({ keyId, privateKey });
  return (value) => {
    const now = new Date();
    const payload = {
      ...value,
      issuedAt: value?.issuedAt || now.toISOString(),
      expiresAt: value?.expiresAt || new Date(now.getTime() + ttlMs).toISOString(),
      keyId,
    };
    return signEntitlement(payload);
  };
}

function verifySignedEnvelope(envelope, keyRegistry, options = {}) {
  if (!envelope?.payload || !envelope?.signature || !envelope?.keyId) {
    throw new BillingError("Подписанный envelope неполон.", "PULSE_SIGNATURE_INVALID", 400);
  }
  const publicKeyValue = keyRegistry instanceof Map ? keyRegistry.get(envelope.keyId) : keyRegistry?.[envelope.keyId];
  if (!publicKeyValue) throw new BillingError("Неизвестный key ID.", "PULSE_SIGNATURE_INVALID", 400);
  const publicKey = crypto.createPublicKey(parsePem(publicKeyValue, "ENTITLEMENT_SIGNING_PUBLIC_KEY"));
  if (publicKey.asymmetricKeyType !== "ed25519") throw new BillingError("Public key должен быть Ed25519.", "PULSE_SIGNATURE_INVALID", 400);
  const payloadBytes = Buffer.from(String(envelope.payload), "base64url");
  const signature = Buffer.from(String(envelope.signature), "base64url");
  if (!crypto.verify(null, payloadBytes, publicKey, signature)) {
    throw new BillingError("Подпись entitlement недействительна.", "PULSE_SIGNATURE_INVALID", 400);
  }
  let payload;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new BillingError("Payload entitlement повреждён.", "ENTITLEMENT_INVALID", 400);
  }
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const notBefore = Date.parse(payload.notBefore || payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt)) {
    throw new BillingError("Entitlement не содержит корректные сроки.", "ENTITLEMENT_INVALID", 400);
  }
  if (notBefore > now + Number(options.clockSkewMs || 30_000)) throw new BillingError("Entitlement ещё не действует.", "ENTITLEMENT_INVALID", 409);
  if (expiresAt <= now) throw new BillingError("Entitlement истёк.", "ENTITLEMENT_EXPIRED", 410);
  if (payload.status === "revoked") throw new BillingError("Entitlement отозван.", "ENTITLEMENT_REVOKED", 410);
  if (options.serverId && payload.serverId !== options.serverId) throw new BillingError("Entitlement выдан другому серверу.", "PULSE_SCOPE_MISMATCH", 403);
  if (options.roomId && payload.roomId !== options.roomId) throw new BillingError("Entitlement выдан другой комнате.", "PULSE_SCOPE_MISMATCH", 403);
  if (options.productCode && payload.productCode !== options.productCode) throw new BillingError("Entitlement выдан для другого продукта.", "PULSE_SCOPE_MISMATCH", 403);
  return payload;
}

module.exports = {
  createEntitlementSigner,
  createResponseSigner,
  verifySignedEnvelope,
};
