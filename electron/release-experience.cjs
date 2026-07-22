"use strict";

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
    title: "Nexora " + currentVersion,
    message: "Nexora обновлена до версии " + currentVersion,
    detail: summary,
    buttons: ["Подробнее", "Закрыть"],
    defaultId: 1,
    cancelId: 1,
    checkboxLabel: "Не показывать снова",
    checkboxChecked: false,
    noLink: true,
  });
  if (result.response === 0) await shellImpl.openExternal("https://github.com/Onmaynec/Nexora/releases/tag/v" + currentVersion);
  if (result.checkboxChecked) {
    value.pendingNotesVersion = null;
    value.dismissedNotesVersion = currentVersion;
    await writeState(file, value, fsImpl);
  }
  log("Post-update notes displayed for " + currentVersion, "info");
  return { shown: true, openedDetails: result.response === 0, dismissed: Boolean(result.checkboxChecked) };
}

function powershellLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function openTestLogConsole({ logFile, spawnImpl = spawn } = {}) {
  const script = [
    "$Host.UI.RawUI.WindowTitle = 'Nexora Client - Test Mode'",
    "Write-Host 'Nexora Client test mode. Close this window to stop viewing the log.' -ForegroundColor Magenta",
    "if (!(Test-Path -LiteralPath " + powershellLiteral(logFile) + ")) { New-Item -ItemType File -Force -Path " + powershellLiteral(logFile) + " | Out-Null }",
    "Get-Content -LiteralPath " + powershellLiteral(logFile) + " -Tail 200 -Wait",
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
