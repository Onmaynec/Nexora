"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflowPath = ".github/workflows/apply-3.2.4.yml";
const selfPath = "scripts/apply-3.2.4-patch.cjs";
const version = "3.2.4";

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function write(relativePath, content) {
  const file = absolute(relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`updated ${relativePath}`);
}

function replace(relativePath, pattern, replacement, label = String(pattern)) {
  const before = read(relativePath);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`Patch did not match ${relativePath}: ${label}`);
  write(relativePath, after);
}

function replaceAllChecked(relativePath, pattern, replacement, minimum, label = String(pattern)) {
  const before = read(relativePath);
  const matches = before.match(pattern) || [];
  if (matches.length < minimum) throw new Error(`Expected at least ${minimum} matches in ${relativePath}: ${label}; found ${matches.length}`);
  write(relativePath, before.replace(pattern, replacement));
}

function updateJson(relativePath, mutator) {
  const value = JSON.parse(read(relativePath));
  mutator(value);
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBmp(relativePath, width, height, pixel) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write("BM", 0, 2, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, sourceY, width, height);
      const offset = 54 + y * rowSize + x * 3;
      buffer[offset] = b;
      buffer[offset + 1] = g;
      buffer[offset + 2] = r;
    }
  }
  write(relativePath, buffer);
}

updateJson("package.json", (pkg) => {
  pkg.version = version;
  pkg.scripts["client:test-mode"] = "electron electron/client-main.cjs --test-mode";
});
updateJson("package-lock.json", (lock) => {
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
});
replace("android/app/build.gradle.kts", /versionCode\s*=\s*\d+/, "versionCode = 30204", "Android versionCode");
replace("android/app/build.gradle.kts", /versionName\s*=\s*"[^"]+"/, `versionName = "${version}"`, "Android versionName");
replace("client/src/api.js", /export const CLIENT_VERSION = "[^"]+";/, `export const CLIENT_VERSION = "${version}";`, "CLIENT_VERSION");

write("electron/update-service.cjs", `"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { app } = require("electron");

const DEFAULT_GITHUB_RELEASES = Object.freeze({
  provider: "github",
  owner: "Onmaynec",
  repo: "Nexora",
  private: false,
});
const DEFAULT_INITIAL_DELAY_MS = 8_000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60_000;
let defaultUpdater = null;

function loadDefaultUpdater() {
  defaultUpdater ||= require("electron-updater").autoUpdater;
  return defaultUpdater;
}

async function configuredFeed(kind, appImpl = app, fsImpl = fs) {
  const environmentName = kind === "client" ? "NEXORA_CLIENT_UPDATE_URL" : "NEXORA_SERVER_UPDATE_URL";
  if (process.env[environmentName]) return String(process.env[environmentName]).trim();
  try {
    const value = JSON.parse(await fsImpl.readFile(path.join(appImpl.getPath("userData"), "update-config.json"), "utf8"));
    return String(value[\`${"${kind}"}FeedUrl\`] || "").trim();
  } catch {
    return "";
  }
}

async function configuredProvider(kind, appImpl = app, fsImpl = fs) {
  const feedUrl = await configuredFeed(kind, appImpl, fsImpl);
  if (feedUrl) {
    if (!/^https:\/\//i.test(feedUrl)) return null;
    return { provider: "generic", url: feedUrl };
  }
  if (kind !== "client") return null;
  return {
    ...DEFAULT_GITHUB_RELEASES,
    owner: String(process.env.NEXORA_GITHUB_OWNER || DEFAULT_GITHUB_RELEASES.owner),
    repo: String(process.env.NEXORA_GITHUB_REPO || DEFAULT_GITHUB_RELEASES.repo),
  };
}

function numericVersion(value) {
  const match = /^(\\d+)\\.(\\d+)\\.(\\d+)(?:[-+].*)?$/.exec(String(value || "").trim());
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(candidate, current) {
  const left = numericVersion(candidate);
  const right = numericVersion(current);
  if (!left || !right) return String(candidate || "") !== String(current || "");
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

function normalizedUpdateError(error) {
  const message = String(error?.message || error || "Ошибка обновления");
  if (/latest\\.yml|404|no published versions|cannot find latest|no releases found/i.test(message)) {
    return {
      reason: "no_installable_update",
      error: "В GitHub пока нет подписанного устанавливаемого обновления для этого канала.",
    };
  }
  if (/net::ERR_|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(message)) {
    return { reason: "network_error", error: "Не удалось связаться с каналом обновлений. Проверьте интернет и повторите попытку." };
  }
  return { reason: "update_error", error: message };
}

function disabledService(state, reason) {
  const snapshot = () => ({ ...state, reason });
  return {
    status: snapshot,
    check: async () => snapshot(),
    download: async () => snapshot(),
    install: () => false,
    start: () => snapshot(),
    stop: () => {},
  };
}

async function createUpdateService({
  kind,
  automatic = false,
  onEvent = () => {},
  log = () => {},
  appImpl = app,
  updater = null,
  fsImpl = fs,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  if (!appImpl || typeof appImpl.getVersion !== "function") throw new Error("Electron app adapter is unavailable.");
  let state = {
    enabled: false,
    status: "disabled",
    currentVersion: appImpl.getVersion(),
    availableVersion: null,
    progress: 0,
    error: null,
    reason: null,
    automatic: Boolean(automatic),
    lastCheckedAt: null,
    nextCheckAt: null,
    detailsUrl: kind === "client" ? "https://github.com/Onmaynec/Nexora/releases/latest" : null,
  };
  let timer = null;
  let stopped = false;
  let inFlight = null;
  const listeners = [];

  const emit = (patch) => {
    state = { ...state, ...patch };
    onEvent({ ...state });
    return { ...state };
  };

  if (!appImpl.isPackaged) return disabledService(state, "development");
  const provider = await configuredProvider(kind, appImpl, fsImpl);
  if (!provider) return disabledService(state, "feed_not_configured");
  const activeUpdater = updater || loadDefaultUpdater();
  const listen = (event, handler) => {
    activeUpdater.on(event, handler);
    listeners.push([event, handler]);
  };

  activeUpdater.autoDownload = Boolean(automatic);
  activeUpdater.autoInstallOnAppQuit = Boolean(automatic);
  activeUpdater.allowPrerelease = false;
  activeUpdater.allowDowngrade = false;
  activeUpdater.setFeedURL(provider);
  emit({ enabled: true, status: "idle", provider: provider.provider, channel: provider.provider === "github" ? `${"${provider.owner}"}/${"${provider.repo}"}` : provider.url });

  listen("checking-for-update", () => emit({ status: "checking", error: null, reason: null }));
  listen("update-available", (info) => emit({ status: automatic ? "downloading" : "available", availableVersion: info.version, reason: null }));
  listen("update-not-available", () => emit({ status: "current", availableVersion: null, progress: 0, reason: null }));
  listen("download-progress", (progress) => emit({ status: "downloading", progress: Math.round(progress.percent || 0) }));
  listen("update-downloaded", (info) => emit({ status: "downloaded", availableVersion: info.version, progress: 100, reason: null }));
  listen("error", (error) => {
    log(`Updater error: ${"${error?.stack || error}"}`, "error");
    emit({ status: "error", ...normalizedUpdateError(error) });
  });

  function schedule(delay) {
    if (stopped || !automatic) return;
    if (timer) clearTimeoutImpl(timer);
    const bounded = Math.max(1_000, Math.min(24 * 60 * 60_000, Number(delay) || DEFAULT_INTERVAL_MS));
    emit({ nextCheckAt: new Date(Date.now() + bounded).toISOString() });
    timer = setTimeoutImpl(async () => {
      timer = null;
      try { await check(); }
      finally { schedule(intervalMs); }
    }, bounded);
  }

  async function check() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      emit({ status: "checking", error: null, reason: null, lastCheckedAt: new Date().toISOString() });
      try {
        const result = await activeUpdater.checkForUpdates();
        if (state.status === "checking") {
          const candidate = result?.updateInfo?.version;
          emit(candidate && isNewerVersion(candidate, state.currentVersion)
            ? { status: automatic ? "downloading" : "available", availableVersion: candidate, reason: null }
            : { status: "current", availableVersion: null, progress: 0, reason: null });
        }
      } catch (error) {
        log(`Update check failed: ${"${error?.stack || error}"}`, "error");
        emit({ status: "error", ...normalizedUpdateError(error) });
      } finally {
        inFlight = null;
      }
      return { ...state };
    })();
    return inFlight;
  }

  return {
    status: () => ({ ...state }),
    check,
    download: async () => {
      try { await activeUpdater.downloadUpdate(); }
      catch (error) {
        log(`Update download failed: ${"${error?.stack || error}"}`, "error");
        emit({ status: "error", ...normalizedUpdateError(error) });
      }
      return { ...state };
    },
    install: () => {
      if (state.status !== "downloaded") return false;
      activeUpdater.quitAndInstall(false, true);
      return true;
    },
    start: () => {
      stopped = false;
      if (automatic && !timer) schedule(initialDelayMs);
      return { ...state };
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeoutImpl(timer);
      timer = null;
      for (const [event, handler] of listeners) activeUpdater.off(event, handler);
      listeners.length = 0;
    },
  };
}

module.exports = {
  DEFAULT_GITHUB_RELEASES,
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_INTERVAL_MS,
  configuredFeed,
  configuredProvider,
  createUpdateService,
  isNewerVersion,
  loadDefaultUpdater,
  normalizedUpdateError,
};
`);

write("electron/release-experience.cjs", `"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const RELEASE_SUMMARIES = Object.freeze({
  "3.2.4": "Исправлены автоматические и ручные обновления, команды консоли сервера и автоматическая доставка MLS Welcome. Добавлены журнал тестового режима, окно после обновления и обновлённый установщик.",
});

function testModeRequested(argv = process.argv) {
  return argv.includes("--test-mode") || process.env.NEXORA_CLIENT_TEST_MODE === "1";
}

async function readState(appImpl, fsImpl = fs) {
  const file = path.join(appImpl.getPath("userData"), "release-experience.json");
  try { return { file, value: JSON.parse(await fsImpl.readFile(file, "utf8")) }; }
  catch { return { file, value: {} }; }
}

async function writeState(file, value, fsImpl = fs) {
  await fsImpl.mkdir(path.dirname(file), { recursive: true });
  await fsImpl.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

async function maybeShowPostUpdate({ appImpl, dialogImpl, shellImpl, log = () => {}, fsImpl = fs } = {}) {
  const currentVersion = appImpl.getVersion();
  const { file, value } = await readState(appImpl, fsImpl);
  if (!value.lastVersion) {
    await writeState(file, { ...value, lastVersion: currentVersion }, fsImpl);
    return { shown: false, firstInstall: true };
  }
  if (value.lastVersion !== currentVersion) {
    value.lastVersion = currentVersion;
    value.pendingNotesVersion = currentVersion;
    await writeState(file, value, fsImpl);
  }
  if (value.pendingNotesVersion !== currentVersion) return { shown: false };
  const summary = RELEASE_SUMMARIES[currentVersion] || "Nexora обновлена. Откройте страницу релиза, чтобы посмотреть полный список изменений.";
  const result = await dialogImpl.showMessageBox({
    type: "info",
    title: `Nexora ${"${currentVersion}"}`,
    message: `Nexora обновлена до версии ${"${currentVersion}"}`,
    detail: summary,
    buttons: ["Подробнее", "Закрыть"],
    defaultId: 1,
    cancelId: 1,
    checkboxLabel: "Не показывать снова",
    checkboxChecked: false,
    noLink: true,
  });
  if (result.response === 0) await shellImpl.openExternal(`https://github.com/Onmaynec/Nexora/releases/tag/v${"${currentVersion}"}`);
  if (result.checkboxChecked) {
    value.pendingNotesVersion = null;
    value.dismissedNotesVersion = currentVersion;
    await writeState(file, value, fsImpl);
  }
  log(`Post-update notes displayed for ${"${currentVersion}"}`, "info");
  return { shown: true, openedDetails: result.response === 0, dismissed: Boolean(result.checkboxChecked) };
}

function powershellLiteral(value) {
  return `'${"${String(value).replace(/'/g, "''")}"}'`;
}

function openTestLogConsole({ logFile, spawnImpl = spawn } = {}) {
  const script = [
    "$Host.UI.RawUI.WindowTitle = 'Nexora Client - Test Mode'",
    "Write-Host 'Nexora Client test mode. Close this window to stop viewing the log.' -ForegroundColor Magenta",
    `if (!(Test-Path -LiteralPath ${"${powershellLiteral(logFile)}"})) { New-Item -ItemType File -Force -Path ${"${powershellLiteral(logFile)}"} | Out-Null }`,
    `Get-Content -LiteralPath ${"${powershellLiteral(logFile)}"} -Tail 200 -Wait`,
  ].join("; ");
  const child = spawnImpl("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", script], {
    detached: true,
    windowsHide: false,
    stdio: "ignore",
  });
  child.unref?.();
  return child;
}

module.exports = { RELEASE_SUMMARIES, maybeShowPostUpdate, openTestLogConsole, testModeRequested };
`);

replace("electron/client-main.cjs", "const { createUpdateService } = require(\"./update-service.cjs\");", "const { createUpdateService } = require(\"./update-service.cjs\");\nconst { maybeShowPostUpdate, openTestLogConsole, testModeRequested } = require(\"./release-experience.cjs\");", "client release experience import");
replace("electron/client-main.cjs", "  mainWindow.webContents.on(\"render-process-gone\", (_event, details) => logClient(`render-process-gone: ${details.reason} (${details.exitCode})`, \"error\"));", "  mainWindow.webContents.on(\"render-process-gone\", (_event, details) => logClient(`render-process-gone: ${details.reason} (${details.exitCode})`, \"error\"));\n  mainWindow.webContents.on(\"console-message\", (_event, level, message, line, sourceId) => {\n    const normalizedLevel = [\"warn\", \"error\"].includes(String(level)) ? String(level) : \"info\";\n    logClient(`renderer ${sourceId || \"unknown\"}:${line || 0} ${message}`, normalizedLevel);\n  });", "renderer logging");
replace("electron/client-main.cjs", /  createWindow\(\);\n  updateService = await createUpdateService\(\{[\s\S]*?\n  updateService\.start\(\);/, `  updateService = await createUpdateService({
    kind: "client",
    automatic: true,
    log: logClient,
    onEvent: async (state) => {
      logClient(\`update ${"${state.status}"}${"${state.availableVersion ? ` ${state.availableVersion}` : ""}"}\`, state.status === "error" ? "error" : "info");
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("client:update", state);
      if (state.status === "downloaded" && mainWindow && !mainWindow.isDestroyed()) {
        const result = await dialog.showMessageBox(mainWindow, { type: "info", title: "Обновление Nexora", message: \`Nexora ${"${state.availableVersion}"} готова к установке.\`, buttons: ["Перезапустить и установить", "Позже"], defaultId: 0, cancelId: 1 });
        if (result.response === 0) updateService.install();
      }
    },
  });
  createWindow();
  updateService.start();
  await logClient(\`Client ${"${app.getVersion()}"} started${"${testModeRequested() ? " in test mode" : ""}"}\`);
  if (testModeRequested() && process.platform === "win32") openTestLogConsole({ logFile: clientLogFile || path.join(app.getPath("logs"), "nexora-client.log") });
  setTimeout(() => maybeShowPostUpdate({ appImpl: app, dialogImpl: dialog, shellImpl: shell, log: logClient }).catch((error) => logClient(\`Post-update dialog failed: ${"${error?.stack || error}"}\`, "error")), 900);`, "client updater initialization order");

replace("electron/server-main.cjs", "  ipcMain.handle(\"server:command\", async (_event, command) => { if (!instance?.commandService) throw new Error(\"Сервер не запущен.\"); return instance.commandService.execute(command, { actor: \"electron-admin\" }); });", `  ipcMain.handle("server:command", async (_event, command) => {
    if (!instance?.commandService) return { ok: false, error: { code: "SERVER_NOT_RUNNING", message: "Сервер не запущен." } };
    try { return await instance.commandService.execute(command, { actor: "electron-admin" }); }
    catch (error) { return { ok: false, error: { code: String(error?.code || "COMMAND_FAILED"), message: String(error?.message || "Команда не выполнена.") } }; }
  });`, "structured server command errors");
replace("electron/server-main.cjs", /  createWindow\(\);\n  updateService = await createUpdateService\(\{ kind: "server", automatic: false, onEvent: \(state\) => send\("server:update", state\) \}\);/, `  updateService = await createUpdateService({ kind: "server", automatic: false, log: (message, level = "info") => persistLog({ message, level, createdAt: new Date().toISOString() }), onEvent: (state) => send("server:update", state) });
  createWindow();`, "server updater initialization order");
replace("electron/server-shell/renderer.js", "  try { appendCommandResult(value, await window.nexoraServer.runCommand(value)); }\n  catch (error) { appendCommandResult(value, null, error); }", `  try {
    const result = await window.nexoraServer.runCommand(value);
    if (result?.ok === false) appendCommandResult(value, null, result.error || { code: "COMMAND_FAILED", message: "Команда не выполнена." });
    else appendCommandResult(value, result);
  } catch (error) { appendCommandResult(value, null, { code: error.code || "IPC_FAILED", message: error.message || "Не удалось вызвать команду." }); }`, "command renderer structured error");

replace("server/developer-commands.cjs", "function compactStatus(status) {", `function unwrapPlaceholder(value) {
  const normalized = String(value ?? "").trim();
  const match = /^(?:<([^<>]+)>|\\[([^\\[\\]]+)\\])$/.exec(normalized);
  return String(match?.[1] || match?.[2] || normalized).trim();
}

function compactStatus(status) {`, "placeholder helper");
replace("server/developer-commands.cjs", "        output: \"help | status | health | users list | rooms list | backup create [passphrase] | storage cleanup | read-only on|off | pulse sandbox on|off | pulse user <user> | plus grant <user> [days] | plus revoke <user> | impulses grant|revoke <user> <amount> [reason] | audit tail [count]\",", "        output: \"Команды: help | status | health | users list | rooms list | backup create [passphrase] | storage cleanup | read-only on|off | pulse sandbox on|off | pulse user <user> | plus grant <user> [days] | plus revoke <user> | impulses grant|revoke <user> <amount> [reason] | audit tail [count]\\nПример: plus grant netrox 30. Символы < > и [ ] в справке обозначают параметры; если вставить их буквально, консоль 3.2.4 безопасно удалит оболочку.\",", "command help");
replaceAllChecked("server/developer-commands.cjs", /this\.pulseSandbox\.overview\(args\[0\]\)/g, "this.pulseSandbox.overview(unwrapPlaceholder(args[0]))", 1, "pulse user normalization");
replace("server/developer-commands.cjs", "? { data: await this.pulseSandbox.grantPlus(args[0], { days: args[1], actor }), output: \"Тестовая подписка Plus выдана.\" }\n        : { data: await this.pulseSandbox.revokePlus(args[0], { actor }), output: \"Тестовая подписка Plus отозвана.\" };", `? { data: await this.pulseSandbox.grantPlus(unwrapPlaceholder(args[0]), { days: unwrapPlaceholder(args[1]), actor }), output: "Тестовая подписка Plus выдана." }
        : { data: await this.pulseSandbox.revokePlus(unwrapPlaceholder(args[0]), { actor }), output: "Тестовая подписка Plus отозвана." };`, "plus normalization");
replace("server/developer-commands.cjs", "      const amount = Math.abs(Math.trunc(Number(args[1])));", "      const amount = Math.abs(Math.trunc(Number(unwrapPlaceholder(args[1]))));", "impulses amount normalization");
replace("server/developer-commands.cjs", "      result = { data: await this.pulseSandbox.adjustImpulses(args[0], delta, { actor, reason: args.slice(2).join(\" \") || \"operator_adjustment\" }), output: action === \"grant\" ? \"Импульсы выданы.\" : \"Импульсы изъяты.\" };", "      result = { data: await this.pulseSandbox.adjustImpulses(unwrapPlaceholder(args[0]), delta, { actor, reason: args.slice(2).map(unwrapPlaceholder).join(\" \") || \"operator_adjustment\" }), output: action === \"grant\" ? \"Импульсы выданы.\" : \"Импульсы изъяты.\" };", "impulses user normalization");
replace("server/developer-commands.cjs", "  splitCommandLine,\n};", "  splitCommandLine,\n  unwrapPlaceholder,\n};", "placeholder export");
replace("server/pulse-sandbox-service.cjs", "  const value = String(reference || \"\").trim().replace(/^@/, \"\").toLowerCase();", "  const value = String(reference || \"\").trim().replace(/^(?:<|\\[)/, \"\").replace(/(?:>|\\])$/, \"\").replace(/^@/, \"\").toLowerCase();", "Pulse user normalization");

write("server/mls-welcome-recovery.cjs", `"use strict";

const { TrustCoreError } = require("./trust-core.cjs");

function requestMlsWelcome({ trustCore, userId, deviceId, conversationId, emit } = {}) {
  if (!trustCore || typeof emit !== "function") throw new Error("MLS Welcome recovery requires Trust Core and emitter.");
  const requester = trustCore.requireDevice(userId, deviceId, { verified: true });
  const group = trustCore.getGroupByConversation(conversationId);
  if (!group) throw new TrustCoreError("MLS group не найден.", "MLS_GROUP_NOT_FOUND", 404);
  const existing = (group.members || []).find((member) => member.deviceId === requester.id && member.status === "active");
  if (existing) return { requested: false, reason: "already_member", groupId: group.id, recipients: 0 };
  const recipients = emit({
    conversationId: group.conversationId,
    groupId: group.id,
    requesterUserId: requester.userId,
    requesterDeviceId: requester.id,
    requestedAt: new Date().toISOString(),
  }) || [];
  return { requested: true, groupId: group.id, recipients: Array.isArray(recipients) ? recipients.length : Number(recipients) || 0 };
}

module.exports = { requestMlsWelcome };
`);
replace("server/trust-routes.cjs", "const { createSlidingWindowRateLimiter } = require(\"./rate-limit.cjs\");", "const { createSlidingWindowRateLimiter } = require(\"./rate-limit.cjs\");\nconst { requestMlsWelcome } = require(\"./mls-welcome-recovery.cjs\");", "welcome recovery import");
replace("server/trust-routes.cjs", "  function emitConversation(conversationId, type, payload) {\n    emitToVerifiedGroupDevices(io, store.db, { conversationId }, type, payload);\n    emitToVerifiedGroupDevices(io, store.db, { conversationId }, \"trust:event\", { type, payload });\n  }", `  function emitConversation(conversationId, type, payload) {
    const recipients = emitToVerifiedGroupDevices(io, store.db, { conversationId }, type, payload);
    emitToVerifiedGroupDevices(io, store.db, { conversationId }, "trust:event", { type, payload });
    return recipients;
  }`, "emitConversation return recipients");
replace("server/trust-routes.cjs", "  app.get(\"/api/v4/trust/conversations/:conversationId/group\", asyncRoute(async (request, response) => {", `  app.post("/api/v4/trust/conversations/:conversationId/welcome/request", asyncRoute(async (request, response) => {
    const { conversation } = requireConversation(request.trustAuth.user.id, request.params.conversationId);
    const requesterDeviceId = deviceId(request);
    enforceRateLimit(trustRateLimits.recovery, \`welcome-request:${"${request.trustAuth.user.id}"}:${"${requesterDeviceId}"}\`, response, "Слишком много запросов MLS Welcome.");
    const result = requestMlsWelcome({
      trustCore,
      userId: request.trustAuth.user.id,
      deviceId: requesterDeviceId,
      conversationId: conversation.id,
      emit: (payload) => emitConversation(conversation.id, "mls.welcome_requested", payload),
    });
    response.status(result.requested ? 202 : 200).json({ ok: true, requestId: request.trustRequestId, ...result });
  }));

  app.get("/api/v4/trust/conversations/:conversationId/group", asyncRoute(async (request, response) => {`, "welcome request route");

replace("client/src/crypto/trust-client.js", "const DEVICE_KEY_PACKAGE_TARGET = 8;", "const DEVICE_KEY_PACKAGE_TARGET = 8;\nconst WELCOME_POLL_INTERVAL_MS = 500;\nconst WELCOME_POLL_TIMEOUT_MS = 10_000;", "welcome polling constants");
replace("client/src/crypto/trust-client.js", "function current() {", "function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }\n\nfunction current() {", "delay helper");
replace("client/src/crypto/trust-client.js", "async function claimWelcome(device, conversationId) {", "async function claimWelcome(device, conversationId) {", "claimWelcome anchor");
replace("client/src/crypto/trust-client.js", "  return loadLocalGroup(result.welcome.conversationId);\n}\n\nfunction participantIds", `  return loadLocalGroup(result.welcome.conversationId);
}

async function requestWelcomeAndWait(device, conversationId) {
  await trustApi(\`/conversations/${"${encodeURIComponent(conversationId)}"}/welcome/request\`, { method: "POST", deviceId: device.id, body: {} });
  const deadline = Date.now() + WELCOME_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(WELCOME_POLL_INTERVAL_MS);
    try {
      const joined = await claimWelcome(device, conversationId);
      if (joined) return joined;
    } catch (error) {
      if (!["MLS_WELCOME_NO_MATCHING_KEY_PACKAGE", "MLS_WELCOME_RACE"].includes(error.code || error.message)) throw error;
    }
  }
  return null;
}

function participantIds`, "welcome request helper");
replace("client/src/crypto/trust-client.js", "    const joined = await claimWelcome(device, conversation.id);\n    local = joined || await loadLocalGroup(conversation.id);", "    const joined = await claimWelcome(device, conversation.id);\n    local = joined || await loadLocalGroup(conversation.id) || await requestWelcomeAndWait(device, conversation.id);", "automatic welcome recovery");
replace("client/src/crypto/trust-client.js", "export function ensureConversationGroup(conversation) {\n  return serializeConversationOperation(conversation.id, () => ensureConversationGroupInternal(conversation));\n}\n", `export function ensureConversationGroup(conversation) {
  return serializeConversationOperation(conversation.id, () => ensureConversationGroupInternal(conversation));
}

export async function handleWelcomeRequest(conversation) {
  if (!conversation?.id) return false;
  try {
    await ensureConversationGroup(conversation);
    return true;
  } catch (error) {
    if (["MLS_WELCOME_PENDING", "MLS_STATE_LOST"].includes(error.code)) return false;
    throw error;
  }
}
`, "welcome request handler export");

replace("client/src/App.jsx", "import { configureTrust, ensureTrustDevice, handleTrustDeviceRevoked, processCommitEvent } from \"./crypto/trust-client\";", "import { configureTrust, ensureTrustDevice, handleTrustDeviceRevoked, handleWelcomeRequest, processCommitEvent } from \"./crypto/trust-client\";", "App welcome import");
replace("client/src/App.jsx", "    const onMlsCommit = (event) => {", `    const onWelcomeRequested = (event) => {
      if (!event?.conversationId || String(event.requesterDeviceId || "") === String(deviceId)) return;
      const conversation = bootstrapRef.current?.conversations?.find((item) => item.id === event.conversationId);
      if (!conversation) return;
      handleWelcomeRequest(conversation)
        .then((changed) => { if (changed) scheduleRefresh(); })
        .catch((error) => showToast(error.message || "Не удалось подготовить MLS Welcome", "error"));
    };
    const onMlsCommit = (event) => {`, "App welcome listener");
replace("client/src/App.jsx", "    socket.on(\"mls.commit\", onMlsCommit);", "    socket.on(\"mls.commit\", onMlsCommit);\n    socket.on(\"mls.welcome_requested\", onWelcomeRequested);", "socket welcome on");
replace("client/src/App.jsx", "      socket.off(\"mls.commit\", onMlsCommit);", "      socket.off(\"mls.commit\", onMlsCommit);\n      socket.off(\"mls.welcome_requested\", onWelcomeRequested);", "socket welcome off");

replace("electron-builder.client.yml", "  - electron/update-service.cjs\n  - package.json", "  - electron/update-service.cjs\n  - electron/release-experience.cjs\n  - package.json", "client packaged release module");
replace("electron-builder.client.yml", "extraMetadata:\n  main: electron/client-main.cjs", "extraResources:\n  - from: build/Nexora-Client-Test-Mode.cmd\n    to: Nexora-Client-Test-Mode.cmd\nextraMetadata:\n  main: electron/client-main.cjs", "test launcher resource");
replace("electron-builder.client.yml", "nsis:\n  oneClick: false", "nsis:\n  oneClick: false\n  installerIcon: build/icon.ico\n  uninstallerIcon: build/icon.ico\n  installerHeaderIcon: build/icon.ico\n  installerSidebar: build/installerSidebar.bmp\n  uninstallerSidebar: build/installerSidebar.bmp\n  include: build/installer.nsh\n  installerLanguages:\n    - ru_RU", "branded client installer");
replace("electron-builder.server.yml", "nsis:\n  oneClick: false", "nsis:\n  oneClick: false\n  installerIcon: build/icon.ico\n  uninstallerIcon: build/icon.ico\n  installerHeaderIcon: build/icon.ico\n  installerSidebar: build/installerSidebar.bmp\n  uninstallerSidebar: build/installerSidebar.bmp\n  installerLanguages:\n    - ru_RU", "branded server installer");
write("build/installer.nsh", `!macro customInstall
  CreateShortCut "$SMPROGRAMS\\Nexora Client (Test Mode).lnk" "$INSTDIR\\${"${APP_EXECUTABLE_FILENAME}"}" "--test-mode" "$INSTDIR\\${"${APP_EXECUTABLE_FILENAME}"}" 0 SW_SHOWNORMAL "" "Nexora Client с консолью журнала"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\\Nexora Client (Test Mode).lnk"
!macroend
`);
write("build/Nexora-Client-Test-Mode.cmd", `@echo off\r\nset "NEXORA_CLIENT_TEST_MODE=1"\r\nstart "Nexora Client Test Mode" "%~dp0..\\Nexora Client.exe" --test-mode\r\n`);
writeBmp("build/installerSidebar.bmp", 164, 314, (x, y, width, height) => {
  const t = y / Math.max(1, height - 1);
  let r = Math.round(8 + 12 * t);
  let g = Math.round(4 + 5 * t);
  let b = Math.round(18 + 30 * t);
  const glowX = x - width * 0.30;
  const glowY = y - height * 0.24;
  const glow = Math.max(0, 1 - Math.sqrt(glowX * glowX + glowY * glowY) / 145);
  r = Math.min(255, r + Math.round(86 * glow));
  g = Math.min(255, g + Math.round(28 * glow));
  b = Math.min(255, b + Math.round(125 * glow));
  const barBase = height - 92;
  if (x >= 20 && x <= 27 && y >= barBase + 28 && y <= barBase + 52) return [174, 92, 255];
  if (x >= 32 && x <= 39 && y >= barBase + 16 && y <= barBase + 52) return [205, 141, 255];
  if (x >= 44 && x <= 51 && y >= barBase && y <= barBase + 52) return [143, 73, 232];
  if (y > height - 28 && x > 16 && x < width - 16) return [18, 10, 31];
  return [r, g, b];
});

replace("test/update-service.test.cjs", "const { createUpdateService, normalizedUpdateError } = require(\"../electron/update-service.cjs\");", "const { createUpdateService, isNewerVersion, normalizedUpdateError } = require(\"../electron/update-service.cjs\");", "update test import");
replace("test/update-service.test.cjs", "  assert.deepEqual(normalizedUpdateError(new Error(\"Cannot find latest.yml: 404\")), {\n    reason: \"no_installable_update\",\n    error: \"Для выбранного канала пока нет подписанного устанавливаемого обновления.\",\n  });", "  assert.deepEqual(normalizedUpdateError(new Error(\"Cannot find latest.yml: 404\")), {\n    reason: \"no_installable_update\",\n    error: \"В GitHub пока нет подписанного устанавливаемого обновления для этого канала.\",\n  });\n});\n\ntest(\"manual check falls back to returned updateInfo when updater emits no event\", async () => {\n  const updater = new FakeUpdater();\n  updater.checkForUpdates = async () => ({ updateInfo: { version: \"3.2.4\" } });\n  const service = await createUpdateService({ kind: \"client\", appImpl, updater, fsImpl });\n  const state = await service.check();\n  assert.equal(state.status, \"available\");\n  assert.equal(state.availableVersion, \"3.2.4\");\n});\n\ntest(\"semantic update comparison rejects downgrades\", () => {\n  assert.equal(isNewerVersion(\"3.2.4\", \"3.2.3\"), true);\n  assert.equal(isNewerVersion(\"3.2.3\", \"3.2.4\"), false);\n  assert.equal(isNewerVersion(\"3.2.4\", \"3.2.4\"), false);", "update regression tests");

replace("test/developer-commands.test.cjs", "const { DeveloperCommandService, splitCommandLine } = require(\"../server/developer-commands.cjs\");", "const { DeveloperCommandService, splitCommandLine, unwrapPlaceholder } = require(\"../server/developer-commands.cjs\");", "developer test import");
replace("test/developer-commands.test.cjs", "  return { state, service: new DeveloperCommandService({ instance, store }) };", `  const pulseCalls = [];
  const pulseSandbox = {
    grantPlus: async (user, options) => { pulseCalls.push({ type: "grant", user, options }); return { user }; },
    revokePlus: async (user, options) => { pulseCalls.push({ type: "revoke", user, options }); return { user }; },
    overview: (user) => ({ user }), transactions: () => [],
    adjustImpulses: async (user, amount, options) => { pulseCalls.push({ type: "impulses", user, amount, options }); return { user, amount }; },
    setEnabled: async (enabled) => ({ enabled }),
  };
  return { state, pulseCalls, service: new DeveloperCommandService({ instance, store, pulseSandbox }) };`, "developer pulse fixture");
replace("test/developer-commands.test.cjs", "test(\"mutating command is audited without secret values\", async () => {", `test("documentation placeholders are accepted without becoming literal identifiers", async () => {
  assert.equal(unwrapPlaceholder("<netrox>"), "netrox");
  assert.equal(unwrapPlaceholder("[30]"), "30");
  const { pulseCalls, service } = fixture();
  await service.execute("plus grant <netrox> [1]", { actor: "test" });
  assert.equal(pulseCalls[0].user, "netrox");
  assert.equal(pulseCalls[0].options.days, "1");
});

test("mutating command is audited without secret values", async () => {`, "developer placeholder test");

write("test/mls-welcome-recovery.test.cjs", `"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { requestMlsWelcome } = require("../server/mls-welcome-recovery.cjs");

function trustFixture({ member = false } = {}) {
  const device = { id: "device-new", userId: "user-1", trustState: "verified" };
  return {
    requireDevice(userId, deviceId, options) {
      assert.equal(userId, "user-1"); assert.equal(deviceId, "device-new"); assert.equal(options.verified, true); return device;
    },
    getGroupByConversation(conversationId) {
      assert.equal(conversationId, "conversation-1");
      return { id: "group-1", conversationId, members: member ? [{ deviceId: device.id, status: "active" }] : [{ deviceId: "device-old", status: "active" }] };
    },
  };
}

test("pending verified device requests Welcome from active MLS members", () => {
  let payload;
  const result = requestMlsWelcome({ trustCore: trustFixture(), userId: "user-1", deviceId: "device-new", conversationId: "conversation-1", emit: (value) => { payload = value; return [{ deviceId: "device-old" }]; } });
  assert.equal(result.requested, true);
  assert.equal(result.recipients, 1);
  assert.equal(payload.requesterDeviceId, "device-new");
  assert.equal(payload.groupId, "group-1");
});

test("existing MLS member does not create a redundant Welcome request", () => {
  let emitted = false;
  const result = requestMlsWelcome({ trustCore: trustFixture({ member: true }), userId: "user-1", deviceId: "device-new", conversationId: "conversation-1", emit: () => { emitted = true; } });
  assert.equal(result.requested, false);
  assert.equal(result.reason, "already_member");
  assert.equal(emitted, false);
});
`);

const changelog = read("CHANGELOG.md");
if (!changelog.includes("## [3.2.4]")) {
  write("CHANGELOG.md", changelog.replace("Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.\n", `Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.\n\n## [3.2.4] — 2026-07-22\n\n### Fixed\n\n- Client auto-update service is initialized before renderer access, keeps its scheduler alive and derives a stable result even when the updater does not emit a terminal event;\n- manual Client update checks now return actionable current, available, network and missing-signed-release states;\n- Server developer commands accept copied documentation placeholders such as \`<netrox>\` and \`[1]\`, and IPC preserves stable command error codes;\n- verified devices waiting for MLS Welcome request recovery from active group members and retry the claim automatically, restoring text, media and voice sending when another active member is online.\n\n### Added\n\n- post-update release summary with “Подробнее”, “Закрыть” and “Не показывать снова”;\n- Windows Client test mode with a live PowerShell log console and a dedicated Start Menu shortcut;\n- branded Russian NSIS installer assets for Client and Server.\n\n### Compatibility\n\n- Local Server schema remains 8; API v3 and Trust/MLS API v4 remain compatible; no database migration is required.\n`));
}

write("RELEASE_NOTES_3.2.4.md", `# Nexora 3.2.4 — Update and MLS delivery recovery

Nexora 3.2.4 is a patch release focused on the Windows update path, Server operator console and MLS device recovery.

## Fixed

- Client automatic updates initialize before the renderer can query them and continue checking on schedule.
- The “Проверить обновления” action receives a terminal state even when Electron Updater does not emit one.
- Network failures and releases without signed updater metadata are reported with stable, understandable states.
- Server console commands preserve error codes instead of exposing Electron IPC wrapper text.
- Arguments copied from help, including \`plus grant <netrox> [1]\`, are normalized safely.
- A verified device without local group state can request MLS Welcome from active members and retry automatically. This shared path covers text, encrypted media and voice messages.

## Added

- After an actual Client version transition, Nexora shows a short release summary with “Подробнее”, “Закрыть” and “Не показывать снова”.
- \`--test-mode\` opens a live Windows PowerShell console tailing \`nexora-client.log\`.
- The installer creates a “Nexora Client (Test Mode)” Start Menu shortcut.
- Client and Server NSIS installers use Nexora icons, a branded sidebar and Russian installer language.

## Security and compatibility

- Update integrity and Authenticode release gates remain enabled; unsigned updater assets are not silently trusted.
- The MLS Welcome request contains no key material. The server only notifies verified devices already active in the group; an active client still creates the RFC 9420 Welcome.
- Local Server schema 8, API v3 and Trust/MLS API v4 are unchanged.
`);

for (const relativePath of [selfPath, workflowPath]) {
  try { fs.unlinkSync(absolute(relativePath)); console.log(`removed temporary ${relativePath}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

console.log("Nexora 3.2.4 patch applied.");
