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

  const markers = [
    ["README.md", new RegExp(`current-${escapedVersion}%20`), `does not expose current version ${version}`],
    ["README.md", new RegExp("\\| `" + escapedVersion + "` \\|"), `does not list release ${version}`],
    ["PROJECT_INDEX.md", new RegExp("Repository version \\| `" + escapedVersion + "`"), `does not match ${version}`],
    ["docs/README.md", new RegExp("Current repository version \\| `" + escapedVersion + "`"), `does not match ${version}`],
    ["docs/ARCHITECTURE.md", new RegExp("main` версии `" + escapedVersion + "`"), `does not match ${version}`],
    ["docs/SECURITY_MODEL.md", new RegExp("Модель безопасности Nexora " + escapedVersion), `title does not match ${version}`],
    ["docs/SECURITY_MODEL.md", new RegExp("Version \\| `" + escapedVersion + "`"), `table does not match ${version}`],
    ["android/README.md", new RegExp("Current version \\| `" + escapedVersion + "`"), `does not match ${version}`],
    ["android/README.md", new RegExp("version metadata equals `" + escapedVersion + "`"), `acceptance metadata does not match ${version}`],
  ];

  for (const [relativePath, expression, description] of markers) {
    expectMatch(relativePath, read(root, relativePath), expression, description);
  }

  const currentEvidence = parseJson(root, "release-evidence/current.json");
  if (currentEvidence.version !== version) fail(`release-evidence/current.json version ${currentEvidence.version} != ${version}`);
  if (currentEvidence.tag !== `v${version}`) fail(`release-evidence/current.json tag ${currentEvidence.tag} != v${version}`);

  for (const relativePath of [`RELEASE_NOTES_${version}.md`, `RELEASE_VERIFICATION_${version}.md`]) {
    const source = read(root, relativePath);
    if (!source.includes(version)) fail(`${relativePath} does not identify ${version}`);
  }

  const changelog = read(root, "CHANGELOG.md");
  expectMatch(
    "CHANGELOG.md",
    changelog,
    new RegExp(`^## \\[${escapedVersion}\\]`, "m"),
    `does not contain ${version}`,
  );

  const history = read(root, "RELEASE_HISTORY.md");
  if (!history.includes("CHANGELOG.md")) fail("RELEASE_HISTORY.md does not delegate to CHANGELOG.md");
  if (/^## \[?\d+\.\d+\.\d+/m.test(history)) fail("RELEASE_HISTORY.md duplicates the canonical version timeline");

  const currentDocuments = [
    "README.md",
    "PROJECT_INDEX.md",
    "docs/README.md",
    "docs/ARCHITECTURE.md",
    "docs/SECURITY_MODEL.md",
    "android/README.md",
    "SECURITY_AUDIT.md",
    "BRANCH_STATUS.md",
  ];
  for (const relativePath of currentDocuments) {
    const source = read(root, relativePath);
    if (source.includes("RELEASE_VERIFICATION_3.2.4.md")) {
      fail(`${relativePath} still links the obsolete current verification document 3.2.4`);
    }
  }

  return { version, expectedAndroidCode };
}

if (require.main === module) {
  try {
    const result = checkReleaseConsistency();
    console.log(`Release consistency ${result.version} is valid (Android versionCode ${result.expectedAndroidCode}).`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { checkReleaseConsistency };
