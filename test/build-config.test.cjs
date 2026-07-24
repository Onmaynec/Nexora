"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

test("релиз 3.3.4 собирает проверяемые assets без native SQLite и MLS runtime", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
  const client = fs.readFileSync(path.join(root, "electron-builder.client.yml"), "utf8");
  const server = fs.readFileSync(path.join(root, "electron-builder.server.yml"), "utf8");
  const updater = fs.readFileSync(path.join(root, "electron", "update-service.cjs"), "utf8");
  const clientMain = fs.readFileSync(path.join(root, "electron", "client-main.cjs"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  const ciWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  const unitRunner = fs.readFileSync(path.join(root, "scripts", "run-unit-tests.cjs"), "utf8");
  const signingCheck = fs.readFileSync(path.join(root, "scripts", "check-release-signing.cjs"), "utf8");
  const signatureVerifier = fs.readFileSync(path.join(root, "scripts", "verify-authenticode.ps1"), "utf8");

  assert.equal(packageJson.version, require("../package-lock.json").version);
  assert.equal(packageJson.dependencies["better-sqlite3"], undefined);
  assert.equal(packageJson.devDependencies?.["better-sqlite3"], undefined);
  assert.equal(packageJson.dependencies["ts-mls"], undefined);
  assert.equal(fs.existsSync(path.join(root, "server", "trust-core.cjs")), false);
  assert.equal(fs.existsSync(path.join(root, "server", "mls-transport.cjs")), false);
  assert.equal(fs.existsSync(path.join(root, "client", "src", "crypto", "mls-engine.js")), false);
  assert.match(packageJson.scripts.test, /build:web/);
  assert.match(packageJson.scripts["test:unit"], /run-unit-tests\.cjs/);
  assert.match(unitRunner, /spawnSync\(process\.execPath/);
  assert.match(unitRunner, /"--test"/);
  assert.match(unitRunner, /name !== "performance\.test\.cjs"/);
  assert.match(packageJson.scripts["test:performance"], /node --test --test-concurrency=1 test\/performance\.test\.cjs/);
  assert.match(packageJson.scripts["release:check"], /test:unit[\s\S]*test:performance[\s\S]*audit:security/);
  assert.match(ciWorkflow, /verify:[\s\S]*test:unit[\s\S]*test:performance[\s\S]*audit:security/);
  assert.doesNotMatch(lock, /node_modules\/better-sqlite3/);
  assert.doesNotMatch(lock, /node_modules\/ts-mls/);
  assert.match(packageJson.engines.node, /22\.16/);

  for (const config of [client, server]) {
    assert.match(config, /npmRebuild:\s*false/);
    assert.match(config, /provider:\s*github/);
    assert.match(config, /owner:\s*Onmaynec/);
    assert.match(config, /repo:\s*Nexora/);
    assert.match(config, /releaseType:\s*draft/);
    assert.match(config, /verifyUpdateCodeSignature:\s*true/);
  }
  assert.match(client, /electron\/client-connection\.cjs/);
  assert.match(server, /channel:\s*server/);
  assert.match(server, /publishAutoUpdate:\s*true/);
  assert.doesNotMatch(server, /\.node|better-sqlite3|node-gyp|ts-mls/);

  assert.match(updater, /autoInstallOnAppQuit\s*=\s*automatic/);
  assert.match(updater, /allowDowngrade\s*=\s*false/);
  assert.match(updater, /UPDATE_SIGNATURE_INVALID/);
  assert.match(updater, /kind === "server" \? "server" : "latest"/);
  assert.match(updater, /isNewerVersion/);

  assert.match(signingCheck, /NEXORA_WINDOWS_SIGNER_SUBJECT/);
  assert.match(signingCheck, /NEXORA_WINDOWS_SIGNER_THUMBPRINT/);
  assert.match(signatureVerifier, /Get-AuthenticodeSignature/);
  assert.match(signatureVerifier, /TimeStamperCertificate/);
  assert.match(signatureVerifier, /Unexpected certificate thumbprint/);

  assert.match(releaseWorkflow, /This workflow publishes only Nexora 3\.3\.4/);
  assert.match(releaseWorkflow, /PUBLISH_TAG=\$officialTag/);
  assert.doesNotMatch(releaseWorkflow, /Verify required 3\.3\.4 baseline/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /Nexora-\$version-source\.zip/);
  assert.match(releaseWorkflow, /npm sbom --omit=dev --sbom-format=spdx/);
  assert.match(releaseWorkflow, /steps\.signing\.outputs\.available == 'true'/);
  assert.match(releaseWorkflow, /Build and verify signed Windows assets/);
  assert.match(releaseWorkflow, /Build explicitly unsigned Windows test assets/);
  assert.match(releaseWorkflow, /Nexora-Client-Setup-\$version-UNSIGNED-TEST\.exe/);
  assert.match(releaseWorkflow, /Nexora-Server-Setup-\$version-UNSIGNED-TEST\.exe/);
  assert.match(releaseWorkflow, /Nexora-Android-\$version-UNSIGNED-TEST\.apk/);
  assert.match(releaseWorkflow, /--publish never/);
  assert.doesNotMatch(releaseWorkflow, /--publish always/);
  assert.match(releaseWorkflow, /Installed Windows package smoke/);
  assert.match(releaseWorkflow, /verify-authenticode\.ps1/);
  assert.match(releaseWorkflow, /server\.yml/);
  assert.match(releaseWorkflow, /UNSIGNED-TEST prerelease without updater metadata/);
  assert.match(releaseWorkflow, /Unsigned artifact set contains updater metadata/);
  assert.match(releaseWorkflow, /Immutable tag already points to another commit/);
  assert.match(releaseWorkflow, /Re-download and verify immutable release assets/);
  assert.match(releaseWorkflow, /baseline\s*=\s*'v3\.3\.3'/);
  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /startsWith\(github\.event\.workflow_run\.head_commit\.message, 'release: Nexora '\)/);
  assert.doesNotMatch(releaseWorkflow, /startsWith\(github\.event\.workflow_run\.head_commit\.message, 'release:'\)/);

  assert.match(clientMain, /persist:nexora-server-/);
  assert.match(clientMain, /partition:\s*currentPartition/);
  assert.match(ciWorkflow, /android-source:/);
  assert.match(ciWorkflow, /gradle-version:\s*"8\.13"/);
});

test("Nexora Server installer включает shared-модули, необходимые серверному runtime", () => {
  const serverConfig = fs.readFileSync(path.join(root, "electron-builder.server.yml"), "utf8");
  const sandboxService = fs.readFileSync(path.join(root, "server", "pulse-sandbox-service.cjs"), "utf8");
  const catalogPath = path.join(root, "shared", "pulse-catalog.cjs");

  assert.match(sandboxService, /require\("\.\.\/shared\/pulse-catalog\.cjs"\)/);
  assert.ok(fs.existsSync(catalogPath), "shared/pulse-catalog.cjs должен существовать в исходном дереве");
  assert.match(
    serverConfig,
    /^\s*-\s+shared\/\*\*\/\*\s*$/m,
    "electron-builder.server.yml должен упаковывать shared/**/*, иначе Nexora Server падает при запуске с MODULE_NOT_FOUND",
  );
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
