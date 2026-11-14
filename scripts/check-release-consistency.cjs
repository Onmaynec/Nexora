"use strict";

const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error(`Release consistency: ${message}`);
}

function read(root, relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) fail(`missing ${relativePath}`);
  return fs.readFileSync(file, "utf8");
}

function parseJson(root, relativePath) {
  try {
    return JSON.parse(read(root, relativePath));
  } catch (error) {
    fail(`invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function expectMatch(relativePath, source, expression, description) {
  if (!expression.test(source)) fail(`${relativePath} ${description}`);
}

function checkReleaseConsistency(root = path.resolve(__dirname, "..")) {
  const packageJson = parseJson(root, "package.json");
  const version = String(packageJson.version || "");
  const semver = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!semver) fail(`package.json has invalid SemVer ${JSON.stringify(version)}`);
  const [, major, minor, patch] = semver.map(Number);
  const expectedAndroidCode = major * 10_000 + minor * 100 + patch;
  const escapedVersion = version.replace(/\./g, "\\.");

  const lock = parseJson(root, "package-lock.json");
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    fail(`package-lock.json is not synchronized with ${version}`);
  }
  if (packageJson.dependencies?.["ts-mls"] || lock.packages?.["node_modules/ts-mls"]) {
    fail("ts-mls must not ship in Stable Core");
  }

  expectMatch(
    "client/src/api.js",
    read(root, "client/src/api.js"),
    new RegExp(`CLIENT_VERSION\\s*=\\s*"${escapedVersion}"`),
    `does not declare Client version ${version}`,
  );
  const android = read(root, "android/app/build.gradle.kts");
  expectMatch("android/app/build.gradle.kts", android, new RegExp(`versionName\\s*=\\s*"${escapedVersion}"`), `does not declare versionName ${version}`);
  expectMatch("android/app/build.gradle.kts", android, new RegExp(`versionCode\\s*=\\s*${expectedAndroidCode}\\b`), `does not declare versionCode ${expectedAndroidCode}`);
  for (const marker of [
    "nexoraRequireSigning",
    "NEXORA_ANDROID_KEYSTORE_PATH",
    "NEXORA_ANDROID_KEYSTORE_PASSWORD",
    "NEXORA_ANDROID_KEY_ALIAS",
    "NEXORA_ANDROID_KEY_PASSWORD",
    "enableV2Signing = true",
    "enableV3Signing = true",
  ]) {
    if (!android.includes(marker)) fail(`android/app/build.gradle.kts missing ${JSON.stringify(marker)}`);
  }

  for (const removed of [
    "server/trust-core.cjs",
    "server/trust-routes.cjs",
    "server/trust-recovery-routes.cjs",
    "server/trust-socket.cjs",
    "server/mls-transport.cjs",
    "server/e2ee-attachments.cjs",
    "client/src/crypto/mls-engine.js",
    "client/src/crypto/trust-client.js",
    "client/src/components/SecureMessagePane.jsx",
  ]) {
    if (fs.existsSync(path.join(root, removed))) fail(`${removed} must remain removed`);
  }

  const currentDocuments = [
    "README.md",
    "PROJECT_INDEX.md",
    "docs/README.md",
    "docs/ARCHITECTURE.md",
    "docs/SECURITY_MODEL.md",
    "docs/releases/README.md",
    "android/README.md",
    "SECURITY.md",
    "SECURITY_AUDIT.md",
    "SUPPORT.md",
    "CONTRIBUTING.md",
    "ADMIN_GUIDE.md",
    "TESTER_GUIDE.md",
    "BRANCH_STATUS.md",
    "BRANCHES.md",
    "docs/PRODUCT_OVERVIEW.md",
    "docs/OPERATIONS_RUNBOOK.md",
    "docs/DEPLOYMENT.md",
    "docs/RELEASE_POLICY.md",
    "docs/GITHUB_RELEASE.md",
    "docs/RELEASE_CHECKLIST.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    "website/index.html",
    "website/app.js",
    "website/site-fixes.js",
  ];

  const specificMarkers = [
    ["README.md", new RegExp(`current-${escapedVersion}`), `does not expose current version ${version}`],
    ["PROJECT_INDEX.md", new RegExp("Repository version \\| `" + escapedVersion + "`"), `does not match ${version}`],
    ["docs/README.md", new RegExp("Current repository version \\| `" + escapedVersion + "`"), `does not match ${version}`],
    ["SECURITY.md", new RegExp("\\| `" + escapedVersion + "` \\| Connect implementation candidate"), `supported version does not match ${version}`],
    ["website/index.html", new RegExp(`>${escapedVersion}<`), `static version does not match ${version}`],
    ["website/app.js", new RegExp(`FALLBACK_VERSION\\s*=\\s*"${escapedVersion}"`), `fallback version does not match ${version}`],
    ["website/site-fixes.js", new RegExp(`FALLBACK_VERSION\\s*=\\s*"${escapedVersion}"`), `correction fallback version does not match ${version}`],
  ];
  for (const [relativePath, expression, description] of specificMarkers) {
    expectMatch(relativePath, read(root, relativePath), expression, description);
  }
  for (const relativePath of currentDocuments) {
    if (!read(root, relativePath).includes(version)) fail(`${relativePath} does not identify current version ${version}`);
  }

  const evidence = parseJson(root, "release-evidence/current.json");
  if (evidence.version !== version || evidence.tag !== `v${version}`) fail("current release evidence identity mismatch");
  if (evidence.status !== "implementation-candidate" || evidence.published !== false || evidence.signed !== false) {
    fail("current evidence must describe an unpublished, unsigned implementation candidate");
  }
  if (evidence.distribution !== "signed-stable-pending-evidence") fail("Connect distribution identity mismatch");
  if (evidence.baseline !== "3.5.0") fail("Connect source baseline must be 3.5.0");
  if (!Array.isArray(evidence.releaseBlockers) || evidence.releaseBlockers.length === 0) {
    fail("implementation candidate must retain explicit release blockers");
  }
  const policy = evidence.publicationPolicy || {};
  if (
    policy.prerelease !== false
    || policy.latest !== true
    || policy.requiresSignedArtifacts !== true
    || policy.updaterMetadataPublished !== false
    || policy.sha256Required !== true
    || policy.sbomRequired !== true
    || policy.crossPlatformCallAcceptanceRequired !== true
  ) {
    fail("Connect publication policy is incomplete");
  }
  for (const asset of [
    `Nexora-Client-Setup-${version}.exe`,
    `Nexora-Client-Setup-${version}.exe.blockmap`,
    "latest.yml",
    `Nexora-Server-Setup-${version}.exe`,
    `Nexora-Server-Setup-${version}.exe.blockmap`,
    "server.yml",
    `Nexora-Android-${version}.apk`,
    `Nexora-PWA-${version}.zip`,
    `Nexora-${version}-source.zip`,
    `Nexora-${version}.spdx.json`,
    "WINDOWS-SIGNATURE-EVIDENCE.json",
    "ANDROID-SIGNATURE-EVIDENCE.txt",
    "RELEASE-EVIDENCE.json",
    "SHA256SUMS.txt",
  ]) {
    if (!evidence.plannedAssets?.includes(asset)) fail(`release-evidence/current.json missing planned asset ${asset}`);
  }

  const externalEvidence = [
    `release-evidence/independent-security-review-${version}.json`,
    `release-evidence/windows-acceptance-${version}.json`,
    `release-evidence/android-acceptance-${version}.json`,
    `release-evidence/pwa-acceptance-${version}.json`,
    `release-evidence/connect-cross-platform-acceptance-${version}.json`,
  ].map((relativePath) => [relativePath, parseJson(root, relativePath)]);
  for (const [relativePath, item] of externalEvidence) {
    if (item.version !== version) fail(`${relativePath} version mismatch`);
    if (!["pending", "passed", "blocked"].includes(item.status)) fail(`${relativePath} has invalid status`);
    if (item.status === "passed" && !item.completedAt) fail(`${relativePath} passed without completedAt`);
  }

  const releaseDirectory = `docs/releases/${version}`;
  for (const relativePath of [`${releaseDirectory}/RELEASE_NOTES.md`, `${releaseDirectory}/RELEASE_VERIFICATION.md`]) {
    const source = read(root, relativePath);
    if (!source.includes(version)) fail(`${relativePath} does not identify ${version}`);
    if (/compatibility pointer/i.test(source)) fail(`${relativePath} must contain canonical content, not a compatibility pointer`);
  }
  for (const [relativePath, canonicalPath] of [
    [`RELEASE_NOTES_${version}.md`, `${releaseDirectory}/RELEASE_NOTES.md`],
    [`RELEASE_VERIFICATION_${version}.md`, `${releaseDirectory}/RELEASE_VERIFICATION.md`],
  ]) {
    const source = read(root, relativePath);
    if (!source.includes(canonicalPath) || !/compatibility pointer/i.test(source)) {
      fail(`${relativePath} must be a compatibility pointer to ${canonicalPath}`);
    }
  }

  expectMatch("CHANGELOG.md", read(root, "CHANGELOG.md"), new RegExp(`^## \\[${escapedVersion}\\]`, "m"), `does not contain ${version}`);
  const releaseIndex = read(root, "docs/releases/README.md");
  if (!releaseIndex.includes("CHANGELOG.md")) fail("docs/releases/README.md does not delegate to CHANGELOG.md");
  if (!releaseIndex.includes(`${version}/RELEASE_NOTES.md`) || !releaseIndex.includes(`${version}/RELEASE_VERIFICATION.md`)) {
    fail(`docs/releases/README.md does not index ${version}`);
  }
  if (releaseIndex.split(/\r?\n/).some((line) => /^## [0-9]/.test(line) || /^## \[[0-9]/.test(line))) {
    fail("docs/releases/README.md duplicates the canonical version timeline");
  }

  for (const relativePath of currentDocuments) {
    const source = read(root, relativePath);
    for (const obsolete of ["RELEASE_VERIFICATION_3.2.4.md", "docs/releases/3.2.4/RELEASE_VERIFICATION.md"]) {
      if (source.includes(obsolete)) fail(`${relativePath} still links the obsolete current verification document 3.2.4`);
    }
  }

  const releaseWorkflow = read(root, ".github/workflows/release.yml");
  for (const marker of [
    "name: Nexora 3.6.0 signed stable release",
    "environment: nexora-production-release",
    "Verify release approval and external evidence",
    "release:signing-check",
    "NEXORA_ANDROID_SIGNER_SHA256",
    "latest.yml",
    "server.yml",
    "Create immutable annotated tag",
    "Re-download and verify immutable release assets",
  ]) {
    if (!releaseWorkflow.includes(marker)) fail(`.github/workflows/release.yml missing ${JSON.stringify(marker)}`);
  }
  if (/UNSIGNED/i.test(releaseWorkflow) || !releaseWorkflow.includes("requiresSignedArtifacts")) {
    fail(".github/workflows/release.yml must remain signed-only and evidence-gated for 3.6.0");
  }
  for (const temporary of [
    ".github/workflows/stable-core-migration.yml",
    ".github/workflows/stable-core-diagnostics.yml",
    ".github/workflows/dispatch-release-3.3.4.yml",
    ".github/workflows/verify-release-3.3.4.yml",
    ".github/workflows/diagnose-release-3.3.4.yml",
    ".github/workflows/connect-diagnostics.yml",
    ".github/workflows/connect-repair.yml",
    ".github/workflows/apply-connect-release.yml",
    ".github/workflows/connect-schema10-remediation.yml",
    ".connect-release-patch",
    ".connect-remediation",
    ".connect-diagnostics",
    ".connect-repair",
    ".connect-patch-diagnostics.json",
    "scripts/apply-stable-core-3.4.cjs",
    "scripts/apply-stable-core-error-contracts.cjs",
    "scripts/apply-stable-core-bootstrap.cjs",
    "scripts/apply-stable-core-client-retirement.cjs",
    "scripts/apply-stable-core-runtime-retirement.cjs",
    "scripts/apply-stable-core-docs.cjs",
    "scripts/prepare-3.4-release-docs.cjs",
    "scripts/repair-connect-3.6.cjs",
    "migration-error.log",
    "unit-failures.log",
  ]) {
    if (fs.existsSync(path.join(root, temporary))) fail(`${temporary} must be removed`);
  }

  return {
    version,
    expectedAndroidCode,
    currentDocumentCount: currentDocuments.length,
    releaseStatus: evidence.status,
    releaseBlockerCount: evidence.releaseBlockers.length,
  };
}

if (require.main === module) {
  try {
    const result = checkReleaseConsistency();
    console.log(
      `Release consistency ${result.version} is valid `
      + `(Android versionCode ${result.expectedAndroidCode}, ${result.currentDocumentCount} current documents, `
      + `${result.releaseBlockerCount} explicit release blockers).`,
    );
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { checkReleaseConsistency };
