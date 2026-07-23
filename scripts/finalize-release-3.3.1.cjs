"use strict";

const fs = require("node:fs");

const version = "3.3.1";
const tag = `v${version}`;
const releaseCommit = "a7d5a7f020051bb837b67df437de90b2cd96958a";
const prHead = "3161ea6e97e6e58f34e341f1b70d763c8550a9a3";
const prCiRun = 29998152125;
const focusedRun = 29998152148;
const releaseRun = 29998460934;

const diagnosticPath = "release-evidence/diagnostic-v3.3.1.json";
const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
if (!diagnostic.releaseAvailable || !diagnostic.release) {
  throw new Error("GitHub Release v3.3.1 is not available");
}

const release = diagnostic.release;
if (release.tagName !== tag || release.isDraft || !release.isPrerelease) {
  throw new Error("Unexpected v3.3.1 release state");
}

const assets = [...release.assets].sort((left, right) => left.name.localeCompare(right.name));
const assetNames = assets.map((asset) => asset.name);
const requiredAssets = [
  `Nexora-${version}-source.zip`,
  `Nexora-${version}.spdx.json`,
  `Nexora-Android-${version}-UNSIGNED-TEST.apk`,
  `Nexora-Client-Setup-${version}-UNSIGNED-TEST.exe`,
  `Nexora-PWA-${version}.zip`,
  `Nexora-Server-Setup-${version}-UNSIGNED-TEST.exe`,
  "SHA256SUMS.txt",
];
for (const name of requiredAssets) {
  if (!assetNames.includes(name)) throw new Error(`Published release is missing ${name}`);
}
if (assetNames.includes("latest.yml") || assetNames.some((name) => name.endsWith(".blockmap"))) {
  throw new Error("UNSIGNED-TEST release exposes production updater metadata");
}

const releaseEvidence = {
  schemaVersion: 1,
  version,
  tag,
  releaseCommit,
  publishedAt: release.publishedAt,
  releaseUrl: release.url,
  name: release.name,
  draft: release.isDraft,
  prerelease: release.isPrerelease,
  distribution: "UNSIGNED-TEST",
  updaterMetadataPublished: false,
  verification: {
    testFirstFailureCommit: "cbb112df2885c1eab0b85c9e08efece6aec39e2a",
    pullRequest: 40,
    pullRequestHead: prHead,
    pullRequestCiRun: prCiRun,
    focusedRegressionRun: focusedRun,
    releaseWorkflowRun: releaseRun,
  },
  assets: assets.map((asset) => ({
    name: asset.name,
    size: asset.size,
    digest: asset.digest,
    contentType: asset.contentType,
    url: asset.url,
  })),
};
fs.writeFileSync("release-evidence/v3.3.1.json", `${JSON.stringify(releaseEvidence, null, 2)}\n`);

const changelogPath = "CHANGELOG.md";
let changelog = fs.readFileSync(changelogPath, "utf8");
if (!changelog.includes("## [3.3.1] — 2026-07-23")) {
  const entry = `## [3.3.1] — 2026-07-23

### Исправлено

- установленный Windows Nexora Server больше не завершается при запуске с \`MODULE_NOT_FOUND: ../shared/pulse-catalog.cjs\`;
- обязательный каталог \`shared/**/*\` включён в Electron Server payload и \`app.asar\`;
- release config validation проверяет packaging manifest, наличие Pulse catalog и exports \`catalogItem\`/\`publicCatalog\`.

### Тесты и выпуск

- дефект сначала подтверждён падающим regression test, затем исправлен тем же контрактом;
- Windows check, unit/API/integration, performance, security, Linux, schema 8 soak, Android и focused 3.3 gates прошли;
- тег \`${tag}\` указывает на release commit \`${releaseCommit}\`;
- GitHub Release опубликован как явно маркированный \`UNSIGNED-TEST\` prerelease с Client, Server, Android, source, PWA, SPDX SBOM и SHA-256 checksums;
- \`latest.yml\` и \`.blockmap\` не опубликованы, поэтому production updater не принимает неподписанные сборки.

### Совместимость

- Local Server schema 8, API v3 и Trust/MLS API v4 сохранены;
- миграция базы, новые зависимости и изменение конфигурации не требуются.

`;
  changelog = changelog.replace("## [3.3.0] — 2026-07-23", `${entry}## [3.3.0] — 2026-07-23`);
}
if (!changelog.includes("[3.3.1]:")) {
  changelog = changelog.replace(
    "[3.2.1]:",
    `[3.3.1]: https://github.com/Onmaynec/Nexora/releases/tag/${tag}\n[3.2.1]:`,
  );
}
fs.writeFileSync(changelogPath, changelog, "utf8");

const readmePath = "README.md";
let readme = fs.readFileSync(readmePath, "utf8");
readme = readme.replace(
  "![Current version](https://img.shields.io/badge/current-3.3.1%20prerelease-c69cff)",
  "![Current version](https://img.shields.io/badge/current-3.3.1%20UNSIGNED--TEST-c69cff)",
);
readme = readme.replace(
  "[![License: MIT](LICENSE)](LICENSE)",
  "[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)",
);
readme = readme.replace(
  "| `3.3.1` | Исправление запуска Windows Server: shared Pulse runtime включён в installer и проверяется release gate | Signed release при наличии ключей или явно маркированный UNSIGNED-TEST prerelease |",
  "| `3.3.1` | Исправление запуска Windows Server: shared Pulse runtime включён в installer и проверяется release gate | Опубликованный UNSIGNED-TEST prerelease без updater metadata |",
);
readme = readme.replace(
  "`3.3.1` проходит build-, unit-, API-, integration-, performance-, security-, soak-, Android- и Windows artifact-gates. При отсутствии сертификатов Windows/Android binaries публикуются только как явно маркированные `UNSIGNED-TEST` assets и не подключаются к production updater.",
  "`3.3.1` прошёл build-, unit-, API-, integration-, performance-, security-, soak-, Android- и Windows artifact-gates. Windows Client/Server и Android опубликованы как явно маркированные `UNSIGNED-TEST` assets; `latest.yml` и `.blockmap` отсутствуют, поэтому production updater их не принимает.",
);
if (!readme.includes("## Документация")) {
  readme += `

Electron Client закрепляет fingerprint за Server ID. Для браузера/PWA и Android Local CA необходимо установить в доверенное хранилище операционной системы. TLS errors не должны обходиться.

Инструкции: [Deployment Guide](docs/DEPLOYMENT.md), [Administrator Guide](ADMIN_GUIDE.md) и [Operations Runbook](docs/OPERATIONS_RUNBOOK.md).

## Документация

Центральный каталог: **[Nexora Documentation](docs/README.md)**.

| Раздел | Документы |
|---|---|
| Продукт | [Product Overview](docs/PRODUCT_OVERVIEW.md), [Current Release Status](BRANCH_STATUS.md) |
| Архитектура | [Architecture](docs/ARCHITECTURE.md), [Project Index](PROJECT_INDEX.md) |
| Безопасность | [Security Policy](SECURITY.md), [Security Model](docs/SECURITY_MODEL.md), [Security Verification](SECURITY_AUDIT.md) |
| Развёртывание | [Deployment](docs/DEPLOYMENT.md), [Administrator Guide](ADMIN_GUIDE.md), [Operations Runbook](docs/OPERATIONS_RUNBOOK.md) |
| Тестирование | [Acceptance Test Guide](TESTER_GUIDE.md), [3.3.1 Verification](RELEASE_VERIFICATION_3.3.1.md) |
| Trust / MLS | [Trust Core 3.2.0 foundation](docs/TRUST_CORE_3.2.0.md), [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md) |
| Миграция | [Schema 8 Migration](docs/MIGRATION_3.2.0.md) |
| Plus / Pulse | [Pulse](docs/PULSE.md), [Pulse Cloud](docs/PULSE_CLOUD.md) |
| Выпуски | [Release Policy](docs/RELEASE_POLICY.md), [Release Checklist](docs/RELEASE_CHECKLIST.md), [Changelog](CHANGELOG.md) |
| Репозиторий | [Branch Index](BRANCHES.md), [Contributing](CONTRIBUTING.md), [Support](SUPPORT.md) |

## Поддержка и участие

- ошибки: [Bug report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml);
- предложения: [Feature request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml);
- установка и эксплуатация: [SUPPORT.md](SUPPORT.md);
- уязвимости: только приватно по инструкции в [SECURITY.md](SECURITY.md);
- правила участия: [CONTRIBUTING.md](CONTRIBUTING.md) и [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Лицензия

Код и документация распространяются по лицензии [MIT](LICENSE).
`;
}
fs.writeFileSync(readmePath, readme, "utf8");

const notesPath = "RELEASE_NOTES_3.3.1.md";
let notes = fs.readFileSync(notesPath, "utf8");
notes = notes.replace(
  /## Распространение[\s\S]*?## Известные ограничения/,
  `## Распространение

GitHub Release опубликован 2026-07-23 как **Nexora 3.3.1 — UNSIGNED TEST BUILDS**. В него входят Windows Client/Server, Android APK, source ZIP, PWA ZIP, SPDX SBOM и SHA-256 checksums. Windows и Android artifacts явно имеют суффикс \`UNSIGNED-TEST\`. \`latest.yml\` и \`.blockmap\` не опубликованы, поэтому production updater не принимает эти сборки.

Release: ${release.url}

## Известные ограничения`,
);
fs.writeFileSync(notesPath, notes, "utf8");

const verificationPath = "RELEASE_VERIFICATION_3.3.1.md";
let verification = fs.readFileSync(verificationPath, "utf8");
verification = verification.replace(
  /## Release candidate gates[\s\S]*?## Windows artifact gate/,
  `## Release candidate gates

- PR head: \`${prHead}\`;
- PR CI run \`${prCiRun}\`: success для \`release-gate\`, Linux tests, Android source build, schema 8 soak и Windows verify;
- Windows verify: \`npm run check\`, unit/API/integration tests, performance smoke и security audit — success;
- focused Nexora 3.3 regressions run \`${focusedRun}\`: success.

## Windows artifact gate`,
);
verification = verification.replace(
  /Фактический release run, tag commit и опубликованные assets будут добавлены в post-release verification update\./,
  `Release workflow run \`${releaseRun}\` завершился успешно. Тег \`${tag}\` указывает на \`${releaseCommit}\`. GitHub Release опубликован как \`UNSIGNED-TEST\` prerelease и прошёл встроенную проверку обязательных assets и запрета updater metadata.`,
);
if (!verification.includes("## Фактический опубликованный выпуск")) {
  verification += `

## Фактический опубликованный выпуск

- release commit/tag: \`${releaseCommit}\` / \`${tag}\`;
- GitHub Release: ${release.url};
- название: **${release.name}**;
- опубликован: \`${release.publishedAt}\`;
- distribution: \`UNSIGNED-TEST\` prerelease;
- production updater metadata: не опубликованы;
- verified assets: ${assetNames.map((name) => `\`${name}\``).join(", ")}.

Машиночитаемое свидетельство с SHA-256 digest, размером и URL каждого artifact сохранено в \`release-evidence/v3.3.1.json\`.
`;
}
fs.writeFileSync(verificationPath, verification, "utf8");

const status = `# Статус выпуска Nexora 3.3.1

## Классификация

| Параметр | Значение |
|---|---|
| Version | \`${version}\` |
| Source Pull Request | PR \`#40\`, merged |
| Release commit | \`${releaseCommit}\` |
| Release tag | \`${tag}\` → release commit |
| GitHub Release | \`${release.name}\` |
| Release URL | \`${release.url}\` |
| Distribution | verified \`UNSIGNED-TEST\` prerelease |
| Production updater metadata | not published |
| Local Server schema | \`8\` |
| Application API | \`v3\` |
| Trust/MLS API | \`v4\` |
| Database migration | not required |
| Independent security audit | not performed |

Nexora \`${version}\` опубликован. Source tag неизменяемо указывает на исправленный runtime commit. Windows Client/Server, Android, PWA, source, SPDX SBOM и checksum assets собраны и проверены GitHub Actions.

## Исправленный блокер

Windows Server installer 3.3.0 не включал \`shared/pulse-catalog.cjs\`, хотя \`server/pulse-sandbox-service.cjs\` импортировал его через \`../shared/pulse-catalog.cjs\`. В 3.3.1 каталог \`shared/**/*\` включён в Electron Server payload. Release gate дополнительно проверяет packaging manifest, существование Pulse catalog и его обязательные exports.

## Verification

- test-first failure commit: \`cbb112df2885c1eab0b85c9e08efece6aec39e2a\`;
- final PR head: \`${prHead}\`;
- PR CI: \`${prCiRun}\`, success;
- focused 3.3 regressions: \`${focusedRun}\`, success;
- release workflow: \`${releaseRun}\`, success;
- release asset validation: success;
- updater distribution boundary: success.

## Published assets

${assets.map((asset) => `- \`${asset.name}\` — ${asset.size} bytes, \`${asset.digest}\`;`).join("\n")}

## Security and compatibility

- authorization, room roles, bans, upload policy, Pulse pricing/ledger and Trust Core were not changed;
- no new dependencies, secrets or network permissions were added;
- schema 8, API v3 and Trust/MLS API v4 remain compatible;
- no migration or rollback is required.

## Real limitations

- Windows Client/Server and Android are unsigned test artifacts; Windows SmartScreen may warn;
- production updater cannot consume this release because \`latest.yml\` and \`.blockmap\` are intentionally absent;
- independent cryptographic/application-security audit was not performed;
- voice/video calls and screen sharing are outside 3.3.1.
`;
fs.writeFileSync("BRANCH_STATUS.md", status, "utf8");

for (const temporaryPath of [
  "release-evidence/diagnostic-v3.3.1.json",
  "release-evidence/finalizer-v3.3.1.json",
]) {
  if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
}

console.log(`Nexora ${version} release documentation finalized from verified GitHub Release evidence.`);
