"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function target(relative) { return path.join(root, relative); }
function read(relative) { return fs.readFileSync(target(relative), "utf8"); }
function write(relative, value) { fs.writeFileSync(target(relative), value); }
function exists(relative) { return fs.existsSync(target(relative)); }

function update(relative, transform) {
  if (!exists(relative)) throw new Error(`Missing documentation surface: ${relative}`);
  const before = read(relative);
  const after = transform(before);
  if (typeof after !== "string" || !after.trim()) throw new Error(`Invalid generated content for ${relative}`);
  if (after !== before) write(relative, after);
}

function prependOnce(relative, marker, block) {
  update(relative, (source) => {
    if (source.includes(marker)) return source;
    const heading = source.match(/^# .+\n/);
    if (!heading) return `${block}\n\n${source}`;
    return `${heading[0]}\n${block}\n${source.slice(heading[0].length)}`;
  });
}

update("README.md", (source) => {
  let value = source
    .replace("current-3.3.3%20UNSIGNED--TEST", "current-3.4.0%20RC")
    .replace("API-v3%20%2B%20Trust%20v4", "API-v3%20%2B%20legacy%20read--only")
    .replace(/^\| `3\.3\.3` \|.*$/m, "| `3.4.0` | Stable Core: server-readable messaging, immutable legacy history, sessions/devices, backup verification and signed updater | Release candidate; stable publication blocked by verified v3.3.4, signing/Windows acceptance and independent review |")
    .replace(/^`3\.3\.3` исправляет.*$/m, "`3.4.0` is a Stable Core release candidate. Ordinary chats no longer depend on MLS synchronization. Trust/MLS runtime is removed; legacy ciphertext remains read-only. The official stable release is blocked until the external gates in `RELEASE_VERIFICATION_3.4.0.md` are closed.");
  if (!value.includes("Stable Core release candidate")) {
    value = value.replace("## Статус продукта", "## Статус продукта\n\n> **Stable Core release candidate:** implementation is in PR #69 and is not yet published.");
  }
  if (!value.includes("RELEASE_NOTES_3.4.0.md")) {
    value = value.replace("## Возможности", "### Current 3.4.0 evidence\n\n- [Release Notes 3.4.0](RELEASE_NOTES_3.4.0.md)\n- [Release Verification 3.4.0](RELEASE_VERIFICATION_3.4.0.md)\n- [Security Review 3.4.0](SECURITY_REVIEW_3.4.0.md)\n\n## Возможности");
  }
  return value;
});

update("CHANGELOG.md", (source) => {
  if (source.includes("## [3.4.0] - Unreleased")) return source;
  const section = `## [3.4.0] - Unreleased\n\n### Added\n\n- server-owned device/session inventory and immediate targeted revocation;\n- immutable legacy secure history viewer/export;\n- non-restoring backup verification API;\n- signed Client/Server updater channels, Authenticode identity/timestamp evidence and n-1→n release gate;\n- stable request-correlated errors and Stable Core reliability regressions.\n\n### Changed\n\n- ordinary chats use the server-readable messaging core without Trust/MLS bootstrap;\n- schema 8 is retained only as a compatibility layer for legacy ciphertext/provenance;\n- ordinary outbox uses bounded retry and archives old MLS entries terminally.\n\n### Removed\n\n- executable Trust Core, MLS recovery/transport, E2EE upload write runtime, client MLS engine and the \`ts-mls\` dependency.\n\n### Release status\n\n- release candidate only; stable publication is blocked by the missing verified \`v3.3.4\` baseline, signing/Windows acceptance and independent security review.\n\n`;
  const heading = source.match(/^# .+\n+/);
  return heading ? `${heading[0]}${section}${source.slice(heading[0].length)}` : `# Changelog\n\n${section}${source}`;
});

for (const relative of [
  "android/README.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "ADMIN_GUIDE.md",
  "TESTER_GUIDE.md",
  "docs/PRODUCT_OVERVIEW.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/DEPLOYMENT.md",
  "website/README.md",
]) {
  prependOnce(relative, "Stable Core 3.4.0 RC", "> **Stable Core 3.4.0 RC:** ordinary server-readable messaging is writable; legacy Trust/MLS history is read-only. Stable publication remains blocked by verified v3.3.4, signing/Windows acceptance and independent review.");
}

prependOnce("docs/RELEASE_POLICY.md", "3.4.0 Stable Core", `## 3.4.0 Stable Core\n\nThe official tag \`v3.4.0\` is permitted only for a complete signed asset set after a verified published \`v3.3.4\` baseline, green release gates, installed Windows 10/11 n-1→n acceptance and independent review closure. Unsigned builds use a distinct \`-unsigned-test.<run>\` prerelease tag and must not publish updater metadata.`);

update("docs/GITHUB_RELEASE.md", () => `# GitHub Release — Nexora 3.4.0\n\n**Current target tag:** \`v3.4.0\`  \n**Status:** **BLOCKED** — release candidate only.\n\n## Mandatory sequence\n\n1. Verify published stable \`v3.3.4\` and required signed assets.\n2. Review and merge PR #69 only after all required checks and independent review closure.\n3. Confirm post-merge CI on the exact release commit.\n4. Configure protected Authenticode credentials, expected subject and thumbprint.\n5. Run the release workflow; it performs signing, timestamp verification, n-1→n installed smoke, checksums and evidence.\n6. Create an immutable annotated \`v3.4.0\` tag only on the verified release commit.\n7. Publish Client, Server, PWA, Android evidence, SPDX SBOM, source archive, SHA256SUMS, blockmaps and both updater metadata channels.\n8. Re-download every asset, verify SHA-256/signatures/metadata and record run IDs/tag SHA.\n\n## Unsigned behavior\n\nWithout the complete signing policy, the workflow may publish only \`v3.4.0-unsigned-test.<run>\` as a prerelease. It must exclude \`latest.yml\`, \`server.yml\` and all blockmaps. The official tag remains unused.\n\n## Current blockers\n\n- verified stable \`v3.3.4\` is absent;\n- signing credentials and Windows acceptance are external;\n- independent security review is pending;\n- release CI/evidence is not final.\n`);

update("docs/RELEASE_CHECKLIST.md", () => `# Release Checklist — Nexora 3.4.0 Stable Core\n\n## Source and review\n\n- [ ] verified \`v3.3.4\` baseline exists and has required signed assets;\n- [ ] PR #69 is synchronized with the approved baseline;\n- [ ] no temporary migration/diagnostic scripts or workflows remain;\n- [ ] independent review records the exact commit and closes all high/critical findings;\n- [ ] PR review and required checks are complete.\n\n## Automated gates\n\n- [ ] \`npm run check\`;\n- [ ] \`npm run test:unit\`;\n- [ ] \`npm run test:performance\`;\n- [ ] \`npm run audit:security\`;\n- [ ] \`npm run release:consistency\`;\n- [ ] \`npm run test:soak\`;\n- [ ] Android \`assembleDebug\`;\n- [ ] production Windows packaging.\n\n## Data and compatibility\n\n- [ ] 3.3.4 database/files backup created and verified;\n- [ ] legacy ciphertext IDs/timestamps/provenance preserved;\n- [ ] all legacy write APIs return \`LEGACY_READ_ONLY\`;\n- [ ] ordinary chats open without MLS bootstrap;\n- [ ] disk-full, interrupted migration, restore rollback and future-schema tests pass.\n\n## Signed distribution\n\n- [ ] Client and Server installers have expected subject/thumbprint and timestamp;\n- [ ] Client \`latest.yml\` and Server \`server.yml\` match 3.4.0 assets;\n- [ ] no downgrade or unsigned fallback;\n- [ ] Windows 10 and 11 clean install/repair/uninstall pass;\n- [ ] signed 3.3.4→3.4.0 installed upgrade preserves Server ID, data and sessions policy.\n\n## Publication\n\n- [ ] merge commit and post-merge CI recorded;\n- [ ] immutable annotated \`v3.4.0\` tag points to verified commit;\n- [ ] GitHub Release includes source/PWA/Client/Server/Android/SPDX/SHA256SUMS/metadata;\n- [ ] assets are re-downloaded and re-verified;\n- [ ] README/docs/website/current evidence point to the published release.\n\nAny unchecked blocker prohibits stable publication.\n`);

prependOnce("BRANCHES.md", "release/3.4.0-stable-core", "## Active development\n\n- `release/3.4.0-stable-core` — PR #69, Stable Core release candidate; not merged or published.");
prependOnce(".github/ISSUE_TEMPLATE/bug_report.md", "3.4.0", "> Current development target: Nexora 3.4.0 Stable Core RC. State whether the issue reproduces on 3.3.3 or PR #69.");

update("website/index.html", (source) => source.replace(/3\.3\.3/g, "3.4.0"));
update("website/src/app.js", (source) => source.replace(/3\.3\.3/g, "3.4.0"));

write("release-evidence/current.json", `${JSON.stringify({
  schemaVersion: 2,
  version: "3.4.0",
  status: "release-candidate",
  verifiedAt: null,
  repository: "Onmaynec/Nexora",
  branch: "release/3.4.0-stable-core",
  pullRequest: 69,
  tag: null,
  tagSha: null,
  releaseName: "Nexora 3.4.0 — Stable Core",
  releaseUrl: null,
  published: false,
  signed: false,
  draft: true,
  prerelease: false,
  updaterMetadataPublished: false,
  blockers: [
    "verified-v3.3.4",
    "authenticode-windows-acceptance",
    "independent-security-review",
    "final-ci-and-publication-evidence"
  ],
  requiredAssets: [
    "Nexora-3.4.0-source.zip",
    "Nexora-PWA-3.4.0.zip",
    "Nexora-3.4.0.spdx.json",
    "SHA256SUMS.txt",
    "Nexora-Client-Setup-3.4.0.exe",
    "Nexora-Client-Setup-3.4.0.exe.blockmap",
    "latest.yml",
    "Nexora-Server-Setup-3.4.0.exe",
    "Nexora-Server-Setup-3.4.0.exe.blockmap",
    "server.yml",
    "Nexora-Android-3.4.0-UNSIGNED-TEST.apk",
    "AUTHENTICODE-EVIDENCE.json",
    "RELEASE-EVIDENCE.json"
  ],
  checks: {
    implementation: "in-progress",
    ci: "in-progress",
    independentReview: "blocked",
    signedWindowsAcceptance: "blocked",
    publication: "blocked"
  },
  assets: []
}, null, 2)}\n`);

console.log("Stable Core 3.4.0 documentation surfaces synchronized");
