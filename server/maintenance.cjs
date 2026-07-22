"use strict";

const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { promisify } = require("node:util");
const { SqliteStore } = require("./store.cjs");

const scrypt = promisify(crypto.scrypt);
const SECURITY_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;

function safeTimestamp(value = new Date()) {
  return value.toISOString().replace(/[:.]/g, "-");
}

async function exists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(itemPath);
    else if (entry.isFile()) total += Number((await fs.stat(itemPath)).size || 0);
  }
  return total;
}

async function regularFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await regularFiles(itemPath));
    else if (entry.isFile()) files.push(itemPath);
  }
  return files;
}

async function deriveBackupKey(passphrase, salt) {
  if (String(passphrase || "").length < 10) throw new Error("Пароль резервной копии должен содержать минимум 10 символов.");
  return Buffer.from(await scrypt(String(passphrase), salt, 32));
}

class MaintenanceService {
  constructor({ store, dataDir, uploadsDir, appVersion, log = () => {} }) {
    this.store = store;
    this.dataDir = dataDir;
    this.uploadsDir = uploadsDir;
    this.backupsDir = path.join(dataDir, "backups");
    this.appVersion = appVersion;
    this.log = log;
    this.timer = null;
    this.fileQueue = Promise.resolve();
  }

  withFileLock(operation) {
    const run = this.fileQueue.catch(() => {}).then(operation);
    this.fileQueue = run.catch(() => {});
    return run;
  }

  async init() {
    await Promise.all([
      fs.mkdir(this.uploadsDir, { recursive: true }),
      fs.mkdir(path.join(this.uploadsDir, ".incoming"), { recursive: true }),
      fs.mkdir(this.backupsDir, { recursive: true }),
    ]);
    await this.cleanupFiles();
    await this.cleanupSecurityState();
    await this.ensureAutomaticBackup();
    this.timer = setInterval(() => {
      this.cleanupFiles()
        .then(() => this.cleanupSecurityState())
        .then(() => this.ensureAutomaticBackup())
        .catch((error) => this.log(`Фоновое обслуживание: ${error.message}`, "warn"));
    }, 60 * 60 * 1000);
    this.timer.unref?.();
    return this;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async cleanupSecurityState({ now = Date.now() } = {}) {
    const securityCutoff = Number(now) - SECURITY_HISTORY_RETENTION_MS;
    const rateLimitCutoff = Number(now) - RATE_LIMIT_RETENTION_MS;
    let removed = { sessions: 0, loginAttempts: 0, rateLimits: 0 };
    await this.store.mutate((state) => {
      const sessions = Array.isArray(state.sessions) ? state.sessions : [];
      const loginAttempts = Array.isArray(state.loginAttempts) ? state.loginAttempts : [];
      const rateLimits = Array.isArray(state.rateLimits) ? state.rateLimits : [];
      const nextSessions = sessions.filter((item) => Date.parse(item.expiresAt) > Number(now));
      const nextLoginAttempts = loginAttempts.filter((item) => Date.parse(item.createdAt) >= securityCutoff);
      const nextRateLimits = rateLimits.filter((item) => Date.parse(item.windowStartedAt) >= rateLimitCutoff);
      removed = {
        sessions: sessions.length - nextSessions.length,
        loginAttempts: loginAttempts.length - nextLoginAttempts.length,
        rateLimits: rateLimits.length - nextRateLimits.length,
      };
      state.sessions = nextSessions;
      state.loginAttempts = nextLoginAttempts;
      state.rateLimits = nextRateLimits;
    });
    if (removed.sessions || removed.loginAttempts || removed.rateLimits) {
      this.log(`Очистка security state: сессий ${removed.sessions}, login history ${removed.loginAttempts}, rate-limit buckets ${removed.rateLimits}`);
    }
    return removed;
  }

  async cleanupFiles(options = {}) {
    if (!options.locked) return this.withFileLock(() => this.cleanupFiles({ locked: true }));
    await this.store.flush();
    const state = this.store.read();
    const now = Date.now();
    const retentionDays = Number(state.settings.fileRetentionDays) || 0;
    const retentionCutoff = retentionDays > 0 ? now - retentionDays * 24 * 60 * 60 * 1000 : 0;
    const activeFiles = state.files.filter((file) => !file.deletedAt);
    const expiredIds = new Set(activeFiles
      .filter((file) => file.kind !== "avatar" && retentionCutoff && Date.parse(file.createdAt) < retentionCutoff)
      .map((file) => file.id));
    const missingIds = new Set();

    for (const file of activeFiles) {
      if (expiredIds.has(file.id)) continue;
      if (!(await exists(path.join(this.uploadsDir, file.storedName)))) missingIds.add(file.id);
    }

    const removedIds = new Set([...expiredIds, ...missingIds]);
    if (removedIds.size) {
      const removedAt = new Date().toISOString();
      await this.store.mutate((draft) => {
        for (const file of draft.files) {
          if (removedIds.has(file.id)) file.deletedAt = removedAt;
        }
        for (const message of draft.messages) {
          if (removedIds.has(message.fileId) && !message.deletedAt) message.attachmentExpiredAt = removedAt;
        }
        for (const user of draft.users) {
          if (removedIds.has(user.avatarFileId)) user.avatarFileId = null;
        }
      });
    }

    const referenced = new Set(this.store.read((draft) => draft.files.filter((file) => !file.deletedAt).map((file) => file.storedName)));
    let deletedOrphans = 0;
    for (const entry of await fs.readdir(this.uploadsDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || referenced.has(entry.name)) continue;
      await fs.unlink(path.join(this.uploadsDir, entry.name)).catch(() => {});
      deletedOrphans += 1;
    }

    const incomingDir = path.join(this.uploadsDir, ".incoming");
    for (const entry of await fs.readdir(incomingDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile()) continue;
      const incomingPath = path.join(incomingDir, entry.name);
      const stat = await fs.stat(incomingPath).catch(() => null);
      if (stat && now - stat.mtimeMs > 60 * 60 * 1000) {
        await fs.unlink(incomingPath).catch(() => {});
        deletedOrphans += 1;
      }
    }

    if (removedIds.size || deletedOrphans) {
      this.log(`Очистка файлов: метаданных ${removedIds.size}, потерянных файлов ${deletedOrphans}`);
    }
    return { expired: expiredIds.size, missing: missingIds.size, orphans: deletedOrphans };
  }

  async backupList() {
    const backups = [];
    for (const entry of await fs.readdir(this.backupsDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(this.backupsDir, entry.name);
      const manifest = await fs.readFile(path.join(directory, "manifest.json"), "utf8").then(JSON.parse).catch(() => null);
      if (!manifest) continue;
      backups.push({ ...manifest, directory, sizeBytes: await directoryBytes(directory) });
    }
    return backups.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async createBackup({ automatic = false, reason = automatic ? "automatic" : "manual", passphrase = "" } = {}, options = {}) {
    if (!options.locked) return this.withFileLock(() => this.createBackup({ automatic, reason, passphrase }, { locked: true }));
    const createdAt = new Date();
    const name = `nexora-${automatic ? "auto" : reason}-${safeTimestamp(createdAt)}`;
    const temporary = path.join(this.backupsDir, `.${name}.tmp`);
    const destination = path.join(this.backupsDir, name);
    await fs.rm(temporary, { recursive: true, force: true });
    await fs.mkdir(temporary, { recursive: true });
    try {
      await this.store.backupDatabase(path.join(temporary, "nexora.sqlite"));
      await fs.cp(this.uploadsDir, path.join(temporary, "uploads"), {
        recursive: true,
        filter: (source) => path.basename(source) !== ".incoming",
      });
      let encryption = null;
      if (passphrase) {
        const salt = crypto.randomBytes(16);
        const key = await deriveBackupKey(passphrase, salt);
        const encryptedFiles = [];
        for (const filePath of await regularFiles(temporary)) {
          const relativePath = path.relative(temporary, filePath).split(path.sep).join("/");
          const iv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
          const plaintext = await fs.readFile(filePath);
          const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
          const encryptedPath = `${filePath}.enc`;
          await fs.writeFile(encryptedPath, ciphertext, { mode: 0o600 });
          await fs.rm(filePath, { force: true });
          encryptedFiles.push({
            path: relativePath,
            encryptedPath: `${relativePath}.enc`,
            size: plaintext.length,
            iv: iv.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
          });
        }
        encryption = { algorithm: "aes-256-gcm", kdf: "scrypt", salt: salt.toString("base64"), files: encryptedFiles };
      }
      const manifest = {
        format: "nexora-sqlite-backup",
        formatVersion: 1,
        appVersion: this.appVersion,
        schemaVersion: this.store.stats().schemaVersion,
        createdAt: createdAt.toISOString(),
        automatic,
        reason,
        encrypted: Boolean(encryption),
        encryption,
        stats: this.store.stats(),
      };
      await fs.writeFile(path.join(temporary, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
      await fs.rename(temporary, destination);
      this.log(`Создана ${automatic ? "автоматическая" : "ручная"} резервная копия: ${destination}`);
      if (automatic) await this.pruneAutomaticBackups();
      return { ...manifest, directory: destination, sizeBytes: await directoryBytes(destination) };
    } catch (error) {
      await fs.rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  async ensureAutomaticBackup() {
    const settings = this.store.read((state) => state.settings);
    const hours = Math.max(1, Number(settings.automaticBackupHours) || 24);
    const latest = (await this.backupList()).find((backup) => backup.automatic);
    if (!latest || Date.now() - Date.parse(latest.createdAt) >= hours * 60 * 60 * 1000) {
      return this.createBackup({ automatic: true });
    }
    return latest;
  }

  async pruneAutomaticBackups() {
    const keep = Math.max(1, Number(this.store.read((state) => state.settings.automaticBackupKeep)) || 7);
    const automatic = (await this.backupList()).filter((backup) => backup.automatic);
    for (const backup of automatic.slice(keep)) await fs.rm(backup.directory, { recursive: true, force: true });
  }

  async materializeEncryptedBackup(directory, manifest, passphrase) {
    const temporary = path.join(this.dataDir, `.backup-decrypt-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
    await fs.mkdir(temporary, { recursive: true });
    try {
      const salt = Buffer.from(manifest.encryption?.salt || "", "base64");
      const key = await deriveBackupKey(passphrase, salt);
      for (const item of manifest.encryption?.files ?? []) {
        const source = path.resolve(directory, item.encryptedPath);
        const destination = path.resolve(temporary, item.path);
        if (!source.startsWith(`${path.resolve(directory)}${path.sep}`) || !destination.startsWith(`${path.resolve(temporary)}${path.sep}`)) {
          throw new Error("Резервная копия содержит небезопасный путь.");
        }
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(item.iv, "base64"));
        decipher.setAuthTag(Buffer.from(item.tag, "base64"));
        const plaintext = Buffer.concat([decipher.update(await fs.readFile(source)), decipher.final()]);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, plaintext, { mode: 0o600 });
      }
      return temporary;
    } catch (error) {
      await fs.rm(temporary, { recursive: true, force: true });
      throw Object.assign(new Error("Не удалось расшифровать резервную копию. Проверьте пароль."), { cause: error });
    }
  }

  async validateBackup(directory, { passphrase = "" } = {}) {
    const resolved = path.resolve(directory);
    const manifest = await fs.readFile(path.join(resolved, "manifest.json"), "utf8").then(JSON.parse).catch(() => null);
    if (!manifest || manifest.format !== "nexora-sqlite-backup") throw new Error("Выбранная папка не является резервной копией Nexora.");
    const materialized = manifest.encrypted ? await this.materializeEncryptedBackup(resolved, manifest, passphrase) : resolved;
    const databasePath = path.join(materialized, "nexora.sqlite");
    const check = SqliteStore.checkDatabaseFile(databasePath);
    if (!check.ok) {
      if (materialized !== resolved) await fs.rm(materialized, { recursive: true, force: true });
      throw new Error(`Резервная копия повреждена: ${check.details}`);
    }
    if (!(await exists(path.join(materialized, "uploads")))) {
      if (materialized !== resolved) await fs.rm(materialized, { recursive: true, force: true });
      throw new Error("В резервной копии отсутствует папка uploads.");
    }
    return { manifest, databasePath, uploadsPath: path.join(materialized, "uploads"), directory: resolved, materialized: materialized !== resolved ? materialized : null };
  }

  async restoreBackup(directory, options = {}) {
    if (!options.locked) return this.withFileLock(() => this.restoreBackup(directory, { locked: true, passphrase: options.passphrase }));
    const backup = await this.validateBackup(directory, { passphrase: options.passphrase });
    await this.createBackup({ automatic: false, reason: "pre-restore" }, { locked: true });
    const stamp = Date.now();
    const stagedUploads = path.join(this.dataDir, `.uploads-restore-${stamp}`);
    const oldUploads = path.join(this.dataDir, `.uploads-before-restore-${stamp}`);
    await fs.cp(backup.uploadsPath, stagedUploads, { recursive: true });
    await fs.mkdir(path.join(stagedUploads, ".incoming"), { recursive: true });
    await fs.rename(this.uploadsDir, oldUploads);
    await fs.rename(stagedUploads, this.uploadsDir);
    try {
      await this.store.replaceDatabase(backup.databasePath);
      await fs.rm(oldUploads, { recursive: true, force: true });
      await this.cleanupFiles({ locked: true });
      this.log(`Сервер восстановлен из резервной копии ${backup.manifest.createdAt}`);
      return backup.manifest;
    } catch (error) {
      await fs.rm(this.uploadsDir, { recursive: true, force: true });
      await fs.rename(oldUploads, this.uploadsDir).catch(() => {});
      throw error;
    } finally {
      await fs.rm(stagedUploads, { recursive: true, force: true });
      if (backup.materialized) await fs.rm(backup.materialized, { recursive: true, force: true });
    }
  }
}

module.exports = { MaintenanceService, directoryBytes };
