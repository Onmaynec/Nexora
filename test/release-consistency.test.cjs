"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkReleaseConsistency } = require("../scripts/check-release-consistency.cjs");

const root = path.resolve(__dirname, "..");
const fixtureFiles = [
  "package.json",
  "package-lock.json",
  "android/app/build.gradle.kts",
  "android/README.md",
  "README.md",
  "PROJECT_INDEX.md",
  "docs/README.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "SECURITY_AUDIT.md",
  "BRANCH_STATUS.md",
  "CHANGELOG.md",
  "RELEASE_HISTORY.md",
  "release-evidence/current.json",
];

function copyFixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-release-consistency-"));
  const version = require("../package.json").version;
  for (const relativePath of [...fixtureFiles, `RELEASE_NOTES_${version}.md`, `RELEASE_VERIFICATION_${version}.md`]) {
    const source = path.join(root, relativePath);
    const destination = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return target;
}

test("release metadata and current documentation use one version", () => {
  const result = checkReleaseConsistency(root);
  assert.equal(result.version, require("../package.json").version);
});

test("release consistency gate rejects Android metadata drift", () => {
  const fixture = copyFixture();
  try {
    const gradle = path.join(fixture, "android/app/build.gradle.kts");
    fs.writeFileSync(gradle, fs.readFileSync(gradle, "utf8").replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "0.0.0"'));
    assert.throws(() => checkReleaseConsistency(fixture), /versionName/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
