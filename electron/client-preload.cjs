"use strict";

const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => document.body.classList.add("electron-client"));

contextBridge.exposeInMainWorld("nexoraClient", {
  connect: (url, confirmation = null) => ipcRenderer.invoke("client:connect", { url, confirmation }),
  forgetServer: (serverId) => ipcRenderer.invoke("client:forget-server", serverId),
  getConfig: () => ipcRenderer.invoke("client:get-config"),
  showConnector: () => ipcRenderer.invoke("client:show-connector"),
  updateStatus: () => ipcRenderer.invoke("client:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("client:check-update"),
  installUpdate: () => ipcRenderer.invoke("client:install-update"),
  getReleaseNotes: () => ipcRenderer.invoke("client:get-release-notes"),
  dismissReleaseNotes: (version, dontShowAgain = false) => ipcRenderer.invoke("client:dismiss-release-notes", { version, dontShowAgain }),
  openReleaseNotes: (version) => ipcRenderer.invoke("client:open-release-notes", version),
  reportRendererError: (report) => ipcRenderer.send("client:renderer-error", report),
  onUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("client:update", listener);
    return () => ipcRenderer.off("client:update", listener);
  },
  platform: process.platform,
});
