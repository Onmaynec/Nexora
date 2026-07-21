"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const DEFAULT_GITHUB_RELEASES = Object.freeze({ provider: "github", owner: "Onmaynec", repo: "Nexora", private: false, releaseType: "release" });

async function configuredFeed(kind) {
  const environmentName = kind === "client" ? "NEXORA_CLIENT_UPDATE_URL" : "NEXORA_SERVER_UPDATE_URL";
  if (process.env[environmentName]) return String(process.env[environmentName]).trim();
  try {
    const value = JSON.parse(await fs.readFile(path.join(app.getPath("userData"), "update-config.json"), "utf8"));
    return String(value[`${kind}FeedUrl`] || "").trim();
  } catch {
    return "";
  }
}

async function configuredProvider(kind) {
  const feedUrl = await configuredFeed(kind);
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

async function createUpdateService({ kind, automatic = false, onEvent = () => {} }) {
  let state = { enabled: false, status: "disabled", currentVersion: app.getVersion(), availableVersion: null, progress: 0, error: null };
  const emit = (patch) => {
    state = { ...state, ...patch };
    onEvent({ ...state });
  };
  if (!app.isPackaged) return {
    status: () => ({ ...state, reason: "development" }),
    check: async () => ({ ...state, reason: "development" }),
    download: async () => ({ ...state, reason: "development" }),
    install: () => false,
  };

  const provider = await configuredProvider(kind);
  if (!provider) return {
    status: () => ({ ...state, reason: "feed_not_configured" }),
    check: async () => ({ ...state, reason: "feed_not_configured" }),
    download: async () => ({ ...state, reason: "feed_not_configured" }),
    install: () => false,
  };

  autoUpdater.autoDownload = automatic;
  autoUpdater.autoInstallOnAppQuit = automatic;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL(provider);
  emit({ enabled: true, status: "idle", provider: provider.provider, channel: provider.provider === "github" ? `${provider.owner}/${provider.repo}` : provider.url });
  autoUpdater.on("checking-for-update", () => emit({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) => emit({ status: automatic ? "downloading" : "available", availableVersion: info.version }));
  autoUpdater.on("update-not-available", () => emit({ status: "current", availableVersion: null }));
  autoUpdater.on("download-progress", (progress) => emit({ status: "downloading", progress: Math.round(progress.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => emit({ status: "downloaded", availableVersion: info.version, progress: 100 }));
  autoUpdater.on("error", (error) => emit({ status: "error", error: error.message }));

  return {
    status: () => ({ ...state }),
    check: async () => { await autoUpdater.checkForUpdates(); return { ...state }; },
    download: async () => { await autoUpdater.downloadUpdate(); return { ...state }; },
    install: () => { if (state.status !== "downloaded") return false; autoUpdater.quitAndInstall(false, true); return true; },
  };
}

module.exports = { DEFAULT_GITHUB_RELEASES, configuredProvider, createUpdateService };
