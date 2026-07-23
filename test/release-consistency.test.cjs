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

function withFixture(callback) {
  const fixture = copyFixture();
  try {
    callback(fixture);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

test("release metadata and every current documentation surface use one version", () => {
  const result = checkReleaseConsistency(root);
  assert.equal(result.version, require("../package.json").version);
  assert.equal(result.currentDocumentCount, 24);
});

test("release consistency gate rejects Android metadata drift", () => {
  withFixture((fixture) => {
    const gradle = path.join(fixture, "android/app/build.gradle.kts");
    fs.writeFileSync(gradle, fs.readFileSync(gradle, "utf8").replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "0.0.0"'));
    assert.throws(() => checkReleaseConsistency(fixture), /versionName/);
  });
});

test("release consistency gate rejects a stale current Security Policy version", () => {
  withFixture((fixture) => {
    const policy = path.join(fixture, "SECURITY.md");
    fs.writeFileSync(policy, fs.readFileSync(policy, "utf8").replace("| `3.3.2` | Published", "| `3.3.1` | Published"));
    assert.throws(() => checkReleaseConsistency(fixture), /SECURITY\.md supported version/);
  });
});

test("release consistency gate rejects obsolete current verification links", () => {
  withFixture((fixture) => {
    const support = path.join(fixture, "SUPPORT.md");
    fs.appendFileSync(support, "\n[obsolete](RELEASE_VERIFICATION_3.2.4.md)\n", "utf8");
    assert.throws(() => checkReleaseConsistency(fixture), /obsolete current verification document/);
  });
});
