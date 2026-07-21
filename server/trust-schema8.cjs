"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { backup } = require("node:sqlite");

const TRUST_SCHEMA_VERSION = 8;
const MIN_FREE_BYTES = 64 * 1024 * 1024;

class TrustMigrationError extends Error {
  constructor(message, code = "MIGRATION_SCHEMA8_FAILED", details = {}) {
    super(message);
    this.name = "TrustMigrationError";
    this.code = code;
    this.status = 500;
    this.details = details;
  }
}

function readSchemaVersion(db) {
  try {
    return Number(db.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value || 0);
  } catch {
    return 0;
  }
}

function integrityCheck(db) {
  try {
    const details = db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]).join("; ");
    return { ok: details === "ok", details };
  } catch (error) {
    return { ok: false, details: error.message };
  }
}

async function ensureFreeSpace(databaseFile) {
  const stat = await fs.stat(databaseFile).catch((error) => error?.code === "ENOENT" ? { size: 0 } : Promise.reject(error));
  const required = Math.max(MIN_FREE_BYTES, Number(stat.size || 0) * 2 + 8 * 1024 * 1024);
  if (typeof fs.statfs !== "function") return { required, available: null };
  const disk = await fs.statfs(path.dirname(databaseFile));
  const available = Number(disk.bavail || disk.bfree || 0) * Number(disk.bsize || 0);
  if (Number.isFinite(available) && available < required) {
    throw new TrustMigrationError("Недостаточно свободного места для безопасной миграции Trust Core.", "MIGRATION_DISK_SPACE_LOW", { required, available });
  }
  return { required, available };
}

function createSchema8(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      credential_identity TEXT NOT NULL,
      signature_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS trust_devices_user_status ON trust_devices(user_id, status, created_at);

    CREATE TABLE IF NOT EXISTS trust_key_packages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      package_blob BLOB NOT NULL,
      payload_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('available','claimed','revoked','expired')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      claimed_at TEXT,
      claimed_by_group_id TEXT
    );
    CREATE INDEX IF NOT EXISTS trust_key_packages_available ON trust_key_packages(user_id, status, expires_at, created_at);

    CREATE TABLE IF NOT EXISTS trust_groups (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      protocol TEXT NOT NULL CHECK(protocol='MLS_1_0'),
      ciphersuite TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','archived')),
      epoch INTEGER NOT NULL DEFAULT 0,
      sequence INTEGER NOT NULL DEFAULT 0,
      created_by_device_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trust_group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','pending_add','pending_removal','removed')),
      joined_epoch INTEGER,
      removed_epoch INTEGER,
      joined_at TEXT,
      removed_at TEXT,
      PRIMARY KEY(group_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS trust_group_members_user ON trust_group_members(user_id, status, group_id);

    CREATE TABLE IF NOT EXISTS trust_welcomes (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      commit_id TEXT NOT NULL,
      welcome_blob BLOB NOT NULL,
      ratchet_tree_blob BLOB NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      UNIQUE(group_id, device_id, commit_id)
    );
    CREATE INDEX IF NOT EXISTS trust_welcomes_device ON trust_welcomes(device_id, claimed_at, created_at);

    CREATE TABLE IF NOT EXISTS trust_envelopes (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_device_id TEXT NOT NULL,
      envelope_type TEXT NOT NULL CHECK(envelope_type IN ('application','proposal','commit')),
      epoch INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      payload_blob BLOB NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, sequence),
      UNIQUE(sender_device_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS trust_envelopes_group_sequence ON trust_envelopes(group_id, sequence);

    CREATE TABLE IF NOT EXISTS trust_transparency_entries (
      log_index INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
}

function enforceSchemaVersion(store) {
  const now = new Date().toISOString();
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(String(TRUST_SCHEMA_VERSION));
  store.state.meta.schemaVersion = TRUST_SCHEMA_VERSION;
  store.db.prepare("INSERT INTO meta(key,value) VALUES('state_meta',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(store.state.meta));
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_8_verified_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(now);
}

async function applySchema8Migration({ store, databaseFile = store?.filePath, log = () => {} } = {}) {
  if (!store?.db || !databaseFile) throw new TrustMigrationError("SQLite store недоступен для migration schema 8.", "MIGRATION_STORE_UNAVAILABLE");
  await store.flush();
  const before = readSchemaVersion(store.db);
  if (before > TRUST_SCHEMA_VERSION) {
    throw new TrustMigrationError("Локальная база создана более новой версией Nexora.", "DATABASE_SCHEMA_NEWER", { current: before, supported: TRUST_SCHEMA_VERSION });
  }
  if (before < 7) {
    throw new TrustMigrationError("Trust Core требует предварительно применённую schema 7.", "MIGRATION_SCHEMA7_REQUIRED", { current: before });
  }
  const initialIntegrity = integrityCheck(store.db);
  if (!initialIntegrity.ok) throw new TrustMigrationError("SQLite база не прошла integrity_check до schema 8.", "DATABASE_CORRUPT", initialIntegrity);

  let backupPath = null;
  if (before < TRUST_SCHEMA_VERSION) {
    await ensureFreeSpace(databaseFile);
    store.db.exec("PRAGMA wal_checkpoint(FULL)");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = `${databaseFile}.pre-schema-8-${stamp}.bak`;
    await backup(store.db, backupPath);
    const checked = store.constructor?.checkDatabaseFile?.(backupPath);
    if (checked && !checked.ok) throw new TrustMigrationError("Резервная копия schema 7 повреждена.", "MIGRATION_BACKUP_FAILED", checked);
  }

  store.db.exec("BEGIN IMMEDIATE");
  try {
    createSchema8(store.db);
    enforceSchemaVersion(store);
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch (rollbackError) { log(`Schema 8 rollback failed: ${rollbackError.message}`, "error"); }
    throw new TrustMigrationError("Migration SQLite schema 7 → 8 не завершена.", error.code || "MIGRATION_SCHEMA8_FAILED", { backupPath, cause: error.message });
  }

  const finalIntegrity = integrityCheck(store.db);
  if (!finalIntegrity.ok) throw new TrustMigrationError("SQLite schema 8 не прошла integrity_check.", "MIGRATION_POSTCHECK_FAILED", { backupPath, ...finalIntegrity });
  log(`SQLite schema ${before} → ${TRUST_SCHEMA_VERSION}: PASS${backupPath ? `; backup ${backupPath}` : ""}`);
  return { from: before, to: TRUST_SCHEMA_VERSION, backupPath, integrity: finalIntegrity.details };
}

async function upgradeStoreToSchema8(store, options = {}) {
  const migration = await applySchema8Migration({ store, databaseFile: options.databaseFile || store.filePath, log: options.log });
  if (store.__nexoraSchema8Patched) return migration;

  const originalPersistState = store.persistState.bind(store);
  store.persistState = function persistStateSchema8(nextState) {
    const result = originalPersistState(nextState);
    enforceSchemaVersion(this);
    return result;
  };

  const originalStats = store.stats.bind(store);
  store.stats = function statsSchema8() {
    return { ...originalStats(), schemaVersion: TRUST_SCHEMA_VERSION };
  };

  if (typeof store.restore === "function") {
    const originalRestore = store.restore.bind(store);
    store.restore = async function restoreSchema8(...args) {
      const result = await originalRestore(...args);
      createSchema8(this.db);
      enforceSchemaVersion(this);
      return result;
    };
  }

  store.__nexoraSchema8Patched = true;
  return migration;
}

module.exports = {
  TRUST_SCHEMA_VERSION,
  TrustMigrationError,
  applySchema8Migration,
  createSchema8,
  integrityCheck,
  readSchemaVersion,
  upgradeStoreToSchema8,
};
