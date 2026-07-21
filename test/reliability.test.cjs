"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");

const { DatabaseSync } = require("node:sqlite");
const { MaintenanceService } = require("../server/maintenance.cjs");
const { SqliteStore, initialState } = require("../server/store.cjs");

async function temporaryDirectory(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function seedState() {
  const state = initialState();
  const createdAt = "2026-01-01T00:00:00.000Z";
  state.users.push({
    id: "user-1",
    username: "legacy",
    displayName: "Legacy User",
    status: "",
    avatarFileId: null,
    notificationSound: "subtle",
    passwordSalt: "salt",
    passwordHash: "hash",
    role: "server_admin",
    createdAt,
    disabledAt: null,
  });
  state.rooms.push({ id: "room-1", name: "Общий", slug: "general", privacy: "public", ownerId: "user-1", inviteCode: "code", createdAt });
  state.roomMembers.push({ roomId: "room-1", userId: "user-1", role: "owner", joinedAt: createdAt });
  state.conversations.push({ id: "conversation-1", type: "room", roomId: "room-1", userIds: [], createdAt });
  state.messages.push({
    id: "message-1",
    conversationId: "conversation-1",
    senderId: "user-1",
    clientId: "legacy-message-1",
    type: "text",
    text: "Сообщение из JSON",
    createdAt,
    updatedAt: null,
    deletedAt: null,
    pinnedAt: null,
    pinnedBy: null,
  });
  return state;
}

test("автоматически мигрирует nexora.json в нормализованные таблицы SQLite", async () => {
  const directory = await temporaryDirectory("nexora-migration-");
  const legacyPath = path.join(directory, "nexora.json");
  const databasePath = path.join(directory, "nexora.sqlite");
  await fs.writeFile(legacyPath, JSON.stringify(seedState(), null, 2));

  const store = new SqliteStore(databasePath, { legacyJsonPath: legacyPath });
  await store.init();
  assert.equal(store.read((state) => state.users[0].username), "legacy");
  assert.equal(store.read((state) => state.messages[0].text), "Сообщение из JSON");
  assert.equal(store.integrityCheck().ok, true);
  await store.close();

  const database = new DatabaseSync(databasePath, { readOnly: true });
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const name of ["users", "rooms", "messages", "files", "sessions", "room_bans", "room_join_requests", "room_audit_log", "voice_listens", "login_attempts", "rate_limits"]) assert.ok(tables.has(name), `нет таблицы ${name}`);
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  database.close();

  await assert.rejects(fs.access(legacyPath));
  assert.ok((await fs.readdir(directory)).some((name) => name.startsWith("nexora.json.migrated-") && name.endsWith(".bak")));
  await fs.rm(directory, { recursive: true, force: true });
});

test("обновление SQLite schema 3 до schema 6 сохраняет данные и создаёт резервную копию", async () => {
  const directory = await temporaryDirectory("nexora-schema-upgrade-");
  const databasePath = path.join(directory, "nexora.sqlite");
  let store = new SqliteStore(databasePath, { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  await store.mutate((state) => Object.assign(state, seedState()));
  await store.close();
  const legacy = new DatabaseSync(databasePath);
  for (const table of ["room_bans", "room_join_requests", "room_audit_log", "voice_listens", "login_attempts", "rate_limits", "v3_entities"]) legacy.exec(`DROP TABLE ${table}`);
  legacy.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run("3");
  legacy.close();
  store = new SqliteStore(databasePath, { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  assert.equal(store.stats().schemaVersion, 6);
  assert.equal(store.read((state) => state.messages.find((message) => message.id === "message-1").text), "Сообщение из JSON");
  const upgraded = new DatabaseSync(databasePath, { readOnly: true });
  const tables = new Set(upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  for (const table of ["room_bans", "room_join_requests", "room_audit_log", "voice_listens", "login_attempts", "rate_limits", "message_bookmarks", "notification_events", "upload_sessions", "billing_links", "billing_entitlements", "pulse_goals", "pulse_contributions", "messages_fts", "v3_entities"]) assert.ok(tables.has(table));
  upgraded.close();
  await store.close();
  assert.ok((await fs.readdir(directory)).some((name) => name.startsWith("nexora.sqlite.pre-schema-6-") && name.endsWith(".bak")));
  await fs.rm(directory, { recursive: true, force: true });
});

test("резервная копия атомарно возвращает базу и файлы", async () => {
  const directory = await temporaryDirectory("nexora-backup-");
  const uploadsDir = path.join(directory, "uploads");
  const store = new SqliteStore(path.join(directory, "nexora.sqlite"), { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  await store.mutate((state) => Object.assign(state, seedState()));
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, "kept.txt"), "backup payload");
  await store.mutate((state) => {
    state.files.push({ id: "file-1", conversationId: "conversation-1", uploaderId: "user-1", originalName: "kept.txt", storedName: "kept.txt", mimeType: "text/plain", size: 14, kind: "file", duration: null, createdAt: "2026-01-01T00:00:00.000Z", deletedAt: null });
    state.messages.push({ id: "message-file", conversationId: "conversation-1", senderId: "user-1", clientId: null, type: "file", text: "", fileId: "file-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null });
  });

  const maintenance = await new MaintenanceService({ store, dataDir: directory, uploadsDir, appVersion: "0.3.0" }).init();
  const backup = await maintenance.createBackup({ automatic: false });
  await store.mutate((state) => { state.users[0].displayName = "Changed"; });
  await fs.writeFile(path.join(uploadsDir, "kept.txt"), "changed");
  await maintenance.restoreBackup(backup.directory);

  assert.equal(store.read((state) => state.users[0].displayName), "Legacy User");
  assert.equal(await fs.readFile(path.join(uploadsDir, "kept.txt"), "utf8"), "backup payload");
  assert.equal(store.integrityCheck().ok, true);
  maintenance.stop();
  await store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("зашифрованная копия не хранит SQLite и вложения открытым текстом", async () => {
  const directory = await temporaryDirectory("nexora-encrypted-backup-");
  const uploadsDir = path.join(directory, "uploads");
  const store = new SqliteStore(path.join(directory, "nexora.sqlite"), { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  await store.mutate((state) => Object.assign(state, seedState()));
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, "secret.txt"), "top secret payload");
  await store.mutate((state) => {
    state.files.push({ id: "secret-file", conversationId: "conversation-1", uploaderId: "user-1", originalName: "secret.txt", storedName: "secret.txt", mimeType: "text/plain", size: 18, kind: "file", duration: null, createdAt: new Date().toISOString(), deletedAt: null });
  });
  const maintenance = new MaintenanceService({ store, dataDir: directory, uploadsDir, appVersion: "2.0.0" });
  await fs.mkdir(maintenance.backupsDir, { recursive: true });
  const backup = await maintenance.createBackup({ passphrase: "BackupPassword123!" });
  assert.equal(backup.encrypted, true);
  await assert.rejects(fs.access(path.join(backup.directory, "nexora.sqlite")));
  await assert.rejects(fs.access(path.join(backup.directory, "uploads", "secret.txt")));
  assert.ok((await fs.readdir(backup.directory)).some((name) => name.endsWith(".enc")));
  await assert.rejects(maintenance.validateBackup(backup.directory, { passphrase: "WrongPassword123!" }), /расшифровать/i);
  const validated = await maintenance.validateBackup(backup.directory, { passphrase: "BackupPassword123!" });
  assert.equal(validated.manifest.encrypted, true);
  await fs.rm(validated.materialized, { recursive: true, force: true });
  maintenance.stop();
  await store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("срок хранения удаляет старые вложения и очистка удаляет сироты", async () => {
  const directory = await temporaryDirectory("nexora-retention-");
  const uploadsDir = path.join(directory, "uploads");
  const store = new SqliteStore(path.join(directory, "nexora.sqlite"), { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  await store.mutate((state) => Object.assign(state, seedState()));
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, "old.bin"), "old");
  await fs.writeFile(path.join(uploadsDir, "orphan.bin"), "orphan");
  await store.mutate((state) => {
    state.settings.fileRetentionDays = 1;
    state.files.push({ id: "old-file", conversationId: "conversation-1", uploaderId: "user-1", originalName: "old.bin", storedName: "old.bin", mimeType: "application/octet-stream", size: 3, kind: "file", duration: null, createdAt: "2020-01-01T00:00:00.000Z", deletedAt: null });
    state.messages.push({ id: "old-message", conversationId: "conversation-1", senderId: "user-1", clientId: null, type: "file", text: "", fileId: "old-file", createdAt: "2020-01-01T00:00:00.000Z", updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null });
  });

  const maintenance = new MaintenanceService({ store, dataDir: directory, uploadsDir, appVersion: "0.3.0" });
  await fs.mkdir(path.join(uploadsDir, ".incoming"), { recursive: true });
  const result = await maintenance.cleanupFiles();
  assert.equal(result.expired, 1);
  assert.ok(result.orphans >= 2);
  assert.ok(store.read((state) => state.files.find((file) => file.id === "old-file").deletedAt));
  assert.ok(store.read((state) => state.messages.find((message) => message.id === "old-message").attachmentExpiredAt));
  await assert.rejects(fs.access(path.join(uploadsDir, "old.bin")));
  await assert.rejects(fs.access(path.join(uploadsDir, "orphan.bin")));
  await store.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("аварийное завершение процесса во время записи не повреждает SQLite", { timeout: 20_000 }, async () => {
  const directory = await temporaryDirectory("nexora-power-cut-");
  const databasePath = path.join(directory, "nexora.sqlite");
  const store = new SqliteStore(databasePath, { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  await store.mutate((state) => Object.assign(state, seedState()));
  await store.close();

  const fixture = path.join(__dirname, "fixtures", "power-writer.cjs");
  const child = spawn(process.execPath, [fixture, databasePath], { stdio: ["ignore", "pipe", "pipe"] });
  const childExit = once(child, "exit");
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`writer timeout: ${stderr}`)), 8_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("READY")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", reject);
  });
  await new Promise((resolve) => setTimeout(resolve, 8));
  child.kill("SIGKILL");
  await childExit;

  const recovered = new SqliteStore(databasePath, { legacyJsonPath: path.join(directory, "nexora.json") });
  await recovered.init();
  assert.equal(recovered.integrityCheck().ok, true, stderr);
  assert.equal(recovered.read((state) => state.users[0].username), "legacy");
  assert.ok(recovered.read((state) => state.messages.length) >= 1);
  await recovered.close();
  await fs.rm(directory, { recursive: true, force: true });
});
