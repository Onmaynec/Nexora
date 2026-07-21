"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { backup } = require("node:sqlite");

const PULSE_SCHEMA_VERSION = 7;
const MIN_FREE_BYTES = 64 * 1024 * 1024;

class PulseMigrationError extends Error {
  constructor(message, code = "MIGRATION_SCHEMA7_FAILED", details = {}) {
    super(message);
    this.name = "PulseMigrationError";
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
    const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
    return Number(row?.value || 0);
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
  const required = Math.max(MIN_FREE_BYTES, Number(stat.size || 0) * 2 + 8 * 1024 * 1024);
  if (typeof fs.statfs !== "function") return { required, available: null };
  const disk = await fs.statfs(directory);
  const available = Number(disk.bavail || disk.bfree || 0) * Number(disk.bsize || 0);
  if (Number.isFinite(available) && available < required) {
    throw new PulseMigrationError("Недостаточно свободного места для безопасной миграции schema 7.", "MIGRATION_DISK_SPACE_LOW", { required, available });
  }
  return { required, available };
}

function createSchema7(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_account_links (
      id TEXT PRIMARY KEY,
      local_user_id TEXT NOT NULL UNIQUE,
      cloud_account_id TEXT NOT NULL,
      link_status TEXT NOT NULL CHECK(link_status IN ('pending','linked','unlinked','revoked')),
      linked_at TEXT,
      unlinked_at TEXT,
      last_verified_at TEXT,
      cloud_subject_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cloud_account_links_status ON cloud_account_links(link_status, updated_at);

    CREATE TABLE IF NOT EXISTS pulse_link_sessions (
      id TEXT PRIMARY KEY,
      local_user_id TEXT NOT NULL,
      nonce TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending','consumed','expired','cancelled')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS pulse_link_sessions_user_status ON pulse_link_sessions(local_user_id, status, expires_at);

    CREATE TABLE IF NOT EXISTS pulse_sync_state (
      local_user_id TEXT PRIMARY KEY,
      cursor TEXT,
      last_success_at TEXT,
      last_attempt_at TEXT,
      last_error_code TEXT,
      overview_json TEXT,
      overview_hash TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pulse_event_inbox (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('received','processing','processed','failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      payload_hash TEXT NOT NULL,
      last_error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS pulse_event_inbox_status ON pulse_event_inbox(status, received_at);

    CREATE TABLE IF NOT EXISTS pulse_event_outbox (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      local_user_id TEXT,
      room_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS pulse_event_outbox_pending ON pulse_event_outbox(delivered_at, created_at);

    CREATE TABLE IF NOT EXISTS billing_entitlement_cache (
      id TEXT PRIMARY KEY,
      jti TEXT NOT NULL UNIQUE,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('user','room','server')),
      scope_id TEXT NOT NULL,
      product_code TEXT NOT NULL,
      status TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      not_before TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      key_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      signature TEXT,
      revoked_at TEXT,
      sync_cursor TEXT
    );
    CREATE INDEX IF NOT EXISTS billing_entitlement_cache_scope ON billing_entitlement_cache(scope_type, scope_id, product_code, status, expires_at);

    CREATE TABLE IF NOT EXISTS billing_key_registry (
      key_id TEXT PRIMARY KEY,
      algorithm TEXT NOT NULL CHECK(algorithm='Ed25519'),
      public_key_pem TEXT NOT NULL,
      public_key_hash TEXT NOT NULL,
      trusted_at TEXT NOT NULL,
      not_before TEXT,
      expires_at TEXT,
      revoked_at TEXT,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_checkout_cache (
      checkout_id TEXT PRIMARY KEY,
      local_user_id TEXT NOT NULL,
      order_id TEXT,
      product_code TEXT NOT NULL,
      status TEXT NOT NULL,
      url TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      request_id TEXT
    );
    CREATE INDEX IF NOT EXISTS billing_checkout_cache_user ON billing_checkout_cache(local_user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS billing_transaction_cache (
      transaction_id TEXT PRIMARY KEY,
      local_user_id TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      amount INTEGER,
      currency TEXT NOT NULL DEFAULT 'IMPULSE',
      status TEXT NOT NULL,
      balance_before INTEGER,
      balance_after INTEGER,
      reference_id TEXT,
      receipt_id TEXT,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      request_id TEXT
    );
    CREATE INDEX IF NOT EXISTS billing_transaction_cache_user_created ON billing_transaction_cache(local_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS room_product_state (
      room_id TEXT NOT NULL,
      product_code TEXT NOT NULL,
      entitlement_jti TEXT,
      status TEXT NOT NULL,
      activated_at TEXT,
      expires_at TEXT,
      settings_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(room_id, product_code)
    );
  `);
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function migrateLegacyState(db, state, now) {
  const insertLink = db.prepare(`
    INSERT INTO cloud_account_links(
      id, local_user_id, cloud_account_id, link_status, linked_at, unlinked_at,
      last_verified_at, cloud_subject_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_user_id) DO UPDATE SET
      cloud_account_id=excluded.cloud_account_id,
      link_status=excluded.link_status,
      linked_at=COALESCE(cloud_account_links.linked_at, excluded.linked_at),
      unlinked_at=excluded.unlinked_at,
      last_verified_at=excluded.last_verified_at,
      updated_at=excluded.updated_at
  `);
  for (const link of state.billingLinks || []) {
    if (!link?.userId || !link?.cloudAccountId) continue;
    const linkedAt = link.linkedAt || link.createdAt || link.syncedAt || now;
    const status = ["linked", "unlinked", "revoked"].includes(link.status) ? link.status : "linked";
    insertLink.run(
      String(link.id || crypto.randomUUID()),
      String(link.userId),
      String(link.cloudAccountId),
      status,
      linkedAt,
      status === "linked" ? null : (link.unlinkedAt || now),
      link.syncedAt || linkedAt,
      link.cloudSubjectHash || null,
      link.createdAt || linkedAt,
      now,
    );
  }

  const insertEntitlement = db.prepare(`
    INSERT INTO billing_entitlement_cache(
      id, jti, scope_type, scope_id, product_code, status, issued_at, not_before,
      expires_at, verified_at, key_id, payload_hash, payload_json, signature, revoked_at, sync_cursor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(jti) DO UPDATE SET
      status=excluded.status,
      expires_at=excluded.expires_at,
      verified_at=excluded.verified_at,
      revoked_at=excluded.revoked_at,
      sync_cursor=excluded.sync_cursor
  `);
  for (const entitlement of state.billingEntitlements || []) {
    if (!entitlement?.scopeId || !entitlement?.productCode) continue;
    const payload = {
      jti: entitlement.jti || entitlement.id,
      serverId: entitlement.serverId || state.meta?.serverId || null,
      roomId: entitlement.scopeType === "room" ? entitlement.scopeId : null,
      productCode: entitlement.productCode,
      status: entitlement.status || "active",
      issuedAt: entitlement.issuedAt || entitlement.startsAt || entitlement.syncedAt || now,
      notBefore: entitlement.notBefore || entitlement.startsAt || entitlement.syncedAt || now,
      expiresAt: entitlement.expiresAt || new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString(),
      keyId: entitlement.signatureKeyId || "legacy-sandbox",
      source: entitlement.source || "legacy",
    };
    const payloadJson = JSON.stringify(payload);
    insertEntitlement.run(
      String(entitlement.id || crypto.randomUUID()),
      String(payload.jti || crypto.randomUUID()),
      entitlement.scopeType === "room" ? "room" : "user",
      String(entitlement.scopeId),
      String(entitlement.productCode),
      String(entitlement.status || "active"),
      payload.issuedAt,
      payload.notBefore,
      payload.expiresAt,
      entitlement.syncedAt || now,
      String(payload.keyId),
      hashText(payloadJson),
      payloadJson,
      entitlement.signature || null,
      entitlement.revokedAt || null,
      entitlement.syncCursor || null,
    );
  }

  const insertTransaction = db.prepare(`
    INSERT OR IGNORE INTO billing_transaction_cache(
      transaction_id, local_user_id, operation_type, amount, currency, status,
      balance_before, balance_after, reference_id, receipt_id, created_at, payload_json, request_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of state.pulseLedger || []) {
    if (!item?.id || !item?.userId) continue;
    insertTransaction.run(
      String(item.id), String(item.userId), String(item.type || item.operationType || "legacy"),
      Number.isFinite(Number(item.amount)) ? Math.trunc(Number(item.amount)) : null,
      String(item.currency || "IMPULSE"), String(item.status || "completed"),
      Number.isFinite(Number(item.balanceBefore)) ? Math.trunc(Number(item.balanceBefore)) : null,
      Number.isFinite(Number(item.balanceAfter)) ? Math.trunc(Number(item.balanceAfter)) : null,
      item.referenceId || null, item.receiptId || null, item.createdAt || now, JSON.stringify(item), item.requestId || null,
    );
  }

  const upsertRoomProduct = db.prepare(`
    INSERT INTO room_product_state(room_id, product_code, entitlement_jti, status, activated_at, expires_at, settings_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '{}', ?)
    ON CONFLICT(room_id, product_code) DO UPDATE SET
      entitlement_jti=excluded.entitlement_jti,
      status=excluded.status,
      activated_at=excluded.activated_at,
      expires_at=excluded.expires_at,
      updated_at=excluded.updated_at
  `);
  for (const entitlement of state.billingEntitlements || []) {
    if (entitlement?.scopeType !== "room" || !entitlement.scopeId || !entitlement.productCode) continue;
    upsertRoomProduct.run(
      String(entitlement.scopeId), String(entitlement.productCode), String(entitlement.jti || entitlement.id || ""),
      String(entitlement.status || "active"), entitlement.startsAt || entitlement.issuedAt || now,
      entitlement.expiresAt || null, now,
    );
  }
}

function enforceSchemaVersion(store) {
  if (!store?.db) return;
  const now = new Date().toISOString();
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(String(PULSE_SCHEMA_VERSION));
  store.state.meta.schemaVersion = PULSE_SCHEMA_VERSION;
  store.db.prepare("INSERT INTO meta(key,value) VALUES('state_meta',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(store.state.meta));
  store.db.prepare("INSERT INTO meta(key,value) VALUES('schema_7_verified_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(now);
}

async function applySchema7Migration({ store, databaseFile = store?.filePath, log = () => {} } = {}) {
  if (!store?.db || !databaseFile) throw new PulseMigrationError("SQLite store недоступен для миграции schema 7.", "MIGRATION_STORE_UNAVAILABLE");
  await store.flush();
  const before = readSchemaVersion(store.db);
  if (before > PULSE_SCHEMA_VERSION) {
    throw new PulseMigrationError("Локальная база создана более новой версией Nexora.", "DATABASE_SCHEMA_NEWER", { current: before, supported: PULSE_SCHEMA_VERSION });
  }
  const integrity = integrityCheck(store.db);
  if (!integrity.ok) throw new PulseMigrationError("Исходная SQLite база не прошла integrity_check.", "DATABASE_CORRUPT", integrity);

  let backupPath = null;
  if (before < PULSE_SCHEMA_VERSION) {
    await ensureFreeSpace(databaseFile);
    store.db.exec("PRAGMA wal_checkpoint(FULL)");
    backupPath = `${databaseFile}.pre-schema-${PULSE_SCHEMA_VERSION}-${timestampSlug()}.bak`;
    await backup(store.db, backupPath);
    const backupCheck = store.constructor?.checkDatabaseFile?.(backupPath);
    if (backupCheck && !backupCheck.ok) throw new PulseMigrationError("Резервная копия schema 6 повреждена.", "MIGRATION_BACKUP_FAILED", backupCheck);
  }

  const now = new Date().toISOString();
  store.db.exec("BEGIN IMMEDIATE");
  try {
    createSchema7(store.db);
    migrateLegacyState(store.db, store.read(), now);
    enforceSchemaVersion(store);
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch (rollbackError) { log(`Schema 7 rollback failed: ${rollbackError.message}`, "error"); }
    throw new PulseMigrationError("Миграция SQLite schema 6 → 7 не завершена.", error.code || "MIGRATION_SCHEMA7_FAILED", { backupPath, cause: error.message });
  }

  const after = integrityCheck(store.db);
  if (!after.ok) throw new PulseMigrationError("SQLite schema 7 не прошла integrity_check.", "MIGRATION_POSTCHECK_FAILED", { backupPath, ...after });
  log(`SQLite schema ${before || "legacy"} → ${PULSE_SCHEMA_VERSION}: PASS${backupPath ? `; backup ${backupPath}` : ""}`);
  return { from: before, to: PULSE_SCHEMA_VERSION, backupPath, integrity: after.details };
}

async function upgradeStoreToSchema7(store, options = {}) {
  const migration = await applySchema7Migration({ store, databaseFile: options.databaseFile || store.filePath, log: options.log });
  if (store.__nexoraSchema7Patched) return migration;

  const originalPersistState = store.persistState.bind(store);
  store.persistState = function persistStateSchema7(nextState) {
    const result = originalPersistState(nextState);
    enforceSchemaVersion(this);
    return result;
  };

  const originalStats = store.stats.bind(store);
  store.stats = function statsSchema7() {
    return { ...originalStats(), schemaVersion: PULSE_SCHEMA_VERSION };
  };

  const originalReplaceDatabase = store.replaceDatabase?.bind(store);
  if (originalReplaceDatabase) {
    store.replaceDatabase = async function replaceDatabaseSchema7(sourcePath) {
      const result = await originalReplaceDatabase(sourcePath);
      await applySchema7Migration({ store: this, databaseFile: this.filePath, log: options.log });
      enforceSchemaVersion(this);
      return result;
    };
  }

  store.__nexoraSchema7Patched = true;
  enforceSchemaVersion(store);
  return migration;
}

module.exports = {
  PULSE_SCHEMA_VERSION,
  PulseMigrationError,
  applySchema7Migration,
  createSchema7,
  integrityCheck,
  readSchemaVersion,
  upgradeStoreToSchema7,
};
