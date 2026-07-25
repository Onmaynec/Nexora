"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(absolute(relativePath), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function update(relativePath, transform) {
  const before = read(relativePath);
  const after = transform(before);
  if (after === before) throw new Error(`Patch produced no change: ${relativePath}`);
  write(relativePath, after);
}

update("android/app/src/main/java/com/nexora/mobile/MainActivity.kt", (source) => replaceExactly(
  source,
  'text = "NEXORA 3.5.0"',
  'text = "NEXORA ${BuildConfig.VERSION_NAME}"',
  "Android shell version label",
));

update("client/src/components/CallController.jsx", (source) => {
  const matches = source.match(/\.catch\(\(\) => \{\}\)/g) || [];
  if (matches.length < 4) throw new Error(`Expected suppressed call failures, found ${matches.length}.`);
  return source.replace(/\.catch\(\(\) => \{\}\)/g, ".catch((failure) => setError(normalizeError(failure)))");
});

update("scripts/check-release-consistency.cjs", (source) => {
  source = replaceExactly(source, `  for (const asset of [
    \`Nexora-Client-Setup-\${version}.exe\`,
    \`Nexora-Server-Setup-\${version}.exe\`,
    \`Nexora-Android-\${version}.apk\`,
    \`Nexora-PWA-\${version}.zip\`,
    \`Nexora-\${version}-source.zip\`,
    \`Nexora-\${version}.spdx.json\`,
    "SHA256SUMS.txt",
  ]) {`, `  for (const asset of [
    \`Nexora-Client-Setup-\${version}.exe\`,
    \`Nexora-Client-Setup-\${version}.exe.blockmap\`,
    "latest.yml",
    \`Nexora-Server-Setup-\${version}.exe\`,
    \`Nexora-Server-Setup-\${version}.exe.blockmap\`,
    "server.yml",
    \`Nexora-Android-\${version}.apk\`,
    \`Nexora-PWA-\${version}.zip\`,
    \`Nexora-\${version}-source.zip\`,
    \`Nexora-\${version}.spdx.json\`,
    "WINDOWS-SIGNATURE-EVIDENCE.json",
    "ANDROID-SIGNATURE-EVIDENCE.txt",
    "RELEASE-EVIDENCE.json",
    "SHA256SUMS.txt",
  ]) {`, "complete signed asset plan");

  source = replaceExactly(source, `  const releaseWorkflow = read(root, ".github/workflows/release.yml");
  if (releaseWorkflow.includes("Nexora 3.6.0 unsigned stable release")) {
    fail(".github/workflows/release.yml must not publish 3.6.0 as unsigned stable");
  }
`, `  const releaseWorkflow = read(root, ".github/workflows/release.yml");
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
    if (!releaseWorkflow.includes(marker)) fail(\`.github/workflows/release.yml missing \${JSON.stringify(marker)}\`);
  }
  if (/UNSIGNED/i.test(releaseWorkflow) || !releaseWorkflow.includes("requiresSignedArtifacts")) {
    fail(".github/workflows/release.yml must remain signed-only and evidence-gated for 3.6.0");
  }
`, "signed release workflow gate");

  source = replaceExactly(source, `    ".github/workflows/connect-repair.yml",
    ".connect-diagnostics",`, `    ".github/workflows/connect-repair.yml",
    ".github/workflows/apply-connect-release.yml",
    ".github/workflows/connect-schema10-remediation.yml",
    ".connect-release-patch",
    ".connect-remediation",
    ".connect-diagnostics",`, "temporary Connect workflow cleanup gate");

  source = replaceExactly(source, `  for (const relativePath of temporaryPaths) {
    if (fs.existsSync(path.join(root, relativePath))) fail(\`${relativePath} must be removed\`);
  }
`, `  for (const relativePath of temporaryPaths) {
    if (fs.existsSync(path.join(root, relativePath))) fail(\`${relativePath} must be removed\`);
  }
  const finalizationWorkflow = fs.existsSync(path.join(root, ".github/workflows/connect-finalization.yml"));
  const finalizationMarker = fs.existsSync(path.join(root, ".connect-finalization/READY"));
  if (finalizationWorkflow !== finalizationMarker) {
    fail("temporary Connect finalization workflow and marker must be present together or removed together");
  }
`, "paired finalization cleanup gate");
  return source;
});

update("test/release-consistency.test.cjs", (source) => {
  if (source.includes("requires signed updater assets for 3.6.0")) throw new Error("Release consistency final tests already exist.");
  return `${source.trimEnd()}

test("release consistency gate requires signed updater assets for 3.6.0", () => {
  withFixture((fixture) => {
    const evidencePath = path.join(fixture, "release-evidence/current.json");
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    evidence.plannedAssets = evidence.plannedAssets.filter((asset) => asset !== "latest.yml");
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    assert.throws(() => checkReleaseConsistency(fixture), /latest\.yml/);
  });
});

test("release consistency gate requires the fail-closed signed publication workflow", () => {
  withFixture((fixture) => {
    const workflow = path.join(fixture, ".github/workflows/release.yml");
    fs.writeFileSync(workflow, fs.readFileSync(workflow, "utf8").replace("environment: nexora-production-release", "environment: unprotected"));
    assert.throws(() => checkReleaseConsistency(fixture), /nexora-production-release/);
  });
});
`;
});

update("test/connect-3.6.test.cjs", (source) => {
  if (source.includes("Android displays package version")) throw new Error("Connect client final regression already exists.");
  return `${source.trimEnd()}

test("Connect client reports background call failures and Android displays package version", async () => {
  const callController = await fs.readFile(path.join(__dirname, "..", "client", "src", "components", "CallController.jsx"), "utf8");
  assert.equal(callController.includes(".catch(() => {})"), false);
  assert.ok(callController.includes("getTracks().forEach((track) => track.stop())"));
  assert.ok(callController.includes("setError(normalizeError(failure))"));
  const android = await fs.readFile(path.join(__dirname, "..", "android", "app", "src", "main", "java", "com", "nexora", "mobile", "MainActivity.kt"), "utf8");
  assert.ok(android.includes("NEXORA " + "$" + "{BuildConfig.VERSION_NAME}"));
});
`;
});

console.log("Applied Connect final source and release gates.");
