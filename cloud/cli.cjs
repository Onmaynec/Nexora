"use strict";

const http = require("node:http");
const path = require("node:path");
const { BillingError } = require("./billing-core.cjs");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new BillingError(`${name} не настроен.`, "PULSE_CLOUD_MISCONFIGURED", 503, { variable: name });
  return value;
}

function optional(name) {
  const value = String(process.env[name] || "").trim();
  return value || null;
}

function positivePort(value, fallback = 4545) {
  const port = Math.trunc(Number(value || fallback));
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new BillingError("PORT должен быть числом от 1 до 65535.", "PULSE_CLOUD_MISCONFIGURED", 503, { variable: "PORT" });
  }
  return port;
}

function buildOptions() {
  const paymentProvider = String(process.env.PAYMENT_PROVIDER || "stripe").trim().toLowerCase();
  if (paymentProvider !== "stripe") {
    throw new BillingError("Nexora 3.1.0 поддерживает PAYMENT_PROVIDER=stripe.", "PULSE_CLOUD_MISCONFIGURED", 503, { variable: "PAYMENT_PROVIDER" });
  }
  return {
    databaseFile: path.resolve(process.env.PULSE_DATABASE_FILE || path.join(process.cwd(), "data", "pulse-cloud.sqlite")),
    publicUrl: required("CLOUD_PUBLIC_URL"),
    serverId: required("NEXORA_PULSE_SERVER_ID"),
    serverApiKey: required("NEXORA_PULSE_API_KEY"),
    adminApiKey: required("CLOUD_ADMIN_API_KEY"),
    paymentSecretKey: required("PAYMENT_SECRET_KEY"),
    paymentWebhookSecret: required("PAYMENT_WEBHOOK_SECRET"),
    entitlementKeyId: required("ENTITLEMENT_SIGNING_KEY_ID"),
    entitlementPrivateKey: required("ENTITLEMENT_SIGNING_PRIVATE_KEY"),
    entitlementPublicKey: required("ENTITLEMENT_SIGNING_PUBLIC_KEY"),
    identityEncryptionKey: required("IDENTITY_ENCRYPTION_KEY"),
    emailDeliveryUrl: required("CLOUD_EMAIL_DELIVERY_URL"),
    emailDeliveryApiKey: required("CLOUD_EMAIL_DELIVERY_API_KEY"),
    oauthRedirectUris: required("NEXORA_PULSE_REDIRECT_URIS_JSON"),
    eventSinkUrl: optional("CLOUD_EVENT_SINK_URL"),
    eventSinkSecret: optional("CLOUD_EVENT_SINK_SECRET"),
    plusPriceId: required("STRIPE_PLUS_PRICE_ID"),
    plusPriceMinor: Number(required("NEXORA_PLUS_PRICE_MINOR")),
    impulse500PriceId: required("STRIPE_IMPULSE_500_PRICE_ID"),
    impulse500PriceMinor: Number(required("NEXORA_IMPULSE_500_PRICE_MINOR")),
    currency: String(process.env.NEXORA_BILLING_CURRENCY || "EUR").trim().toUpperCase(),
    region: String(process.env.NEXORA_BILLING_REGION || "*").trim(),
    taxMode: String(process.env.NEXORA_BILLING_TAX_MODE || "exclusive").trim(),
    trustProxy: Number(process.env.CLOUD_TRUST_PROXY || 1),
    rateLimit: Number(process.env.CLOUD_RATE_LIMIT_PER_MINUTE || 180),
    workerIntervalMs: Number(process.env.CLOUD_WORKER_INTERVAL_MS || 30_000),
    workerLeaseMs: Number(process.env.CLOUD_WORKER_LEASE_MS || 60_000),
    workerTimeoutMs: Number(process.env.CLOUD_WORKER_TIMEOUT_MS || 10_000),
  };
}

function start() {
  const port = positivePort(process.env.PORT, 4545);
  const host = String(process.env.HOST || "127.0.0.1").trim();
  const options = buildOptions();
  const { createCloudAppV12 } = require("./create-cloud-server-v12.cjs");
  const { app, database, workers } = createCloudAppV12({ ...options, log: (message, level = "info") => console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[Pulse Cloud] ${message}`) });
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 30_000;

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    try { await workers.stop(); } catch (error) { console.error(`[Pulse Cloud] workers stop failed: ${error.message}`); }
    server.close((error) => {
      try { database.close(); } catch (closeError) { console.error(`[Pulse Cloud] close failed: ${closeError.message}`); }
      if (error) {
        console.error(`[Pulse Cloud] ${signal}: ${error.message}`);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  server.listen(port, host, () => {
    workers.start(options.workerIntervalMs);
    console.log(`[Pulse Cloud] listening on http://${host}:${port}`);
  });
  return { server, database, workers };
}

if (require.main === module) {
  try { start(); }
  catch (error) {
    const code = error instanceof BillingError ? error.code : "INTERNAL_ERROR";
    console.error(`[Pulse Cloud] startup failed (${code}): ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildOptions, optional, positivePort, required, start };
