"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexoraServer", {
  status: () => ipcRenderer.invoke("server:status"),
  start: () => ipcRenderer.invoke("server:start"),
  stop: () => ipcRenderer.invoke("server:stop"),
  adminData: () => ipcRenderer.invoke("server:admin-data"),
  toggleUser: (userId, disabled) => ipcRenderer.invoke("server:toggle-user", { userId, disabled }),
  deleteRoom: (roomId) => ipcRenderer.invoke("server:delete-room", roomId),
  resetPassword: (userId, password) => ipcRenderer.invoke("server:reset-password", { userId, password }),
  createBackup: (passphrase = "") => ipcRenderer.invoke("server:create-backup", passphrase),
  listBackups: () => ipcRenderer.invoke("server:list-backups"),
  restoreBackup: (passphrase = "") => ipcRenderer.invoke("server:restore-backup", passphrase),
  cleanupStorage: () => ipcRenderer.invoke("server:cleanup-storage"),
  updateStorage: (settings) => ipcRenderer.invoke("server:update-storage", settings),
  updateSecurity: (settings) => ipcRenderer.invoke("server:update-security", settings),
  openBackups: () => ipcRenderer.invoke("server:open-backups"),
  exportRoom: (roomId) => ipcRenderer.invoke("server:export-room", roomId),
  copy: (value) => ipcRenderer.invoke("server:copy", value),
  exportCertificate: () => ipcRenderer.invoke("server:export-certificate"),
  openCertificate: () => ipcRenderer.invoke("server:open-certificate"),
  openDataFolder: () => ipcRenderer.invoke("server:open-data-folder"),
  openLogFile: () => ipcRenderer.invoke("server:open-log-file"),
  updateStatus: () => ipcRenderer.invoke("server:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("server:check-update"),
  downloadUpdate: () => ipcRenderer.invoke("server:download-update"),
  installUpdate: () => ipcRenderer.invoke("server:install-update"),
  onUpdate: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("server:update", listener);
    return () => ipcRenderer.off("server:update", listener);
  },
  onLog: (callback) => {
    const listener = (_event, entry) => callback(entry);
    ipcRenderer.on("server:log", listener);
    return () => ipcRenderer.off("server:log", listener);
  },
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("server:status-changed", listener);
    return () => ipcRenderer.off("server:status-changed", listener);
  },
});
