"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const {
  configuredProvider,
  createUpdateService,
  isNewerVersion,
  normalizedUpdateError,
  safeLogMessage,
} = require("../electron/update-service.cjs");

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checks = 0;
    this.feed = null;
    this.channel = null;
    this.downloads = 0;
    this.installs = 0;
  }
  setFeedURL(value) { this.feed = value; }
  async checkForUpdates() {
    this.checks += 1;
    this.emit("checking-for-update");
    this.emit("update-not-available", { version: "3.4.0" });
  }
  async downloadUpdate() { this.downloads += 1; }
  quitAndInstall() { this.installs += 1; }
}

const appImpl = {
  isPackaged: true,
  getVersion: () => "3.4.0",
  getPath: () => "/tmp/nexora-test",
};
const fsImpl = { readFile: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); } };

test("automatic update service schedules an initial check and reschedules", async () => {
  const updater = new FakeUpdater();
  const timers = [];
  const service = await createUpdateService({
    kind: "client",
    automatic: true,
    appImpl,
    updater,
    fsImpl,
    initialDelayMs: 1_000,
    intervalMs: 5_000,
    setTimeoutImpl: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeoutImpl: () => {},
  });
  service.start();
  assert.equal(timers[0].delay, 1_000);
  await timers[0].callback();
  assert.equal(updater.checks, 1);
  assert.equal(service.status().status, "current");
  assert.equal(timers[1].delay, 5_000);
  service.stop();
  assert.equal(updater.listenerCount("checking-for-update"), 0);
});

test("concurrent update checks are single-flight", async () => {
  const updater = new FakeUpdater();
  let resolveCheck;
  updater.checkForUpdates = () => {
    updater.checks += 1;
    return new Promise((resolve) => { resolveCheck = resolve; });
  };
  const service = await createUpdateService({ kind: "client", appImpl, updater, fsImpl });
  const first = service.check();
  const second = service.check();
  assert.equal(updater.checks, 1);
  resolveCheck();
  await Promise.all([first, second]);
});

test("missing signed updater metadata produces a stable reason", () => {
  assert.deepEqual(normalizedUpdateError(new Error("Cannot find latest.yml: 404")), {
    reason: "no_installable_update",
    code: "RESOURCE_NOT_FOUND",
    error: "В GitHub пока нет подписанного устанавливаемого обновления для этого канала.",
  });
});

test("tampered installer and checksum failures map to UPDATE_SIGNATURE_INVALID", () => {
  assert.deepEqual(normalizedUpdateError(new Error("sha512 checksum mismatch; installer may be tampered")), {
    reason: "signature_invalid",
    code: "UPDATE_SIGNATURE_INVALID",
    error: "Подпись или контрольная сумма обновления недействительна.",
  });
});

test("manual check falls back to returned updateInfo when updater emits no event", async () => {
  const updater = new FakeUpdater();
  updater.checkForUpdates = async () => ({ updateInfo: { version: "3.4.1" } });
  const service = await createUpdateService({ kind: "client", appImpl, updater, fsImpl });
  const state = await service.check();
  assert.equal(state.status, "available");
  assert.equal(state.availableVersion, "3.4.1");
});

test("Client and Server use separate immutable GitHub metadata channels", async () => {
  const clientProvider = await configuredProvider("client", appImpl, fsImpl);
  const serverProvider = await configuredProvider("server", appImpl, fsImpl);
  assert.deepEqual(clientProvider, { provider: "github", owner: "Onmaynec", repo: "Nexora", private: false, channel: "latest" });
  assert.deepEqual(serverProvider, { provider: "github", owner: "Onmaynec", repo: "Nexora", private: false, channel: "server" });

  const clientUpdater = new FakeUpdater();
  const client = await createUpdateService({ kind: "client", appImpl, updater: clientUpdater, fsImpl });
  assert.equal(client.status().provider, "github");
  assert.equal(client.status().channel, "latest");
  assert.equal(client.status().repository, "Onmaynec/Nexora");
  assert.equal(clientUpdater.channel, "latest");
  assert.deepEqual(clientUpdater.feed, clientProvider);

  const serverUpdater = new FakeUpdater();
  const server = await createUpdateService({ kind: "server", appImpl, updater: serverUpdater, fsImpl });
  assert.equal(server.status().provider, "github");
  assert.equal(server.status().channel, "server");
  assert.equal(serverUpdater.channel, "server");
  assert.deepEqual(serverUpdater.feed, serverProvider);
});

test("semantic update comparison rejects invalid versions and downgrades", () => {
  assert.equal(isNewerVersion("3.4.1", "3.4.0"), true);
  assert.equal(isNewerVersion("3.3.4", "3.4.0"), false);
  assert.equal(isNewerVersion("3.4.0", "3.4.0"), false);
  assert.equal(isNewerVersion("invalid", "3.4.0"), false);
});

test("update-available and update-downloaded events cannot bypass no-downgrade", async () => {
  const updater = new FakeUpdater();
  const service = await createUpdateService({ kind: "client", appImpl, updater, fsImpl });
  updater.emit("update-available", { version: "3.3.4" });
  assert.equal(service.status().status, "current");
  assert.equal(service.status().reason, "no_downgrade");
  updater.emit("update-downloaded", { version: "3.3.4" });
  assert.equal(service.status().status, "error");
  assert.equal(service.status().code, "STATE_CONFLICT");
  assert.equal(service.install(), false);
  assert.equal(updater.installs, 0);
});

test("updater logs redact local filesystem paths", () => {
  assert.equal(safeLogMessage(new Error("failed at C:\\Users\\name\\secret\\installer.exe")), "failed at [path]");
  assert.equal(safeLogMessage(new Error("failed at /home/runner/work/private/installer.exe")), "failed at [path]");
});
