"use strict";

const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const {
  inspectNexoraServer,
  isAllowedNexoraUrl,
  loadErrorMessage,
  matchesPinnedCertificate,
  normalizeFingerprint,
  normalizeServerUrl,
} = require("./client-connection.cjs");
const { createUpdateService } = require("./update-service.cjs");
const { maybeShowPostUpdate, openTestLogConsole, testModeRequested } = require("./release-experience.cjs");

let mainWindow;
let configFile;
let config = { servers: [], activeServerId: null, legacyUrl: null };
let updateService = null;
let clientLogFile = null;
let activeTrust = null;
let activeClientSession = null;
let currentPartition = null;

const CONNECTOR_PARTITION = "persist:nexora-connector";

function partitionForServer(serverId) {
  if (!serverId) return CONNECTOR_PARTITION;
  const digest = crypto.createHash("sha256").update(String(serverId)).digest("hex").slice(0, 24);
  return `persist:nexora-server-${digest}`;
}

function isActiveServerUrl(value) {
  if (!activeTrust?.url) return false;
  try {
    return new URL(value).origin === new URL(activeTrust.url).origin;
  } catch {
    return false;
  }
}

async function logClient(message, level = "info") {
  try {
    clientLogFile ||= path.join(app.getPath("logs"), "nexora-client.log");
    await fs.mkdir(path.dirname(clientLogFile), { recursive: true });
    await fs.appendFile(clientLogFile, `${new Date().toISOString()} [${level.toUpperCase()}] ${String(message).replace(/[\r\n]+/g, " ")}\n`, "utf8");
  } catch {}
}

function configurePermissions(clientSession) {
  clientSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details = {}) => {
    const requestingUrl = details.requestingUrl || details.securityOrigin || requestingOrigin;
    if (!isActiveServerUrl(requestingUrl)) return false;
    if (permission === "notifications") return true;
    if (permission === "media") return details.mediaType === "audio";
    return false;
  });
  clientSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const trusted = isActiveServerUrl(details.requestingUrl || details.securityOrigin || webContents.getURL());
    if (!trusted) return callback(false);
    if (permission === "notifications") return callback(true);
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    callback(permission === "media" && mediaTypes.length > 0 && mediaTypes.every((type) => type === "audio"));
  });
}

function installCertificateVerifier(clientSession = activeClientSession) {
  if (!clientSession) return;
  clientSession.setCertificateVerifyProc(null);
  clientSession.setCertificateVerifyProc((request, callback) => {
    const trusted = activeTrust && matchesPinnedCertificate([activeTrust], {
      hostname: request.hostname,
      certificate: request.certificate,
    });
    callback(trusted ? 0 : -3);
  });
}

function activateTrust(server = null) {
  activeTrust = server;
  installCertificateVerifier(activeClientSession);
}

function restartIntoPartition() {
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 250);
}

async function loadConfig() {
  configFile = path.join(app.getPath("userData"), "client-config.json");
  try {
    const saved = JSON.parse(await fs.readFile(configFile, "utf8"));
    if (Array.isArray(saved.servers)) {
      const servers = saved.servers.flatMap((item) => {
        try {
          return item?.id && item?.fingerprint ? [{ ...item, url: normalizeServerUrl(item.url) }] : [];
        } catch {
          return [];
        }
      });
      config = { ...config, ...saved, servers };
    } else if (saved.serverUrl) {
      config.legacyUrl = saved.serverUrl;
    }
  } catch {}
}

async function saveConfig() {
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
}

function publicConfig() {
  return {
    activeServerId: config.activeServerId,
    legacyUrl: config.legacyUrl,
    servers: config.servers.map(({ id, url, fingerprint, version, lastConnectedAt }) => ({ id, url, fingerprint, version, lastConnectedAt })),
  };
}

function shellPath() {
  return path.join(__dirname, "client-shell", "index.html");
}

async function showConnector(error = "", address = "") {
  activateTrust(null);
  const values = {};
  if (error) values.error = error;
  if (address) values.address = address;
  const query = Object.keys(values).length ? { query: values } : undefined;
  await mainWindow.loadFile(shellPath(), query);
}

async function connectServer(value, confirmation = null) {
  const url = normalizeServerUrl(value);
  const inspected = await inspectNexoraServer(url, { clientVersion: app.getVersion() });
  const existing = config.servers.find((item) => item.id === inspected.id || item.url === url);
  const changed = Boolean(existing && normalizeFingerprint(existing.fingerprint) !== normalizeFingerprint(inspected.fingerprint));
  if ((!existing || changed) && !confirmation) {
    return { ok: false, requiresConfirmation: true, changed, server: inspected, previousFingerprint: existing?.fingerprint ?? null };
  }
  if (confirmation && (
    confirmation.serverId !== inspected.id
    || normalizeFingerprint(confirmation.fingerprint) !== normalizeFingerprint(inspected.fingerprint)
  )) {
    throw new Error("Сертификат изменился во время подтверждения. Сверьте новый SHA-256 ещё раз.");
  }
  const entry = {
    ...existing,
    ...inspected,
    lastConnectedAt: new Date().toISOString(),
  };
  config.servers = [...config.servers.filter((item) => item.id !== entry.id && item.url !== entry.url), entry];
  config.activeServerId = entry.id;
  config.legacyUrl = null;
  await saveConfig();
  if (currentPartition !== partitionForServer(entry.id)) {
    restartIntoPartition();
    return { ok: true, server: entry, restarting: true };
  }
  activateTrust(entry);
  await mainWindow.loadURL(url);
  return { ok: true, server: entry };
}

async function forgetServer(serverId) {
  config.servers = config.servers.filter((item) => item.id !== serverId);
  if (config.activeServerId === serverId) config.activeServerId = null;
  await saveConfig();
  if (activeTrust?.id === serverId) activateTrust(null);
  if (!config.activeServerId && currentPartition !== CONNECTOR_PARTITION) {
    restartIntoPartition();
    return publicConfig();
  }
  await showConnector();
  return publicConfig();
}

function createWindow() {
  const active = config.servers.find((item) => item.id === config.activeServerId);
  currentPartition = partitionForServer(active?.id);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#050308",
    title: "Nexora",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#08050d", symbolColor: "#c69cff", height: 36 },
    webPreferences: {
      preload: path.join(__dirname, "client-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: currentPartition,
    },
  });
  activeClientSession = mainWindow.webContents.session;
  configurePermissions(activeClientSession);
  installCertificateVerifier(activeClientSession);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith("file:")) {
      logClient(`did-fail-load ${url}: ${description} (${code})`, "error");
      showConnector(loadErrorMessage(code, description, url), url);
    }
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => logClient(`render-process-gone: ${details.reason} (${details.exitCode})`, "error"));
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const normalizedLevel = ["warn", "error"].includes(String(level)) ? String(level) : "info";
    logClient(`renderer ${sourceId || "unknown"}:${line || 0} ${message}`, normalizedLevel);
  });
  showConnector("", active?.url || "").then(async () => {
    if (!active) return;
    try {
      const result = await connectServer(active.url);
      if (result?.requiresConfirmation) await showConnector("Сертификат сохранённого сервера изменился. Нажмите на сервер и заново сверьте SHA-256.", active.url);
    } catch (error) {
      await showConnector(error.message, active.url);
    }
  });
}

app.on("certificate-error", (event, _webContents, url, _error, certificate, callback) => {
  if (_webContents === mainWindow?.webContents && activeTrust && matchesPinnedCertificate([activeTrust], { url, certificate })) {
    event.preventDefault();
    callback(true);
    return;
  }
  callback(false);
});

function requireConnector(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  try {
    if (new URL(senderUrl).protocol === "file:") return;
  } catch {}
  throw new Error("Эта операция доступна только в окне подключения Nexora.");
}

function requireNexoraWindow(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  try {
    if (new URL(senderUrl).protocol === "file:" || isActiveServerUrl(senderUrl)) return;
  } catch {}
  throw new Error("Недоверенное окно не может управлять Nexora Client.");
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.nexora.client");
  await loadConfig();
  ipcMain.handle("client:connect", (event, { url, confirmation }) => { requireConnector(event); return connectServer(url, confirmation || null); });
  ipcMain.handle("client:forget-server", (event, serverId) => { requireConnector(event); return forgetServer(serverId); });
  ipcMain.handle("client:get-config", (event) => { requireConnector(event); return publicConfig(); });
  ipcMain.handle("client:show-connector", (event) => { requireNexoraWindow(event); return showConnector(); });
  ipcMain.handle("client:update-status", () => updateService?.status() ?? { enabled: false, status: "initializing" });
  ipcMain.handle("client:check-update", () => updateService?.check() ?? { enabled: false });
  ipcMain.handle("client:install-update", () => updateService?.install() ?? false);
  ipcMain.on("client:renderer-error", (event, report = {}) => {
    requireNexoraWindow(event);
    const message = String(report.message || "Unknown renderer error").replace(/[\r\n]+/g, " ").slice(0, 500);
    const componentStack = String(report.componentStack || "").replace(/[\r\n]+/g, " ").slice(0, 4_000);
    logClient(`renderer-error: ${message} ${componentStack}`, "error");
  });
  updateService = await createUpdateService({
    kind: "client",
    automatic: true,
    log: logClient,
    onEvent: async (state) => {
      logClient("update " + state.status + (state.availableVersion ? " " + state.availableVersion : ""), state.status === "error" ? "error" : "info");
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("client:update", state);
      if (state.status === "downloaded" && mainWindow && !mainWindow.isDestroyed()) {
        const result = await dialog.showMessageBox(mainWindow, { type: "info", title: "Обновление Nexora", message: "Nexora " + state.availableVersion + " готова к установке.", buttons: ["Перезапустить и установить", "Позже"], defaultId: 0, cancelId: 1 });
        if (result.response === 0) updateService.install();
      }
    },
  });
  createWindow();
  updateService.start();
  await logClient("Client " + app.getVersion() + " started" + (testModeRequested() ? " in test mode" : ""));
  if (testModeRequested() && process.platform === "win32") openTestLogConsole({ logFile: clientLogFile || path.join(app.getPath("logs"), "nexora-client.log") });
  setTimeout(() => maybeShowPostUpdate({ appImpl: app, dialogImpl: dialog, shellImpl: shell, log: logClient }).catch((error) => logClient("Post-update dialog failed: " + (error?.stack || error), "error")), 900);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => updateService?.stop());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
process.on("unhandledRejection", (error) => logClient(`unhandledRejection: ${error?.stack || error}`, "error"));
