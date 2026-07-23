# Nexora 3.3.1

Дата выпуска: 2026-07-23

Nexora `3.3.1` — исправляющий релиз для блокирующего сбоя запуска установленного **Nexora Server 3.3.0**.

## Исправленная ошибка

После установки Server main process мог завершиться до открытия интерфейса с ошибкой:

```text
Error: Cannot find module '../shared/pulse-catalog.cjs'
Require stack:
- server/pulse-sandbox-service.cjs
- server/pulse-v3-routes.cjs
- server/create-server-v3.1.cjs
- electron/server-main.cjs
```

Ошибка воспроизводилась только в упакованном Windows Server. В исходном дереве модуль `shared/pulse-catalog.cjs` присутствовал, поэтому запуск через Node и часть unit/integration tests проходили.

## Первопричина

`server/pulse-sandbox-service.cjs` использует относительный runtime-import `../shared/pulse-catalog.cjs`, но `electron-builder.server.yml` включал `electron/**/*`, `server/**/*`, Web build и `package.json` без каталога `shared/**/*`.

Electron Builder корректно создавал installer и `app.asar`, однако обязательный Pulse catalog не попадал в пакет. При загрузке server routes Node.js завершал main process с `MODULE_NOT_FOUND`.

## Исправление

- в Windows Server payload добавлен `shared/**/*`;
- release config validation теперь отдельно проверяет наличие Server runtime payload и контракт экспортов Pulse catalog;
- добавлен регрессионный тест, связывающий import из `server/pulse-sandbox-service.cjs` с обязательным inclusion pattern в `electron-builder.server.yml`;
- версия Client, Server, Android metadata, package и lockfile синхронизирована как `3.3.1`.

## Проверка

Исправление считается готовым только после прохождения:

- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:check`;
- Linux `npm test`;
- schema 8 soak;
- Android source build;
- Windows Electron Server packaging в release workflow.

Регрессионный тест сначала был добавлен без исправления и подтвердил дефект: CI job `linux-tests` завершился ошибкой на `npm test`. После включения `shared/**/*` тот же контракт должен проходить.

## Совместимость

- Local Server schema: `8`;
- Application API: `v3`;
- Trust/MLS API: `v4`;
- Cloud schema: без изменений;
- миграция базы не требуется;
- конфигурация существующих серверов сохраняется;
- обновление поддерживается с `3.3.0` и предыдущих поддерживаемых версий линии `3.2.x`.

## Безопасность

Релиз не меняет роли, авторизацию, room permissions, Pulse pricing, ledger, Trust Core или cryptographic profile. Добавляется только отсутствовавший read-only catalog module, уже являющийся частью исходного кода 3.3.0. Новые зависимости, секреты и сетевые разрешения не добавлены.

## Распространение

GitHub Release опубликован 2026-07-23 как **Nexora 3.3.1 — UNSIGNED TEST BUILDS**. В него входят Windows Client/Server, Android APK, source ZIP, PWA ZIP, SPDX SBOM и SHA-256 checksums. Windows и Android artifacts явно имеют суффикс `UNSIGNED-TEST`. `latest.yml` и `.blockmap` не опубликованы, поэтому production updater не принимает эти сборки.

Release: https://github.com/Onmaynec/Nexora/releases/tag/v3.3.1

## Известные ограничения

- `UNSIGNED-TEST` installer может показывать предупреждение Windows SmartScreen;
- Android APK без release keystore остаётся test build;
- независимый cryptographic/application-security аудит не заявляется;
- voice/video calls и screen sharing не входят в релиз `3.3.1`.
