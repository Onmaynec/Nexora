# Статус выпуска Nexora 3.3.1

## Классификация

| Параметр | Значение |
|---|---|
| Version | `3.3.1` |
| Source Pull Request | PR `#40`, merged |
| Release commit | `a7d5a7f020051bb837b67df437de90b2cd96958a` |
| Release tag | `v3.3.1` → release commit |
| GitHub Release | `Nexora 3.3.1 — UNSIGNED TEST BUILDS` |
| Release URL | `https://github.com/Onmaynec/Nexora/releases/tag/v3.3.1` |
| Distribution | verified `UNSIGNED-TEST` prerelease |
| Production updater metadata | not published |
| Local Server schema | `8` |
| Application API | `v3` |
| Trust/MLS API | `v4` |
| Database migration | not required |
| Independent security audit | not performed |

Nexora `3.3.1` опубликован. Source tag неизменяемо указывает на исправленный runtime commit. Windows Client/Server, Android, PWA, source, SPDX SBOM и checksum assets собраны и проверены GitHub Actions.

## Исправленный блокер

Windows Server installer 3.3.0 не включал `shared/pulse-catalog.cjs`, хотя `server/pulse-sandbox-service.cjs` импортировал его через `../shared/pulse-catalog.cjs`. В 3.3.1 каталог `shared/**/*` включён в Electron Server payload. Release gate дополнительно проверяет packaging manifest, существование Pulse catalog и его обязательные exports.

## Verification

- test-first failure commit: `cbb112df2885c1eab0b85c9e08efece6aec39e2a`;
- final PR head: `3161ea6e97e6e58f34e341f1b70d763c8550a9a3`;
- PR CI: `29998152125`, success;
- focused 3.3 regressions: `29998152148`, success;
- release workflow: `29998460934`, success;
- release asset validation: success;
- updater distribution boundary: success.

## Published assets

- `Nexora-3.3.1-source.zip` — 1817325 bytes, `sha256:3485b2a52f271f21b9c8a7675ab88c87542d1c7b1baeeed4eff6f2142f4cb210`;
- `Nexora-3.3.1.spdx.json` — 134461 bytes, `sha256:9ef90e7ccbd0b8ae73344d587a605492e0c493712ad728b67cf62849f30d3a83`;
- `Nexora-Android-3.3.1-UNSIGNED-TEST.apk` — 848686 bytes, `sha256:76b9fd61e9489402728f2eb44de048587a42e553f00368dddbc6eb147a273c14`;
- `Nexora-Client-Setup-3.3.1-UNSIGNED-TEST.exe` — 105353064 bytes, `sha256:a6536d6953ff7cc2a12fb24eb9d13736112d44df205126d5d2aa61f7cfa20baf`;
- `Nexora-PWA-3.3.1.zip` — 1258672 bytes, `sha256:59c0c47daf6b00a1fb42f115a92cc38f6551fb055c9feded401c078dd28e4b6a`;
- `Nexora-Server-Setup-3.3.1-UNSIGNED-TEST.exe` — 106523884 bytes, `sha256:6a81c80b589487c896e9605bfa5b356ed66a604435b50732b97438d6ef2dfd78`;
- `SHA256SUMS.txt` — 597 bytes, `sha256:ce7ef65a55d9ceb1b5e0868722ce12507359d6313fc75980b274f455da0b1fb6`;

## Security and compatibility

- authorization, room roles, bans, upload policy, Pulse pricing/ledger and Trust Core were not changed;
- no new dependencies, secrets or network permissions were added;
- schema 8, API v3 and Trust/MLS API v4 remain compatible;
- no migration or rollback is required.

## Real limitations

- Windows Client/Server and Android are unsigned test artifacts; Windows SmartScreen may warn;
- production updater cannot consume this release because `latest.yml` and `.blockmap` are intentionally absent;
- independent cryptographic/application-security audit was not performed;
- voice/video calls and screen sharing are outside 3.3.1.
