"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

test("релиз 3.3.0 собирает проверяемые артефакты без native SQLite", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
  const client = fs.readFileSync(path.join(root, "electron-builder.client.yml"), "utf8");
  const server = fs.readFileSync(path.join(root, "electron-builder.server.yml"), "utf8");
  const updater = fs.readFileSync(path.join(root, "electron", "update-service.cjs"), "utf8");
  const clientMain = fs.readFileSync(path.join(root, "electron", "client-main.cjs"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  const ciWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  const unitRunner = fs.readFileSync(path.join(root, "scripts", "run-unit-tests.cjs"), "utf8");
  assert.equal(packageJson.version, require("../package-lock.json").version);
  assert.equal(packageJson.dependencies["better-sqlite3"], undefined);
  assert.equal(packageJson.devDependencies?.["better-sqlite3"], undefined);
  assert.match(packageJson.scripts.test, /build:web/);
  assert.match(packageJson.scripts["test:unit"], /run-unit-tests\.cjs/);
  assert.match(unitRunner, /spawnSync\(process\.execPath/);
  assert.match(unitRunner, /"--test"/);
  assert.match(unitRunner, /name !== "performance\.test\.cjs"/);
  assert.match(packageJson.scripts["test:performance"], /node --test --test-concurrency=1 test\/performance\.test\.cjs/);
  assert.match(packageJson.scripts["release:check"], /test:unit[\s\S]*test:performance[\s\S]*audit:security/);
  assert.match(ciWorkflow, /verify:[\s\S]*test:unit[\s\S]*test:performance[\s\S]*audit:security/);
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
  assert.match(releaseWorkflow, /Nexora-\$version-source\.zip/);
  assert.match(releaseWorkflow, /sbom --omit=dev --sbom-format=spdx/);
  assert.match(releaseWorkflow, /steps\.signing\.outputs\.available == 'true'/);
  assert.match(releaseWorkflow, /Publish source and PWA prerelease/);
  assert.match(releaseWorkflow, /--publish always/);
  assert.match(releaseWorkflow, /--publish never/);
  assert.match(releaseWorkflow, /gh release edit \$tag[^\n]*--draft=false/);
  assert.doesNotMatch(releaseWorkflow, /release upload .*--clobber/);
  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /startsWith\(github\.event\.workflow_run\.head_commit\.message, 'release:'\)/);
  assert.match(releaseWorkflow, /git tag -a \$tag/);
  assert.match(clientMain, /persist:nexora-server-/);
  assert.match(clientMain, /partition:\s*currentPartition/);
  assert.match(ciWorkflow, /android-source:/);
  assert.match(ciWorkflow, /gradle-version:\s*"8\.13"/);
});

test("Android и PWA клиенты не обходят TLS и работают только с безопасным transport", () => {
  const activity = fs.readFileSync(path.join(root, "android", "app", "src", "main", "java", "com", "nexora", "mobile", "MainActivity.kt"), "utf8");
  const manifest = fs.readFileSync(path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const network = fs.readFileSync(path.join(root, "android", "app", "src", "main", "res", "xml", "network_security_config.xml"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(root, "client", "public", "sw.js"), "utf8");
  assert.match(manifest, /usesCleartextTraffic="false"/);
  assert.match(network, /cleartextTrafficPermitted="false"/);
  assert.match(activity, /onReceivedSslError[\s\S]*handler\.cancel\(\)/);
  assert.doesNotMatch(activity, /handler\.proceed\(\)/);
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity, /setAcceptThirdPartyCookies\(browser, false\)/);
  assert.match(serviceWorker, /\/api/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request/);
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
