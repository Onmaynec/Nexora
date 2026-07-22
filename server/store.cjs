"use strict";

const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { DatabaseSync, backup } = require("node:sqlite");

const SCHEMA_VERSION = 6;
const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const V3_COLLECTIONS = Object.freeze([
  "events",
  "scheduledMessages",
  "drafts",
  "messageEdits",
  "polls",
  "pollVotes",
  "roomInvites",
  "roomReports",
  "moderationAppeals",
  "customRoles",
  "roomCategories",
  "botAccounts",
  "apiTokens",
  "webhooks",
  "integrationAudit",
  "paymentEvents",
  "pulseLedger",
]);

function initialState() {
  return {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      serverId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      migratedFromJsonAt: null,
      lastEventSequence: 0,
    },
    settings: {
      storageQuotaBytes: DEFAULT_STORAGE_QUOTA_BYTES,
      fileRetentionDays: 0,
      automaticBackupHours: 24,
      automaticBackupKeep: 7,
      passwordMinLength: 10,
      passwordRequireUpper: true,
      passwordRequireLower: true,
      passwordRequireNumber: true,
      passwordRequireSymbol: false,
      loginMaxAttempts: 5,
      loginLockMinutes: 15,
      pulseEnabled: false,
      pulseCloudUrl: "",
      emergencyReadOnly: false,
      registrationPolicy: "open",
      updateChannel: "stable",
    },
    users: [],
    sessions: [],
    blocks: [],
    contactRequests: [],
    contacts: [],
    rooms: [],
    roomMembers: [],
    roomBans: [],
    roomJoinRequests: [],
    roomAuditLog: [],
    conversations: [],
    messages: [],
    reactions: [],
    reads: [],
    files: [],
    conversationSettings: [],
    voiceListens: [],
    messageBookmarks: [],
    notificationEvents: [],
    uploadSessions: [],
    billingLinks: [],
    billingEntitlements: [],
    pulseGoals: [],
    pulseContributions: [],
    loginAttempts: [],
    rateLimits: [],
    ...Object.fromEntries(V3_COLLECTIONS.map((collection) => [collection, []])),
  };
}

function normalizeState(value) {
  const defaults = initialState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const normalized = {
    ...defaults,
    ...value,
    meta: { ...defaults.meta, ...(value.meta ?? {}) },
    settings: { ...defaults.settings, ...(value.settings ?? {}) },
  };
  for (const key of Object.keys(defaults)) {
    if (Array.isArray(defaults[key]) && !Array.isArray(normalized[key])) normalized[key] = [];
  }
  normalized.meta.schemaVersion = SCHEMA_VERSION;
  normalized.settings.storageQuotaBytes = Math.max(
    256 * 1024 * 1024,
    Number(normalized.settings.storageQuotaBytes) || DEFAULT_STORAGE_QUOTA_BYTES,
  );
  normalized.settings.fileRetentionDays = Math.max(0, Number(normalized.settings.fileRetentionDays) || 0);
  normalized.settings.passwordMinLength = Math.max(8, Math.min(64, Number(normalized.settings.passwordMinLength) || 10));
  normalized.settings.loginMaxAttempts = Math.max(3, Math.min(20, Number(normalized.settings.loginMaxAttempts) || 5));
  normalized.settings.loginLockMinutes = Math.max(1, Math.min(24 * 60, Number(normalized.settings.loginLockMinutes) || 15));
  if (!normalized.meta.serverId) normalized.meta.serverId = crypto.randomUUID();
  normalized.users = normalized.users.map((user) => ({
    mustChangePassword: false,
    bio: "",
    profileColor: "violet",
    avatarFrame: "none",
    plusBadgeVisible: true,
    notificationMode: "all",
    quietHoursStart: "",
    quietHoursEnd: "",
    locale: "ru",
    totpEnabled: false,
    totpSecret: null,
    recoveryCodeHashes: [],
    ...user,
  }));
  normalized.sessions = normalized.sessions.map((session) => ({
    ...session,
    csrfToken: session.csrfToken || crypto.randomBytes(24).toString("base64url"),
  }));
  normalized.rooms = normalized.rooms.map((room) => ({
    readOnly: false,
    slowModeSeconds: 0,
    allowFiles: true,
    allowVoice: true,
    joinPolicy: room.privacy === "private" ? "invite" : "open",
    inviteExpiresAt: null,
    inviteMaxUses: 0,
    inviteUseCount: 0,
    description: "",
    rules: "",
    categoryId: null,
    announcementOnly: false,
    preapproveMessages: false,
    allowImages: true,
    ...room,
  }));
  normalized.roomMembers = normalized.roomMembers.map((member) => ({
    customRoleIds: [],
    restrictedUntil: null,
    ...member,
  }));
  normalized.roomBans = normalized.roomBans.map((ban) => ({ expiresAt: null, ...ban }));
  normalized.conversationSettings = normalized.conversationSettings.map((setting) => ({
    muted: false,
    pinned: false,
    archived: false,
    folder: "all",
    background: "default",
    compact: false,
    notificationMode: "all",
    ...setting,
  }));
  normalized.meta.lastEventSequence = Math.max(
    Number(normalized.meta.lastEventSequence) || 0,
    ...normalized.events.map((event) => Number(event.sequence) || 0),
  );
  return normalized;
}

function json(value) {
  return JSON.stringify(value);
}

function parsed(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function timestampSlug(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
}

class SqliteStore extends EventEmitter {
  constructor(filePath, options = {}) {
    super();
    this.filePath = filePath;
    this.legacyJsonPath = options.legacyJsonPath ?? path.join(path.dirname(filePath), "nexora.json");
    this.state = initialState();
    this.queue = Promise.resolve();
    this.db = null;
  }

  open() {
    this.db = new DatabaseSync(this.filePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA wal_autocheckpoint = 250");
    this.createSchema();
  }

  async backupBeforeMigration() {
    let source = null;
    try {
      const file = await fs.stat(this.filePath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
      if (!file?.size) return null;
      source = new DatabaseSync(this.filePath);
      let row = null;
      try { row = source.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(); } catch { row = null; }
      const current = Number(row?.value || 0);
      if (current >= SCHEMA_VERSION) return null;
      const destination = `${this.filePath}.pre-schema-${SCHEMA_VERSION}-${timestampSlug()}.bak`;
      await backup(source, destination);
      this.emit("log", { level: "info", message: `Создана резервная копия перед миграцией schema ${current || "legacy"} → ${SCHEMA_VERSION}: ${destination}` });
      return destination;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw Object.assign(new Error(`Не удалось создать резервную копию перед миграцией: ${error.message}`), { code: "MIGRATION_BACKUP_FAILED" });
    } finally {
      source?.close();
    }
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        blocker_id TEXT NOT NULL,
        blocked_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contact_requests (
        id TEXT PRIMARY KEY,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        user_a_id TEXT NOT NULL,
        user_b_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        owner_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS room_bans (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS room_bans_room_user ON room_bans(room_id, user_id);
      CREATE TABLE IF NOT EXISTS room_join_requests (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS room_join_requests_room_status ON room_join_requests(room_id, status);
      CREATE TABLE IF NOT EXISTS room_audit_log (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS room_audit_room_created ON room_audit_log(room_id, created_at);
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        room_id TEXT,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        client_id TEXT,
        type TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client
        ON messages(sender_id, client_id) WHERE client_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS messages_conversation_created
        ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS messages_text_search
        ON messages(text COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS reactions (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reads (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_read_at TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (conversation_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        uploader_id TEXT NOT NULL,
        stored_name TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS files_conversation_created
        ON files(conversation_id, created_at);
      CREATE TABLE IF NOT EXISTS conversation_settings (
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        muted INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        PRIMARY KEY (user_id, conversation_id)
      );
      CREATE TABLE IF NOT EXISTS voice_listens (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        listened_at TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS message_bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS message_bookmarks_user_message
        ON message_bookmarks(user_id, message_id);
      CREATE TABLE IF NOT EXISTS notification_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notification_events_user_created
        ON notification_events(user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS upload_sessions_expiry
        ON upload_sessions(status, expires_at);
      CREATE TABLE IF NOT EXISTS billing_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cloud_account_id TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS billing_links_user_account
        ON billing_links(user_id, cloud_account_id);
      CREATE TABLE IF NOT EXISTS billing_entitlements (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        product_code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS billing_entitlements_scope
        ON billing_entitlements(scope_type, scope_id, expires_at);
      CREATE TABLE IF NOT EXISTS pulse_goals (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pulse_goals_room_status
        ON pulse_goals(room_id, status, created_at DESC);
      CREATE TABLE IF NOT EXISTS pulse_contributions (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pulse_contributions_goal
        ON pulse_contributions(goal_id);
      CREATE TABLE IF NOT EXISTS login_attempts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        ip TEXT NOT NULL,
        success INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS login_attempts_identity_created ON login_attempts(username, ip, created_at);
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        window_started_at TEXT NOT NULL,
        hits INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS v3_entities (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        scope_id TEXT,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS v3_entities_scope_created
        ON v3_entities(collection, scope_id, created_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        message_id UNINDEXED,
        conversation_id UNINDEXED,
        text,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(message_id, conversation_id, text)
        VALUES (new.id, new.conversation_id, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE OF text, conversation_id ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
        INSERT INTO messages_fts(message_id, conversation_id, text)
        VALUES (new.id, new.conversation_id, new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE message_id = old.id;
      END;
    `);
    this.db.exec(`
      INSERT INTO messages_fts(message_id, conversation_id, text)
      SELECT messages.id, messages.conversation_id, messages.text
      FROM messages
      WHERE NOT EXISTS (
        SELECT 1 FROM messages_fts WHERE messages_fts.message_id = messages.id
      );
    `);
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await this.backupBeforeMigration();
    this.open();
    const check = this.integrityCheck();
    if (!check.ok) {
      const corruptPath = `${this.filePath}.corrupt-${timestampSlug()}`;
      this.db.close();
      this.db = null;
      await fs.copyFile(this.filePath, corruptPath).catch(() => {});
      throw Object.assign(new Error(`SQLite integrity_check: ${check.details}`), { code: "DATABASE_CORRUPT", corruptPath });
    }

    if (this.isEmpty()) await this.migrateLegacyJson();
    this.state = this.loadState();
    await this.cleanup();
    return this;
  }

  isEmpty() {
    return Number(this.db.prepare("SELECT COUNT(*) AS count FROM users").get().count) === 0
      && Number(this.db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count) === 0;
  }

  async migrateLegacyJson() {
    let source;
    try {
      source = normalizeState(JSON.parse(await fs.readFile(this.legacyJsonPath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") {
        const broken = `${this.legacyJsonPath}.broken-${timestampSlug()}`;
        await fs.copyFile(this.legacyJsonPath, broken).catch(() => {});
        this.emit("log", { level: "warn", message: `Повреждённый nexora.json сохранён: ${broken}` });
      }
      source = initialState();
    }

    if (source.users.length || source.rooms.length || source.messages.length || source.files.length) {
      source.meta.migratedFromJsonAt = new Date().toISOString();
      this.persistState(source);
      const migratedPath = `${this.legacyJsonPath}.migrated-${timestampSlug()}.bak`;
      await fs.rename(this.legacyJsonPath, migratedPath).catch(() => {});
      this.emit("log", { level: "info", message: `nexora.json автоматически перенесён в SQLite; исходная копия: ${migratedPath}` });
    } else {
      this.persistState(source);
    }
  }

  loadRows(table) {
    return this.db.prepare(`SELECT data FROM ${table}`).all().map((row) => parsed(row.data)).filter(Boolean);
  }

  loadState() {
    const meta = parsed(this.db.prepare("SELECT value FROM meta WHERE key = 'state_meta'").get()?.value, {});
    const settings = parsed(this.db.prepare("SELECT value FROM meta WHERE key = 'settings'").get()?.value, {});
    const v3 = Object.fromEntries(V3_COLLECTIONS.map((collection) => [
      collection,
      this.db.prepare("SELECT data FROM v3_entities WHERE collection = ? ORDER BY created_at, id").all(collection).map((row) => parsed(row.data)).filter(Boolean),
    ]));
    return normalizeState({
      meta,
      settings,
      users: this.loadRows("users"),
      sessions: this.loadRows("sessions"),
      blocks: this.loadRows("blocks"),
      contactRequests: this.loadRows("contact_requests"),
      contacts: this.loadRows("contacts"),
      rooms: this.loadRows("rooms"),
      roomMembers: this.loadRows("room_members"),
      roomBans: this.loadRows("room_bans"),
      roomJoinRequests: this.loadRows("room_join_requests"),
      roomAuditLog: this.loadRows("room_audit_log"),
      conversations: this.loadRows("conversations"),
      messages: this.loadRows("messages"),
      reactions: this.loadRows("reactions"),
      reads: this.loadRows("reads"),
      files: this.loadRows("files"),
      conversationSettings: this.loadRows("conversation_settings"),
      voiceListens: this.loadRows("voice_listens"),
      messageBookmarks: this.loadRows("message_bookmarks"),
      notificationEvents: this.loadRows("notification_events"),
      uploadSessions: this.loadRows("upload_sessions"),
      billingLinks: this.loadRows("billing_links"),
      billingEntitlements: this.loadRows("billing_entitlements"),
      pulseGoals: this.loadRows("pulse_goals"),
      pulseContributions: this.loadRows("pulse_contributions"),
      loginAttempts: this.loadRows("login_attempts"),
      rateLimits: this.loadRows("rate_limits"),
      ...v3,
    });
  }

  persistState(nextState = this.state) {
    const state = normalizeState(nextState);
    const previous = normalizeState(this.state);
    const definitions = {
      users: {
        table: "users", key: (item) => item.id,
        upsert: "INSERT INTO users (id, username, display_name, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, data=excluded.data",
        args: (item) => [item.id, item.username, item.displayName, json(item)],
        remove: "DELETE FROM users WHERE id = ?", removeArgs: (item) => [item.id],
      },
      sessions: {
        table: "sessions", key: (item) => item.id,
        upsert: "INSERT INTO sessions (id, user_id, token_hash, expires_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, token_hash=excluded.token_hash, expires_at=excluded.expires_at, data=excluded.data",
        args: (item) => [item.id, item.userId, item.tokenHash, item.expiresAt, json(item)],
        remove: "DELETE FROM sessions WHERE id = ?", removeArgs: (item) => [item.id],
      },
      blocks: {
        table: "blocks", key: (item) => item.id,
        upsert: "INSERT INTO blocks (id, blocker_id, blocked_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET blocker_id=excluded.blocker_id, blocked_id=excluded.blocked_id, data=excluded.data",
        args: (item) => [item.id, item.blockerId, item.blockedId, json(item)],
        remove: "DELETE FROM blocks WHERE id = ?", removeArgs: (item) => [item.id],
      },
      contactRequests: {
        table: "contact_requests", key: (item) => item.id,
        upsert: "INSERT INTO contact_requests (id, from_user_id, to_user_id, status, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET from_user_id=excluded.from_user_id, to_user_id=excluded.to_user_id, status=excluded.status, data=excluded.data",
        args: (item) => [item.id, item.fromUserId, item.toUserId, item.status, json(item)],
        remove: "DELETE FROM contact_requests WHERE id = ?", removeArgs: (item) => [item.id],
      },
      contacts: {
        table: "contacts", key: (item) => item.id,
        upsert: "INSERT INTO contacts (id, user_a_id, user_b_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_a_id=excluded.user_a_id, user_b_id=excluded.user_b_id, data=excluded.data",
        args: (item) => [item.id, item.userAId, item.userBId, json(item)],
        remove: "DELETE FROM contacts WHERE id = ?", removeArgs: (item) => [item.id],
      },
      rooms: {
        table: "rooms", key: (item) => item.id,
        upsert: "INSERT INTO rooms (id, slug, owner_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, owner_id=excluded.owner_id, data=excluded.data",
        args: (item) => [item.id, item.slug, item.ownerId, json(item)],
        remove: "DELETE FROM rooms WHERE id = ?", removeArgs: (item) => [item.id],
      },
      roomMembers: {
        table: "room_members", key: (item) => `${item.roomId}\u0000${item.userId}`,
        upsert: "INSERT INTO room_members (room_id, user_id, role, data) VALUES (?, ?, ?, ?) ON CONFLICT(room_id, user_id) DO UPDATE SET role=excluded.role, data=excluded.data",
        args: (item) => [item.roomId, item.userId, item.role, json(item)],
        remove: "DELETE FROM room_members WHERE room_id = ? AND user_id = ?", removeArgs: (item) => [item.roomId, item.userId],
      },
      roomBans: {
        table: "room_bans", key: (item) => item.id,
        upsert: "INSERT INTO room_bans (id, room_id, user_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET room_id=excluded.room_id, user_id=excluded.user_id, data=excluded.data",
        args: (item) => [item.id, item.roomId, item.userId, json(item)],
        remove: "DELETE FROM room_bans WHERE id = ?", removeArgs: (item) => [item.id],
      },
      roomJoinRequests: {
        table: "room_join_requests", key: (item) => item.id,
        upsert: "INSERT INTO room_join_requests (id, room_id, user_id, status, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET room_id=excluded.room_id, user_id=excluded.user_id, status=excluded.status, data=excluded.data",
        args: (item) => [item.id, item.roomId, item.userId, item.status, json(item)],
        remove: "DELETE FROM room_join_requests WHERE id = ?", removeArgs: (item) => [item.id],
      },
      roomAuditLog: {
        table: "room_audit_log", key: (item) => item.id,
        upsert: "INSERT INTO room_audit_log (id, room_id, actor_id, action, created_at, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET room_id=excluded.room_id, actor_id=excluded.actor_id, action=excluded.action, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [item.id, item.roomId, item.actorId, item.action, item.createdAt, json(item)],
        remove: "DELETE FROM room_audit_log WHERE id = ?", removeArgs: (item) => [item.id],
      },
      conversations: {
        table: "conversations", key: (item) => item.id,
        upsert: "INSERT INTO conversations (id, type, room_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET type=excluded.type, room_id=excluded.room_id, data=excluded.data",
        args: (item) => [item.id, item.type, item.roomId ?? null, json(item)],
        remove: "DELETE FROM conversations WHERE id = ?", removeArgs: (item) => [item.id],
      },
      messages: {
        table: "messages", key: (item) => item.id,
        upsert: "INSERT INTO messages (id, conversation_id, sender_id, client_id, type, text, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id, sender_id=excluded.sender_id, client_id=excluded.client_id, type=excluded.type, text=excluded.text, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [item.id, item.conversationId, item.senderId, item.clientId ?? null, item.type, item.text ?? "", item.createdAt, json(item)],
        remove: "DELETE FROM messages WHERE id = ?", removeArgs: (item) => [item.id],
      },
      reactions: {
        table: "reactions", key: (item) => item.id,
        upsert: "INSERT INTO reactions (id, message_id, user_id, emoji, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET message_id=excluded.message_id, user_id=excluded.user_id, emoji=excluded.emoji, data=excluded.data",
        args: (item) => [item.id, item.messageId, item.userId, item.emoji, json(item)],
        remove: "DELETE FROM reactions WHERE id = ?", removeArgs: (item) => [item.id],
      },
      reads: {
        table: "reads", key: (item) => `${item.conversationId}\u0000${item.userId}`,
        upsert: "INSERT INTO reads (conversation_id, user_id, last_read_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at=excluded.last_read_at, data=excluded.data",
        args: (item) => [item.conversationId, item.userId, item.lastReadAt, json(item)],
        remove: "DELETE FROM reads WHERE conversation_id = ? AND user_id = ?", removeArgs: (item) => [item.conversationId, item.userId],
      },
      files: {
        table: "files", key: (item) => item.id,
        upsert: "INSERT INTO files (id, conversation_id, uploader_id, stored_name, size, kind, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET conversation_id=excluded.conversation_id, uploader_id=excluded.uploader_id, stored_name=excluded.stored_name, size=excluded.size, kind=excluded.kind, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [item.id, item.conversationId ?? null, item.uploaderId, item.storedName, Number(item.size || 0), item.kind, item.createdAt, json(item)],
        remove: "DELETE FROM files WHERE id = ?", removeArgs: (item) => [item.id],
      },
      conversationSettings: {
        table: "conversation_settings", key: (item) => `${item.userId}\u0000${item.conversationId}`,
        upsert: "INSERT INTO conversation_settings (user_id, conversation_id, muted, data) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, conversation_id) DO UPDATE SET muted=excluded.muted, data=excluded.data",
        args: (item) => [item.userId, item.conversationId, item.muted ? 1 : 0, json(item)],
        remove: "DELETE FROM conversation_settings WHERE user_id = ? AND conversation_id = ?", removeArgs: (item) => [item.userId, item.conversationId],
      },
      voiceListens: {
        table: "voice_listens", key: (item) => `${item.messageId}\u0000${item.userId}`,
        upsert: "INSERT INTO voice_listens (message_id, user_id, listened_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(message_id, user_id) DO UPDATE SET listened_at=excluded.listened_at, data=excluded.data",
        args: (item) => [item.messageId, item.userId, item.listenedAt, json(item)],
        remove: "DELETE FROM voice_listens WHERE message_id = ? AND user_id = ?", removeArgs: (item) => [item.messageId, item.userId],
      },
      messageBookmarks: {
        table: "message_bookmarks", key: (item) => item.id,
        upsert: "INSERT INTO message_bookmarks (id, user_id, message_id, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, message_id=excluded.message_id, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [item.id, item.userId, item.messageId, item.createdAt, json(item)],
        remove: "DELETE FROM message_bookmarks WHERE id = ?", removeArgs: (item) => [item.id],
      },
      notificationEvents: {
        table: "notification_events", key: (item) => item.id,
        upsert: "INSERT INTO notification_events (id, user_id, type, created_at, read_at, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, type=excluded.type, created_at=excluded.created_at, read_at=excluded.read_at, data=excluded.data",
        args: (item) => [item.id, item.userId, item.type, item.createdAt, item.readAt ?? null, json(item)],
        remove: "DELETE FROM notification_events WHERE id = ?", removeArgs: (item) => [item.id],
      },
      uploadSessions: {
        table: "upload_sessions", key: (item) => item.id,
        upsert: "INSERT INTO upload_sessions (id, user_id, conversation_id, status, created_at, expires_at, data) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, conversation_id=excluded.conversation_id, status=excluded.status, created_at=excluded.created_at, expires_at=excluded.expires_at, data=excluded.data",
        args: (item) => [item.id, item.userId, item.conversationId, item.status, item.createdAt, item.expiresAt, json(item)],
        remove: "DELETE FROM upload_sessions WHERE id = ?", removeArgs: (item) => [item.id],
      },
      billingLinks: {
        table: "billing_links", key: (item) => item.id,
        upsert: "INSERT INTO billing_links (id, user_id, cloud_account_id, status, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, cloud_account_id=excluded.cloud_account_id, status=excluded.status, data=excluded.data",
        args: (item) => [item.id, item.userId, item.cloudAccountId, item.status, json(item)],
        remove: "DELETE FROM billing_links WHERE id = ?", removeArgs: (item) => [item.id],
      },
      billingEntitlements: {
        table: "billing_entitlements", key: (item) => item.id,
        upsert: "INSERT INTO billing_entitlements (id, scope_type, scope_id, product_code, expires_at, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET scope_type=excluded.scope_type, scope_id=excluded.scope_id, product_code=excluded.product_code, expires_at=excluded.expires_at, data=excluded.data",
        args: (item) => [item.id, item.scopeType, item.scopeId, item.productCode, item.expiresAt, json(item)],
        remove: "DELETE FROM billing_entitlements WHERE id = ?", removeArgs: (item) => [item.id],
      },
      pulseGoals: {
        table: "pulse_goals", key: (item) => item.id,
        upsert: "INSERT INTO pulse_goals (id, room_id, status, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET room_id=excluded.room_id, status=excluded.status, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [item.id, item.roomId, item.status, item.createdAt, json(item)],
        remove: "DELETE FROM pulse_goals WHERE id = ?", removeArgs: (item) => [item.id],
      },
      pulseContributions: {
        table: "pulse_contributions", key: (item) => item.id,
        upsert: "INSERT INTO pulse_contributions (id, goal_id, user_id, amount, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET goal_id=excluded.goal_id, user_id=excluded.user_id, amount=excluded.amount, data=excluded.data",
        args: (item) => [item.id, item.goalId, item.userId, Number(item.amount || 0), json(item)],
        remove: "DELETE FROM pulse_contributions WHERE id = ?", removeArgs: (item) => [item.id],
      },
      loginAttempts: {
        table: "login_attempts", key: (item) => item.id,
        upsert: "INSERT INTO login_attempts (id, username, ip, success, created_at, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET username=excluded.username, ip=excluded.ip, success=excluded.success, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [item.id, item.username, item.ip, item.success ? 1 : 0, item.createdAt, json(item)],
        remove: "DELETE FROM login_attempts WHERE id = ?", removeArgs: (item) => [item.id],
      },
      rateLimits: {
        table: "rate_limits", key: (item) => item.key,
        upsert: "INSERT INTO rate_limits (key, window_started_at, hits, data) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET window_started_at=excluded.window_started_at, hits=excluded.hits, data=excluded.data",
        args: (item) => [item.key, item.windowStartedAt, Number(item.hits || 0), json(item)],
        remove: "DELETE FROM rate_limits WHERE key = ?", removeArgs: (item) => [item.key],
      },
    };
    for (const collection of V3_COLLECTIONS) {
      definitions[collection] = {
        table: "v3_entities",
        key: (item) => item.id,
        upsert: "INSERT INTO v3_entities (collection, id, scope_id, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET scope_id=excluded.scope_id, created_at=excluded.created_at, data=excluded.data",
        args: (item) => [collection, item.id, item.scopeId ?? item.roomId ?? item.conversationId ?? item.userId ?? null, item.createdAt ?? item.scheduledAt ?? new Date(0).toISOString(), json(item)],
        remove: "DELETE FROM v3_entities WHERE collection = ? AND id = ?",
        removeArgs: (item) => [collection, item.id],
      };
    }
    const write = () => {
      for (const [collection, definition] of Object.entries(definitions)) {
        const before = new Map(previous[collection].map((item) => [definition.key(item), item]));
        const after = new Map(state[collection].map((item) => [definition.key(item), item]));
        const remove = this.db.prepare(definition.remove);
        const upsert = this.db.prepare(definition.upsert);
        for (const [key, item] of before) {
          if (!after.has(key)) remove.run(...definition.removeArgs(item));
        }
        for (const [key, item] of after) {
          const existing = before.get(key);
          if (!existing || json(existing) !== json(item)) upsert.run(...definition.args(item));
        }
      }

      const meta = this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      meta.run("schema_version", String(SCHEMA_VERSION));
      meta.run("state_meta", json(state.meta));
      meta.run("settings", json(state.settings));
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      write();
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
    this.state = state;
  }

  read(selector = (state) => state) {
    return selector(this.state);
  }

  searchMessageIds(query, { conversationId = null, limit = 120 } = {}) {
    const tokens = String(query || "").normalize("NFKC").match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 12) ?? [];
    if (!tokens.length || !this.db) return [];
    const expression = tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(" AND ");
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 120));
    try {
      const rows = conversationId
        ? this.db.prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? AND conversation_id = ? LIMIT ?").all(expression, conversationId, safeLimit)
        : this.db.prepare("SELECT message_id FROM messages_fts WHERE messages_fts MATCH ? LIMIT ?").all(expression, safeLimit);
      return rows.map((row) => row.message_id);
    } catch {
      return [];
    }
  }

  mutate(mutator) {
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const draft = structuredClone(this.state);
        const result = await mutator(draft);
        this.persistState(draft);
        this.emit("changed");
        return result == null ? result : structuredClone(result);
      });
    this.queue = operation.catch(() => {});
    return operation;
  }

  persist() {
    this.queue = this.queue.catch(() => {}).then(() => this.persistState(this.state));
    return this.queue;
  }

  async cleanup() {
    const now = Date.now();
    await this.mutate((state) => {
      for (const user of state.users.filter((item) => !item.disabledAt)) {
        const saved = state.conversations.some(
          (conversation) => conversation.type === "dm" && conversation.userIds.length === 1 && conversation.userIds[0] === user.id,
        );
        if (!saved) state.conversations.push({
          id: crypto.randomUUID(), type: "dm", userIds: [user.id], roomId: null,
          savedMessages: true, createdAt: new Date().toISOString(),
        });
      }
      state.sessions = state.sessions.filter((session) => Date.parse(session.expiresAt) > now);
      state.contactRequests = state.contactRequests.filter((request) => request.status === "pending");
      state.roomJoinRequests = state.roomJoinRequests.filter((request) => request.status === "pending" || Date.parse(request.resolvedAt || 0) > now - 90 * 24 * 60 * 60 * 1000);
      state.loginAttempts = state.loginAttempts.filter((attempt) => Date.parse(attempt.createdAt) > now - 90 * 24 * 60 * 60 * 1000);
      state.rateLimits = state.rateLimits.filter((bucket) => Date.parse(bucket.windowStartedAt) > now - 24 * 60 * 60 * 1000);
      state.notificationEvents = state.notificationEvents.filter((event) => Date.parse(event.createdAt) > now - 90 * 24 * 60 * 60 * 1000);
      state.uploadSessions = state.uploadSessions.filter((session) => session.status === "complete" || Date.parse(session.expiresAt) > now);
      state.events = state.events
        .filter((event) => Date.parse(event.createdAt) > now - 30 * 24 * 60 * 60 * 1000)
        .slice(-50_000);
      state.scheduledMessages = state.scheduledMessages.filter((message) => message.status === "pending" || Date.parse(message.updatedAt || message.scheduledAt) > now - 90 * 24 * 60 * 60 * 1000);
      state.roomInvites = state.roomInvites.filter((invite) => !invite.revokedAt || Date.parse(invite.revokedAt) > now - 90 * 24 * 60 * 60 * 1000);
      state.paymentEvents = state.paymentEvents.slice(-20_000);
      state.integrationAudit = state.integrationAudit.slice(-20_000);
      for (const goal of state.pulseGoals) {
        if (goal.status === "active" && goal.expiresAt && Date.parse(goal.expiresAt) <= now) goal.status = "expired";
      }
    });
  }

  integrityCheck(database = this.db) {
    try {
      const rows = database.prepare("PRAGMA integrity_check").all();
      const details = rows.map((row) => Object.values(row)[0]).join("; ");
      return { ok: details === "ok", details };
    } catch (error) {
      return { ok: false, details: error.message };
    }
  }

  async backupDatabase(destination) {
    await this.flush();
    this.db.exec("PRAGMA wal_checkpoint(FULL)");
    await backup(this.db, destination);
    const check = SqliteStore.checkDatabaseFile(destination);
    if (!check.ok) throw new Error(`Резервная копия SQLite повреждена: ${check.details}`);
    return destination;
  }

  static checkDatabaseFile(filePath) {
    let database;
    try {
      database = new DatabaseSync(filePath, { readOnly: true });
      const rows = database.prepare("PRAGMA integrity_check").all();
      const details = rows.map((row) => Object.values(row)[0]).join("; ");
      return { ok: details === "ok", details };
    } catch (error) {
      return { ok: false, details: error.message };
    } finally {
      database?.close();
    }
  }

  async replaceDatabase(sourcePath) {
    const check = SqliteStore.checkDatabaseFile(sourcePath);
    if (!check.ok) throw new Error(`Копия не прошла проверку целостности: ${check.details}`);
    const operation = this.queue.catch(() => {}).then(async () => {
      const temporary = `${this.filePath}.restore-${Date.now()}`;
      const previous = `${this.filePath}.before-restore-${timestampSlug()}`;
      await fs.copyFile(sourcePath, temporary);
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      this.db.close();
      this.db = null;
      await Promise.all([
        fs.rm(`${this.filePath}-wal`, { force: true }),
        fs.rm(`${this.filePath}-shm`, { force: true }),
      ]);
      await fs.rename(this.filePath, previous);
      try {
        await fs.rename(temporary, this.filePath);
        this.open();
        const restoredCheck = this.integrityCheck();
        if (!restoredCheck.ok) throw new Error(restoredCheck.details);
        this.state = this.loadState();
        await fs.rm(previous, { force: true });
        this.emit("changed");
      } catch (error) {
        this.db?.close();
        this.db = null;
        await fs.rm(this.filePath, { force: true });
        await fs.rename(previous, this.filePath).catch(() => {});
        this.open();
        this.state = this.loadState();
        throw error;
      } finally {
        await fs.rm(temporary, { force: true });
      }
    });
    this.queue = operation;
    return operation;
  }

  async flush() {
    await this.queue;
    this.db?.exec("PRAGMA wal_checkpoint(PASSIVE)");
  }

  async close() {
    await this.flush();
    if (this.db) {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      this.db.close();
    }
    this.db = null;
  }

  stats() {
    const state = this.state;
    const bytes = state.files.filter((file) => !file.deletedAt).reduce((total, file) => total + Number(file.size || 0), 0);
    const quotaBytes = Number(state.settings.storageQuotaBytes) || DEFAULT_STORAGE_QUOTA_BYTES;
    let databaseBytes = 0;
    try {
      databaseBytes = Number(this.db.prepare("PRAGMA page_count").get().page_count)
        * Number(this.db.prepare("PRAGMA page_size").get().page_size);
    } catch {}
    return {
      users: state.users.filter((user) => !user.disabledAt).length,
      disabledUsers: state.users.filter((user) => user.disabledAt).length,
      rooms: state.rooms.length,
      messages: state.messages.filter((message) => !message.deletedAt).length,
      files: state.files.filter((file) => !file.deletedAt && file.kind !== "avatar").length,
      bytes,
      databaseBytes,
      quotaBytes,
      remainingBytes: Math.max(0, quotaBytes - bytes),
      quotaPercent: quotaBytes ? Math.min(100, Math.round((bytes / quotaBytes) * 1000) / 10) : 0,
      fileRetentionDays: Number(state.settings.fileRetentionDays) || 0,
      firstAccountPending: state.users.length === 0,
      database: "sqlite",
      schemaVersion: SCHEMA_VERSION,
      integrity: this.db ? (this.integrityCheck().ok ? "ok" : "failed") : "closed",
    };
  }
}

module.exports = {
  DEFAULT_STORAGE_QUOTA_BYTES,
  SCHEMA_VERSION,
  V3_COLLECTIONS,
  SqliteStore,
  initialState,
  normalizeState,
};
