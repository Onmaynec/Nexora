"use strict";

const express = require("express");
const { createCloudAppV11 } = require("./create-cloud-server-v11.cjs");
const { BillingError, timingSafeEqualText } = require("./billing-core.cjs");
const { createResponseSigner } = require("./entitlements.cjs");
const { IdentityService } = require("./identity-service.cjs");
const { mountIdentityRoutes } = require("./identity-routes.cjs");
const { BillingWorkers, HttpEmailSender, SignedEventPublisher } = require("./workers.cjs");
const { mountBillingManagementRoutes } = require("./billing-management-routes.cjs");

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : fallback;
  } catch {
    throw new BillingError("Configuration JSON array повреждён.", "PULSE_CLOUD_MISCONFIGURED", 503);
  }
}

function createCloudAppV12(options = {}) {
  const responseSigner = options.responseSigner || createResponseSigner({
    keyId: options.entitlementKeyId,
    privateKey: options.entitlementPrivateKey,
  });
  const base = createCloudAppV11({ ...options, responseSigner });
  const redirectUris = parseJsonArray(options.oauthRedirectUris, ["nexora://cloud-account/complete"]);
  const serverId = String(options.serverId || "").trim();
  const oauthClients = [
    ...(Array.isArray(options.oauthClients) ? options.oauthClients : []),
    ...(serverId ? [{
      clientId: `nexora-server:${serverId}`,
      displayName: `Nexora Local Server ${serverId}`,
      redirectUris,
      scopes: ["openid", "profile", "link:account"],
    }] : []),
  ];
  const identity = new IdentityService(base.database, {
    encryptionKey: options.identityEncryptionKey,
    responseSigner,
    oauthClients,
    clock: options.clock,
    exposeVerificationTokens: options.exposeVerificationTokens,
  });
  const emailSender = options.emailSender || (options.emailDeliveryUrl ? new HttpEmailSender({
    endpoint: options.emailDeliveryUrl,
    apiKey: options.emailDeliveryApiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.workerTimeoutMs,
  }) : null);
  const eventPublisher = options.eventPublisher || (options.eventSinkUrl ? new SignedEventPublisher({
    endpoint: options.eventSinkUrl,
    secret: options.eventSinkSecret,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.workerTimeoutMs,
  }) : null);
  const workers = new BillingWorkers({
    database: base.database,
    provider: base.provider,
    emailSender,
    eventPublisher,
    clock: options.clock,
    log: options.log || (() => {}),
    leaseMs: options.workerLeaseMs,
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy || 1);

  app.get("/.well-known/oauth-authorization-server", (_request, response) => {
    const issuer = String(options.publicUrl || "").replace(/\/+$/, "");
    response.json({
      issuer,
      authorization_endpoint: `${issuer}/v1/oauth/authorize`,
      token_endpoint: `${issuer}/v1/oauth/token`,
      userinfo_endpoint: `${issuer}/v1/oauth/userinfo`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: ["openid", "profile", "link:account"],
    });
  });

  mountIdentityRoutes({ app, identity, log: options.log });
  mountBillingManagementRoutes({
    app,
    database: base.database,
    provider: base.provider,
    responseSigner,
    serverApiKey: options.serverApiKey,
    configuredServerId: serverId,
    publicUrl: options.publicUrl,
  });

  function adminAuth(request, response, next) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!timingSafeEqualText(token, options.adminApiKey)) {
      return response.status(401).json({ ok: false, code: "AUTH_REQUIRED", message: "Operator credential недействителен.", requestId: request.identityRequestId || null, details: {} });
    }
    next();
  }

  app.get("/v1/admin/workers/status", adminAuth, (_request, response) => {
    response.json({ ok: true, workers: workers.status() });
  });

  app.post("/v1/admin/workers/run", adminAuth, async (request, response) => {
    try { response.json({ ok: true, result: await workers.runOnce(), requestId: request.identityRequestId || null }); }
    catch (error) {
      response.status(error instanceof BillingError ? error.status : 500).json({
        ok: false,
        code: error instanceof BillingError ? error.code : "INTERNAL_ERROR",
        message: error instanceof BillingError ? error.message : "Worker execution failed.",
        requestId: request.identityRequestId || null,
        details: error instanceof BillingError ? error.details || {} : {},
      });
    }
  });

  app.get("/healthz/full", (_request, response) => {
    const identityCount = base.database.db.prepare("SELECT COUNT(*) AS count FROM cloud_identities").get();
    response.json({
      ok: true,
      service: "nexora-pulse-cloud",
      version: "3.1.0",
      ledger: base.database.ledgerInvariant(),
      identity: { accounts: Number(identityCount?.count || 0), emailDeliveryConfigured: Boolean(emailSender) },
      workers: workers.status(),
    });
  });

  app.use(base.app);
  return { ...base, app, identity, workers };
}

module.exports = {
  createCloudAppV12,
  parseJsonArray,
};
