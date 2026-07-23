"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CLIENT_VERSION } = require("../client/src/api.js");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const android = fs.readFileSync(path.join(root, "android/app/build.gradle.kts"), "utf8");
const evidence = JSON.parse(fs.readFileSync(path.join(root, "release-evidence/current.json"), "utf8"));

const failures = [];
function fail(message) { failures.push(message); }
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function requireMarker(relativePath, marker) {
  const value = read(relativePath);
  if (!value.includes(marker)) fail(`${relativePath}: отсутствует маркер ${JSON.stringify(marker)}`);
}
function forbidMarker(relativePath, marker) {
  const value = read(relativePath);
  if (value.includes(marker)) fail(`${relativePath}: найден запрещённый устаревший маркер ${JSON.stringify(marker)}`);
}

if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) fail("package.json и package-lock.json имеют разные версии");
if (CLIENT_VERSION !== pkg.version) fail(`CLIENT_VERSION=${CLIENT_VERSION}, package=${pkg.version}`);
if (!android.includes(`versionName = "${pkg.version}"`)) fail("Android versionName не совпадает с package version");
if (!android.includes("versionCode = 30400")) fail("Android versionCode для 3.4.0 должен быть 30400");
if (pkg.dependencies?.["ts-mls"] || lock.packages?.["node_modules/ts-mls"]) fail("ts-mls не должен входить в Stable Core runtime");

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
  if (fs.existsSync(path.join(root, removed))) fail(`${removed}: executable Trust/MLS runtime must be removed`);
}

const markerChecks = [
  ["README.md", "current-3.4.0%20RC"],
  ["README.md", "Stable Core release candidate"],
  ["PROJECT_INDEX.md", "Repository version | `3.4.0`"],
  ["docs/README.md", "Current repository version | `3.4.0`"],
  ["docs/ARCHITECTURE.md", "Архитектура Nexora 3.4.0 Stable Core"],
  ["docs/SECURITY_MODEL.md", "Модель безопасности Nexora 3.4.0 Stable Core"],
  ["docs/OPERATIONS_RUNBOOK.md", "Stable Core 3.4.0 RC"],
  ["docs/DEPLOYMENT.md", "Stable Core 3.4.0 RC"],
  ["docs/PRODUCT_OVERVIEW.md", "Stable Core 3.4.0 RC"],
  ["docs/RELEASE_POLICY.md", "3.4.0 Stable Core"],
  ["docs/GITHUB_RELEASE.md", "v3.4.0"],
  ["docs/GITHUB_RELEASE.md", "BLOCKED"],
  ["docs/RELEASE_CHECKLIST.md", "Nexora 3.4.0 Stable Core"],
  ["android/README.md", "Stable Core 3.4.0 RC"],
  ["SECURITY.md", "Stable Core 3.4.0 RC"],
  ["SUPPORT.md", "Stable Core 3.4.0 RC"],
  ["CONTRIBUTING.md", "Stable Core 3.4.0 RC"],
  ["ADMIN_GUIDE.md", "Stable Core 3.4.0 RC"],
  ["TESTER_GUIDE.md", "Stable Core 3.4.0 RC"],
  ["BRANCHES.md", "release/3.4.0-stable-core"],
  ["website/README.md", "Stable Core 3.4.0 RC"],
  ["website/index.html", "3.4.0"],
  ["website/src/app.js", "3.4.0"],
  [".github/ISSUE_TEMPLATE/bug_report.md", "3.4.0"],
  ["RELEASE_NOTES_3.4.0.md", "Status:** release candidate"],
  ["RELEASE_VERIFICATION_3.4.0.md", "verified published `v3.3.4` baseline is absent"],
  ["SECURITY_REVIEW_3.4.0.md", "Independent review contract"],
  ["CHANGELOG.md", "## [3.4.0] - Unreleased"],
];
for (const [file, marker] of markerChecks) requireMarker(file, marker);

forbidMarker("docs/README.md", "Current repository version | `3.3.3`");
forbidMarker("README.md", "current-3.3.3%20UNSIGNED--TEST");

if (evidence.version !== pkg.version) fail("release-evidence/current.json version не совпадает с package version");
if (evidence.status !== "release-candidate") fail("current release evidence must remain release-candidate before publication");
if (evidence.published !== false || evidence.signed !== false) fail("unpublished RC evidence cannot claim published/signed status");
for (const blocker of ["verified-v3.3.4", "authenticode-windows-acceptance", "independent-security-review"]) {
  if (!evidence.blockers?.includes(blocker)) fail(`release evidence missing blocker ${blocker}`);
}

requireMarker("electron/update-service.cjs", "UPDATE_SIGNATURE_INVALID");
requireMarker("electron/update-service.cjs", "allowDowngrade = false");
requireMarker("electron-builder.client.yml", "verifyUpdateCodeSignature: true");
requireMarker("electron-builder.server.yml", "channel: server");
requireMarker("scripts/check-release-signing.cjs", "NEXORA_WINDOWS_SIGNER_THUMBPRINT");
requireMarker("scripts/verify-authenticode.ps1", "TimeStamperCertificate");
requireMarker(".github/workflows/release.yml", "Verify required 3.3.4 baseline");
requireMarker(".github/workflows/release.yml", "Installed Windows n-1 to n smoke");
requireMarker(".github/workflows/release.yml", "Re-download and verify immutable release assets");

for (const temporary of [
  ".github/workflows/stable-core-migration.yml",
  ".github/workflows/stable-core-diagnostics.yml",
  "scripts/apply-stable-core-3.4.cjs",
  "scripts/apply-stable-core-error-contracts.cjs",
  "scripts/apply-stable-core-bootstrap.cjs",
  "scripts/apply-stable-core-client-retirement.cjs",
  "scripts/apply-stable-core-runtime-retirement.cjs",
  "scripts/apply-stable-core-docs.cjs",
  "migration-error.log",
  "unit-failures.log",
]) {
  if (fs.existsSync(path.join(root, temporary))) fail(`${temporary}: temporary migration/diagnostic artifact must be removed`);
}

if (failures.length) {
  console.error("Release consistency failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log(`Release consistency OK for Nexora ${pkg.version} Stable Core RC`);
}
