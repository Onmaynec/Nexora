"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const version = "3.4.0";
const oldBranch = "release/3.4.0-stable-core";
const newBranch = "release/3.4.0-stable-core-v2";
const mergedBaseline = "6202bbdf8ff636711d9874452958df5dd40d9656";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

const copiedDocs = [
  "README.md",
  "PROJECT_INDEX.md",
  "docs/README.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
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
  "CHANGELOG.md",
  "RELEASE_NOTES_3.4.0.md",
  "RELEASE_VERIFICATION_3.4.0.md",
  "SECURITY_REVIEW_3.4.0.md",
];

for (const relativePath of copiedDocs) {
  let source = read(relativePath)
    .replaceAll(oldBranch, newBranch)
    .replaceAll("PR #69", "PR #96")
    .replaceAll("`#69`", "`#96`")
    .replaceAll("#69", "#96")
    .replaceAll("1ecb2d830d0ce38c7c42453f4848823e89b67d9c", mergedBaseline);
  write(relativePath, source);
}

let verification = read("RELEASE_VERIFICATION_3.4.0.md");
verification = verification
  .replace(
    /\| Published stable `v3\.3\.4` exists \| \*\*BLOCKED\*\* \|[^\n]*/,
    "| Published verified `v3.3.4` exists | **BLOCKED** | merge baseline is verified; immutable tag/GitHub Release is still absent |",
  )
  .replace(
    /\| `v3\.3\.4` required Client\/Server\/checksum assets \| \*\*BLOCKED\*\* \|[^\n]*/,
    "| `v3.3.4` required Client/Server/checksum assets | **BLOCKED** | publication workflow has not produced the immutable asset set |",
  )
  .replace(
    /\| Working branch started from verified post-3\.3\.4 commit \| \*\*BLOCKED\*\* \|[^\n]*/,
    `| Working branch started from verified post-3.3.4 commit | **PASS** | clean branch starts from merge commit \`${mergedBaseline}\` |`,
  )
  .replace("1. verified published `v3.3.4` baseline is absent;", "1. verified `v3.3.4` source baseline is merged; immutable tag/release/assets remain absent;");
write("RELEASE_VERIFICATION_3.4.0.md", verification);

const canonicalDirectory = `docs/releases/${version}`;
write(`${canonicalDirectory}/RELEASE_NOTES.md`, read("RELEASE_NOTES_3.4.0.md"));
write(`${canonicalDirectory}/RELEASE_VERIFICATION.md`, read("RELEASE_VERIFICATION_3.4.0.md"));
write(
  "RELEASE_NOTES_3.4.0.md",
  `# Nexora 3.4.0 — Release Notes\n\nThe canonical release notes are stored at [\`docs/releases/3.4.0/RELEASE_NOTES.md\`](docs/releases/3.4.0/RELEASE_NOTES.md).\n\nThis compatibility pointer is retained for historical links and the release workflow.`,
);
write(
  "RELEASE_VERIFICATION_3.4.0.md",
  `# Nexora 3.4.0 — Release Verification\n\nThe canonical release verification ledger is stored at [\`docs/releases/3.4.0/RELEASE_VERIFICATION.md\`](docs/releases/3.4.0/RELEASE_VERIFICATION.md).\n\nThis compatibility pointer is retained for historical links.`,
);

let releaseIndex = read("docs/releases/README.md");
releaseIndex = releaseIndex
  .replace(/\| `3\.3\.4` \|[^\n]*/, "| `3.4.0` | [Release notes](3.4.0/RELEASE_NOTES.md) | [Release verification](3.4.0/RELEASE_VERIFICATION.md) | [`release-evidence/current.json`](../../release-evidence/current.json) |\n| `3.3.4` | [Release notes](3.3.4/RELEASE_NOTES.md) | [Release verification](3.3.4/RELEASE_VERIFICATION.md) | historical prerequisite evidence |")
  .replace("## Current release", "## Current release candidate");
write("docs/releases/README.md", releaseIndex);

const evidence = {
  schemaVersion: 2,
  version,
  tag: `v${version}`,
  status: "release-candidate",
  published: false,
  signed: false,
  distribution: "blocked-stable",
  repository: "Onmaynec/Nexora",
  branch: newBranch,
  baseline: "v3.3.4",
  baselineMergeCommit: mergedBaseline,
  blockers: [
    "published-v3.3.4-tag-release-assets",
    "authenticode-signing-policy",
    "windows-10-installed-upgrade-acceptance",
    "windows-11-installed-upgrade-acceptance",
    "independent-security-review",
    "final-ci",
    "merge",
    "github-release",
    "asset-redownload-smoke",
  ],
  guarantees: {
    ordinaryMessagingWritable: true,
    trustMlsRuntime: "retired",
    legacySecureHistory: "read-only",
    serverDecryptsLegacyCiphertext: false,
    stableReleaseRequiresSignedAssets: true,
    unsignedOfficialTagPublished: false,
  },
  assets: [],
  verification: { status: "pending" },
};
write("release-evidence/current.json", JSON.stringify(evidence, null, 2));

write("release-evidence/independent-security-review-3.4.0.json", JSON.stringify({
  schemaVersion: 1,
  version,
  reviewedCommit: null,
  reviewer: null,
  independent: false,
  approved: false,
  unresolvedHigh: null,
  unresolvedCritical: null,
  reportUrl: null,
  status: "blocked",
}, null, 2));

write("release-evidence/windows-acceptance-3.4.0.json", JSON.stringify({
  schemaVersion: 1,
  version,
  baseline: "3.3.4",
  target: version,
  windows10: { installedUpgradePassed: false, evidenceUrl: null },
  windows11: { installedUpgradePassed: false, evidenceUrl: null },
  signedTargetVerified: false,
  status: "blocked",
}, null, 2));

for (const relativePath of ["website/index.html", "website/app.js", "website/site-fixes.js"]) {
  write(relativePath, read(relativePath).replaceAll("3.3.4", version));
}

console.log("Prepared Nexora 3.4.0 release documentation and external evidence gates.");
