"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const version = "3.3.4";
const androidVersionCode = 30304;

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.mkdirSync(path.dirname(file(relativePath)), { recursive: true });
  fs.writeFileSync(file(relativePath), content, "utf8");
}

function update(relativePath, transform) {
  const before = read(relativePath);
  const after = transform(before);
  if (after === before) return;
  write(relativePath, after);
}

function remove(relativePath) {
  if (fs.existsSync(file(relativePath))) fs.rmSync(file(relativePath), { recursive: true, force: true });
}

const packageJson = JSON.parse(read("package.json"));
packageJson.version = version;
write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

const packageLock = JSON.parse(read("package-lock.json"));
packageLock.version = version;
if (packageLock.packages?.[""]) packageLock.packages[""].version = version;
write("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`);

update("android/app/build.gradle.kts", (source) => source
  .replace(/versionCode\s*=\s*\d+/, `versionCode = ${androidVersionCode}`)
  .replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${version}"`));

update("client/src/api.js", (source) => source.replace(
  /export const CLIENT_VERSION = "[^"]+";/,
  `export const CLIENT_VERSION = "${version}";`,
));

update("client/src/components/Workspace.jsx", (source) => source.replace(
  'import { loadE2eeDraft } from "../crypto/trust-client";\n',
  "",
));

update("test/build-config.test.cjs", (source) => source
  .replace(/test\("релиз [^"]+ собирает/, `test("релиз ${version} собирает`));

const currentSurfaces = [
  "README.md",
  "PROJECT_INDEX.md",
  "docs/README.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/DEPLOYMENT.md",
  "docs/PRODUCT_OVERVIEW.md",
  "docs/RELEASE_POLICY.md",
  "docs/GITHUB_RELEASE.md",
  "docs/RELEASE_CHECKLIST.md",
  "android/README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "ADMIN_GUIDE.md",
  "TESTER_GUIDE.md",
  "BRANCH_STATUS.md",
  "BRANCHES.md",
  "website/README.md",
  "website/index.html",
  "website/app.js",
  "website/site-fixes.js",
  "website/src/app.js",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
].filter((relativePath) => fs.existsSync(file(relativePath)));

for (const relativePath of currentSurfaces) {
  update(relativePath, (source) => source
    .replaceAll("3.4.0", version)
    .replaceAll("Stable Core", "Post-MLS Baseline")
    .replaceAll("release/3.4.0-stable-core", "release/3.3.4-post-mls")
    .replaceAll("verified v3.3.4, signing/Windows acceptance and independent review", "CI, merge, release publication and asset smoke")
    .replaceAll("verified `v3.3.4`, Authenticode/Windows acceptance и independent security review", "CI, merge, tag, GitHub Release и asset smoke")
    .replaceAll("verified published `v3.3.4` baseline is absent", "GitHub publication and asset smoke are pending")
    .replaceAll("verified-v3.3.4", "github-publication-evidence"));
}

update("CHANGELOG.md", (source) => source
  .replace("## [3.4.0] - Unreleased", `## [${version}] - Unreleased`)
  .replaceAll("Nexora 3.4.0", `Nexora ${version}`)
  .replaceAll("Stable Core", "Post-MLS Baseline"));

const renames = [
  ["RELEASE_NOTES_3.4.0.md", `RELEASE_NOTES_${version}.md`],
  ["RELEASE_VERIFICATION_3.4.0.md", `RELEASE_VERIFICATION_${version}.md`],
  ["SECURITY_REVIEW_3.4.0.md", `SECURITY_REVIEW_${version}.md`],
];
for (const [from, to] of renames) {
  if (!fs.existsSync(file(from))) continue;
  const content = read(from)
    .replaceAll("3.4.0", version)
    .replaceAll("Stable Core", "Post-MLS Baseline")
    .replaceAll("verified published `v3.3.4` baseline is absent", "GitHub publication and asset smoke are pending")
    .replaceAll("Independent review contract", "Security review scope and automated evidence");
  write(to, content);
  remove(from);
}

const evidence = {
  schemaVersion: 2,
  version,
  tag: `v${version}`,
  status: "release-candidate",
  published: false,
  signed: false,
  distribution: "pending",
  repository: "Onmaynec/Nexora",
  branch: "release/3.3.4-post-mls",
  baseline: "v3.3.3",
  blockers: ["ci", "merge", "github-release", "asset-redownload-smoke"],
  guarantees: {
    ordinaryMessagingWritable: true,
    trustMlsRuntime: "retired",
    legacySecureHistory: "read-only",
    serverDecryptsLegacyCiphertext: false,
    unsignedUpdaterMetadataPublished: false,
  },
  assets: [],
  verification: { status: "pending" },
};
write("release-evidence/current.json", `${JSON.stringify(evidence, null, 2)}\n`);

update(".github/workflows/release.yml", (source) => {
  let result = source
    .replace("description: Existing official tag, for example v3.4.0", "description: Existing official tag, for example v3.3.4")
    .replace(/\n      - name: Verify required 3\.3\.4 baseline[\s\S]*?\n      - name: Detect complete signing policy/, "\n      - name: Detect complete signing policy")
    .replace(/\n      - name: Download 3\.3\.4 installers for n-1 to n acceptance[\s\S]*?\n      - name: Create release evidence and checksums/, "\n      - name: Create release evidence and checksums")
    .replace("$testTag = \"${{ steps.identity.outputs.official_tag }}-unsigned-test.$env:GITHUB_RUN_NUMBER\"\n            \"PUBLISH_TAG=$testTag\"", "\"PUBLISH_TAG=${{ steps.identity.outputs.official_tag }}\"")
    .replace("Only an UNSIGNED-TEST prerelease may be created; official stable tag remains unused.", "The official tag will be published as an UNSIGNED-TEST prerelease without updater metadata.")
    .replace("baseline = 'v3.3.4'", "baseline = 'v3.3.3'");
  return result;
});

const consistency = `"use strict";\n\nconst fs = require("node:fs");\nconst path = require("node:path");\nconst { CLIENT_VERSION } = require("../client/src/api.js");\n\nconst root = path.resolve(__dirname, "..");\nconst pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));\nconst lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));\nconst android = fs.readFileSync(path.join(root, "android/app/build.gradle.kts"), "utf8");\nconst evidence = JSON.parse(fs.readFileSync(path.join(root, "release-evidence/current.json"), "utf8"));\nconst failures = [];\nconst fail = (message) => failures.push(message);\nconst read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");\nconst requireMarker = (relativePath, marker) => { if (!read(relativePath).includes(marker)) fail(\`${'${relativePath}'}: missing ${'${JSON.stringify(marker)}'}\`); };\n\nif (pkg.version !== "${version}" || lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) fail("package/lock version mismatch");\nif (CLIENT_VERSION !== pkg.version) fail("Client version mismatch");\nif (!android.includes('versionName = "${version}"') || !android.includes("versionCode = ${androidVersionCode}")) fail("Android metadata mismatch");\nif (pkg.dependencies?.["ts-mls"] || lock.packages?.["node_modules/ts-mls"]) fail("ts-mls must not ship");\nfor (const removed of [\n  "server/trust-core.cjs", "server/trust-routes.cjs", "server/trust-recovery-routes.cjs",\n  "server/trust-socket.cjs", "server/mls-transport.cjs", "server/e2ee-attachments.cjs",\n  "client/src/crypto/mls-engine.js", "client/src/crypto/trust-client.js", "client/src/components/SecureMessagePane.jsx",\n]) if (fs.existsSync(path.join(root, removed))) fail(\`${'${removed}'} must remain removed\`);\n\nfor (const [relativePath, marker] of [\n  ["README.md", "current-${version}"],\n  ["PROJECT_INDEX.md", "Repository version | \\\`${version}\\\`"],\n  ["docs/README.md", "Current repository version | \\\`${version}\\\`"],\n  ["docs/ARCHITECTURE.md", "${version}"],\n  ["docs/SECURITY_MODEL.md", "${version}"],\n  ["RELEASE_NOTES_${version}.md", "${version}"],\n  ["RELEASE_VERIFICATION_${version}.md", "${version}"],\n  ["SECURITY_REVIEW_${version}.md", "${version}"],\n  ["CHANGELOG.md", "## [${version}] - Unreleased"],\n]) requireMarker(relativePath, marker);\n\nif (evidence.version !== pkg.version || evidence.tag !== \`v${'${pkg.version}'}\`) fail("release evidence identity mismatch");\nif (evidence.status !== "release-candidate" || evidence.published !== false) fail("pre-publication evidence must be release-candidate");\nrequireMarker(".github/workflows/release.yml", "UNSIGNED-TEST prerelease without updater metadata");\nrequireMarker("electron/update-service.cjs", "UPDATE_SIGNATURE_INVALID");\nrequireMarker("electron/update-service.cjs", "allowDowngrade = false");\nrequireMarker("electron-builder.client.yml", "verifyUpdateCodeSignature: true");\nrequireMarker("electron-builder.server.yml", "channel: server");\n\nfor (const temporary of [\n  ".github/workflows/stable-core-migration.yml", ".github/workflows/stable-core-diagnostics.yml",\n  "scripts/apply-stable-core-3.4.cjs", "scripts/apply-stable-core-error-contracts.cjs",\n  "scripts/apply-stable-core-bootstrap.cjs", "scripts/apply-stable-core-client-retirement.cjs",\n  "scripts/apply-stable-core-runtime-retirement.cjs", "scripts/apply-stable-core-docs.cjs",\n  "migration-error.log", "unit-failures.log",\n]) if (fs.existsSync(path.join(root, temporary))) fail(\`${'${temporary}'} must be removed\`);\n\nif (failures.length) {\n  console.error("Release consistency failed:");\n  failures.forEach((message) => console.error(\`- ${'${message}'}\`));\n  process.exitCode = 1;\n} else {\n  console.log("Release consistency OK for Nexora ${version} Post-MLS Baseline RC");\n}\n`;
write("scripts/check-release-consistency.cjs", consistency);

for (const relativePath of [
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
]) remove(relativePath);

remove("scripts/prepare-post-mls-3.3.4.cjs");
remove(".github/workflows/prepare-post-mls-3.3.4.yml");

console.log("Prepared Nexora 3.3.4 Post-MLS Baseline source tree.");
