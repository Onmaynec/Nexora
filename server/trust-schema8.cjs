"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { backup } = require("node:sqlite");

const TRUST_SCHEMA_VERSION = 8;
const MIN_FREE_BYTES = 96 * 1024 * 1024;

class TrustMigrationError extends Error {
  constructor(message, code = "MIGRATION_SCHEMA8_FAILED", details = {}) {
    super(message);
    this.name = "TrustMigrationError";
    this.code = code;
    this.status = 500;
    this.details = details;
  }
}

function timestampSlug(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
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
  const directory = path.dirname(databaseFile);
  const stat = await fs.stat(databaseFile).catch((error) => error?.code === "ENOENT" ? { size: 0 } : Promise.reject(error));
  const required = Math.max(MIN_FREE_BYTES, Number(stat.size || 0) * 2 + 16 * 1024 * 1024);
  if (typeof fs.statfs !== "function") return { required, available: null };
  const disk = await fs.statfs(directory);
  const available = Number(disk.bavail || disk.bfree || 0) * Number(disk.bsize || 0);
  if (Number.isFinite(available) && available < required) {
    throw new TrustMigrationError("Недостаточно свободного места для безопасной миграции schema 8.", "MIGRATION_DISK_SPACE_LOW", { required, available });
  }
  return { required, available };
}

function createSchema8(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('register_device','verify_device','revoke_device')),
      target_device_id TEXT,
      nonce TEXT NOT NULL UNIQUE,
      context_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS trust_challenges_user_expiry
      ON trust_challenges(user_id, purpose, expires_at);

    CREATE TABLE IF NOT EXISTS trust_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      identity_key TEXT NOT NULL,
      signature_key TEXT NOT NULL,
      credential TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      trust_state TEXT NOT NULL CHECK(trust_state IN ('verified','unverified','blocked')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      verified_at TEXT,
      revoked_at TEXT,
      data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS trust_devices_user_fingerprint
      ON trust_devices(user_id, fingerprint);
    CREATE INDEX IF NOT EXISTS trust_devices_user_status
      ON trust_devices(user_id, status, trust_state, updated_at DESC);

    CREATE TABLE IF NOT EXISTS trust_device_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      verifier_device_id TEXT NOT NULL,
      target_device_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('verified','revoked')),
      proof_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trust_device_verifications_target
      ON trust_device_verifications(target_device_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS mls_key_packages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      ciphersuite INTEGER NOT NULL,
      package_hash TEXT NOT NULL UNIQUE,
      package_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      claimed_at TEXT,
      claimed_by_user_id TEXT,
      claimed_by_device_id TEXT
    );
    CREATE INDEX IF NOT EXISTS mls_key_packages_available
      ON mls_key_packages(user_id, device_id, claimed_at, expires_at, created_at);

    CREATE TABLE IF NOT EXISTS mls_groups (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      group_id TEXT NOT NULL UNIQUE,
      ciphersuite INTEGER NOT NULL,
      epoch INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('active','suspended','closed')),
      creator_device_id TEXT NOT NULL,
      public_state_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mls_groups_status ON mls_groups(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS mls_group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      leaf_index INTEGER,
      status TEXT NOT NULL CHECK(status IN ('active','removed')),
      joined_epoch INTEGER NOT NULL,
      removed_epoch INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(group_id, device_id)
    );
    CREATE INDEX IF NOT EXISTS mls_group_members_user
      ON mls_group_members(group_id, user_id, status);

    CREATE TABLE IF NOT EXISTS mls_welcome_queue (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      target_device_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      welcome_hash TEXT NOT NULL UNIQUE,
      welcome_data TEXT NOT NULL,
      ratchet_tree_data TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      claimed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS mls_welcome_queue_target
      ON mls_welcome_queue(target_device_id, claimed_at, expires_at, created_at);

    CREATE TABLE IF NOT EXISTS mls_commit_log (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      previous_epoch INTEGER NOT NULL,
      epoch INTEGER NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_device_id TEXT NOT NULL,
      commit_hash TEXT NOT NULL UNIQUE,
      commit_data TEXT NOT NULL,
      public_state_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(group_id, epoch)
    );
    CREATE INDEX IF NOT EXISTS mls_commit_log_group_epoch
      ON mls_commit_log(group_id, epoch DESC);

    CREATE TABLE IF NOT EXISTS mls_replay_cache (
      message_hash TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      sender_device_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mls_replay_cache_expiry ON mls_replay_cache(expires_at);

    CREATE TABLE IF NOT EXISTS trust_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      actor_device_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS trust_audit_user_created
      ON trust_audit(user_id, created_at DESC);
  `);
}

function enforceSchemaVersion(store) {
  if (!store?.db) return;
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
  if (!store?.db || !databaseFile) throw new TrustMigrationError("SQLite store недоступен для миграции schema 8.", "MIGRATION_STORE_UNAVAILABLE");
  await store.flush();
  const before = readSchemaVersion(store.db);
  if (before > TRUST_SCHEMA_VERSION) {
    throw new TrustMigrationError("Локальная база создана более новой версией Nexora.", "DATABASE_SCHEMA_NEWER", { current: before, supported: TRUST_SCHEMA_VERSION });
  }
  if (before < 7) {
    throw new TrustMigrationError("Schema 8 требует завершённую миграцию schema 7.", "DATABASE_SCHEMA_PREREQUISITE", { current: before, required: 7 });
  }
  const integrity = integrityCheck(store.db);
  if (!integrity.ok) throw new TrustMigrationError("Исходная SQLite база не прошла integrity_check.", "DATABASE_CORRUPT", integrity);

  let backupPath = null;
  if (before < TRUST_SCHEMA_VERSION) {
    await ensureFreeSpace(databaseFile);
    store.db.exec("PRAGMA wal_checkpoint(FULL)");
    backupPath = `${databaseFile}.pre-schema-${TRUST_SCHEMA_VERSION}-${timestampSlug()}.bak`;
    await backup(store.db, backupPath);
    const backupCheck = store.constructor?.checkDatabaseFile?.(backupPath);
    if (backupCheck && !backupCheck.ok) {
      throw new TrustMigrationError("Резервная копия schema 7 повреждена.", "MIGRATION_BACKUP_FAILED", { backupPath, ...backupCheck });
    }
  }

  store.db.exec("BEGIN IMMEDIATE");
  try {
    createSchema8(store.db);
    enforceSchemaVersion(store);
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch (rollbackError) { log(`Schema 8 rollback failed: ${rollbackError.message}`, "error"); }
    throw new TrustMigrationError("Миграция SQLite schema 7 → 8 не завершена.", error.code || "MIGRATION_SCHEMA8_FAILED", { backupPath, cause: error.message });
  }

  const after = integrityCheck(store.db);
  if (!after.ok) throw new TrustMigrationError("SQLite schema 8 не прошла integrity_check.", "MIGRATION_POSTCHECK_FAILED", { backupPath, ...after });
  log(`SQLite schema ${before} → ${TRUST_SCHEMA_VERSION}: PASS${backupPath ? `; backup ${backupPath}` : ""}`);
  return { from: before, to: TRUST_SCHEMA_VERSION, backupPath, integrity: after.details };
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

  const originalReplaceDatabase = store.replaceDatabase?.bind(store);
  if (originalReplaceDatabase) {
    store.replaceDatabase = async function replaceDatabaseSchema8(sourcePath) {
      const result = await originalReplaceDatabase(sourcePath);
      await applySchema8Migration({ store: this, databaseFile: this.filePath, log: options.log });
      enforceSchemaVersion(this);
      return result;
    };
  }

  store.__nexoraSchema8Patched = true;
  enforceSchemaVersion(store);
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
