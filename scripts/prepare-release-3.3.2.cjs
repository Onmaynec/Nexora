"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const version = "3.3.2";

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(file(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(file(relativePath), content, "utf8");
}

function replaceAllRequired(relativePath, replacements) {
  let source = read(relativePath);
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${relativePath}: required text not found: ${before.slice(0, 120)}`);
    }
    source = source.replace(before, after);
  }
  write(relativePath, source);
}

const packageJson = JSON.parse(read("package.json"));
packageJson.version = version;
packageJson.scripts["release:consistency"] = "node scripts/check-release-consistency.cjs";
packageJson.scripts["release:check"] = "node scripts/sync-release-metadata.cjs --check && npm run release:consistency && npm run check && npm run test:unit && npm run test:performance && npm run audit:security";
write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

const sync = spawnSync(process.execPath, [file("scripts/sync-release-metadata.cjs")], {
  cwd: root,
  stdio: "inherit",
});
if (sync.status !== 0) throw new Error("release metadata synchronization failed");

replaceAllRequired("README.md", [
  ["current-3.3.1%20UNSIGNED--TEST", "current-3.3.2%20UNSIGNED--TEST"],
  [
    "| `3.3.1` | Исправление запуска Windows Server: shared Pulse runtime включён в installer и проверяется release gate | Опубликованный UNSIGNED-TEST prerelease без updater metadata |",
    "| `3.3.2` | Release Consistency: единая версия, current docs, release evidence и asset smoke gate | Опубликованный UNSIGNED-TEST prerelease без updater metadata |\n| `3.3.1` | Исправление запуска Windows Server: shared Pulse runtime включён в installer и проверяется release gate | Заменён 3.3.2 |",
  ],
  [
    "`3.3.1` прошёл build-, unit-, API-, integration-, performance-, security-, soak-, Android- и Windows artifact-gates. Windows Client/Server и Android опубликованы как явно маркированные `UNSIGNED-TEST` assets; `latest.yml` и `.blockmap` отсутствуют, поэтому production updater их не принимает. Независимый E2EE-аудит не заявляется. Авторитетные документы текущей линии:",
    "`3.3.2` сохраняет runtime и security boundary 3.3.1, синхронизирует release metadata и current documentation, а также добавляет обязательную post-publication smoke-проверку Client, Server, Android и PWA assets. Windows Client/Server и Android публикуются как явно маркированные `UNSIGNED-TEST` assets; `latest.yml` и `.blockmap` отсутствуют, поэтому production updater их не принимает. Независимый E2EE-аудит не заявляется. Авторитетные документы текущей линии:",
  ],
  ["- [Release Notes 3.3.1](RELEASE_NOTES_3.3.1.md);", "- [Release Notes 3.3.2](RELEASE_NOTES_3.3.2.md);"],
  ["- [Release Verification 3.3.1](RELEASE_VERIFICATION_3.3.1.md);", "- [Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.2.md);"],
  [
    "### Release 3.3.1",
    "### Release 3.3.2\n\n- package, lockfile, Client handshake и Android metadata синхронизированы одной версией;\n- Architecture, Security Model, Android README, Project Index и Documentation Portal актуализированы;\n- `CHANGELOG.md` закреплён как единственный источник release history;\n- CI блокирует version drift и старые current verification links;\n- release evidence pipeline скачивает и smoke-проверяет Client, Server, Android и PWA assets.\n\n### Release 3.3.1",
  ],
  ["Nexora `3.3.1` не заявляет защиту от traffic analysis.", "Nexora `3.3.2` не заявляет защиту от traffic analysis."],
  ["[3.3.1 Verification](RELEASE_VERIFICATION_3.3.1.md)", "[3.3.2 Verification](RELEASE_VERIFICATION_3.3.2.md)"],
  ["[Changelog](CHANGELOG.md)", "[Release History](RELEASE_HISTORY.md), [Changelog](CHANGELOG.md)"],
]);

replaceAllRequired("PROJECT_INDEX.md", [
  ["| Repository version | `3.3.1` |", "| Repository version | `3.3.2` |"],
  [
    "| `scripts/sync-release-metadata.cjs` | package/lock/Android/handshake version synchronization |",
    "| `scripts/sync-release-metadata.cjs` | package/lock/Android/handshake version synchronization |\n| `scripts/check-release-consistency.cjs` | CI gate для package, lock, Android, current docs и release evidence |",
  ],
  ["## Ключевые лимиты, действующие в 3.2.4", "## Ключевые лимиты, действующие в 3.3.0+"],
  [
    "| `test/release-experience.test.cjs` | post-update dialog, dismissal, GitHub details link и test-mode switch |",
    "| `test/release-experience.test.cjs` | post-update dialog, dismissal, GitHub details link и test-mode switch |\n| `test/release-consistency.test.cjs` | единая версия и отказ при Android/documentation drift |",
  ],
  [
    "| `npm run release:check` | synchronized metadata и complete release-sensitive gate |",
    "| `npm run release:consistency` | package/lock/Android/docs/evidence version consistency |\n| `npm run release:check` | synchronized metadata и complete release-sensitive gate |",
  ],
]);

replaceAllRequired("docs/ARCHITECTURE.md", [
  ["Документ описывает `main` версии `3.3.1`:", "Документ описывает `main` версии `3.3.2`:"],
  ["No migration is required between 3.2.0–3.2.4.", "No migration is required between 3.2.0–3.3.2."],
  ["## 10. Welcome recovery 3.2.4", "## 10. Welcome recovery baseline 3.3.0"],
  [
    "## 20. Security limitations",
    "## 20. Release metadata boundary\n\n`package.json` является источником SemVer. CI сравнивает lockfile, Android metadata, Client handshake, README, Project Index, Architecture, Security Model и current release evidence. Post-publication workflow скачивает Client, Server, Android и PWA assets, проверяет SHA-256 и container integrity до записи immutable evidence.\n\n## 21. Security limitations",
  ],
  ["stable signed 3.2.4 Windows approval", "stable signed 3.3.x Windows approval"],
]);

replaceAllRequired("docs/SECURITY_MODEL.md", [
  ["# Модель безопасности Nexora 3.3.1", "# Модель безопасности Nexora 3.3.2"],
  ["| Version | `3.3.1` |", "| Version | `3.3.2` |"],
  ["В 3.2.4 pending verified device может запросить создание Welcome:", "Начиная с 3.3.0 pending verified device может запросить создание Welcome:"],
  [
    "- SBOM и checksums.",
    "- SBOM и checksums;\n- согласованность SemVer между package, lockfile, Android, current docs и release evidence;\n- smoke-проверку опубликованных Client, Server, Android и PWA assets.",
  ],
  [
    "См. [Security Policy](../SECURITY.md), [Security Verification Summary](../SECURITY_AUDIT.md), [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) и [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md).",
    "См. [Security Policy](../SECURITY.md), [Security Verification Summary](../SECURITY_AUDIT.md), [Security Review 3.3.0](../SECURITY_REVIEW_3.3.0.md) и [Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md).",
  ],
]);

replaceAllRequired("android/README.md", [
  ["| Current version | `3.3.1` |", "| Current version | `3.3.2` |"],
  ["- version metadata equals `3.2.4`.", "- version metadata equals `3.3.2`."],
  [
    "Nexora 3.2.4 does not claim traffic-analysis resistance or independent certification. Existing 3.1.x data is not retroactively encrypted. 3.1.x Client cannot participate in active secure 3.2.x conversation.",
    "Nexora 3.3.0+ does not claim traffic-analysis resistance or independent certification. Existing 3.1.x data is not retroactively encrypted. 3.1.x Client cannot participate in an active secure 3.3.x conversation.",
  ],
  ["[Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md)", "[Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md)"],
]);

replaceAllRequired("docs/README.md", [
  ["| Current repository version | `3.3.1` |", "| Current repository version | `3.3.2` |"],
  ["| Local Server migration from 3.2.0–3.3.0 | не требуется |", "| Local Server migration from 3.2.0–3.3.1 | не требуется |"],
  [
    "3.3.1 является текущим исправляющим выпуском: она сохраняет продуктовую линию 3.3.0 и исправляет запуск установленного Windows Server, включая обязательный `shared/pulse-catalog.cjs` в Electron payload. Security boundary, schema 8, API v3 и Trust/MLS API v4 не изменены.",
    "3.3.2 является текущим исправляющим выпуском Release Consistency: runtime 3.3.1 не меняется, а package/lock/Android/current docs/release evidence синхронизируются и защищаются CI gate. Security boundary, schema 8, API v3 и Trust/MLS API v4 не изменены.",
  ],
  ["Current through 3.3.1", "Current through 3.3.2"],
  ["current security boundary inherited unchanged by 3.3.1", "current security boundary inherited unchanged by 3.3.2"],
  ["[Release Verification 3.3.1](../RELEASE_VERIFICATION_3.3.1.md)", "[Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md)"],
  ["[Release Notes 3.3.1](../RELEASE_NOTES_3.3.1.md) | current Server startup patch scope", "[Release Notes 3.3.2](../RELEASE_NOTES_3.3.2.md) | current release consistency scope"],
  ["security boundary inherited unchanged by 3.3.1", "security boundary inherited unchanged by 3.3.2"],
  ["[Changelog](../CHANGELOG.md) | release history", "[Release History](../RELEASE_HISTORY.md) | pointer to the canonical [Changelog](../CHANGELOG.md)"],
  ["current 3.3.1 behavior", "current 3.3.2 behavior"],
]);

replaceAllRequired("SECURITY_AUDIT.md", [
  ["**Текущая версия:** `3.3.1`", "**Текущая версия:** `3.3.2`"],
  ["security boundary, unchanged by 3.3.1", "security boundary, unchanged by 3.3.2"],
  ["[Release Verification 3.3.1](RELEASE_VERIFICATION_3.3.1.md)", "[Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.2.md)"],
  ["[Release Notes 3.3.1](RELEASE_NOTES_3.3.1.md)", "[Release Notes 3.3.2](RELEASE_NOTES_3.3.2.md)"],
  ["| Version | `3.3.1` |", "| Version | `3.3.2` |"],
  ["| Local Server migration from 3.2.0–3.3.0 | не требуется |", "| Local Server migration from 3.2.0–3.3.1 | не требуется |"],
  [
    "Основной implementation gate 3.3.1: PR CI run `29998152125`.\n\nFocused Nexora 3.3 regressions: run `29998152148`. Release packaging/publication: run `29998460934`.",
    "Для 3.3.2 обязательны стандартные Windows/Linux/release/soak/Android gates, version-consistency regression и post-publication asset smoke. Конкретные run IDs и digests записываются в `release-evidence/v3.3.2.json` и `release-evidence/post-release-main-gate.json`.",
  ],
  [
    "Детали test-first regression, runner gates, packaging и publication приведены в [Release Verification 3.3.1](RELEASE_VERIFICATION_3.3.1.md). Исправление 3.3.1 не расширяет security boundary: оно восстанавливает dependency closure упакованного Server и добавляет fail-fast release validation.",
    "Acceptance contract, consistency gate и asset smoke описаны в [Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.2.md). Выпуск 3.3.2 не расширяет security boundary и не изменяет runtime authorization, Trust/MLS или storage behavior.",
  ],
]);

const changelog = read("CHANGELOG.md");
const changelogAnchor = "## [3.3.1] — 2026-07-23";
if (!changelog.includes(changelogAnchor)) throw new Error("CHANGELOG.md: 3.3.1 anchor not found");
const entry = `## [3.3.2] — 2026-07-23\n\n### Исправлено\n\n- version metadata, current documentation и release evidence приведены к одному источнику истины;\n- current-ссылки на устаревшую Release Verification 3.2.4 заменены актуальными;\n- Architecture, Security Model, Android README и Project Index больше не содержат противоречивых current claims.\n\n### CI и выпуск\n\n- добавлен release consistency gate для package, lockfile, Android, README, Project Index, Architecture, Security Model и evidence;\n- добавлена негативная регрессия, подтверждающая отказ при Android version drift;\n- release evidence workflow скачивает опубликованные Client, Server, Android и PWA assets, проверяет SHA-256, PE/ZIP integrity и обязательное содержимое;\n- CHANGELOG закреплён как единственный канонический release history.\n\n### Организационная очистка\n\n- конфликтующие устаревшие PR #30 и #31 закрыты;\n- экспериментальный Rust/OpenMLS PR #11 закрыт как superseded отдельным текущим Trust/MLS-контуром.\n\n### Совместимость\n\n- schema 8, API v3 и Trust/MLS API v4 сохранены;\n- runtime code, зависимости, migrations и пользовательские функции не изменены.\n\n`;
write("CHANGELOG.md", changelog.replace(changelogAnchor, `${entry}${changelogAnchor}`));

console.log("Prepared Nexora 3.3.2 Release Consistency changes.");
