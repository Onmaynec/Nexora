"use strict";

const crypto = require("node:crypto");

class PulseCloudClientError extends Error {
  constructor(message, code = "PULSE_CLOUD_ERROR", status = 502, details = {}) {
    super(message);
    this.name = "PulseCloudClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeCloudUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { throw new PulseCloudClientError("Pulse Cloud URL имеет неверный формат.", "PULSE_CLOUD_MISCONFIGURED", 503); }
  if (url.protocol !== "https:") throw new PulseCloudClientError("Pulse Cloud должен использовать HTTPS.", "PULSE_CLOUD_MISCONFIGURED", 503);
  if (url.username || url.password) throw new PulseCloudClientError("Pulse Cloud URL не должен содержать credentials.", "PULSE_CLOUD_MISCONFIGURED", 503);
  return url.toString().replace(/\/$/, "");
}

function decodeBase64Url(value, label) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length > 1_000_000) {
    throw new PulseCloudClientError(`${label} имеет неверный формат.`, "PULSE_SIGNATURE_INVALID", 502);
  }
  return Buffer.from(text, "base64url");
}

function verifySignedEnvelope(envelope, keyRegistry, options = {}) {
  if (!envelope?.payload || !envelope?.signature || !envelope?.keyId) {
    throw new PulseCloudClientError("Подписанный Cloud envelope неполон.", "PULSE_SIGNATURE_INVALID", 502);
  }
  const publicKeyPem = keyRegistry instanceof Map ? keyRegistry.get(envelope.keyId) : keyRegistry?.[envelope.keyId];
  if (!publicKeyPem) throw new PulseCloudClientError("Cloud использовал неизвестный key ID.", "PULSE_SIGNATURE_INVALID", 502, { keyId: envelope.keyId });
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(String(publicKeyPem).replace(/\\n/g, "\n"));
  } catch {
    throw new PulseCloudClientError("Public key Cloud повреждён.", "PULSE_SIGNATURE_INVALID", 502);
  }
  if (publicKey.asymmetricKeyType !== "ed25519") throw new PulseCloudClientError("Cloud key должен быть Ed25519.", "PULSE_SIGNATURE_INVALID", 502);
  const payloadBytes = decodeBase64Url(envelope.payload, "Cloud payload");
  const signature = decodeBase64Url(envelope.signature, "Cloud signature");
  if (!crypto.verify(null, payloadBytes, publicKey, signature)) {
    throw new PulseCloudClientError("Подпись Pulse Cloud недействительна.", "PULSE_SIGNATURE_INVALID", 502);
  }
  let payload;
  try { payload = JSON.parse(payloadBytes.toString("utf8")); } catch { throw new PulseCloudClientError("Cloud payload повреждён.", "PULSE_PAYLOAD_INVALID", 502); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new PulseCloudClientError("Cloud payload имеет неверную структуру.", "PULSE_PAYLOAD_INVALID", 502);
  if (payload.keyId && payload.keyId !== envelope.keyId) throw new PulseCloudClientError("Key ID envelope не совпадает с payload.", "PULSE_SIGNATURE_INVALID", 502);
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const notBefore = Date.parse(payload.notBefore || payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt)) throw new PulseCloudClientError("Cloud envelope не содержит корректный срок.", "PULSE_PAYLOAD_INVALID", 502);
  const skew = Math.max(0, Math.min(5 * 60_000, Number(options.clockSkewMs) || 30_000));
  if (notBefore > now + skew) throw new PulseCloudClientError("Cloud envelope ещё не действует.", "PULSE_PAYLOAD_NOT_ACTIVE", 502);
  if (expiresAt <= now - skew) throw new PulseCloudClientError("Cloud envelope истёк.", "PULSE_PAYLOAD_EXPIRED", 502);
  if (options.serverId && payload.serverId !== options.serverId) throw new PulseCloudClientError("Cloud envelope выдан другому серверу.", "PULSE_SCOPE_MISMATCH", 502);
  if (options.userId && payload.userId !== options.userId) throw new PulseCloudClientError("Cloud envelope выдан другому пользователю.", "PULSE_SCOPE_MISMATCH", 502);
  if (options.roomId && payload.roomId !== options.roomId) throw new PulseCloudClientError("Cloud envelope относится к другой комнате.", "PULSE_SCOPE_MISMATCH", 502);
  if (options.productCode && payload.productCode !== options.productCode) throw new PulseCloudClientError("Cloud envelope относится к другому продукту.", "PULSE_SCOPE_MISMATCH", 502);
  return payload;
}

function safeRequestId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(text) ? text : crypto.randomUUID();
}

class PulseCloudClient {
  constructor({
    mode = "disabled",
    cloudUrl = "",
    apiKey = "",
    serverId,
    repository,
    fetchImpl = globalThis.fetch,
    timeoutMs = 8_000,
    clock = () => new Date(),
    log = () => {},
  } = {}) {
    this.mode = ["disabled", "sandbox", "production"].includes(mode) ? mode : "disabled";
    this.serverId = String(serverId || "").trim();
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1_000, Math.min(30_000, Number(timeoutMs) || 8_000));
    this.clock = clock;
    this.log = log;
    this.apiKey = String(apiKey || "");
    this.cloudUrl = "";
    this.configurationError = null;
    if (this.mode === "production") {
      try {
        this.cloudUrl = normalizeCloudUrl(cloudUrl);
        if (!this.serverId || !this.cloudUrl || this.apiKey.length < 24 || !repository) {
          throw new PulseCloudClientError("Pulse production требует Cloud URL, Server ID, scoped API key и local repository.", "PULSE_CLOUD_MISCONFIGURED", 503);
        }
      } catch (error) {
        this.configurationError = error;
        this.mode = "misconfigured";
        this.log(`Pulse production отключён: ${error.message}`, "warn");
      }
    }
  }

  status() {
    let keyCount = 0;
    try {
      keyCount = this.repository?.keyRegistry?.().size || 0;
    } catch (error) {
      if (error?.code !== "PULSE_LOCAL_STORE_UNAVAILABLE") throw error;
    }
    return {
      mode: this.mode,
      enabled: this.mode === "production" || this.mode === "sandbox",
      productionReady: this.mode === "production",
      cloudOrigin: this.cloudUrl ? new URL(this.cloudUrl).origin : null,
      keyCount,
      errorCode: this.configurationError?.code || null,
    };
  }

  requireProduction() {
    if (this.mode !== "production") {
      const code = this.mode === "misconfigured" ? "PULSE_CLOUD_MISCONFIGURED" : "PULSE_DISABLED";
      throw new PulseCloudClientError("Production Pulse Cloud недоступен.", code, 503);
    }
  }

  authorizationUrl({ linkId, nonce, localUserId, redirectUri = "nexora://cloud-account/complete" }) {
    this.requireProduction();
    const url = new URL("/v1/oauth/authorize", this.cloudUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", `nexora-server:${this.serverId}`);
    url.searchParams.set("server_id", this.serverId);
    url.searchParams.set("local_user_id", String(localUserId));
    url.searchParams.set("link_id", String(linkId));
    url.searchParams.set("nonce", String(nonce));
    url.searchParams.set("redirect_uri", String(redirectUri));
    return url.toString();
  }

  verifyLinkAttestation(envelope, expected) {
    const payload = verifySignedEnvelope(envelope, this.repository.keyRegistry(), {
      serverId: this.serverId,
      now: this.clock(),
    });
    if (payload.type !== "local_account_link"
      || payload.linkId !== expected.linkId
      || payload.nonce !== expected.nonce
      || payload.localUserId !== expected.localUserId
      || !payload.cloudAccountId
      || !payload.subject) {
      throw new PulseCloudClientError("Link attestation не соответствует локальной сессии.", "LINK_ATTESTATION_INVALID", 400);
    }
    return payload;
  }

  async request(path, { method = "GET", body, idempotencyKey, requestId, userId, roomId, productCode } = {}) {
    this.requireProduction();
    const normalizedRequestId = safeRequestId(requestId);
    const nonce = crypto.randomBytes(24).toString("base64url");
    const timestamp = this.clock().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.cloudUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Nexora-Server-ID": this.serverId,
          "X-Nexora-Timestamp": timestamp,
          "X-Nexora-Nonce": nonce,
          "X-Request-ID": normalizedRequestId,
          ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      const code = error?.name === "AbortError" ? "PULSE_CLOUD_TIMEOUT" : "PULSE_CLOUD_OFFLINE";
      throw new PulseCloudClientError("Pulse Cloud временно недоступен.", code, 503, { requestId: normalizedRequestId });
    } finally {
      clearTimeout(timer);
    }

    const value = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PulseCloudClientError(
        value?.message || "Pulse Cloud отклонил запрос.",
        value?.code || "PULSE_CLOUD_ERROR",
        response.status,
        { requestId: value?.requestId || response.headers?.get?.("x-request-id") || normalizedRequestId },
      );
    }
    const payload = verifySignedEnvelope(value, this.repository.keyRegistry(), {
      serverId: this.serverId,
      userId,
      roomId,
      productCode,
      now: this.clock(),
    });
    return { payload, requestId: response.headers?.get?.("x-request-id") || normalizedRequestId, envelope: value };
  }

  async overview(localUserId, requestId) {
    const result = await this.request(`/v1/servers/${encodeURIComponent(this.serverId)}/users/${encodeURIComponent(localUserId)}/overview`, {
      userId: String(localUserId), requestId,
    });
    const overview = structuredClone(result.payload);
    for (const entitlement of overview.entitlements || []) {
      if (!entitlement?.envelope) throw new PulseCloudClientError("Overview содержит entitlement без envelope.", "ENTITLEMENT_INVALID", 502);
      entitlement.verifiedPayload = verifySignedEnvelope(entitlement.envelope, this.repository.keyRegistry(), {
        serverId: this.serverId,
        productCode: entitlement.productCode,
        now: this.clock(),
      });
      if (entitlement.verifiedPayload.jti !== entitlement.jti) throw new PulseCloudClientError("Entitlement jti не совпадает.", "ENTITLEMENT_INVALID", 502);
    }
    return { overview, requestId: result.requestId };
  }

  async transactions(localUserId, { limit = 50, before = null, requestId } = {}) {
    const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(200, Number(limit) || 50))) });
    if (before) query.set("before", String(before));
    const result = await this.request(`/v1/servers/${encodeURIComponent(this.serverId)}/users/${encodeURIComponent(localUserId)}/transactions?${query}`, {
      userId: String(localUserId), requestId,
    });
    return { transactions: result.payload.transactions || [], requestId: result.requestId };
  }

  async transaction(localUserId, transactionId, requestId) {
    const result = await this.request(`/v1/servers/${encodeURIComponent(this.serverId)}/users/${encodeURIComponent(localUserId)}/transactions/${encodeURIComponent(transactionId)}`, {
      userId: String(localUserId), requestId,
    });
    return { transaction: result.payload.transaction, requestId: result.requestId };
  }

  async checkout(localUserId, productCode, { currency = "EUR", region = "*", idempotencyKey, requestId } = {}) {
    const result = await this.request("/v1/checkout/sessions", {
      method: "POST",
      body: { serverId: this.serverId, userId: localUserId, productCode, currency, region },
      idempotencyKey, requestId, userId: String(localUserId),
    });
    if (!/^https:\/\//i.test(String(result.payload.url || ""))) throw new PulseCloudClientError("Cloud вернул небезопасный checkout URL.", "CHECKOUT_INVALID", 502);
    return { checkout: result.payload, requestId: result.requestId };
  }

  async checkoutStatus(localUserId, checkoutId, requestId) {
    const result = await this.request(`/v1/checkout/${encodeURIComponent(checkoutId)}`, { userId: String(localUserId), requestId });
    return { checkout: result.payload, requestId: result.requestId };
  }

  async goals(roomId, requestId) {
    const result = await this.request(`/v1/servers/${encodeURIComponent(this.serverId)}/rooms/${encodeURIComponent(roomId)}/goals`, {
      roomId: String(roomId), requestId,
    });
    return { goals: result.payload.goals || [], requestId: result.requestId };
  }

  async createGoal(localUserId, roomId, input, requestId) {
    const result = await this.request("/v1/goals", {
      method: "POST",
      body: { ...input, serverId: this.serverId, userId: localUserId, roomId },
      idempotencyKey: input.idempotencyKey,
      requestId,
      userId: String(localUserId), roomId: String(roomId),
    });
    return { goal: result.payload.goal, requestId: result.requestId };
  }

  async contribute(localUserId, roomId, goalId, amount, idempotencyKey, requestId) {
    const result = await this.request(`/v1/goals/${encodeURIComponent(goalId)}/contributions`, {
      method: "POST",
      body: { serverId: this.serverId, userId: localUserId, amount },
      idempotencyKey, requestId, userId: String(localUserId), roomId: String(roomId),
    });
    return { result: result.payload, requestId: result.requestId };
  }

  async cancelGoal(localUserId, roomId, goalId, idempotencyKey, requestId) {
    const result = await this.request(`/v1/goals/${encodeURIComponent(goalId)}/cancel`, {
      method: "POST",
      body: { serverId: this.serverId, userId: localUserId },
      idempotencyKey, requestId, userId: String(localUserId), roomId: String(roomId),
    });
    return { result: result.payload, requestId: result.requestId };
  }
}

module.exports = {
  PulseCloudClient,
  PulseCloudClientError,
  normalizeCloudUrl,
  safeRequestId,
  verifySignedEnvelope,
};
