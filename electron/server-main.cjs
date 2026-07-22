"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require("electron");
const QRCode = require("qrcode");
const { createNexoraServer } = require("../server/create-server-v31.cjs");
const { createUpdateService } = require("./update-service.cjs");

let window;
let instance;
let starting = null;
let stopping = null;
let logFile;
let updateService;

function clientDirectory() {
  return path.join(app.getAppPath(), "client", "dist");
}

function send(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

async function persistLog(entry) {
  if (!logFile) logFile = path.join(app.getPath("logs"), "nexora-server.log");
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  const line = `${entry.createdAt} [${String(entry.level || "info").toUpperCase()}] ${String(entry.message || "").replace(/[\r\n]+/g, " ")}\n`;
  await fs.appendFile(logFile, line, "utf8");
}

async function decoratedStatus() {
  const status = instance?.status() ?? { running: false, port: 3443, tls: true, addresses: [], stats: {} };
  const primary = status.addresses?.find((item) => item.isRadmin) ?? status.addresses?.[0];
  return {
    ...status,
    version: app.getVersion(),
    logFile: logFile ?? path.join(app.getPath("logs"), "nexora-server.log"),
    primaryUrl: primary?.url ?? status.localUrl ?? "https://localhost:3443",
    qrCode: primary?.url ? await QRCode.toDataURL(`nexora://connect?url=${encodeURIComponent(primary.url)}`, { width: 220, margin: 1, color: { dark: "#1b1028", light: "#ead8ff" } }) : null,
  };
}

async function startServer() {
  if (stopping) await stopping;
  if (instance?.status().running) return decoratedStatus();
  if (starting) return starting;
  starting = (async () => {
    instance = await createNexoraServer({
      host: "0.0.0.0",
      port: 3443,
      redirectPort: 3080,
      tls: true,
      redirect: true,
      dataDir: path.join(app.getPath("userData"), "server-data"),
      clientDir: clientDirectory(),
      development: !app.isPackaged,
      quiet: true,
    });
    instance.events.on("log", (entry) => {
      send("server:log", entry);
      persistLog(entry).catch((error) => console.error(`[Nexora Server] log write failed: ${error.message}`));
    });
    instance.events.on("status", async () => send("server:status-changed", await decoratedStatus()));
    instance.events.on("stats", async () => send("server:status-changed", await decoratedStatus()));
    await instance.listen();
    const status = await decoratedStatus();
    send("server:status-changed", status);
    return status;
  })();
  try { return await starting; } finally { starting = null; }
}

async function stopServer() {
  if (stopping) return stopping;
  const current = instance;
  if (!current) return decoratedStatus();
  instance = null;
  stopping = (async () => {
    await current.close();
    const status = await decoratedStatus();
    send("server:status-changed", status);
    return status;
  })();
  try {
    return await stopping;
  } finally {
    stopping = null;
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 650,
    title: "Nexora Server",
    backgroundColor: "#050308",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#08050d", symbolColor: "#c69cff", height: 36 },
    webPreferences: {
      preload: path.join(__dirname, "server-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  window.setMenuBarVisibility(false);
  window.loadFile(path.join(__dirname, "server-shell", "index.html"));
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.nexora.server");
  ipcMain.handle("server:status", decoratedStatus);
  ipcMain.handle("server:start", startServer);
  ipcMain.handle("server:stop", stopServer);
  ipcMain.handle("server:admin-data", () => instance?.listAdminData() ?? { users: [], rooms: [], stats: {} });
  ipcMain.handle("server:toggle-user", async (_event, { userId, disabled }) => {
    if (!instance) throw new Error("Сервер не запущен.");
    return instance.setUserDisabled(userId, disabled);
  });
  ipcMain.handle("server:delete-room", async (_event, roomId) => {
    if (!instance) throw new Error("Сервер не запущен.");
    return instance.deleteRoom(roomId);
  });
  ipcMain.handle("server:reset-password", async (_event, { userId, password }) => {
    if (!instance) throw new Error("Сервер не запущен.");
    return instance.resetUserPassword(userId, password);
  });
  ipcMain.handle("server:create-backup", async (_event, passphrase = "") => {
    if (!instance) throw new Error("Сервер не запущен.");
    const backup = await instance.createBackup(passphrase);
    shell.showItemInFolder(path.join(backup.directory, "manifest.json"));
    return backup;
  });
  ipcMain.handle("server:list-backups", () => instance?.listBackups() ?? []);
  ipcMain.handle("server:restore-backup", async (_event, passphrase = "") => {
    if (!instance) throw new Error("Сервер не запущен.");
    const result = await dialog.showOpenDialog(window, {
      title: "Выберите папку резервной копии Nexora",
      defaultPath: instance.status().backupsDir,
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const restored = await instance.restoreBackup(result.filePaths[0], passphrase);
    return { canceled: false, ...restored };
  });
  ipcMain.handle("server:cleanup-storage", async () => {
    if (!instance) throw new Error("Сервер не запущен.");
    return instance.cleanupStorage();
  });
  ipcMain.handle("server:update-storage", async (_event, settings) => {
    if (!instance) throw new Error("Сервер не запущен.");
    return instance.updateStorageSettings(settings);
  });
  ipcMain.handle("server:update-security", async (_event, settings) => {
    if (!instance) throw new Error("Сервер не запущен.");
    return instance.updateSecuritySettings(settings);
  });
  ipcMain.handle("server:open-backups", () => shell.openPath(instance?.status().backupsDir ?? app.getPath("userData")));
  ipcMain.handle("server:export-room", async (_event, roomId) => {
    if (!instance) throw new Error("Сервер не запущен.");
    const data = await instance.exportRoom(roomId);
    const result = await dialog.showSaveDialog(window, {
      title: "Экспорт сообщений комнаты",
      defaultPath: `Nexora-${data.room.slug}-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "Nexora JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), "utf8");
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle("server:copy", (_event, value) => { clipboard.writeText(String(value ?? "")); return true; });
  ipcMain.handle("server:export-certificate", async () => {
    if (!instance?.certificates?.caCertificate) throw new Error("Сертификат ещё не создан.");
    const result = await dialog.showSaveDialog(window, { title: "Сохранить сертификат Nexora", defaultPath: "nexora-local-ca.crt", filters: [{ name: "Certificate", extensions: ["crt"] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.copyFile(instance.certificates.caCertificate, result.filePath);
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle("server:open-certificate", () => instance?.certificates?.caCertificate ? shell.openPath(instance.certificates.caCertificate) : "Сертификат не найден");
  ipcMain.handle("server:open-data-folder", () => shell.openPath(instance?.dataDir ?? app.getPath("userData")));
  ipcMain.handle("server:open-log-file", async () => {
    if (!logFile) logFile = path.join(app.getPath("logs"), "nexora-server.log");
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, "", "utf8");
    shell.showItemInFolder(logFile);
    return logFile;
  });
  ipcMain.handle("server:command", async (_event, command) => { if (!instance?.commandService) throw new Error("Сервер не запущен."); return instance.commandService.execute(command, { actor: "electron-admin" }); });
  ipcMain.handle("server:update-status", () => updateService?.status() ?? { enabled: false, status: "initializing" });
  ipcMain.handle("server:check-update", () => updateService?.check() ?? { enabled: false });
  ipcMain.handle("server:download-update", () => updateService?.download() ?? { enabled: false });
  ipcMain.handle("server:install-update", () => updateService?.install() ?? false);
  createWindow();
  updateService = await createUpdateService({ kind: "server", automatic: false, onEvent: (state) => send("server:update", state) });
  startServer().catch((error) => send("server:log", { level: "error", message: error.message, createdAt: new Date().toISOString() }));
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", (event) => {
  if (instance || starting || stopping) {
    event.preventDefault();
    stopServer()
      .catch((error) => persistLog({ level: "error", message: `Server shutdown failed: ${error?.stack || error}`, createdAt: new Date().toISOString() }))
      .finally(() => app.quit());
  }
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
process.on("unhandledRejection", (error) => persistLog({ level: "error", message: `Unhandled rejection: ${error?.stack || error}`, createdAt: new Date().toISOString() }));
