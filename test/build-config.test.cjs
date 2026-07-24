"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("релиз 3.5.0 собирает только проверяемый signed Mobile Continuity без native SQLite и MLS runtime", () => {
  const packageJson = JSON.parse(read("package.json"));
  const lock = read("package-lock.json");
  const client = read("electron-builder.client.yml");
  const server = read("electron-builder.server.yml");
  const updater = read("electron/update-service.cjs");
  const clientMain = read("electron/client-main.cjs");
  const releaseWorkflow = read(".github/workflows/release.yml");
  const ciWorkflow = read(".github/workflows/ci.yml");
  const unitRunner = read("scripts/run-unit-tests.cjs");
  const signingCheck = read("scripts/check-release-signing.cjs");
  const signatureVerifier = read("scripts/verify-authenticode.ps1");

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

  assert.match(releaseWorkflow, /name: Nexora 3\.5\.0 stable release/);
  assert.match(releaseWorkflow, /This workflow publishes only Nexora 3\.5\.0/);
  assert.match(releaseWorkflow, /Verify required 3\.4\.0 baseline/);
  assert.match(releaseWorkflow, /release-evidence\/independent-security-review-3\.5\.0\.json/);
  assert.match(releaseWorkflow, /release-evidence\/windows-acceptance-3\.5\.0\.json/);
  assert.match(releaseWorkflow, /release-evidence\/android-acceptance-3\.5\.0\.json/);
  assert.match(releaseWorkflow, /release-evidence\/pwa-acceptance-3\.5\.0\.json/);
  assert.match(releaseWorkflow, /Verify Android and PWA acceptance evidence/);
  assert.match(releaseWorkflow, /Require complete Authenticode policy/);
  assert.match(releaseWorkflow, /Release blocker: complete Authenticode policy is required/);
  assert.match(releaseWorkflow, /Build and verify signed Windows assets/);
  assert.match(releaseWorkflow, /Installed package upgrade smoke/);
  assert.match(releaseWorkflow, /Nexora-Client-Setup-\$version\.exe/);
  assert.match(releaseWorkflow, /Nexora-Server-Setup-\$version\.exe/);
  assert.match(releaseWorkflow, /latest\.yml/);
  assert.match(releaseWorkflow, /server\.yml/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /Nexora-\$version-source\.zip/);
  assert.match(releaseWorkflow, /npm sbom --omit=dev --sbom-format=spdx/);
  assert.match(releaseWorkflow, /--publish never/);
  assert.doesNotMatch(releaseWorkflow, /--publish always/);
  assert.match(releaseWorkflow, /verify-authenticode\.ps1/);
  assert.match(releaseWorkflow, /docs\/releases\/\$version\/RELEASE_NOTES\.md/);
  assert.match(releaseWorkflow, /Immutable tag already points to another commit/);
  assert.match(releaseWorkflow, /Re-download and verify immutable release assets/);
  assert.match(releaseWorkflow, /baseline = 'v3\.4\.0'/);
  assert.match(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /startsWith\(github\.event\.workflow_run\.head_commit\.message, 'release: Nexora 3\.5\.0'\)/);
  assert.match(clientMain, /createUpdateService/);
});
