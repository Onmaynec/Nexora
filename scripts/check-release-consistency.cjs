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

  const packageLock = parseJson(root, "package-lock.json");
  if (packageLock.version !== version) fail(`package-lock.json version ${packageLock.version} != ${version}`);
  if (packageLock.packages?.[""]?.version !== version) {
    fail(`package-lock.json root package version ${packageLock.packages?.[""]?.version} != ${version}`);
  }
  if (packageJson.dependencies?.["ts-mls"] || packageLock.packages?.["node_modules/ts-mls"]) {
    fail("ts-mls must not ship in the post-MLS baseline");
  }

  const clientApi = read(root, "client/src/api.js");
  expectMatch(
    "client/src/api.js",
    clientApi,
    new RegExp(`CLIENT_VERSION\\s*=\\s*"${escapedVersion}"`),
    `does not declare Client version ${version}`,
  );

  const android = read(root, "android/app/build.gradle.kts");
  expectMatch(
    "android/app/build.gradle.kts",
    android,
    new RegExp(`versionName\\s*=\\s*"${escapedVersion}"`),
    `does not declare versionName ${version}`,
  );
  expectMatch(
    "android/app/build.gradle.kts",
    android,
    new RegExp(`versionCode\\s*=\\s*${expectedAndroidCode}\\b`),
    `does not declare versionCode ${expectedAndroidCode}`,
  );

  const removedRuntime = [
    "server/trust-core.cjs",
    "server/trust-routes.cjs",
    "server/trust-recovery-routes.cjs",
    "server/trust-socket.cjs",
    "server/mls-transport.cjs",
    "server/e2ee-attachments.cjs",
    "client/src/crypto/mls-engine.js",
    "client/src/crypto/trust-client.js",
    "client/src/components/SecureMessagePane.jsx",
  ];
  for (const relativePath of removedRuntime) {
    if (fs.existsSync(path.join(root, relativePath))) fail(`${relativePath} must remain removed`);
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
    ["SECURITY.md", new RegExp("\\| `" + escapedVersion + "` \\| Release candidate"), `supported version does not match ${version}`],
    ["website/index.html", new RegExp(`>${escapedVersion}<`), `static version does not match ${version}`],
    ["website/app.js", new RegExp(`FALLBACK_VERSION\\s*=\\s*"${escapedVersion}"`), `fallback version does not match ${version}`],
    ["website/site-fixes.js", new RegExp(`FALLBACK_VERSION\\s*=\\s*"${escapedVersion}"`), `correction fallback version does not match ${version}`],
  ];
  for (const [relativePath, expression, description] of specificMarkers) {
    expectMatch(relativePath, read(root, relativePath), expression, description);
  }

  for (const relativePath of currentDocuments) {
    const source = read(root, relativePath);
    if (!source.includes(version)) fail(`${relativePath} does not identify current version ${version}`);
  }

  const evidence = parseJson(root, "release-evidence/current.json");
  if (evidence.version !== version) fail(`release-evidence/current.json version ${evidence.version} != ${version}`);
  if (evidence.tag !== `v${version}`) fail(`release-evidence/current.json tag ${evidence.tag} != v${version}`);
  if (evidence.status !== "release-candidate" || evidence.published !== false) {
    fail("release-evidence/current.json must remain an unpublished release candidate before publication");
  }

  const releaseDirectory = `docs/releases/${version}`;
  for (const relativePath of [
    `${releaseDirectory}/RELEASE_NOTES.md`,
    `${releaseDirectory}/RELEASE_VERIFICATION.md`,
  ]) {
    const source = read(root, relativePath);
    if (!source.includes(version)) fail(`${relativePath} does not identify ${version}`);
    if (/compatibility pointer/i.test(source)) fail(`${relativePath} must contain canonical content, not a compatibility pointer`);
  }

  const rootPointers = [
    [`RELEASE_NOTES_${version}.md`, `${releaseDirectory}/RELEASE_NOTES.md`],
    [`RELEASE_VERIFICATION_${version}.md`, `${releaseDirectory}/RELEASE_VERIFICATION.md`],
  ];
  for (const [relativePath, canonicalPath] of rootPointers) {
    const source = read(root, relativePath);
    if (!source.includes(canonicalPath) || !/compatibility pointer/i.test(source)) {
      fail(`${relativePath} must be a compatibility pointer to ${canonicalPath}`);
    }
  }

  const changelog = read(root, "CHANGELOG.md");
  expectMatch(
    "CHANGELOG.md",
    changelog,
    new RegExp(`^## \\[${escapedVersion}\\]`, "m"),
    `does not contain ${version}`,
  );

  const releaseIndex = read(root, "docs/releases/README.md");
  if (!releaseIndex.includes("CHANGELOG.md")) fail("docs/releases/README.md does not delegate to CHANGELOG.md");
  if (!releaseIndex.includes(`${version}/RELEASE_NOTES.md`) || !releaseIndex.includes(`${version}/RELEASE_VERIFICATION.md`)) {
    fail(`docs/releases/README.md does not index ${version}`);
  }
  if (/^## \\[?\d+\.\d+\.\d+/m.test(releaseIndex)) {
    fail("docs/releases/README.md duplicates the canonical version timeline");
  }

  const obsoleteVerificationPaths = [
    "RELEASE_VERIFICATION_3.2.4.md",
    "docs/releases/3.2.4/RELEASE_VERIFICATION.md",
  ];
  for (const relativePath of currentDocuments) {
    const source = read(root, relativePath);
    for (const obsoletePath of obsoleteVerificationPaths) {
      if (source.includes(obsoletePath)) {
        fail(`${relativePath} still links the obsolete current verification document 3.2.4`);
      }
    }
  }

  const releaseWorkflow = read(root, ".github/workflows/release.yml");
  for (const marker of [
    "UNSIGNED-TEST prerelease without updater metadata",
    `docs/releases/${version}/RELEASE_NOTES.md`,
    "Re-download and verify immutable release assets",
  ]) {
    if (!releaseWorkflow.includes(marker)) fail(`.github/workflows/release.yml missing ${JSON.stringify(marker)}`);
  }

  for (const temporary of [
    ".github/workflows/stable-core-migration.yml",
    ".github/workflows/stable-core-diagnostics.yml",
    "scripts/apply-stable-core-3.4.cjs",
    "scripts/apply-stable-core-error-contracts.cjs",
    "scripts/apply-stable-core-bootstrap.cjs",
    "scripts/apply-stable-core-client-retirement.cjs",
    "scripts/apply-stable-core-runtime-retirement.cjs",
    "scripts/apply-stable-core-docs.cjs",
    "scripts/finalize-post-mls-current-surfaces.cjs",
    "scripts/finalize-changelog-3.3.4.cjs",
    "migration-error.log",
    "unit-failures.log",
  ]) {
    if (fs.existsSync(path.join(root, temporary))) fail(`${temporary} must be removed`);
  }

  return { version, expectedAndroidCode, currentDocumentCount: currentDocuments.length };
}

if (require.main === module) {
  try {
    const result = checkReleaseConsistency();
    console.log(
      `Release consistency ${result.version} is valid (Android versionCode ${result.expectedAndroidCode}, ${result.currentDocumentCount} current documents).`,
    );
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { checkReleaseConsistency };
