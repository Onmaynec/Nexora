"use strict";

const { createNexoraServer: createBaseNexoraServer, LIMITS, REACTIONS } = require("./create-server.cjs");
const { mountE2eeAttachmentRoutes } = require("./e2ee-attachments.cjs");
const { PulseCloudClient } = require("./pulse-cloud-client.cjs");
const { PulseLocalRepository } = require("./pulse-local-repository.cjs");
const { upgradeStoreToSchema7 } = require("./pulse-schema7.cjs");
const { mountPulseV3Routes } = require("./pulse-v3-routes.cjs");
const { mountPulseProductRoutes } = require("./pulse-product-routes.cjs");
const { PulseSyncWorker } = require("./pulse-sync-worker.cjs");
const { DeveloperCommandService } = require("./developer-commands.cjs");
const { PulseSandboxService } = require("./pulse-sandbox-service.cjs");
const { upgradeStoreToSchema8 } = require("./trust-schema8.cjs");
const { TrustCore } = require("./trust-core.cjs");
const { mountTrustRoutes } = require("./trust-routes.cjs");
const { mountTrustRecoveryRoutes } = require("./trust-recovery-routes.cjs");
const { mountTrustSocketAuthorization } = require("./trust-socket.cjs");
const { mountMlsTransport } = require("./mls-transport.cjs");

function parsePublicKeys(options = {}) {
  const values = [];
  const configured = options.pulsePublicKeys ?? process.env.NEXORA_PULSE_PUBLIC_KEYS_JSON;
  if (configured) {
    let parsed = configured;
    if (typeof configured === "string") {
      try { parsed = JSON.parse(configured); } catch { throw Object.assign(new Error("NEXORA_PULSE_PUBLIC_KEYS_JSON содержит неверный JSON."), { code: "PULSE_CLOUD_MISCONFIGURED" }); }
    }
    if (Array.isArray(parsed)) values.push(...parsed);
    else if (parsed && typeof parsed === "object") {
      for (const [keyId, publicKey] of Object.entries(parsed)) values.push({ keyId, publicKey });
    }
  }
  const singleKey = options.pulsePublicKey ?? process.env.NEXORA_PULSE_PUBLIC_KEY;
  const singleKeyId = options.pulsePublicKeyId ?? process.env.NEXORA_PULSE_PUBLIC_KEY_ID ?? process.env.ENTITLEMENT_SIGNING_KEY_ID;
  if (singleKey && singleKeyId) values.push({ keyId: singleKeyId, publicKey: singleKey });
  return values;
}

async function createNexoraServer(options = {}) {
  const instance = await createBaseNexoraServer(options);
  const log = (message, level = "info") => {
    const entry = { level, message, createdAt: new Date().toISOString() };
    instance.events.emit("log", entry);
    if (!options.quiet) console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[Nexora] ${message}`);
  };

  let trustCleanupTimer = null;
  try {
    const pulseMigration = await upgradeStoreToSchema7(instance.store, {
      databaseFile: instance.status().databaseFile,
      log: (message) => log(message, "info"),
    });
    const trustMigration = await upgradeStoreToSchema8(instance.store, {
      databaseFile: instance.status().databaseFile,
      log: (message) => log(message, "info"),
    });

    const repository = new PulseLocalRepository(instance.store, { clock: options.clock });
    for (const item of parsePublicKeys(options)) {
      repository.trustPublicKey({
        keyId: item.keyId,
        publicKey: item.publicKey,
        algorithm: item.algorithm || "Ed25519",
        source: item.source || "configuration",
        notBefore: item.notBefore || null,
        expiresAt: item.expiresAt || null,
      });
    }
    const client = new PulseCloudClient({
      mode: options.pulseMode ?? process.env.NEXORA_PULSE_MODE ?? "disabled",
      cloudUrl: options.pulseCloudUrl ?? process.env.NEXORA_PULSE_CLOUD_URL ?? "",
      apiKey: options.pulseApiKey ?? process.env.NEXORA_PULSE_API_KEY ?? "",
      serverId: instance.status().serverId,
      repository,
      fetchImpl: options.pulseFetch ?? options.fetchImpl ?? globalThis.fetch,
      timeoutMs: options.pulseTimeoutMs ?? process.env.NEXORA_PULSE_TIMEOUT_MS,
      clock: options.clock,
      log,
    });

    const sandbox = new PulseSandboxService({ store: instance.store, productionMode: client.status().mode === "production", clock: options.clock, log });
    const trustCore = new TrustCore({ store: instance.store, clock: options.clock, log });
    mountTrustSocketAuthorization({ io: instance.io, trustCore, log });

    const pulseRoutes = mountPulseV3Routes({
      app: instance.app,
      store: instance.store,
      io: instance.io,
      serverId: instance.status().serverId,
      client,
      repository,
      sandbox,
      log,
    });
    const syncWorker = new PulseSyncWorker({
      client,
      repository,
      store: instance.store,
      io: instance.io,
      serverId: instance.status().serverId,
      log,
      intervalMs: options.pulseSyncIntervalMs ?? process.env.NEXORA_PULSE_SYNC_INTERVAL_MS,
    });
    mountPulseProductRoutes({ app: instance.app, authRequired: pulseRoutes.authRequired, client, repository, syncWorker });
    const trustRoutes = mountTrustRoutes({ app: instance.app, store: instance.store, io: instance.io, trustCore, log });
    mountTrustRecoveryRoutes({ app: instance.app, trustCore, ...trustRoutes });
    const mlsTransport = mountMlsTransport({ io: instance.io, store: instance.store, trustCore, log });
    const e2eeAttachments = mountE2eeAttachmentRoutes({
      app: instance.app,
      store: instance.store,
      authRequired: trustRoutes.authRequired,
      dataDir: instance.dataDir,
      maxPlaintextBytes: LIMITS.fileBytes,
      postingError: mlsTransport.postingError,
      log,
    });

    const baseStatus = instance.status.bind(instance);
    instance.status = () => ({
      ...baseStatus(),
      schemaVersion: 8,
      pulseV3: { ...client.status(), ...(sandbox.enabled() ? { mode: "sandbox", enabled: true, productionReady: false, testMode: true } : {}), sync: syncWorker.status() },
      trust: { ...trustCore.status(), encryptedAttachments: true, deviceScopedRealtime: true },
      migration: pulseMigration,
      migrations: { pulse: pulseMigration, trust: trustMigration },
    });
    const baseListen = instance.listen.bind(instance);
    instance.listen = async () => {
      await baseListen();
      syncWorker.start();
      trustCore.cleanup();
      await e2eeAttachments.cleanupExpired();
      trustCleanupTimer = setInterval(() => {
        try { trustCore.cleanup(); } catch (error) { log(`Trust cleanup failed: ${error.message}`, "warn"); }
        e2eeAttachments.cleanupExpired().catch((error) => log(`E2EE attachment cleanup failed: ${error.message}`, "warn"));
      }, 60 * 60_000);
      trustCleanupTimer.unref?.();
      return instance.status();
    };
    const baseClose = instance.close.bind(instance);
    instance.close = async () => {
      syncWorker.stop();
      if (trustCleanupTimer) clearInterval(trustCleanupTimer);
      trustCleanupTimer = null;
      await baseClose();
    };
    instance.pulseRepository = repository;
    instance.pulseCloudClient = client;
    instance.pulseSyncWorker = syncWorker;
    instance.pulseMigration = pulseMigration;
    instance.pulseSandbox = sandbox;
    instance.trustCore = trustCore;
    instance.trustMigration = trustMigration;
    instance.e2eeAttachments = e2eeAttachments;
    instance.commandService = new DeveloperCommandService({ instance, store: instance.store, pulseSandbox: sandbox, log, clock: options.clock });
    return instance;
  } catch (error) {
    if (trustCleanupTimer) clearInterval(trustCleanupTimer);
    await instance.close().catch((closeError) => log(`Failed to close Local Server after Trust/Pulse initialization error: ${closeError.message}`, "error"));
    throw error;
  }
}

module.exports = {
  LIMITS,
  REACTIONS,
  createNexoraServer,
  parsePublicKeys,
};
