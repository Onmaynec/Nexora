"use strict";

const crypto = require("node:crypto");
const dns = require("node:dns").promises;
const https = require("node:https");
const net = require("node:net");

const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

function gatewayError(code, message, { permanent = false, status = null } = {}) {
  return Object.assign(new Error(message), { code, permanent, status });
}

function normalizeAddress(value) {
  const source = String(value || "").trim().toLowerCase();
  if (!source.startsWith("::ffff:")) return source;
  const tail = source.slice(7);
  if (net.isIP(tail) === 4) return tail;
  const groups = tail.split(":");
  if (groups.length === 2 && groups.every((group) => /^[a-f0-9]{1,4}$/.test(group))) {
    const high = Number.parseInt(groups[0], 16);
    const low = Number.parseInt(groups[1], 16);
    return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  }
  return source;
}

function isPrivateAddress(value) {
  const address = normalizeAddress(value);
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b, c] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 88 && c === 99)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113)
      || a >= 224;
  }
  if (family === 6) {
    if (address === "::" || address === "::1") return true;
    if (address.startsWith("fc") || address.startsWith("fd") || /^fe[89abcdef]/.test(address) || address.startsWith("ff")) return true;
    if (address === "100::" || address.startsWith("100:0:0:0:")) return true;
    if (address.startsWith("64:ff9b:") || address.startsWith("2001:0:") || address.startsWith("2001:2:") || address.startsWith("2001:10:") || address.startsWith("2001:20:") || address.startsWith("2001:db8:")) return true;
    if (address.startsWith("2002:")) {
      const groups = address.split(":");
      if (groups.length >= 3 && /^[a-f0-9]{1,4}$/.test(groups[1]) && /^[a-f0-9]{1,4}$/.test(groups[2])) {
        const high = Number.parseInt(groups[1], 16);
        const low = Number.parseInt(groups[2], 16);
        return isPrivateAddress(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
      }
      return true;
    }
    return false;
  }
  return true;
}

function validateGatewayConfig({ url, secret } = {}) {
  const rawUrl = String(url || "").trim();
  const rawSecret = String(secret || "").trim();
  if (!rawUrl && !rawSecret) return null;
  if (!rawUrl || !rawSecret) throw gatewayError("PUSH_GATEWAY_MISCONFIGURED", "Push gateway URL and secret must be configured together.", { permanent: true });
  if (rawSecret.length < 32 || rawSecret.length > 4_096) throw gatewayError("PUSH_GATEWAY_MISCONFIGURED", "Push gateway secret must contain 32–4096 characters.", { permanent: true });

  let parsed;
  try { parsed = new URL(rawUrl); } catch {
    throw gatewayError("PUSH_GATEWAY_MISCONFIGURED", "Push gateway URL is invalid.", { permanent: true });
  }
  if (parsed.protocol !== "https:") throw gatewayError("PUSH_GATEWAY_HTTPS_REQUIRED", "Push gateway must use HTTPS.", { permanent: true });
  if (parsed.username || parsed.password || parsed.hash) throw gatewayError("PUSH_GATEWAY_MISCONFIGURED", "Push gateway URL must not contain credentials or a fragment.", { permanent: true });
  if (!parsed.hostname || parsed.hostname === "localhost" || (net.isIP(parsed.hostname) && isPrivateAddress(parsed.hostname))) {
    throw gatewayError("PUSH_GATEWAY_PRIVATE_TARGET", "Push gateway must resolve to a public address.", { permanent: true });
  }
  return { url: parsed, secret: rawSecret };
}

function signGatewayRequest(secret, timestamp, body) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

async function resolvePinnedAddress(hostname, lookup = dns.lookup) {
  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw gatewayError("PUSH_GATEWAY_DNS_FAILED", `Push gateway DNS resolution failed: ${error.code || error.name || "unknown"}`);
  }
  const values = Array.isArray(records) ? records : records ? [records] : [];
  if (!values.length) throw gatewayError("PUSH_GATEWAY_DNS_FAILED", "Push gateway DNS resolution returned no addresses.");
  if (values.some((record) => isPrivateAddress(record.address))) {
    throw gatewayError("PUSH_GATEWAY_PRIVATE_TARGET", "Push gateway resolved to a private or reserved address.", { permanent: true });
  }
  const selected = values[0];
  return { address: selected.address, family: Number(selected.family) || net.isIP(selected.address) };
}

function createPushGatewayTransport({
  url = process.env.NEXORA_PUSH_GATEWAY_URL,
  secret = process.env.NEXORA_PUSH_GATEWAY_SECRET,
  timeoutMs = process.env.NEXORA_PUSH_GATEWAY_TIMEOUT_MS,
  lookup = dns.lookup,
  requestFactory = https.request,
  clock = () => Date.now(),
} = {}) {
  const config = validateGatewayConfig({ url, secret });
  if (!config) {
    return {
      configured: false,
      status: () => ({ configured: false, endpointHost: null, lastSuccessAt: null, lastErrorCode: null }),
      async send() { throw gatewayError("PUSH_GATEWAY_NOT_CONFIGURED", "Production push gateway is not configured.", { permanent: true }); },
    };
  }

  const boundedTimeout = Math.max(1_000, Math.min(30_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  let lastSuccessAt = null;
  let lastErrorCode = null;

  async function send(delivery) {
    const token = String(delivery?.token || "");
    if (token.length < 16 || token.length > 8_192) throw gatewayError("PUSH_TOKEN_INVALID", "Push token is invalid.", { permanent: true });
    const deliveryId = String(delivery.deliveryId || crypto.randomUUID());
    const body = JSON.stringify({
      version: 1,
      deliveryId,
      serverId: String(delivery.serverId || ""),
      subscription: {
        provider: String(delivery.provider || ""),
        token,
        installationId: String(delivery.installationId || ""),
      },
      notification: delivery.notification && typeof delivery.notification === "object" ? delivery.notification : {},
      data: delivery.data && typeof delivery.data === "object" ? delivery.data : {},
    });
    const timestamp = String(clock());
    const signature = signGatewayRequest(config.secret, timestamp, body);
    const pinned = await resolvePinnedAddress(config.url.hostname, lookup);

    try {
      const result = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (handler, value) => {
          if (settled) return;
          settled = true;
          handler(value);
        };
        const request = requestFactory({
          protocol: "https:",
          hostname: config.url.hostname,
          port: config.url.port || 443,
          path: `${config.url.pathname}${config.url.search}`,
          method: "POST",
          servername: config.url.hostname,
          rejectUnauthorized: true,
          timeout: boundedTimeout,
          lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "X-Nexora-Timestamp": timestamp,
            "X-Nexora-Signature": `sha256=${signature}`,
            "X-Nexora-Delivery-ID": deliveryId,
          },
        }, (response) => {
          const chunks = [];
          let size = 0;
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              request.destroy(gatewayError("PUSH_GATEWAY_RESPONSE_TOO_LARGE", "Push gateway response exceeded the size limit."));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (size > MAX_RESPONSE_BYTES) return;
            const text = Buffer.concat(chunks).toString("utf8");
            let parsed = null;
            try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
            finish(resolve, { status: Number(response.statusCode || 0), body: parsed });
          });
          response.on("error", (error) => finish(reject, error));
        });
        request.once("timeout", () => request.destroy(gatewayError("PUSH_GATEWAY_TIMEOUT", "Push gateway request timed out.")));
        request.once("error", (error) => finish(reject, error));
        request.end(body);
      });

      if (result.status < 200 || result.status >= 300) {
        const invalidToken = result.status === 404 || result.status === 410 || ["PUSH_TOKEN_INVALID", "TOKEN_NOT_REGISTERED"].includes(result.body?.code);
        throw gatewayError(
          invalidToken ? "PUSH_TOKEN_INVALID" : "PUSH_GATEWAY_REJECTED",
          `Push gateway rejected the delivery with HTTP ${result.status}.`,
          { permanent: invalidToken || (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429), status: result.status },
        );
      }
      lastSuccessAt = new Date(clock()).toISOString();
      lastErrorCode = null;
      return { ok: true, status: result.status, providerMessageId: String(result.body?.messageId || "") || null };
    } catch (error) {
      lastErrorCode = String(error?.code || "PUSH_GATEWAY_UNAVAILABLE");
      if (error?.code) throw error;
      throw gatewayError("PUSH_GATEWAY_UNAVAILABLE", "Push gateway request failed.");
    }
  }

  return {
    configured: true,
    send,
    status: () => ({ configured: true, endpointHost: config.url.hostname, lastSuccessAt, lastErrorCode }),
  };
}

module.exports = {
  createPushGatewayTransport,
  isPrivateAddress,
  resolvePinnedAddress,
  signGatewayRequest,
  validateGatewayConfig,
};
