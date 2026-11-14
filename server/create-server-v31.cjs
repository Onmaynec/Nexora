"use strict";

const { createNexoraServer: createBaseNexoraServer, LIMITS, REACTIONS } = require("./create-server.cjs");
const { PulseCloudClient } = require("./pulse-cloud-client.cjs");
const { PulseLocalRepository } = require("./pulse-local-repository.cjs");
const { upgradeStoreToSchema7 } = require("./pulse-schema7.cjs");
const { mountPulseV3Routes } = require("./pulse-v3-routes.cjs");
const { mountPulseProductRoutes } = require("./pulse-product-routes.cjs");
const { PulseSyncWorker } = require("./pulse-sync-worker.cjs");
const { DeveloperCommandService } = require("./developer-commands.cjs");
const { PulseSandboxService } = require("./pulse-sandbox-service.cjs");
const { upgradeStoreToSchema8 } = require("./trust-schema8.cjs");
const { mountStableCore } = require("./stable-core.cjs");
const { upgradeStoreToSchema9 } = require("./mobile-continuity-schema9.cjs");
const { mountMobileContinuity } = require("./mobile-continuity.cjs");
const { createMobilePushService } = require("./mobile-push-service.cjs");
const { createPushGatewayTransport } = require("./push-gateway.cjs");
const { upgradeStoreToSchema10 } = require("./connect-schema10.cjs");
const { mountConnect } = require("./connect.cjs");
const { mountCommunities } = require("./communities.cjs");

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

  try {
    const pulseMigration = await upgradeStoreToSchema7(instance.store, {
      databaseFile: instance.status().databaseFile,
      log: (message) => log(message, "info"),
    });
    const legacyTrustMigration = await upgradeStoreToSchema8(instance.store, {
      databaseFile: instance.status().databaseFile,
      log: (message) => log(message, "info"),
    });
    const mobileContinuityMigration = await upgradeStoreToSchema9(instance.store, {
      databaseFile: instance.status().databaseFile,
      log: (message) => log(message, "info"),
    });
    const connectMigration = await upgradeStoreToSchema10(instance.store, {
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
    mountPulseProductRoutes({
      app: instance.app,
      authRequired: pulseRoutes.authRequired,
      client,
      repository,
      syncWorker,
      sandbox,
      io: instance.io,
      store: instance.store,
    });
    const stableCore = mountStableCore({
      app: instance.app,
      store: instance.store,
      io: instance.io,
      authRequired: pulseRoutes.authRequired,
      maintenance: instance.maintenance,
      log,
    });
    const mobileContinuity = mountMobileContinuity({
      app: instance.app,
      store: instance.store,
      io: instance.io,
      authRequired: pulseRoutes.authRequired,
      maintenance: instance.maintenance,
      dataDir: instance.status().dataDir,
      maxFileBytes: LIMITS.fileBytes,
      serverId: instance.status().serverId,
      pushTokenKey: options.pushTokenKey,
      log,
    });
    const connect = await mountConnect({
      app: instance.app,
      store: instance.store,
      io: instance.io,
      serverId: instance.status().serverId,
      authRequired: pulseRoutes.authRequired,
      turnSecret: options.turnSecret,
      turnUrls: options.turnUrls,
      turnTtlSeconds: options.turnTtlSeconds,
      log,
    });
    const communities = options.experimentalCommunities === true ? mountCommunities({
      app: instance.app,
      store: instance.store,
      io: instance.io,
      authRequired: pulseRoutes.authRequired,
      log,
    }) : null;
    const pushTransport = options.pushTransport ?? createPushGatewayTransport({
      url: options.pushGatewayUrl ?? process.env.NEXORA_PUSH_GATEWAY_URL,
      secret: options.pushGatewaySecret ?? process.env.NEXORA_PUSH_GATEWAY_SECRET,
      timeoutMs: options.pushGatewayTimeoutMs ?? process.env.NEXORA_PUSH_GATEWAY_TIMEOUT_MS,
      lookup: options.pushGatewayLookup,
      requestFactory: options.pushGatewayRequestFactory,
      clock: options.pushGatewayClock,
    });
    const mobilePush = createMobilePushService({
      store: instance.store,
      events: instance.events,
      serverId: instance.status().serverId,
      pushTokenKey: options.pushTokenKey,
      transport: pushTransport,
      clock: options.clock,
      maxAttempts: options.pushMaxAttempts,
      maxAgeMs: options.pushMaxAgeMs,
      log,
    });
    await mobilePush.start();

    const baseStatus = instance.status.bind(instance);
    instance.status = () => ({
      ...baseStatus(),
      schemaVersion: 10,
      pulseV3: { keyCount: 0, ...client.status(), ...(sandbox.enabled() ? { mode: "sandbox", enabled: true, productionReady: false, testMode: true } : {}), sync: syncWorker.status() },
      stableCore: stableCore.status(),
      mobileContinuity: { ...mobileContinuity.status(), pushGateway: mobilePush.status() },
      connect: connect.status(),
      communities: communities?.status() ?? { enabled: false },
      trust: { runtime: "retired", legacyHistory: "read_only", encryptedAttachments: false, deviceScopedRealtime: false, activeGroups: 0 },
      migration: connectMigration,
      migrations: { pulse: pulseMigration, legacyTrust: legacyTrustMigration, mobileContinuity: mobileContinuityMigration, connect: connectMigration },
    });
    const baseListen = instance.listen.bind(instance);
    instance.listen = async () => {
      await baseListen();
      syncWorker.start();
      return instance.status();
    };
    const baseClose = instance.close.bind(instance);
    instance.close = async () => {
      syncWorker.stop();
      await mobilePush.close();
      connect.close();
      communities?.close();
      mobileContinuity.close();
      await baseClose();
    };
    instance.pulseRepository = repository;
    instance.pulseCloudClient = client;
    instance.pulseSyncWorker = syncWorker;
    instance.pulseMigration = pulseMigration;
    instance.pulseSandbox = sandbox;
    instance.legacyTrustMigration = legacyTrustMigration;
    instance.mobileContinuityMigration = mobileContinuityMigration;
    instance.connectMigration = connectMigration;
    instance.stableCore = stableCore;
    instance.mobileContinuity = mobileContinuity;
    instance.connect = connect;
    instance.communities = communities;
    instance.mobilePush = mobilePush;
    instance.pushTransport = pushTransport;
    instance.commandService = new DeveloperCommandService({ instance, store: instance.store, pulseSandbox: sandbox, log, clock: options.clock });
    return instance;
  } catch (error) {
    await instance.close().catch((closeError) => log(`Failed to close Local Server after Connect initialization error: ${closeError.message}`, "error"));
    throw error;
  }
}

module.exports = {
  LIMITS,
  REACTIONS,
  createNexoraServer,
  parsePublicKeys,
};
