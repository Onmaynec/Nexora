"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("релиз 3.6.0 собирает signed Connect assets без native SQLite и MLS runtime", () => {
  const packageJson = JSON.parse(read("package.json"));
  const lock = read("package-lock.json");
  const client = read("electron-builder.client.yml");
  const server = read("electron-builder.server.yml");
  const updater = read("electron/update-service.cjs");
  const clientMain = read("electron/client-main.cjs");
  const androidBuild = read("android/app/build.gradle.kts");
  const releaseWorkflow = read(".github/workflows/release.yml");
  const ciWorkflow = read(".github/workflows/ci.yml");
  const unitRunner = read("scripts/run-unit-tests.cjs");
  const signingCheck = read("scripts/check-release-signing.cjs");
  const signatureVerifier = read("scripts/verify-authenticode.ps1");
  const evidence = JSON.parse(read("release-evidence/current.json"));

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

  assert.match(androidBuild, /nexoraRequireSigning/);
  assert.match(androidBuild, /NEXORA_ANDROID_KEYSTORE_PATH/);
  assert.match(androidBuild, /NEXORA_ANDROID_KEYSTORE_PASSWORD/);
  assert.match(androidBuild, /NEXORA_ANDROID_KEY_ALIAS/);
  assert.match(androidBuild, /NEXORA_ANDROID_KEY_PASSWORD/);
  assert.match(androidBuild, /enableV2Signing\s*=\s*true/);
  assert.match(androidBuild, /enableV3Signing\s*=\s*true/);

  assert.equal(evidence.status, "implementation-candidate");
  assert.equal(evidence.signed, false);
  assert.ok(evidence.releaseBlockers.length > 0);
  assert.equal(evidence.publicationPolicy.requiresSignedArtifacts, true);
  assert.equal(evidence.publicationPolicy.updaterMetadataPublished, false);

  assert.match(releaseWorkflow, /name: Nexora 3\.6\.0 signed stable release/);
  assert.match(releaseWorkflow, /This workflow publishes only Nexora 3\.6\.0/);
  assert.match(releaseWorkflow, /environment: nexora-production-release/);
  assert.match(releaseWorkflow, /statuses:\s*write/);
  assert.match(releaseWorkflow, /Mark release status pending/);
  assert.match(releaseWorkflow, /context="release\/3\.6\.0"/);
  assert.match(releaseWorkflow, /Mark release status successful/);
  assert.match(releaseWorkflow, /Mark release status failed/);
  assert.match(releaseWorkflow, /Resolve immutable release identity/);
  assert.match(releaseWorkflow, /Refuse overwrite of published v3\.6\.0/);
  assert.match(releaseWorkflow, /Immutable v3\.6\.0 GitHub Release already exists/);
  assert.match(releaseWorkflow, /cancel-in-progress:\s*false/);
  assert.match(releaseWorkflow, /Verify release approval and external evidence/);
  assert.match(releaseWorkflow, /status !== 'release-approved'/);
  assert.match(releaseWorkflow, /releaseBlockers\.length !== 0/);
  assert.match(releaseWorkflow, /release:signing-check/);
  assert.match(releaseWorkflow, /Build and verify signed Android artifact/);
  assert.match(releaseWorkflow, /:app:assembleRelease -PnexoraRequireSigning=true/);
  assert.match(releaseWorkflow, /NEXORA_ANDROID_SIGNER_SHA256/);
  assert.match(releaseWorkflow, /apksigner verify/);
  assert.match(releaseWorkflow, /Build signed Windows Client and Server/);
  assert.match(releaseWorkflow, /Get-AuthenticodeSignature/);
  assert.match(releaseWorkflow, /TimeStamperCertificate/);
  assert.match(releaseWorkflow, /Nexora-Client-Setup-\$version\.exe\.blockmap/);
  assert.match(releaseWorkflow, /Nexora-Server-Setup-\$version\.exe\.blockmap/);
  assert.match(releaseWorkflow, /latest\.yml/);
  assert.match(releaseWorkflow, /server\.yml/);
  assert.match(releaseWorkflow, /Installed signed package smoke/);
  assert.match(releaseWorkflow, /WaitForExit\(180000\)/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /Nexora-\$version-source\.zip/);
  assert.match(releaseWorkflow, /npm sbom --omit=dev --sbom-format=spdx/);
  assert.match(releaseWorkflow, /--publish never/);
  assert.doesNotMatch(releaseWorkflow, /UNSIGNED/i);
  assert.doesNotMatch(releaseWorkflow, /--prerelease/);
  assert.doesNotMatch(releaseWorkflow, /--clobber/);
  assert.match(releaseWorkflow, /Create immutable annotated tag/);
  assert.match(releaseWorkflow, /Publish signed GitHub Release/);
  assert.match(releaseWorkflow, /Re-download and verify immutable release assets/);
  assert.match(releaseWorkflow, /push:[\s\S]*branches:\s*\[main\]/);
  assert.match(releaseWorkflow, /startsWith\(github\.event\.head_commit\.message, 'release: Nexora 3\.6\.0'\)/);
  assert.match(releaseWorkflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(releaseWorkflow, /inputs\.release_ref \|\| github\.sha/);
  assert.doesNotMatch(releaseWorkflow, /workflow_run:/);
  assert.doesNotMatch(releaseWorkflow, /github\.event\.workflow_run/);
  assert.match(clientMain, /createUpdateService/);
});

test("Android BuildConfig is generated for the runtime version label", () => {
  const gradle = read("android/app/build.gradle.kts");
  const activity = read("android/app/src/main/java/com/nexora/mobile/MainActivity.kt");
  assert.match(activity, /BuildConfig\.VERSION_NAME/);
  assert.match(gradle, /buildFeatures\s*\{\s*buildConfig\s*=\s*true\s*\}/);
});

test("security audit follows signed Connect release policy", () => {
  const audit = read("scripts/security-audit.cjs");
  assert.match(audit, /Official 3\.6\.0 signed release is evidence-gated and updater-safe/);
  assert.doesNotMatch(audit, /Official 3\.5\.0 unsigned release is transparent/);
  assert.match(audit, /requiresSignedArtifacts !== true/);
  assert.match(audit, /Get-AuthenticodeSignature/);
  assert.match(audit, /NEXORA_ANDROID_SIGNER_SHA256/);
  assert.match(audit, /updaterMetadataPublished !== true/);
});

test("security audit runs the npm CLI with Node on Windows and Linux", () => {
  const audit = read("scripts/security-audit.cjs");
  assert.match(audit, /process\.env\.npm_execpath/);
  assert.match(audit, /spawnSync\(process\.execPath, \[npmCli, "audit"/);
  assert.match(audit, /shell: false/);
  assert.match(audit, /npm audit metadata unavailable/);
  assert.doesNotMatch(audit, /process\.platform === "win32" \? "npm\.cmd"/);
});
