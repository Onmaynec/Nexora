"use strict";

const fs = require("node:fs");

function update(path, transforms) {
  let content = fs.readFileSync(path, "utf8");
  for (const [from, to] of transforms) {
    if (!content.includes(from)) {
      throw new Error(`${path}: expected source text was not found: ${JSON.stringify(from)}`);
    }
    content = content.replace(from, to);
  }
  fs.writeFileSync(path, content, "utf8");
}

update("docs/README.md", [
  ["| Current repository version | `3.2.4` |", "| Current repository version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` prerelease |"],
  ["| Migration from 3.2.0–3.2.3 | не требуется |", "| Local Server migration from 3.2.0–3.3.0 | не требуется |"],
  [
    "3.2.4 объединяет Trust/MLS foundation 3.2.0, lifecycle corrections 3.2.1–3.2.2, security hardening 3.2.3 и patch updater/Server console/Welcome recovery 3.2.4.",
    "3.3.1 является текущим исправляющим выпуском: она сохраняет продуктовую линию 3.3.0 и исправляет запуск установленного Windows Server, включая обязательный `shared/pulse-catalog.cjs` в Electron payload. Security boundary, schema 8, API v3 и Trust/MLS API v4 не изменены.",
  ],
  ["Current 3.2.4", "Current through 3.3.1"],
  ["Current 3.2.4", "Current through 3.3.1"],
  ["Current 3.2.4", "Current through 3.3.1"],
  ["Current 3.2.4", "Current through 3.3.1"],
  ["Current 3.2.4", "Current through 3.3.1"],
  [
    "| [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) | updater, console, Welcome recovery, test mode | Release-specific current |",
    "| [Security Review 3.3.0](../SECURITY_REVIEW_3.3.0.md) | current security boundary inherited unchanged by 3.3.1 | Release-specific current |",
  ],
  [
    "| [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md) | CI and compatibility evidence | Release-specific current |",
    "| [Release Verification 3.3.1](../RELEASE_VERIFICATION_3.3.1.md) | test-first regression, CI, release and asset evidence | Release-specific current |",
  ],
  ["- [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md);", "- [Release Verification 3.3.1](../RELEASE_VERIFICATION_3.3.1.md);"],
  [
    "| [Release Notes 3.2.4](../RELEASE_NOTES_3.2.4.md) | current patch scope |",
    "| [Release Notes 3.3.1](../RELEASE_NOTES_3.3.1.md) | current Server startup patch scope |",
  ],
  [
    "| [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) | release security boundary |",
    "| [Security Review 3.3.0](../SECURITY_REVIEW_3.3.0.md) | security boundary inherited unchanged by 3.3.1 |",
  ],
  [
    "| [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md) | authoritative evidence |",
    "| [Release Verification 3.3.1](../RELEASE_VERIFICATION_3.3.1.md) | authoritative test and publication evidence |",
  ],
  ["current 3.2.4 behavior", "current 3.3.1 behavior"],
]);

update("PROJECT_INDEX.md", [
  ["| Repository version | `3.2.4` |", "| Repository version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` prerelease |"],
]);

update("ADMIN_GUIDE.md", [
  ["| Repository version | `3.2.4` |", "| Repository version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` prerelease |"],
  [
    "`3.2.4` предназначена для controlled prerelease testing. Signed production deployment должен использовать подтверждённую release classification и complete signed assets.",
    "`3.3.1` опубликована как controlled `UNSIGNED-TEST` prerelease. Signed production deployment должен использовать подтверждённую signed release classification и полный набор updater assets.",
  ],
]);

update("docs/PRODUCT_OVERVIEW.md", [
  ["| Current repository version | `3.2.4` |", "| Current repository version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` prerelease |"],
  ["| Migration from 3.2.0–3.2.3 | не требуется |", "| Local Server migration from 3.2.0–3.3.0 | не требуется |"],
  [
    "- `3.2.4` — Windows updater lifecycle, audited Server console, automatic MLS Welcome recovery, post-update UX и test-mode diagnostics.",
    "- `3.2.4` — Windows updater lifecycle, audited Server console, automatic MLS Welcome recovery, post-update UX и test-mode diagnostics;\n- `3.2.5` — messaging/media regressions, developer commands и encrypted outbox corrections;\n- `3.3.0` — Trust recovery, spendable Impulses/Pulse, voice waveform UX, website и complete artifact pipeline;\n- `3.3.1` — packaged Windows Server startup correction: `shared/**/*` включён в `app.asar` и защищён release gate.",
  ],
]);

update("CONTRIBUTING.md", [
  ["| Repository version | `3.2.4` |", "| Repository version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` prerelease |"],
]);

update("SECURITY.md", [
  [
    "| `3.2.4` | Source/PWA prerelease | Текущая поддерживаемая prerelease-линия; security fixes принимаются |",
    "| `3.3.1` | Published `UNSIGNED-TEST` prerelease | Текущая поддерживаемая prerelease-линия; security fixes принимаются |",
  ],
  [
    "| `3.2.0–3.2.3` | Superseded prereleases | Обновитесь до `3.2.4`; отчёты принимаются для regression/impact analysis |",
    "| `3.2.0–3.3.0` | Superseded prereleases | Обновитесь до `3.3.1`; отчёты принимаются для regression/impact analysis |",
  ],
]);

update("SECURITY_AUDIT.md", [
  ["**Дата документа:** 22 июля 2026", "**Дата документа:** 23 июля 2026"],
  ["**Текущая версия:** `3.2.4`", "**Текущая версия:** `3.3.1`"],
  ["**Канал:** Source/PWA prerelease", "**Канал:** Published `UNSIGNED-TEST` prerelease"],
  [
    "- [Security Review 3.2.4](SECURITY_REVIEW_3.2.4.md);\n- [Release Verification 3.2.4](RELEASE_VERIFICATION_3.2.4.md);",
    "- [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md) — security boundary, unchanged by 3.3.1;\n- [Release Verification 3.3.1](RELEASE_VERIFICATION_3.3.1.md);\n- [Release Notes 3.3.1](RELEASE_NOTES_3.3.1.md);",
  ],
  ["| Version | `3.2.4` |", "| Version | `3.3.1` |"],
  ["| Migration from 3.2.0–3.2.3 | не требуется |", "| Local Server migration from 3.2.0–3.3.0 | не требуется |"],
  [
    "Основной implementation gate 3.2.4: CI run `#334`, ID `29942843275`.\n\nMerge-head multi-platform gate: CI run `#343`, ID `29943869863`.",
    "Основной implementation gate 3.3.1: PR CI run `29998152125`.\n\nFocused Nexora 3.3 regressions: run `29998152148`. Release packaging/publication: run `29998460934`.",
  ],
  [
    "Детали и исключения runner timing приведены в [Release Verification 3.2.4](RELEASE_VERIFICATION_3.2.4.md).",
    "Детали test-first regression, runner gates, packaging и publication приведены в [Release Verification 3.3.1](RELEASE_VERIFICATION_3.3.1.md). Исправление 3.3.1 не расширяет security boundary: оно восстанавливает dependency closure упакованного Server и добавляет fail-fast release validation.",
  ],
  ["## 6. 3.2.4 patch verification", "## 6. Historical 3.2.4 patch verification"],
]);

update("TESTER_GUIDE.md", [
  ["- current version: `3.2.4` Source/PWA prerelease;", "- current version: `3.3.1` published `UNSIGNED-TEST` prerelease;"],
  [
    "3.2.4 тестируется с disposable accounts и test data. Она не является signed stable Windows release и не заявляется как independently audited E2EE.",
    "3.3.1 тестируется с disposable accounts и test data. Она не является signed stable Windows release и не заявляется как independently audited E2EE. Критическая acceptance-проверка: установить Windows Server, запустить его и подтвердить отсутствие `MODULE_NOT_FOUND` для `shared/pulse-catalog.cjs` до открытия Server UI.",
  ],
]);

update("SUPPORT.md", [
  [
    "| `3.2.4` Source/PWA prerelease | Текущая prerelease-линия; defect и security reports принимаются |",
    "| `3.3.1` published `UNSIGNED-TEST` prerelease | Текущая prerelease-линия; defect и security reports принимаются |",
  ],
  [
    "| `3.2.0–3.2.3` | Superseded prereleases; обновитесь до `3.2.4` перед обычной диагностикой |",
    "| `3.2.0–3.3.0` | Superseded prereleases; обновитесь до `3.3.1` перед обычной диагностикой |",
  ],
  [
    "В обращении укажите точные Client, Server и Pulse Cloud versions, release channel и commit/tag. `3.2.4` не является signed stable Windows release и не заявляется как independently audited E2EE.",
    "В обращении укажите точные Client, Server и Pulse Cloud versions, release channel и commit/tag. `3.3.1` опубликована как unsigned test prerelease, не является signed stable Windows release и не заявляется как independently audited E2EE.",
  ],
]);

update(".github/ISSUE_TEMPLATE/bug_report.yml", [
  [
    "Current version: 3.2.4 Source/PWA prerelease. Signed production baseline: 3.1.2. Versions 3.2.0–3.2.3 are superseded; reproduce on 3.2.4 when possible.",
    "Current version: 3.3.1 published UNSIGNED-TEST prerelease. Signed production baseline: 3.1.2. Versions 3.2.0–3.3.0 are superseded; reproduce on 3.3.1 when possible.",
  ],
  ["Client 3.2.4 prerelease / Server 3.2.4 / Cloud disabled / commit abc123", "Client 3.3.1 UNSIGNED-TEST / Server 3.3.1 / Cloud disabled / tag v3.3.1"],
  ["Use main/v3.2.4 for current reports", "Use main/v3.3.1 for current reports"],
  ["main / v3.2.4 / agent/...", "main / v3.3.1 / agent/..."],
  ["        - Source/PWA prerelease", "        - Published UNSIGNED-TEST prerelease"],
]);

update("docs/ARCHITECTURE.md", [
  ["Документ описывает `main` версии `3.2.4`:", "Документ описывает `main` версии `3.3.1`:"],
  ["- distribution: Source/PWA prerelease;", "- distribution: published `UNSIGNED-TEST` prerelease;"],
]);

update("docs/SECURITY_MODEL.md", [
  ["# Модель безопасности Nexora 3.2.4", "# Модель безопасности Nexora 3.3.1"],
  ["| Version | `3.2.4` |", "| Version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` prerelease |"],
]);

update("docs/DEPLOYMENT.md", [
  ["Документ относится к Nexora `3.2.4`:", "Документ относится к Nexora `3.3.1`:"],
  ["- Source/PWA prerelease;", "- published `UNSIGNED-TEST` prerelease;"],
  ["| Controlled 3.2.4 prerelease |", "| Controlled 3.3.1 prerelease |"],
]);

update("docs/OPERATIONS_RUNBOOK.md", [
  ["Runbook относится к Nexora `3.2.4`:", "Runbook относится к Nexora `3.3.1`:"],
  ["- Source/PWA prerelease;", "- published `UNSIGNED-TEST` prerelease;"],
]);

update("android/README.md", [
  ["| Current version | `3.2.4` |", "| Current version | `3.3.1` |"],
  ["| Distribution | Source/PWA prerelease |", "| Distribution | Published `UNSIGNED-TEST` APK prerelease |"],
]);

update("docs/GITHUB_RELEASE.md", [
  [
    "| Source/PWA prerelease | source ZIP, PWA ZIP, SPDX SBOM, checksums | no |\n| Stable signed Windows |",
    "| Source/PWA prerelease | source ZIP, PWA ZIP, SPDX SBOM, checksums | no |\n| Published UNSIGNED-TEST prerelease | Client/Server `.exe`, Android APK, source/PWA/SBOM/checksums; no updater metadata | no |\n| Stable signed Windows |",
  ],
  ["- `3.2.4` — Source/PWA prerelease;", "- `3.3.1` — published `UNSIGNED-TEST` prerelease without `latest.yml` or `.blockmap`;"],
]);

const requiredCurrentMarkers = {
  "docs/README.md": "Current repository version | `3.3.1`",
  "PROJECT_INDEX.md": "Repository version | `3.3.1`",
  "ADMIN_GUIDE.md": "Repository version | `3.3.1`",
  "docs/PRODUCT_OVERVIEW.md": "Current repository version | `3.3.1`",
  "CONTRIBUTING.md": "Repository version | `3.3.1`",
  "SECURITY.md": "| `3.3.1` | Published `UNSIGNED-TEST` prerelease |",
  "SECURITY_AUDIT.md": "**Текущая версия:** `3.3.1`",
  "TESTER_GUIDE.md": "current version: `3.3.1`",
  "SUPPORT.md": "| `3.3.1` published `UNSIGNED-TEST` prerelease |",
  "docs/ARCHITECTURE.md": "`main` версии `3.3.1`",
  "docs/SECURITY_MODEL.md": "# Модель безопасности Nexora 3.3.1",
  "docs/DEPLOYMENT.md": "Nexora `3.3.1`",
  "docs/OPERATIONS_RUNBOOK.md": "Nexora `3.3.1`",
  "android/README.md": "Current version | `3.3.1`",
  "docs/GITHUB_RELEASE.md": "`3.3.1` — published `UNSIGNED-TEST` prerelease",
};
for (const [path, marker] of Object.entries(requiredCurrentMarkers)) {
  if (!fs.readFileSync(path, "utf8").includes(marker)) {
    throw new Error(`${path}: missing final marker ${marker}`);
  }
}

console.log("Current documentation metadata synchronized for Nexora 3.3.1.");
