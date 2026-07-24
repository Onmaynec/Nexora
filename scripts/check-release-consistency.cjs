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
const fail = (message) => failures.push(message);
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const requireMarker = (relativePath, marker) => { if (!read(relativePath).includes(marker)) fail(`${relativePath}: missing ${JSON.stringify(marker)}`); };

if (pkg.version !== "3.3.4" || lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) fail("package/lock version mismatch");
if (CLIENT_VERSION !== pkg.version) fail("Client version mismatch");
if (!android.includes('versionName = "3.3.4"') || !android.includes("versionCode = 30304")) fail("Android metadata mismatch");
if (pkg.dependencies?.["ts-mls"] || lock.packages?.["node_modules/ts-mls"]) fail("ts-mls must not ship");
for (const removed of [
  "server/trust-core.cjs", "server/trust-routes.cjs", "server/trust-recovery-routes.cjs",
  "server/trust-socket.cjs", "server/mls-transport.cjs", "server/e2ee-attachments.cjs",
  "client/src/crypto/mls-engine.js", "client/src/crypto/trust-client.js", "client/src/components/SecureMessagePane.jsx",
]) if (fs.existsSync(path.join(root, removed))) fail(`${removed} must remain removed`);

for (const [relativePath, marker] of [
  ["README.md", "current-3.3.4"],
  ["PROJECT_INDEX.md", "Repository version | \`3.3.4\`"],
  ["docs/README.md", "Current repository version | \`3.3.4\`"],
  ["docs/ARCHITECTURE.md", "3.3.4"],
  ["docs/SECURITY_MODEL.md", "3.3.4"],
  ["RELEASE_NOTES_3.3.4.md", "3.3.4"],
  ["RELEASE_VERIFICATION_3.3.4.md", "3.3.4"],
  ["SECURITY_REVIEW_3.3.4.md", "3.3.4"],
  ["CHANGELOG.md", "## [3.3.4] - Unreleased"],
]) requireMarker(relativePath, marker);

if (evidence.version !== pkg.version || evidence.tag !== `v${pkg.version}`) fail("release evidence identity mismatch");
if (evidence.status !== "release-candidate" || evidence.published !== false) fail("pre-publication evidence must be release-candidate");
requireMarker(".github/workflows/release.yml", "UNSIGNED-TEST prerelease without updater metadata");
requireMarker("electron/update-service.cjs", "UPDATE_SIGNATURE_INVALID");
requireMarker("electron/update-service.cjs", "allowDowngrade = false");
requireMarker("electron-builder.client.yml", "verifyUpdateCodeSignature: true");
requireMarker("electron-builder.server.yml", "channel: server");

for (const temporary of [
  ".github/workflows/stable-core-migration.yml", ".github/workflows/stable-core-diagnostics.yml",
  "scripts/apply-stable-core-3.4.cjs", "scripts/apply-stable-core-error-contracts.cjs",
  "scripts/apply-stable-core-bootstrap.cjs", "scripts/apply-stable-core-client-retirement.cjs",
  "scripts/apply-stable-core-runtime-retirement.cjs", "scripts/apply-stable-core-docs.cjs",
  "migration-error.log", "unit-failures.log",
]) if (fs.existsSync(path.join(root, temporary))) fail(`${temporary} must be removed`);

if (failures.length) {
  console.error("Release consistency failed:");
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log("Release consistency OK for Nexora 3.3.4 Post-MLS Baseline RC");
}
