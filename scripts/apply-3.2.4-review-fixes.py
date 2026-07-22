from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path, before, after):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    if before not in source:
        raise SystemExit(f"Expected block not found in {path}: {before[:100]!r}")
    file.write_text(source.replace(before, after, 1), encoding="utf-8")
    print(f"updated {path}")


replace(
    "electron/update-service.cjs",
    '    if (!/^https:///i.test(feedUrl)) return null;',
    '    if (!/^https:\\/\\//i.test(feedUrl)) return null;',
)

replace(
    "electron/update-service.cjs",
    '  activeUpdater.autoInstallOnAppQuit = Boolean(automatic);',
    '  activeUpdater.autoInstallOnAppQuit = automatic;',
)

replace(
    "electron/client-main.cjs",
    '''  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const normalizedLevel = ["warn", "error"].includes(String(level)) ? String(level) : "info";
    logClient(`renderer ${sourceId || "unknown"}:${line || 0} ${message}`, normalizedLevel);
  });''',
    '''  mainWindow.webContents.on("console-message", (_event, details) => {
    const level = details?.level === "error" ? "error" : details?.level === "warning" ? "warn" : "info";
    const message = String(details?.message || "").replace(/[\\r\\n]+/g, " ").slice(0, 4_000);
    logClient(`renderer ${details?.sourceId || "unknown"}:${details?.lineNumber || 0} ${message}`, level);
  });''',
)

replace(
    "electron/release-experience.cjs",
    '''  if (!value.lastVersion) {
    await writeState(file, { ...value, lastVersion: currentVersion }, fsImpl);
    return { shown: false, firstInstall: true };
  }''',
    '''  if (!value.lastVersion) {
    value.lastVersion = currentVersion;
    value.pendingNotesVersion = currentVersion;
    await writeState(file, value, fsImpl);
  }''',
)

replace(
    "server/developer-commands.cjs",
    '      result = { data: { overview: this.pulseSandbox.overview(unwrapPlaceholder(args[0])), transactions: this.pulseSandbox.transactions(args[0], 20) }, output: "Тестовое состояние Pulse получено." };',
    '      const userReference = unwrapPlaceholder(args[0]);\n      result = { data: { overview: this.pulseSandbox.overview(userReference), transactions: this.pulseSandbox.transactions(userReference, 20) }, output: "Тестовое состояние Pulse получено." };',
)

replace(
    "test/build-config.test.cjs",
    'test("релиз 3.2.3 собирает проверяемые артефакты без native SQLite", () => {',
    'test("релиз 3.2.4 собирает проверяемые артефакты без native SQLite", () => {',
)

(ROOT / "test/release-experience.test.cjs").write_text('''"use strict";

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
''', encoding="utf-8")
print("created test/release-experience.test.cjs")

replace(
    "test/developer-commands.test.cjs",
    '''test("mutating command is audited without secret values", async () => {''',
    '''test("pulse user normalizes copied help placeholders for every lookup", async () => {
  const { service } = fixture();
  const result = await service.execute("pulse user <netrox>", { actor: "test" });
  assert.equal(result.data.overview.user, "netrox");
});

test("mutating command is audited without secret values", async () => {''',
)

replace(
    "test/update-service.test.cjs",
    '''test("semantic update comparison rejects downgrades", () => {''',
    '''test("default Client channel uses the official GitHub repository", async () => {
  const updater = new FakeUpdater();
  const service = await createUpdateService({ kind: "client", appImpl, updater, fsImpl });
  assert.equal(service.status().provider, "github");
  assert.equal(service.status().channel, "Onmaynec/Nexora");
  assert.deepEqual(updater.feed, { provider: "github", owner: "Onmaynec", repo: "Nexora", private: false });
});

test("semantic update comparison rejects downgrades", () => {''',
)

# The helper and workflow are one-shot repository mechanics, not release source.
for relative in ["scripts/apply-3.2.4-review-fixes.py", ".github/workflows/apply-3.2.4-review-fixes.yml"]:
    target = ROOT / relative
    if target.exists():
        target.unlink()
        print(f"removed {relative}")
