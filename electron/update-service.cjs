"use strict";

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
    return String(value[String(kind) + "FeedUrl"] || "").trim();
  } catch {
    return "";
  }
}

async function configuredProvider(kind, appImpl = app, fsImpl = fs) {
  const feedUrl = await configuredFeed(kind, appImpl, fsImpl);
  if (feedUrl) {
    if (!/^https:///i.test(feedUrl)) return null;
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
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(value || "").trim());
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
  if (/latest\.yml|404|no published versions|cannot find latest|no releases found/i.test(message)) {
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
  emit({ enabled: true, status: "idle", provider: provider.provider, channel: provider.provider === "github" ? provider.owner + "/" + provider.repo : provider.url });

  listen("checking-for-update", () => emit({ status: "checking", error: null, reason: null }));
  listen("update-available", (info) => emit({ status: automatic ? "downloading" : "available", availableVersion: info.version, reason: null }));
  listen("update-not-available", () => emit({ status: "current", availableVersion: null, progress: 0, reason: null }));
  listen("download-progress", (progress) => emit({ status: "downloading", progress: Math.round(progress.percent || 0) }));
  listen("update-downloaded", (info) => emit({ status: "downloaded", availableVersion: info.version, progress: 100, reason: null }));
  listen("error", (error) => {
    log("Updater error: " + (error?.stack || error), "error");
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
        log("Update check failed: " + (error?.stack || error), "error");
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
        log("Update download failed: " + (error?.stack || error), "error");
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
