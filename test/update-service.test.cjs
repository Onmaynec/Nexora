"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createUpdateService, normalizedUpdateError } = require("../electron/update-service.cjs");

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
    error: "Для выбранного канала пока нет подписанного устанавливаемого обновления.",
  });
});
