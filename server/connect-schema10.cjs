"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { backup } = require("node:sqlite");

const CONNECT_SCHEMA_VERSION = 10;
const MIN_FREE_BYTES = 96 * 1024 * 1024;

class ConnectMigrationError extends Error {
  constructor(message, code = "MIGRATION_SCHEMA10_FAILED", details = {}) {
    super(message);
    this.name = "ConnectMigrationError";
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
    throw new ConnectMigrationError("Недостаточно свободного места для безопасной миграции schema 10.", "MIGRATION_DISK_SPACE_LOW", { required, available });
  }
  return { required, available };
}

function createSchema10(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connect_privacy (
      user_id TEXT PRIMARY KEY,
      presence_visibility TEXT NOT NULL DEFAULT 'everyone'
        CHECK(presence_visibility IN ('everyone','contacts','shared_rooms','nobody')),
      last_seen_visibility TEXT NOT NULL DEFAULT 'approximate'
        CHECK(last_seen_visibility IN ('exact','approximate','hidden')),
      read_receipts_visibility TEXT NOT NULL DEFAULT 'contacts'
        CHECK(read_receipts_visibility IN ('everyone','contacts','shared_rooms','nobody')),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connect_call_history (
      id TEXT PRIMARY KEY,
      caller_id TEXT NOT NULL,
      callee_id TEXT NOT NULL,
      state TEXT NOT NULL
        CHECK(state IN ('ended','declined','missed','failed')),
      outcome TEXT NOT NULL
        CHECK(outcome IN ('completed','declined','missed','failed','blocked','revoked','unavailable')),
      started_at TEXT NOT NULL,
      answered_at TEXT,
      ended_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK(duration_seconds >= 0),
      ended_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS connect_call_history_caller
      ON connect_call_history(caller_id, ended_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS connect_call_history_callee
      ON connect_call_history(callee_id, ended_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS connect_idempotency (
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY(user_id, scope, key_hash)
    );
    CREATE INDEX IF NOT EXISTS connect_idempotency_expiry
      ON connect_idempotency(expires_at);

    CREATE TABLE IF NOT EXISTS connect_audit (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      object_id TEXT,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS connect_audit_actor_created
      ON connect_audit(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS connect_audit_target_created
      ON connect_audit(target_user_id, created_at DESC);
  `);
}

function enforceSchemaVersion(store) {
  if (!store?.db) return;
  const now = new Date().toISOString();
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(String(CONNECT_SCHEMA_VERSION));
  store.state.meta.schemaVersion = CONNECT_SCHEMA_VERSION;
  store.db.prepare("INSERT INTO meta(key,value) VALUES('state_meta',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(store.state.meta));
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_10_verified_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(now);
}

async function applySchema10Migration({ store, databaseFile = store?.filePath, log = () => {} } = {}) {
  if (!store?.db || !databaseFile) throw new ConnectMigrationError("SQLite store недоступен для миграции schema 10.", "MIGRATION_STORE_UNAVAILABLE");
  await store.flush();
  const before = readSchemaVersion(store.db);
  if (before > CONNECT_SCHEMA_VERSION) {
    throw new ConnectMigrationError("Локальная база создана более новой версией Nexora.", "DATABASE_SCHEMA_NEWER", { current: before, supported: CONNECT_SCHEMA_VERSION });
  }
  if (before < 9) {
    throw new ConnectMigrationError("Schema 10 требует завершённую миграцию schema 9.", "DATABASE_SCHEMA_PREREQUISITE", { current: before, required: 9 });
  }
  const sourceIntegrity = integrityCheck(store.db);
  if (!sourceIntegrity.ok) throw new ConnectMigrationError("Исходная SQLite база не прошла integrity_check.", "DATABASE_CORRUPT", sourceIntegrity);

  let backupPath = null;
  if (before < CONNECT_SCHEMA_VERSION) {
    await ensureFreeSpace(databaseFile);
    store.db.exec("PRAGMA wal_checkpoint(FULL)");
    backupPath = `${databaseFile}.pre-schema-${CONNECT_SCHEMA_VERSION}-${timestampSlug()}.bak`;
    await backup(store.db, backupPath);
    const backupCheck = store.constructor?.checkDatabaseFile?.(backupPath);
    if (backupCheck && !backupCheck.ok) {
      throw new ConnectMigrationError("Резервная копия schema 9 повреждена.", "MIGRATION_BACKUP_FAILED", { backupPath, ...backupCheck });
    }
  }

  store.db.exec("BEGIN IMMEDIATE");
  try {
    createSchema10(store.db);
    enforceSchemaVersion(store);
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch (rollbackError) { log(`Schema 10 rollback failed: ${rollbackError.message}`, "error"); }
    throw new ConnectMigrationError("Миграция SQLite schema 9 → 10 не завершена.", error.code || "MIGRATION_SCHEMA10_FAILED", { backupPath, cause: error.message });
  }

  const targetIntegrity = integrityCheck(store.db);
  if (!targetIntegrity.ok) throw new ConnectMigrationError("SQLite schema 10 не прошла integrity_check.", "MIGRATION_POSTCHECK_FAILED", { backupPath, ...targetIntegrity });
  log(`SQLite schema ${before} → ${CONNECT_SCHEMA_VERSION}: PASS${backupPath ? `; backup ${backupPath}` : ""}`);
  return { from: before, to: CONNECT_SCHEMA_VERSION, backupPath, integrity: targetIntegrity.details };
}

async function upgradeStoreToSchema10(store, options = {}) {
  const migration = await applySchema10Migration({ store, databaseFile: options.databaseFile || store.filePath, log: options.log });
  if (store.__nexoraSchema10Patched) return migration;

  const originalPersistState = store.persistState.bind(store);
  store.persistState = function persistStateSchema10(nextState) {
    const result = originalPersistState(nextState);
    enforceSchemaVersion(this);
    return result;
  };

  const originalStats = store.stats.bind(store);
  store.stats = function statsSchema10() {
    return { ...originalStats(), schemaVersion: CONNECT_SCHEMA_VERSION };
  };

  const originalReplaceDatabase = store.replaceDatabase?.bind(store);
  if (originalReplaceDatabase) {
    store.replaceDatabase = async function replaceDatabaseSchema10(sourcePath) {
      const result = await originalReplaceDatabase(sourcePath);
      await applySchema10Migration({ store: this, databaseFile: this.filePath, log: options.log });
      enforceSchemaVersion(this);
      return result;
    };
  }

  store.__nexoraSchema10Patched = true;
  enforceSchemaVersion(store);
  return migration;
}

module.exports = {
  CONNECT_SCHEMA_VERSION,
  ConnectMigrationError,
  applySchema10Migration,
  createSchema10,
  integrityCheck,
  readSchemaVersion,
  upgradeStoreToSchema10,
};
