"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const VERSION = "3.5.0";
const BASELINE = "3.4.0";

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.mkdirSync(path.dirname(file(relativePath)), { recursive: true });
  fs.writeFileSync(file(relativePath), content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function update(relativePath, transform) {
  const before = read(relativePath);
  const after = transform(before);
  if (after === before) return false;
  write(relativePath, after);
  return true;
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Required ${label || "marker"} is missing: ${JSON.stringify(before)}`);
  return source.replace(before, after);
}

function insertAfterRequired(source, marker, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(marker)) throw new Error(`Required ${label || "insertion marker"} is missing: ${JSON.stringify(marker)}`);
  return source.replace(marker, `${marker}${addition}`);
}

function json(relativePath, value) {
  write(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

if (JSON.parse(read("package.json")).version !== VERSION) {
  throw new Error(`This preparation script only supports Nexora ${VERSION}.`);
}

childProcess.execFileSync(process.execPath, [file("scripts/sync-release-metadata.cjs")], { cwd: root, stdio: "inherit" });

update("server/mobile-continuity.cjs", (source) => {
  source = replaceRequired(
    source,
    "  let cleanupTimer = null;",
    `  let cleanupTimer = null;\n  let lastStatus = {\n    enabled: true,\n    schemaVersion: 9,\n    activeUploads: 0,\n    pushSubscriptions: 0,\n    pushTokenKeyConfigured: Boolean(tokenKey),\n    tokenPlaintextStored: false,\n    closed: false,\n  };`,
    "mobile continuity status cache",
  );
  return replaceRequired(
    source,
    `    status() {\n      const activeUploads = Number(store.db.prepare("SELECT COUNT(*) AS count FROM mobile_upload_sessions WHERE status='active'").get()?.count || 0);\n      const pushSubscriptions = Number(store.db.prepare("SELECT COUNT(*) AS count FROM mobile_push_subscriptions WHERE revoked_at IS NULL").get()?.count || 0);\n      return { enabled: true, schemaVersion: 9, activeUploads, pushSubscriptions, pushTokenKeyConfigured: Boolean(tokenKey), tokenPlaintextStored: false };\n    },`,
    `    status() {\n      if (!store.db) return { ...lastStatus, closed: true };\n      try {\n        const activeUploads = Number(store.db.prepare("SELECT COUNT(*) AS count FROM mobile_upload_sessions WHERE status='active'").get()?.count || 0);\n        const pushSubscriptions = Number(store.db.prepare("SELECT COUNT(*) AS count FROM mobile_push_subscriptions WHERE revoked_at IS NULL").get()?.count || 0);\n        lastStatus = { enabled: true, schemaVersion: 9, activeUploads, pushSubscriptions, pushTokenKeyConfigured: Boolean(tokenKey), tokenPlaintextStored: false, closed: false };\n        return lastStatus;\n      } catch (error) {\n        if (!store.db) return { ...lastStatus, closed: true };\n        throw error;\n      }\n    },`,
    "mobile continuity status implementation",
  );
});

update("test/pulse-local-integration.test.cjs", (source) => source
  .replace('test("schema 8 is active and Pulse API requires authentication"', 'test("schema 9 is active and Pulse API requires authentication"')
  .replace("assert.equal(instance.status().schemaVersion, 8);", "assert.equal(instance.status().schemaVersion, 9);"));

update("test/regression-3.2.1.test.cjs", (source) => source
  .replace('test("schema 8 status remains readable after server close"', 'test("schema 9 status remains readable after server close"')
  .replace("assert.equal(status.schemaVersion, 8);", "assert.equal(status.schemaVersion, 9);"));

update("README.md", (source) => {
  source = source
    .replace("current-3.4.0%20RC", "current-3.5.0%20RC")
    .replace("SQLite-schema%208", "SQLite-schema%209")
    .replace(
      "> **Stable Core release candidate:** version `3.4.0` is implemented in PR #96 but is not published. Stable publication is blocked until a verified stable `v3.3.4` baseline exists, Authenticode/Windows acceptance is complete and an independent security review closes all high/critical findings.",
      "> **Mobile Continuity release candidate:** version `3.5.0` is implemented in the stacked release branch and is not published. Publication is blocked until `v3.4.0` is actually released, Android/PWA/Windows acceptance is complete, signing evidence is available and all security/release gates pass.",
    )
    .replace(
      "| `3.4.0` | Stable Core: ordinary messaging, immutable legacy history, devices/sessions, backup verification and signed updater | Release candidate; not merged/tagged/published |",
      "| `3.5.0` | Mobile Continuity: replay/outbox, profile isolation, PWA lifecycle, Android hardening, privacy-safe push and resumable media | Release candidate; stacked on unpublished 3.4.0 |\n| `3.4.0` | Stable Core: ordinary messaging, immutable legacy history, devices/sessions, backup verification and signed updater | Required baseline; not yet published |",
    )
    .replace("Authoritative 3.4.0 documents:", "Authoritative 3.5.0 documents:")
    .replace("- [Release Notes 3.4.0](RELEASE_NOTES_3.4.0.md)", "- [Release Notes 3.5.0](RELEASE_NOTES_3.5.0.md)")
    .replace("- [Release Verification 3.4.0](RELEASE_VERIFICATION_3.4.0.md)", "- [Release Verification 3.5.0](RELEASE_VERIFICATION_3.5.0.md)")
    .replace("- [Security Review 3.4.0](SECURITY_REVIEW_3.4.0.md)", "- [Security Model](docs/SECURITY_MODEL.md)");
  return source;
});

update("PROJECT_INDEX.md", (source) => source
  .replace("| Repository version | `3.4.0` |", "| Repository version | `3.5.0` |")
  .replace("| Classification | Release candidate — Stable Core |", "| Classification | Release candidate — Mobile Continuity |")
  .replace("| Publication | Заблокирована до verified `v3.3.4`, Authenticode/Windows acceptance и independent security review |", "| Publication | Заблокирована до опубликованной `v3.4.0`, platform acceptance, signing и independent security review |")
  .replace("| Local Server database | SQLite schema 8 compatibility layer |", "| Local Server database | SQLite schema 9 with schema 8 compatibility layer |")
  .replace("Этот индекс описывает ветку `release/3.4.0-stable-core-v2` и PR #96. До merge он не является описанием опубликованного `main`.", "Этот индекс описывает ветку `release/3.5.0-mobile-continuity` и stacked draft PR. До merge он не является описанием опубликованного `main`.")
  .replace("| `server/stable-core.cjs` | device inventory/revoke, legacy read-only viewer/export, backup verify и signing status |", "| `server/stable-core.cjs` | device inventory/revoke, legacy read-only viewer/export, backup verify и signing status |\n| `server/mobile-continuity.cjs` | device-scoped push, sync diagnostics and resumable media sessions |\n| `server/mobile-continuity-schema9.cjs` | schema 8 → 9 migration, backup, integrity and downgrade protection |"));

update("docs/README.md", (source) => source
  .replace("| Current repository version | `3.4.0` |", "| Current repository version | `3.5.0` |")
  .replace("| Classification | Stable Core release candidate |", "| Classification | Mobile Continuity release candidate |")
  .replace("| Publication | Blocked — verified `v3.3.4`, Authenticode/Windows acceptance and independent review are mandatory |", "| Publication | Blocked — published `v3.4.0`, platform acceptance, signing and independent review are mandatory |")
  .replace("| Local Server database | SQLite schema 8 |", "| Local Server database | SQLite schema 9 |")
  .replace("| Migration | schema 8 is retained; migration is transactional/idempotent and future schemas are rejected |", "| Migration | additive schema 8 → 9 migration is transactional/idempotent; backups and future-schema rejection remain mandatory |")
  .replace(/`3\.4\.0` retires executable Trust\/MLS paths[^\n]+/, "`3.5.0` adds Mobile Continuity on top of the Stable Core baseline: replay/outbox ordering, profile-isolated caches, safe PWA updates, Android lifecycle/deep links, device-scoped push and resumable media. This branch is not published until every blocker in `RELEASE_VERIFICATION_3.5.0.md` is closed.")
  .replace("## Stable Core documents", "## Mobile Continuity documents")
  .replace("| [Release Notes 3.4.0](../RELEASE_NOTES_3.4.0.md) | user-visible changes, compatibility and limitations | Release candidate |", "| [Release Notes 3.5.0](../RELEASE_NOTES_3.5.0.md) | user-visible changes, compatibility and limitations | Release candidate |")
  .replace("| [Release Verification 3.4.0](../RELEASE_VERIFICATION_3.4.0.md) | code, tests, CI, signing and publication evidence | In progress |", "| [Release Verification 3.5.0](../RELEASE_VERIFICATION_3.5.0.md) | code, tests, CI, signing and publication evidence | In progress |"));

update("SECURITY.md", (source) => source.replace(/\| `3\.4\.0` \| Release candidate[^\n]*/, "| `3.5.0` | Release candidate | Security fixes accepted on the release branch; publication remains blocked by platform/signing/review gates. |"));

const currentDocuments = [
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "android/README.md",
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
];
for (const relativePath of currentDocuments) {
  update(relativePath, (source) => {
    if (source.includes(VERSION)) return source;
    const note = relativePath.endsWith(".yml")
      ? `\n# Current release candidate: Nexora ${VERSION} Mobile Continuity.\n`
      : `\n> Current release candidate: Nexora ${VERSION} Mobile Continuity. This is not a published stable release.\n`;
    return `${source.trimEnd()}${note}`;
  });
}

const releaseNotes = `# Nexora ${VERSION} — Mobile Continuity\n\nStatus: release candidate; unpublished. Baseline: Nexora ${BASELINE}, which must be published and verified before this release can proceed.\n\n## Product result\n\nNexora ${VERSION} establishes one continuity contract across Windows, Browser/PWA and Android: durable drafts/outbox, ordered replay after reconnect, profile-isolated local state, safe PWA updates, contextual Android lifecycle/permissions, privacy-safe device notifications and resumable media.\n\n## Implemented scope\n\n- cursor replay with monotonic sequence, bounded retention and RESYNC_REQUIRED handling;\n- reconnect order: session/access validation, replay or controlled resync, then per-conversation outbox flush;\n- account/server-isolated IndexedDB, drafts, cursors and outbox diagnostics;\n- service-worker shell-only cache, explicit update states and activation guard during recording/upload;\n- Android strict HTTPS/same-origin shell, deep links, contextual microphone/notification permissions and lifecycle cleanup;\n- device-scoped push registrations encrypted at rest with generic payload policy;\n- resumable file/image/voice sessions with confirmed offsets, idempotent chunks, SHA-256, MIME checks, quota/policy revalidation, cancel and TTL cleanup;\n- additive SQLite schema 9 migration with verified backup, integrity checks and downgrade protection.\n\n## Compatibility\n\nApplication API v3 is extended additively. Existing ordinary messaging and immutable legacy Trust/MLS history remain supported. No cross-server merged inbox, video/screen sharing, federation or mandatory cloud relay is introduced.\n\n## Required configuration\n\nPush registration requires NEXORA_PUSH_TOKEN_KEY. A production push provider, release signing credentials, Android signing and platform acceptance environments are external prerequisites.\n\n## Known release blockers\n\n- published and verified v${BASELINE};\n- production push-provider integration and credentials;\n- signed Android and Windows artifacts;\n- Android/PWA/Windows installed acceptance matrix;\n- independent security review with zero unresolved high/critical findings;\n- full CI, soak, packaging, checksums, signature and post-download smoke evidence.\n`;

const releaseVerification = `# Nexora ${VERSION} — Release Verification\n\nStatus: release candidate; publication blocked.\n\n## Internal gates\n\n| Gate | Status | Evidence |\n|---|---|---|\n| Schema 8 → 9 migration, backup and integrity | Implemented | automated migration and API integration tests |\n| Replay/outbox ordering and idempotency | Implemented | regression tests and reconnect contract |\n| PWA shell cache/update lifecycle | Implemented | source/build checks; installed browser matrix pending |\n| Android source build | Implemented | CI debug assembly; signed device acceptance pending |\n| Push token privacy | Implemented | AES-256-GCM storage and no-plaintext tests |\n| Resumable media offset/hash/policy | Implemented | API tests; restart/device fault matrix pending |\n| Multi-profile isolation | Implemented | scoped cache/outbox contracts; extended acceptance pending |\n\n## Mandatory external gates\n\n- v${BASELINE} must exist as a verified published release;\n- independent review evidence must be approved;\n- Android, PWA and Windows acceptance evidence must be completed;\n- signing credentials and signatures must be verified;\n- production push adapter prerequisites must be configured and tested;\n- final CI, performance/soak, security audit, packaged smoke and asset re-download verification must pass.\n\n## Publication state\n\nNo v${VERSION} tag or GitHub Release may be created while any item above is incomplete. Unsigned artifacts are test evidence only and must be marked UNSIGNED-TEST.\n`;

write(`docs/releases/${VERSION}/RELEASE_NOTES.md`, releaseNotes);
write(`docs/releases/${VERSION}/RELEASE_VERIFICATION.md`, releaseVerification);
write(`RELEASE_NOTES_${VERSION}.md`, `# Nexora ${VERSION} release notes\n\nCompatibility pointer: canonical release notes are maintained in [docs/releases/${VERSION}/RELEASE_NOTES.md](docs/releases/${VERSION}/RELEASE_NOTES.md).\n`);
write(`RELEASE_VERIFICATION_${VERSION}.md`, `# Nexora ${VERSION} release verification\n\nCompatibility pointer: canonical verification evidence is maintained in [docs/releases/${VERSION}/RELEASE_VERIFICATION.md](docs/releases/${VERSION}/RELEASE_VERIFICATION.md).\n`);

update("CHANGELOG.md", (source) => {
  if (new RegExp(`^## \\[${VERSION.replace(/\./g, "\\.")}\\]`, "m").test(source)) return source;
  const section = `## [${VERSION}] - Unreleased\n\n### Added\n\n- Mobile Continuity replay/outbox, scoped offline state, PWA lifecycle, Android hardening, privacy-safe push and resumable media.\n- Additive SQLite schema 9 with verified migration and diagnostics.\n\n### Security\n\n- Device-scoped encrypted push tokens, strict server-side media validation and access/policy revalidation.\n\n### Release status\n\n- Release candidate only; publication is blocked until v${BASELINE}, signing, platform acceptance and independent review gates are complete.\n\n`;
  const headingEnd = source.indexOf("\n", source.indexOf("# "));
  return `${source.slice(0, headingEnd + 1)}\n${section}${source.slice(headingEnd + 1)}`;
});

update("docs/releases/README.md", (source) => {
  if (source.includes(`${VERSION}/RELEASE_NOTES.md`) && source.includes(`${VERSION}/RELEASE_VERIFICATION.md`)) return source;
  return `${source.trimEnd()}\n\n- [${VERSION} release notes](${VERSION}/RELEASE_NOTES.md)\n- [${VERSION} release verification](${VERSION}/RELEASE_VERIFICATION.md)\n`;
});

json("release-evidence/current.json", {
  schemaVersion: 3,
  version: VERSION,
  tag: `v${VERSION}`,
  status: "release-candidate",
  published: false,
  signed: false,
  distribution: "blocked-stable",
  repository: "Onmaynec/Nexora",
  branch: "release/3.5.0-mobile-continuity",
  baseline: `v${BASELINE}`,
  baselinePublication: { status: "blocked", releaseUrl: null, checksumVerification: "pending", evidence: null },
  blockers: [
    "published-v3.4.0-baseline",
    "production-push-adapter",
    "android-signing-and-installed-acceptance",
    "pwa-installed-offline-update-acceptance",
    "windows-authenticode-and-installed-upgrade-acceptance",
    "independent-security-review",
    "final-ci-and-soak",
    "merge-tag-github-release",
    "asset-redownload-signature-smoke",
  ],
  guarantees: {
    ordinaryMessagingWritable: true,
    trustMlsRuntime: "retired",
    legacySecureHistory: "read-only",
    pushPlaintextDefault: false,
    localProfilesIsolated: true,
    stableReleaseRequiresSignedAssets: true,
    unsignedOfficialTagPublished: false,
  },
  assets: [],
  verification: { status: "in-progress", head: null, ciRuns: [], productionDependencyAudit: { high: null, critical: null } },
});

json(`release-evidence/independent-security-review-${VERSION}.json`, {
  schemaVersion: 1,
  version: VERSION,
  reviewedCommit: null,
  reviewer: null,
  independent: false,
  approved: false,
  unresolvedHigh: null,
  unresolvedCritical: null,
  reportUrl: null,
  status: "blocked",
});
json(`release-evidence/windows-acceptance-${VERSION}.json`, {
  schemaVersion: 1,
  version: VERSION,
  baseline: BASELINE,
  target: VERSION,
  windows10: { installedUpgradePassed: false, evidenceUrl: null },
  windows11: { installedUpgradePassed: false, evidenceUrl: null },
  signedTargetVerified: false,
  status: "blocked",
});
json(`release-evidence/android-acceptance-${VERSION}.json`, {
  schemaVersion: 1,
  version: VERSION,
  baseline: BASELINE,
  target: VERSION,
  signedArtifactVerified: false,
  installPassed: false,
  upgradeWithoutProfileLossPassed: false,
  lifecyclePermissionDeepLinkPassed: false,
  certificatePolicyPassed: false,
  evidenceUrl: null,
  status: "blocked",
});
json(`release-evidence/pwa-acceptance-${VERSION}.json`, {
  schemaVersion: 1,
  version: VERSION,
  installPassed: false,
  offlineStartupPassed: false,
  updateDuringDraftPassed: false,
  cacheScopeCleanupPassed: false,
  evidenceUrl: null,
  status: "blocked",
});

update(".github/workflows/release.yml", (source) => {
  source = source
    .replaceAll("3.4.0", VERSION)
    .replaceAll("3-4-0", "3-5-0")
    .replaceAll("3.3.4", BASELINE)
    .replaceAll("3\\.3\\.4", "3\\.4\\.0");
  source = source.replace(
    "      - name: Require complete Authenticode policy",
    `      - name: Verify Android and PWA acceptance evidence\n        shell: pwsh\n        run: |\n          $ErrorActionPreference = "Stop"\n          $android = Get-Content release-evidence/android-acceptance-${VERSION}.json -Raw | ConvertFrom-Json\n          if ($android.version -ne "${VERSION}" -or -not $android.signedArtifactVerified -or -not $android.installPassed -or -not $android.upgradeWithoutProfileLossPassed -or -not $android.lifecyclePermissionDeepLinkPassed -or -not $android.certificatePolicyPassed) {\n            throw "Release blocker: Android signed installed acceptance is incomplete"\n          }\n          $pwa = Get-Content release-evidence/pwa-acceptance-${VERSION}.json -Raw | ConvertFrom-Json\n          if ($pwa.version -ne "${VERSION}" -or -not $pwa.installPassed -or -not $pwa.offlineStartupPassed -or -not $pwa.updateDuringDraftPassed -or -not $pwa.cacheScopeCleanupPassed) {\n            throw "Release blocker: PWA installed/offline/update acceptance is incomplete"\n          }\n\n      - name: Require complete Authenticode policy`,
  );
  return source;
});

update("scripts/check-release-consistency.cjs", (source) => {
  source = source
    .replace('if (evidence.baseline !== "v3.3.4") fail("Stable Core baseline must be v3.3.4");', 'if (evidence.baseline !== "v3.4.0") fail("Mobile Continuity baseline must be v3.4.0");')
    .replaceAll("independent-security-review-3.4.0.json", `independent-security-review-${VERSION}.json`)
    .replaceAll("windows-acceptance-3.4.0.json", `windows-acceptance-${VERSION}.json`)
    .replaceAll("name: Nexora 3.4.0 stable release", `name: Nexora ${VERSION} stable release`)
    .replaceAll("Verify required 3.3.4 baseline", `Verify required ${BASELINE} baseline`)
    .replaceAll("3.4.0 stable workflow", `${VERSION} stable workflow`);
  source = insertAfterRequired(
    source,
    `  const windows = parseJson(root, "release-evidence/windows-acceptance-${VERSION}.json");\n`,
    `  const androidAcceptance = parseJson(root, "release-evidence/android-acceptance-${VERSION}.json");\n  const pwaAcceptance = parseJson(root, "release-evidence/pwa-acceptance-${VERSION}.json");\n`,
    "platform evidence parser",
  );
  source = insertAfterRequired(
    source,
    `  if (windows.status !== "blocked" || windows.windows10?.installedUpgradePassed || windows.windows11?.installedUpgradePassed) {\n    fail("release-candidate Windows acceptance evidence must remain explicitly blocked until completed");\n  }\n`,
    `  if (androidAcceptance.version !== version || pwaAcceptance.version !== version) fail("mobile platform evidence version mismatch");\n  if (androidAcceptance.status !== "blocked" || androidAcceptance.installPassed || androidAcceptance.signedArtifactVerified) {\n    fail("release-candidate Android acceptance evidence must remain explicitly blocked until completed");\n  }\n  if (pwaAcceptance.status !== "blocked" || pwaAcceptance.installPassed || pwaAcceptance.offlineStartupPassed) {\n    fail("release-candidate PWA acceptance evidence must remain explicitly blocked until completed");\n  }\n`,
    "platform evidence validation",
  );
  source = insertAfterRequired(
    source,
    `    "release-evidence/windows-acceptance-${VERSION}.json",\n`,
    `    "release-evidence/android-acceptance-${VERSION}.json",\n    "release-evidence/pwa-acceptance-${VERSION}.json",\n`,
    "release workflow platform evidence markers",
  );
  return source;
});

update("test/release-consistency.test.cjs", (source) => source
  .replaceAll("independent-security-review-3.4.0.json", `independent-security-review-${VERSION}.json`)
  .replaceAll("windows-acceptance-3.4.0.json", `windows-acceptance-${VERSION}.json`)
  .replace(
    `  "release-evidence/windows-acceptance-${VERSION}.json",`,
    `  "release-evidence/windows-acceptance-${VERSION}.json",\n  "release-evidence/android-acceptance-${VERSION}.json",\n  "release-evidence/pwa-acceptance-${VERSION}.json",`,
  ));

console.log(`Nexora ${VERSION} Mobile Continuity release-candidate surfaces prepared.`);
