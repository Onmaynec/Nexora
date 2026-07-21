"use strict";

const { createNexoraServerV31 } = require("./create-server-v31.cjs");
const { upgradeStoreToSchema8 } = require("./trust-schema8.cjs");
const { TrustRepository } = require("./trust-repository.cjs");
const { mountTrustV4Routes } = require("./trust-v4-routes.cjs");
const { mountTrustDiscoveryRoutes } = require("./trust-discovery-routes.cjs");

function trustStats(repository) {
  const db = repository.db;
  const count = (table, where = "") => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get()?.count || 0);
  return {
    activeDevices: count("trust_devices", "WHERE status='active'"),
    revokedDevices: count("trust_devices", "WHERE status='revoked'"),
    availableKeyPackages: count("trust_key_packages", "WHERE status='available'"),
    activeGroups: count("trust_groups", "WHERE status='active'"),
    envelopes: count("trust_envelopes"),
    pendingWelcomes: count("trust_welcomes", "WHERE claimed_at IS NULL"),
    transparencyEntries: count("trust_transparency_entries"),
  };
}

async function createNexoraServerV32(options = {}) {
  const log = options.log || (() => {});
  const instance = await createNexoraServerV31(options);
  try {
    const migration = await upgradeStoreToSchema8(instance.store, {
      databaseFile: options.databaseFile || instance.databaseFile,
      log,
    });
    const repository = new TrustRepository({ store: instance.store, clock: options.clock, log });
    const routes = mountTrustV4Routes({
      app: instance.app,
      store: instance.store,
      io: instance.io,
      repository,
      log,
    });
    const discovery = mountTrustDiscoveryRoutes({
      app: instance.app,
      store: instance.store,
      repository,
      log,
    });
    const originalStatus = instance.status.bind(instance);
    instance.status = () => ({
      ...originalStatus(),
      trustCore: {
        enabled: true,
        protocol: "MLS_1_0",
        ciphersuite: "MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519",
        schemaVersion: 8,
        serverDecrypts: false,
        transparency: repository.transparencyRoot(),
        stats: trustStats(repository),
      },
    });
    instance.trustMigration = migration;
    instance.trustRepository = repository;
    instance.trustRoutes = routes;
    instance.trustDiscovery = discovery;
    return instance;
  } catch (error) {
    await instance.close().catch(() => {});
    throw error;
  }
}

module.exports = {
  createNexoraServerV32,
  trustStats,
};
