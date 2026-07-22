"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { maybeShowPostUpdate, testModeRequested } = require("../electron/release-experience.cjs");

function memoryFs(initial = null) {
  let stored = initial;
  return {
    async readFile() {
      if (stored == null) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return stored;
    },
    async mkdir() {},
    async writeFile(_file, value) { stored = value; },
    value: () => stored == null ? null : JSON.parse(stored),
  };
}

const appImpl = {
  getVersion: () => "3.2.4",
  getPath: () => "/tmp/nexora-release-test",
};

test("post-update summary is shown on first 3.2.4 launch", async () => {
  const fsImpl = memoryFs();
  let options;
  const result = await maybeShowPostUpdate({
    appImpl,
    fsImpl,
    dialogImpl: { showMessageBox: async (value) => { options = value; return { response: 1, checkboxChecked: false }; } },
    shellImpl: { openExternal: async () => { throw new Error("unexpected"); } },
  });
  assert.equal(result.shown, true);
  assert.equal(options.message, "Nexora обновлена до версии 3.2.4");
  assert.deepEqual(options.buttons, ["Подробнее", "Закрыть"]);
  assert.equal(options.checkboxLabel, "Не показывать снова");
  assert.equal(fsImpl.value().pendingNotesVersion, "3.2.4");
});

test("post-update checkbox dismisses notes and details opens the GitHub release", async () => {
  const fsImpl = memoryFs(JSON.stringify({ lastVersion: "3.2.3" }));
  let opened = null;
  const result = await maybeShowPostUpdate({
    appImpl,
    fsImpl,
    dialogImpl: { showMessageBox: async () => ({ response: 0, checkboxChecked: true }) },
    shellImpl: { openExternal: async (url) => { opened = url; } },
  });
  assert.equal(result.openedDetails, true);
  assert.equal(result.dismissed, true);
  assert.equal(opened, "https://github.com/Onmaynec/Nexora/releases/tag/v3.2.4");
  assert.equal(fsImpl.value().pendingNotesVersion, null);
  assert.equal(fsImpl.value().dismissedNotesVersion, "3.2.4");
});

test("dismissed release notes are not shown again", async () => {
  const fsImpl = memoryFs(JSON.stringify({ lastVersion: "3.2.4", pendingNotesVersion: null, dismissedNotesVersion: "3.2.4" }));
  let shown = false;
  const result = await maybeShowPostUpdate({
    appImpl,
    fsImpl,
    dialogImpl: { showMessageBox: async () => { shown = true; return { response: 1, checkboxChecked: false }; } },
    shellImpl: { openExternal: async () => {} },
  });
  assert.equal(result.shown, false);
  assert.equal(shown, false);
});

test("test mode accepts command line and environment switches", () => {
  const previous = process.env.NEXORA_CLIENT_TEST_MODE;
  delete process.env.NEXORA_CLIENT_TEST_MODE;
  assert.equal(testModeRequested(["electron", "app", "--test-mode"]), true);
  assert.equal(testModeRequested(["electron", "app"]), false);
  process.env.NEXORA_CLIENT_TEST_MODE = "1";
  assert.equal(testModeRequested(["electron", "app"]), true);
  if (previous == null) delete process.env.NEXORA_CLIENT_TEST_MODE;
  else process.env.NEXORA_CLIENT_TEST_MODE = previous;
});
