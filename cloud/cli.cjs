"use strict";

const http = require("node:http");
const path = require("node:path");
const { BillingError } = require("./billing-core.cjs");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new BillingError(`${name} не настроен.`, "PULSE_CLOUD_MISCONFIGURED", 503, { variable: name });
  return value;
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
    serverId: String(process.env.NEXORA_PULSE_SERVER_ID || "").trim(),
    serverApiKey: required("NEXORA_PULSE_API_KEY"),
    adminApiKey: required("CLOUD_ADMIN_API_KEY"),
    paymentSecretKey: required("PAYMENT_SECRET_KEY"),
    paymentWebhookSecret: required("PAYMENT_WEBHOOK_SECRET"),
    entitlementKeyId: required("ENTITLEMENT_SIGNING_KEY_ID"),
    entitlementPrivateKey: required("ENTITLEMENT_SIGNING_PRIVATE_KEY"),
    entitlementPublicKey: required("ENTITLEMENT_SIGNING_PUBLIC_KEY"),
    plusPriceId: required("STRIPE_PLUS_PRICE_ID"),
    plusPriceMinor: Number(required("NEXORA_PLUS_PRICE_MINOR")),
    impulse500PriceId: required("STRIPE_IMPULSE_500_PRICE_ID"),
    impulse500PriceMinor: Number(required("NEXORA_IMPULSE_500_PRICE_MINOR")),
    currency: String(process.env.NEXORA_BILLING_CURRENCY || "EUR").trim().toUpperCase(),
    region: String(process.env.NEXORA_BILLING_REGION || "*").trim(),
    taxMode: String(process.env.NEXORA_BILLING_TAX_MODE || "exclusive").trim(),
    trustProxy: Number(process.env.CLOUD_TRUST_PROXY || 1),
    rateLimit: Number(process.env.CLOUD_RATE_LIMIT_PER_MINUTE || 180),
  };
}

function start() {
  const port = positivePort(process.env.PORT, 4545);
  const host = String(process.env.HOST || "127.0.0.1").trim();
  const options = buildOptions();
  const { createCloudAppV11 } = require("./create-cloud-server-v11.cjs");
  const { app, database } = createCloudAppV11(options);
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 30_000;

  const shutdown = (signal) => {
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
    console.log(`[Pulse Cloud] listening on http://${host}:${port}`);
  });
  return { server, database };
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    const code = error instanceof BillingError ? error.code : "INTERNAL_ERROR";
    console.error(`[Pulse Cloud] startup failed (${code}): ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildOptions, positivePort, start };
