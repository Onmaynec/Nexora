"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { backup } = require("node:sqlite");

const MOBILE_CONTINUITY_SCHEMA_VERSION = 9;
const MIN_FREE_BYTES = 96 * 1024 * 1024;

class MobileContinuityMigrationError extends Error {
  constructor(message, code = "MIGRATION_SCHEMA9_FAILED", details = {}) {
    super(message);
    this.name = "MobileContinuityMigrationError";
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
    throw new MobileContinuityMigrationError("Недостаточно свободного места для безопасной миграции schema 9.", "MIGRATION_DISK_SPACE_LOW", { required, available });
  }
  return { required, available };
}

function createSchema9(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      installation_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('webpush','fcm','apns')),
      token_ciphertext TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      idempotency_key_hash TEXT NOT NULL,
      preview_policy TEXT NOT NULL DEFAULT 'generic' CHECK(preview_policy IN ('generic','sender','full')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT,
      last_error_code TEXT,
      UNIQUE(user_id, device_id, server_id, installation_id, provider)
    );
    CREATE INDEX IF NOT EXISTS mobile_push_user_device
      ON mobile_push_subscriptions(user_id, device_id, revoked_at, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_idempotency
      ON mobile_push_subscriptions(user_id, idempotency_key_hash);

    CREATE TABLE IF NOT EXISTS mobile_upload_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      claimed_mime TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('file','image','voice')),
      expected_size INTEGER NOT NULL CHECK(expected_size > 0),
      confirmed_offset INTEGER NOT NULL DEFAULT 0 CHECK(confirmed_offset >= 0),
      expected_sha256 TEXT,
      temp_name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('active','completed','cancelled','expired','failed')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      cancelled_at TEXT,
      message_id TEXT,
      error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS mobile_upload_owner_status
      ON mobile_upload_sessions(user_id, device_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS mobile_upload_expiry
      ON mobile_upload_sessions(status, expires_at);
  `);
}

function enforceSchemaVersion(store) {
  if (!store?.db) return;
  const now = new Date().toISOString();
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(String(MOBILE_CONTINUITY_SCHEMA_VERSION));
  store.state.meta.schemaVersion = MOBILE_CONTINUITY_SCHEMA_VERSION;
  store.db.prepare("INSERT INTO meta(key,value) VALUES('state_meta',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(store.state.meta));
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_9_verified_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(now);
}

async function applySchema9Migration({ store, databaseFile = store?.filePath, log = () => {} } = {}) {
  if (!store?.db || !databaseFile) throw new MobileContinuityMigrationError("SQLite store недоступен для миграции schema 9.", "MIGRATION_STORE_UNAVAILABLE");
  await store.flush();
  const before = readSchemaVersion(store.db);
  if (before > MOBILE_CONTINUITY_SCHEMA_VERSION) {
    throw new MobileContinuityMigrationError("Локальная база создана более новой версией Nexora.", "DATABASE_SCHEMA_NEWER", { current: before, supported: MOBILE_CONTINUITY_SCHEMA_VERSION });
  }
  if (before < 8) {
    throw new MobileContinuityMigrationError("Schema 9 требует завершённую миграцию schema 8.", "DATABASE_SCHEMA_PREREQUISITE", { current: before, required: 8 });
  }
  const sourceIntegrity = integrityCheck(store.db);
  if (!sourceIntegrity.ok) throw new MobileContinuityMigrationError("Исходная SQLite база не прошла integrity_check.", "DATABASE_CORRUPT", sourceIntegrity);

  let backupPath = null;
  if (before < MOBILE_CONTINUITY_SCHEMA_VERSION) {
    await ensureFreeSpace(databaseFile);
    store.db.exec("PRAGMA wal_checkpoint(FULL)");
    backupPath = `${databaseFile}.pre-schema-${MOBILE_CONTINUITY_SCHEMA_VERSION}-${timestampSlug()}.bak`;
    await backup(store.db, backupPath);
    const backupCheck = store.constructor?.checkDatabaseFile?.(backupPath);
    if (backupCheck && !backupCheck.ok) {
      throw new MobileContinuityMigrationError("Резервная копия schema 8 повреждена.", "MIGRATION_BACKUP_FAILED", { backupPath, ...backupCheck });
    }
  }

  store.db.exec("BEGIN IMMEDIATE");
  try {
    createSchema9(store.db);
    enforceSchemaVersion(store);
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch (rollbackError) { log(`Schema 9 rollback failed: ${rollbackError.message}`, "error"); }
    throw new MobileContinuityMigrationError("Миграция SQLite schema 8 → 9 не завершена.", error.code || "MIGRATION_SCHEMA9_FAILED", { backupPath, cause: error.message });
  }

  const targetIntegrity = integrityCheck(store.db);
  if (!targetIntegrity.ok) throw new MobileContinuityMigrationError("SQLite schema 9 не прошла integrity_check.", "MIGRATION_POSTCHECK_FAILED", { backupPath, ...targetIntegrity });
  log(`SQLite schema ${before} → ${MOBILE_CONTINUITY_SCHEMA_VERSION}: PASS${backupPath ? `; backup ${backupPath}` : ""}`);
  return { from: before, to: MOBILE_CONTINUITY_SCHEMA_VERSION, backupPath, integrity: targetIntegrity.details };
}

async function upgradeStoreToSchema9(store, options = {}) {
  const migration = await applySchema9Migration({ store, databaseFile: options.databaseFile || store.filePath, log: options.log });
  if (store.__nexoraSchema9Patched) return migration;

  const originalPersistState = store.persistState.bind(store);
  store.persistState = function persistStateSchema9(nextState) {
    const result = originalPersistState(nextState);
    enforceSchemaVersion(this);
    return result;
  };

  const originalStats = store.stats.bind(store);
  store.stats = function statsSchema9() {
    return { ...originalStats(), schemaVersion: MOBILE_CONTINUITY_SCHEMA_VERSION };
  };

  const originalReplaceDatabase = store.replaceDatabase?.bind(store);
  if (originalReplaceDatabase) {
    store.replaceDatabase = async function replaceDatabaseSchema9(sourcePath) {
      const result = await originalReplaceDatabase(sourcePath);
      await applySchema9Migration({ store: this, databaseFile: this.filePath, log: options.log });
      enforceSchemaVersion(this);
      return result;
    };
  }

  store.__nexoraSchema9Patched = true;
  enforceSchemaVersion(store);
  return migration;
}

module.exports = {
  MOBILE_CONTINUITY_SCHEMA_VERSION,
  MobileContinuityMigrationError,
  applySchema9Migration,
  createSchema9,
  integrityCheck,
  readSchemaVersion,
  upgradeStoreToSchema9,
};
