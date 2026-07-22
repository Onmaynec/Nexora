"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createUpdateService, isNewerVersion, normalizedUpdateError } = require("../electron/update-service.cjs");

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checks = 0;
    this.feed = null;
  }
  setFeedURL(value) { this.feed = value; }
  async checkForUpdates() {
    this.checks += 1;
    this.emit("checking-for-update");
    this.emit("update-not-available", { version: "3.1.2" });
  }
  async downloadUpdate() {}
  quitAndInstall() {}
}

const appImpl = {
  isPackaged: true,
  getVersion: () => "3.1.2",
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
    error: "В GitHub пока нет подписанного устанавливаемого обновления для этого канала.",
  });
});

test("manual check falls back to returned updateInfo when updater emits no event", async () => {
  const updater = new FakeUpdater();
  updater.checkForUpdates = async () => ({ updateInfo: { version: "3.2.4" } });
  const service = await createUpdateService({ kind: "client", appImpl, updater, fsImpl });
  const state = await service.check();
  assert.equal(state.status, "available");
  assert.equal(state.availableVersion, "3.2.4");
});

test("default Client channel uses the official GitHub repository", async () => {
  const updater = new FakeUpdater();
  const service = await createUpdateService({ kind: "client", appImpl, updater, fsImpl });
  assert.equal(service.status().provider, "github");
  assert.equal(service.status().channel, "Onmaynec/Nexora");
  assert.deepEqual(updater.feed, { provider: "github", owner: "Onmaynec", repo: "Nexora", private: false });
});

test("semantic update comparison rejects downgrades", () => {
  assert.equal(isNewerVersion("3.2.4", "3.2.3"), true);
  assert.equal(isNewerVersion("3.2.3", "3.2.4"), false);
  assert.equal(isNewerVersion("3.2.4", "3.2.4"), false);
});
