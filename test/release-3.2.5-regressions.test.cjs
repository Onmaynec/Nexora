"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SqliteStore } = require("../server/store.cjs");
const { PulseSandboxService } = require("../server/pulse-sandbox-service.cjs");

const root = path.resolve(__dirname, "..");

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

test("3.2.5: Pulse sandbox writes valid billing rows to the real SQLite store", async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "nexora-325-pulse-"));
  const store = new SqliteStore(path.join(directory, "nexora.sqlite"));
  try {
    await store.init();
    await store.mutate((state) => {
      state.users.push({ id: "u1", username: "netrox", displayName: "Netrox", role: "user", createdAt: new Date().toISOString(), passwordSalt: "x", passwordHash: "x", disabledAt: null });
    });
    const service = new PulseSandboxService({ store, clock: () => new Date("2026-07-22T20:00:00.000Z") });
    await service.setEnabled(true, "test");
    await service.grantPlus("netrox", { days: 30, actor: "test" });
    await service.adjustImpulses("netrox", 100, { actor: "test", reason: "qa" });
    const overview = service.overview("netrox");
    assert.equal(overview.subscription.status, "active");
    assert.equal(overview.wallet.balance, 500);
    assert.equal(store.integrityCheck().ok, true);
  } finally {
    await store.close();
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

test("3.2.5: release announcement is renderer-driven and persisted per version", async () => {
  const release = require("../electron/release-experience.cjs");
  assert.equal(typeof release.getPendingReleaseNotes, "function");
  assert.equal(typeof release.dismissReleaseNotes, "function");
  const appImpl = { getVersion: () => "3.2.5", getPath: () => "/tmp/nexora-release-325" };
  const fsImpl = memoryFs(JSON.stringify({ lastVersion: "3.2.4" }));
  const notes = await release.getPendingReleaseNotes({ appImpl, fsImpl });
  assert.equal(notes.version, "3.2.5");
  assert.match(notes.title, /3\.2\.5/);
  assert.ok(Array.isArray(notes.highlights) && notes.highlights.length >= 4);
  await release.dismissReleaseNotes({ appImpl, fsImpl, version: "3.2.5", dontShowAgain: true });
  assert.equal((await release.getPendingReleaseNotes({ appImpl, fsImpl })), null);
  assert.equal(fsImpl.value().dismissedNotesVersion, "3.2.5");
});

test("Stable Core preserves in-app release UX without injecting particle canvases into navigation", () => {
  const main = fs.readFileSync(path.join(root, "client", "src", "main.jsx"), "utf8");
  const announcement = fs.readFileSync(path.join(root, "client", "src", "components", "ReleaseAnnouncement.jsx"), "utf8");
  const workspace = fs.readFileSync(path.join(root, "client", "src", "components", "Workspace.jsx"), "utf8");
  const particles = fs.readFileSync(path.join(root, "client", "src", "components", "ParticleField.jsx"), "utf8");
  assert.match(main, /ReleaseAnnouncement/);
  assert.match(announcement, /release-announcement/);
  assert.match(announcement, /Не показывать снова/);
  assert.doesNotMatch(workspace, /<ParticleField/);
  assert.match(particles, /ResizeObserver/);
  assert.match(particles, /contained/);
});

test("ordinary server-readable message rendering keeps voice, lazy media and local updates", () => {
  const pane = fs.readFileSync(path.join(root, "client", "src", "components", "MessagePane.jsx"), "utf8");
  assert.match(pane, /VoicePlayer/);
  assert.match(pane, /loading="lazy"/);
  assert.match(pane, /cacheMessages/);
  assert.match(pane, /readCachedMessages/);
  assert.match(pane, /flushOutbox/);
});

test("legacy history is routed to a read-only viewer instead of MLS group creation recovery", () => {
  const workspace = fs.readFileSync(path.join(root, "client", "src", "components", "Workspace.jsx"), "utf8");
  const viewer = fs.readFileSync(path.join(root, "client", "src", "components", "LegacySecureHistoryPane.jsx"), "utf8");
  assert.match(workspace, /activeConversation\.legacySecure/);
  assert.match(viewer, /LEGACY_READ_ONLY/);
  assert.match(viewer, /server-side расшифровка не выполнялась/);
  assert.doesNotMatch(workspace, /requestWelcome|claimWelcome|SecureMessagePane/);
});

test("message delivery updates previews without forcing full bootstrap per event", () => {
  const app = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");
  const pane = fs.readFileSync(path.join(root, "client", "src", "components", "MessagePane.jsx"), "utf8");
  assert.match(app, /applyMessagePreview\(message\)/);
  assert.match(app, /socket\.on\("message:new", onMessage\)/);
  assert.doesNotMatch(pane, /result\.failed[\s\S]{0,180}onRefresh/);
});

test("local Windows test build remains separate from signed stable publication", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.doesNotMatch(pkg.scripts["release:windows"], /signing-check/);
  assert.match(pkg.scripts["release:windows:signed"], /signing-check/);
  assert.match(workflow, /release:signing-check/);
  assert.match(workflow, /WINDOWS_CERTIFICATE_BASE64/);
  assert.match(workflow, /PUBLISH_TAG=\$officialTag/);
  assert.match(workflow, /UNSIGNED-TEST prerelease without updater metadata/);
  assert.match(workflow, /--prerelease/);
  assert.doesNotMatch(workflow, /Unsigned artifact set contains updater metadata[\s\S]{0,240}latest\.yml/);
});

test("Server control plane styles disabled controls and scrollbars inside the product theme", () => {
  const extras = fs.readFileSync(path.join(root, "electron", "server-shell", "extras.css"), "utf8");
  assert.match(extras, /button:disabled/);
  assert.match(extras, /::-webkit-scrollbar-thumb/);
  assert.match(extras, /command-console form button/);
});
