"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

test("Windows-сборка 2.0.0 не запускает node-gyp для SQLite", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
  const client = fs.readFileSync(path.join(root, "electron-builder.client.yml"), "utf8");
  const server = fs.readFileSync(path.join(root, "electron-builder.server.yml"), "utf8");
  const updater = fs.readFileSync(path.join(root, "electron", "update-service.cjs"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.equal(packageJson.dependencies["better-sqlite3"], undefined);
  assert.equal(packageJson.devDependencies?.["better-sqlite3"], undefined);
  assert.match(packageJson.scripts.test, /build:web/);
  assert.match(packageJson.scripts["test:unit"], /node --test/);
  assert.doesNotMatch(lock, /node_modules\/better-sqlite3/);
  assert.match(packageJson.engines.node, /22\.16/);
  assert.match(client, /npmRebuild:\s*false/);
  assert.match(client, /electron\/client-connection\.cjs/);
  assert.match(server, /npmRebuild:\s*false/);
  assert.doesNotMatch(server, /\.node|better-sqlite3|node-gyp/);
  assert.match(client, /provider:\s*github/);
  assert.match(client, /owner:\s*Onmaynec/);
  assert.match(client, /repo:\s*Nexora/);
  assert.match(client, /releaseType:\s*draft/);
  assert.match(updater, /autoInstallOnAppQuit\s*=\s*automatic/);
  assert.match(updater, /owner:\s*"Onmaynec"/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /--publish always/);
  assert.match(releaseWorkflow, /--publish never/);
  assert.match(releaseWorkflow, /gh release edit \$tag[^\n]*--draft=false/);
  assert.doesNotMatch(releaseWorkflow, /release upload .*--clobber/);
  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /startsWith\(github\.event\.workflow_run\.head_commit\.message, 'release:'\)/);
  assert.match(releaseWorkflow, /git tag -a \$tag/);
});

test("release tag обязан совпадать с package.json version", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const script = path.join(root, "scripts", "check-release-tag.cjs");
  const matching = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, RELEASE_TAG: `v${packageJson.version}` },
  });
  assert.equal(matching.status, 0, matching.stderr);

  const mismatch = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, RELEASE_TAG: "v999.0.0" },
  });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /не совпадает/);
});
