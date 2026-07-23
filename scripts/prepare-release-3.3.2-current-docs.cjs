"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const changes = [];

function transform(relativePath, replacements) {
  const file = path.join(root, relativePath);
  let source = fs.readFileSync(file, "utf8");
  const original = source;
  for (const [pattern, replacement] of replacements) {
    source = typeof pattern === "string"
      ? source.split(pattern).join(replacement)
      : source.replace(pattern, replacement);
  }
  if (source !== original) {
    fs.writeFileSync(file, source, "utf8");
    changes.push(relativePath);
  }
}

transform("SECURITY.md", [
  [/\| `3\.3\.1` \| Published `UNSIGNED-TEST` prerelease \| Текущая поддерживаемая prerelease-линия; security fixes принимаются \|/g, "| `3.3.2` | Published `UNSIGNED-TEST` prerelease | Текущая поддерживаемая prerelease-линия; security fixes принимаются |"],
  [/\| `3\.2\.0–3\.3\.0` \| Superseded prereleases \| Обновитесь до `3\.3\.1`;/g, "| `3.2.0–3.3.1` | Superseded prereleases | Обновитесь до `3.3.2`;"],
  ["## 5. Текущая security boundary — 3.2.4", "## 5. Текущая security boundary — 3.3.0+"],
  ["[Security Review 3.2.4](SECURITY_REVIEW_3.2.4.md)", "[Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md)"],
  ["[Release Verification 3.2.4](RELEASE_VERIFICATION_3.2.4.md)", "[Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.2.md)"],
  ["signed stable Windows status для 3.2.4", "signed stable Windows status для 3.3.2"],
]);

transform("SUPPORT.md", [
  [/\| `3\.3\.1` published `UNSIGNED-TEST` prerelease \|/g, "| `3.3.2` published `UNSIGNED-TEST` prerelease |"],
  [/\| `3\.2\.0–3\.3\.0` \| Superseded prereleases; обновитесь до `3\.3\.1`/g, "| `3.2.0–3.3.1` | Superseded prereleases; обновитесь до `3.3.2`"],
  ["`3.3.1` опубликована как unsigned test prerelease", "`3.3.2` опубликована как unsigned test prerelease"],
  ["воспроизведите на `3.2.4`, если это возможно", "воспроизведите на `3.3.2`, если это возможно"],
]);

transform("CONTRIBUTING.md", [
  ["| Repository version | `3.3.1` |", "| Repository version | `3.3.2` |"],
]);

transform("docs/OPERATIONS_RUNBOOK.md", [
  ["Runbook относится к Nexora `3.3.1`:", "Runbook относится к Nexora `3.3.2`:"],
  ["## 9. Upgrade to 3.2.4", "## 9. Upgrade to 3.3.2"],
  [/### From 3\.1\.x\/schema 7(?! to 3\.3\.2)/g, "### From 3.1.x/schema 7 to 3.3.2"],
  ["### From 3.2.0–3.2.3", "### From 3.2.0–3.3.1"],
  ["Client/Server both 3.2.4-compatible", "Client/Server both 3.3.0+-compatible"],
]);

transform("ADMIN_GUIDE.md", [
  ["| Repository version | `3.3.1` |", "| Repository version | `3.3.2` |"],
  ["`3.3.1` опубликована как controlled `UNSIGNED-TEST` prerelease.", "`3.3.2` опубликована как controlled `UNSIGNED-TEST` prerelease."],
  ["Upgrade 3.2.0–3.2.3 → 3.2.4 не требует migration.", "Upgrade 3.2.0–3.3.1 → 3.3.2 не требует migration."],
  ["## 10. MLS Welcome recovery 3.2.4", "## 10. MLS Welcome recovery 3.3.0+"],
  ["compatible 3.2.4 Client", "compatible 3.3.0+ Client"],
]);

transform("docs/DEPLOYMENT.md", [
  ["Документ относится к Nexora `3.3.1`:", "Документ относится к Nexora `3.3.2`:"],
  ["Controlled 3.3.1 prerelease", "Controlled 3.3.2 prerelease"],
  ["### 3.1.x / schema 7 → 3.2.4", "### 3.1.x / schema 7 → 3.3.2"],
  ["### 3.2.0–3.2.3 → 3.2.4", "### 3.2.0–3.3.1 → 3.3.2"],
  ["compatible 3.2.x clients", "compatible 3.3.x clients"],
  ["## 11. Welcome recovery 3.2.4", "## 11. Welcome recovery 3.3.0+"],
]);

transform("TESTER_GUIDE.md", [
  ["current version: `3.3.1` published `UNSIGNED-TEST` prerelease", "current version: `3.3.2` published `UNSIGNED-TEST` prerelease"],
  ["3.3.1 тестируется с disposable accounts", "3.3.2 тестируется с disposable accounts"],
  ["## 13. MLS Welcome recovery 3.2.4", "## 13. MLS Welcome recovery 3.3.0+"],
  ["## 18. Windows updater 3.2.4", "## 18. Windows updater 3.3.0+"],
]);

transform("docs/PRODUCT_OVERVIEW.md", [
  ["| Current repository version | `3.3.1` |", "| Current repository version | `3.3.2` |"],
  ["| Local Server migration from 3.2.0–3.3.0 | не требуется |", "| Local Server migration from 3.2.0–3.3.1 | не требуется |"],
  [/- `3\.3\.1` — packaged Windows Server startup correction: `shared\/\*\*\/\*` включён в `app\.asar` и защищён release gate\.(?!\n- `3\.3\.2`)/g, "- `3.3.1` — packaged Windows Server startup correction: `shared/**/*` включён в `app.asar` и защищён release gate;\n- `3.3.2` — release metadata, current documentation, release history и published-asset smoke приведены к одному проверяемому состоянию."],
  ["## 8. MLS Welcome recovery 3.2.4", "## 8. MLS Welcome recovery 3.3.0+"],
  ["3.2.4 включает:", "3.3.0+ включает:"],
  ["| Platform | Technology | 3.2.4 status |", "| Platform | Technology | 3.3.2 status |"],
  ["Nexora 3.2.4 не заявляет:", "Nexora 3.3.2 не заявляет:"],
  ["[Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md)", "[Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md)"],
]);

transform("docs/RELEASE_POLICY.md", [
  ["Metadata синхронизируется в package, lockfile, Client handshake, Android, release notes, verification и tag.", "Metadata синхронизируется в package, lockfile, Client handshake, Android, current README/documentation, release notes, verification, release evidence и tag."],
  ["3.2.4 keeps schema 8. Migration from 3.2.0–3.2.3 is not required.", "3.3.2 keeps schema 8. Migration from 3.2.0–3.3.1 is not required."],
  [/^### 3\.2\.4$/m, "### 3.3.2"],
  ["- classification: Source/PWA prerelease;", "- classification: Published `UNSIGNED-TEST` prerelease;"],
  ["- database migration from 3.2.0–3.2.3: none;", "- database migration from 3.2.0–3.3.1: none;"],
  ["[Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md)", "[Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md)"],
]);

transform("docs/GITHUB_RELEASE.md", [
  ["- `3.3.1` — published `UNSIGNED-TEST` prerelease without `latest.yml` or `.blockmap`;", "- `3.3.2` — published `UNSIGNED-TEST` prerelease without `latest.yml` or `.blockmap`;"],
  ["- release notes/security review/verification;", "- README, Project Index, Architecture, Security Model and operational current documents;\n- release notes/security review/verification and current release evidence;"],
  ["Current tag: `v3.2.4`.", "Current tag: `v3.3.2`."],
  ["git tag -s v3.2.4 -m \"Nexora 3.2.4\"", "git tag -s v3.3.2 -m \"Nexora 3.3.2\""],
  ["git push origin v3.2.4", "git push origin v3.3.2"],
  ["8. otherwise publishes explicit Source/PWA prerelease without updater assets.", "8. otherwise publishes explicit `UNSIGNED-TEST` prerelease without updater metadata."],
  ["## 7. Packaged Client updater 3.2.4", "## 7. Packaged Client updater 3.3.0+"],
  ["publish complete signed 3.2.4 asset set", "publish complete signed 3.3.2 asset set"],
  ["3.2.4 displays:", "3.3.2 displays:"],
  ["3.2.4 evidence is recorded in:", "3.3.2 evidence is recorded in:"],
  ["[Release Notes](../RELEASE_NOTES_3.2.4.md)", "[Release Notes](../RELEASE_NOTES_3.3.2.md)"],
  ["[Security Review](../SECURITY_REVIEW_3.2.4.md)", "[Security Review](../SECURITY_REVIEW_3.3.0.md)"],
  ["[Release Verification](../RELEASE_VERIFICATION_3.2.4.md)", "[Release Verification](../RELEASE_VERIFICATION_3.3.2.md)"],
]);

transform("docs/RELEASE_CHECKLIST.md", [
  [/^# Nexora 3\.2\.4 Release Checklist$/m, "# Nexora 3.3.2 Release Checklist"],
  ["show `3.2.4`", "show `3.3.2`"],
  ["Tag is immutable `v3.2.4`", "Tag is immutable `v3.3.2`"],
  ["3.2.4 is not described", "3.3.2 is not described"],
  ["No migration required from 3.2.0–3.2.3.", "No migration required from 3.2.0–3.3.1."],
  ["## 8. MLS Welcome recovery 3.2.4", "## 8. MLS Welcome recovery 3.3.0+"],
  ["## 11. Updater 3.2.4", "## 11. Updater 3.3.0+"],
  ["updater n-1 → 3.2.4", "updater n-1 → 3.3.2"],
  ["Until all stable gates complete, 3.2.4 remains Source/PWA prerelease", "Until all stable gates complete, 3.3.2 remains an `UNSIGNED-TEST` prerelease"],
]);

transform("BRANCHES.md", [
  ["| `main` | Nexora `3.2.4` Source/PWA prerelease; signed production baseline `3.1.2` |", "| `main` | Nexora `3.3.2` published `UNSIGNED-TEST` prerelease; signed production baseline `3.1.2` |"],
  ["| `agent/nexora-3.2.0-trust-core` | Early Rust/OpenMLS Trust Core foundation | Draft PR #11; superseded by current implementation; release prohibited |", "| `agent/nexora-3.2.0-trust-core` | Early Rust/OpenMLS Trust Core foundation | Closed PR #11; superseded by current `ts-mls` implementation; release prohibited |"],
  ["The 3.2.5 branch is active development, not current product documentation. The early Trust Core branch remains open only as historical provenance and must not merge, tag or publish without a new explicit rebase/review decision.", "The 3.2.5 branch is historical development, not current product documentation. The early Rust/OpenMLS branch remains only as historical provenance and must not merge, tag or publish without a new RFC, rebase and security review."],
  [/- \| `docs\/reconcile-all-branches-3\.2\.4`/g, "- | `docs/reconcile-all-branches-3.2.4`"],
  ["| `docs/reconcile-all-branches-3.2.4` | Current 3.2.4 documentation and all-branch status reconciliation | Merged through PR #27 |", "| `docs/reconcile-all-branches-3.2.4` | Historical 3.2.4 documentation and branch reconciliation | Merged through PR #27 |\n| `agent/release-3.3.2-consistency` | Release metadata, documentation and evidence consistency | Merged through PR #42 |"],
  ["| `automation/nexora-3.1.0-tag` | Historical tag automation attempt | Open obsolete PR #6; do not merge/tag/publish |", "| `automation/nexora-3.1.0-tag` | Historical tag automation attempt | Closed obsolete PR #6; do not merge/tag/publish |"],
  ["| `automation/nexora-3.1.0-finalize` | Historical finalization attempt | Open obsolete PR #7; do not merge/tag/publish |", "| `automation/nexora-3.1.0-finalize` | Historical finalization attempt | Closed obsolete PR #7; do not merge/tag/publish |"],
  ["- version: `3.2.4`;", "- version: `3.3.2`;"],
  ["- distribution: Source/PWA prerelease;", "- distribution: published `UNSIGNED-TEST` prerelease;"],
  ["- migration from 3.2.0–3.2.3: not required;", "- migration from 3.2.0–3.3.1: not required;"],
]);

transform(".github/ISSUE_TEMPLATE/bug_report.yml", [
  [/Current version: 3\.3\.1 published UNSIGNED-TEST prerelease\. Signed production baseline: 3\.1\.2\. Versions 3\.2\.0–3\.3\.0 are superseded; reproduce on 3\.3\.1 when possible\./g, "Current version: 3.3.2 published UNSIGNED-TEST prerelease. Signed production baseline: 3.1.2. Versions 3.2.0–3.3.1 are superseded; reproduce on 3.3.2 when possible."],
  ["Client 3.3.1 UNSIGNED-TEST / Server 3.3.1 / Cloud disabled / tag v3.3.1", "Client 3.3.2 UNSIGNED-TEST / Server 3.3.2 / Cloud disabled / tag v3.3.2"],
  ["Use main/v3.3.1 for current reports", "Use main/v3.3.2 for current reports"],
  ["main / v3.3.1 / agent/...", "main / v3.3.2 / agent/..."],
  ["I reproduced on 3.2.4 or supplied", "I reproduced on 3.3.2 or supplied"],
]);

transform("website/index.html", [
  [">3.2.4<", ">3.3.2<"],
]);

transform("website/app.js", [
  [/const FALLBACK_VERSION = "3\.2\.4";/g, "const FALLBACK_VERSION = \"3.3.2\";"],
  ["release-документации Nexora 3.2.x", "release-документации Nexora 3.3.x"],
  ["Линия 3.2.x не заявляется", "Линия 3.3.x не заявляется"],
  ["Nexora 3.2.x release documentation", "Nexora 3.3.x release documentation"],
  ["The 3.2.x line does not claim", "The 3.3.x line does not claim"],
]);

transform("website/site-fixes.js", [
  [/const FALLBACK_VERSION = "3\.3\.0";/g, "const FALLBACK_VERSION = \"3.3.2\";"],
]);

console.log(`Synchronized ${changes.length} current documentation surfaces: ${changes.join(", ") || "already current"}.`);
