# Проверка выпуска Nexora 3.3.1

Дата: 2026-07-23

## Область выпуска

`3.3.1` исправляет один блокирующий дефект Windows Nexora Server: установленное приложение завершалось в Electron main process, потому что Server installer не содержал обязательный модуль `shared/pulse-catalog.cjs`.

## Воспроизведение до исправления

Сначала в commit `cbb112df2885c1eab0b85c9e08efece6aec39e2a` добавлен регрессионный тест без изменения packaging manifest.

Тест проверяет всю цепочку условия дефекта:

1. `server/pulse-sandbox-service.cjs` выполняет `require("../shared/pulse-catalog.cjs")`;
2. `shared/pulse-catalog.cjs` существует в source tree;
3. `electron-builder.server.yml` обязан включать `shared/**/*`.

CI run `29997280893` подтвердил дефект: job `linux-tests` (`89173845553`) завершился ошибкой на `npm test`, потому что packaging manifest не удовлетворял новому runtime-контракту. Focused regressions run `29997280919` сохранил зелёное состояние незатронутых контрактов.

## Первопричина

`electron-builder.server.yml` включал Server Electron shell, `server/**/*`, Web build и `package.json`, но не каталог `shared/**/*`. Исходный Pulse catalog поэтому был доступен при запуске из checkout, но отсутствовал внутри установленного `app.asar`. Загрузка `server/pulse-sandbox-service.cjs` приводила к `MODULE_NOT_FOUND` до запуска Server UI.

## Реализованное исправление

- `electron-builder.server.yml`: в Server payload добавлен `shared/**/*`;
- `scripts/check-electron-builder-config.cjs`: release gate читает source manifest, проверяет inclusion pattern, существование Pulse catalog и обязательные exports `catalogItem`/`publicCatalog`;
- `test/build-config.test.cjs`: добавлен постоянный regression contract;
- release metadata синхронизирована как `3.3.1` для package, lockfile, Client и Android;
- добавлены release notes и changelog documentation.

## Схема, API и миграции

- Local Server schema: `8`, без изменений;
- Cloud schema: без изменений;
- Application API: `v3`, без изменений;
- Trust/MLS API: `v4`, без изменений;
- миграции и rollback не требуются.

## Безопасность

Исправление не меняет авторизацию, роли комнат, бан-листы, upload validation, Pulse pricing/ledger, entitlement trust boundary, Trust Core или MLS profile. В пакет добавляется только уже существующий read-only shared catalog module. Новые зависимости, secrets, network permissions и executable payload не добавлены.

## Release candidate gates

- PR head: `3161ea6e97e6e58f34e341f1b70d763c8550a9a3`;
- PR CI run `29998152125`: success для `release-gate`, Linux tests, Android source build, schema 8 soak и Windows verify;
- Windows verify: `npm run check`, unit/API/integration tests, performance smoke и security audit — success;
- focused Nexora 3.3 regressions run `29998152148`: success.

## Windows artifact gate

После merge release workflow обязан:

1. создать тег `v3.3.1` только для проверенного release commit;
2. собрать Windows Client и Windows Server;
3. включить `shared/pulse-catalog.cjs` в Server `app.asar` через `shared/**/*`;
4. опубликовать signed artifacts при наличии Authenticode secrets либо явно маркированные `UNSIGNED-TEST` artifacts без updater metadata;
5. создать SPDX SBOM и `SHA256SUMS.txt`.

Release workflow run `29998460934` завершился успешно. Тег `v3.3.1` указывает на `a7d5a7f020051bb837b67df437de90b2cd96958a`. GitHub Release опубликован как `UNSIGNED-TEST` prerelease и прошёл встроенную проверку обязательных assets и запрета updater metadata.

## Реальные ограничения

- до завершения Windows release workflow packaged installer считается release candidate, а не опубликованным выпуском;
- неподписанный installer может показывать предупреждение SmartScreen;
- независимый cryptographic/application-security audit не выполнен;
- voice/video calls и screen sharing не входят в `3.3.1`.


## Фактический опубликованный выпуск

- release commit/tag: `a7d5a7f020051bb837b67df437de90b2cd96958a` / `v3.3.1`;
- GitHub Release: https://github.com/Onmaynec/Nexora/releases/tag/v3.3.1;
- название: **Nexora 3.3.1 — UNSIGNED TEST BUILDS**;
- опубликован: `2026-07-23T10:19:09Z`;
- distribution: `UNSIGNED-TEST` prerelease;
- production updater metadata: не опубликованы;
- verified assets: `Nexora-3.3.1-source.zip`, `Nexora-3.3.1.spdx.json`, `Nexora-Android-3.3.1-UNSIGNED-TEST.apk`, `Nexora-Client-Setup-3.3.1-UNSIGNED-TEST.exe`, `Nexora-PWA-3.3.1.zip`, `Nexora-Server-Setup-3.3.1-UNSIGNED-TEST.exe`, `SHA256SUMS.txt`.

Машиночитаемое свидетельство с SHA-256 digest, размером и URL каждого artifact сохранено в `release-evidence/v3.3.1.json`.
