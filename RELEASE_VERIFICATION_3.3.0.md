# Release Verification — Nexora 3.3.0

Дата подготовки: 2026-07-23  
Pull Request: `#38`  
Рабочая ветка: `agent/nexora-3.3.0-full-release`

## Статус

Runtime release candidate проверен на commit `32743436bbce99dc9632d28eeb44367d8554fbb7`.

- CI run: `29966678997` — **PASS**;
- focused Nexora 3.3 regressions run: `29966678998` — **PASS**;
- Project website run: `29966678986` — **PASS**.

Этот документ добавляет только release evidence. Финальная публикация считается завершённой только после merge, успешного CI на merge commit, создания immutable tag `v3.3.0` и проверки GitHub Release assets.

## Проверенные первопричины и исправления

### 1. Чаты не открывались

Подтверждённая цепочка:

1. Client вызывал `welcome/claim` перед MLS group sync;
2. при отсутствии Welcome запускался polling;
3. повторная инициализация выполнялась после неготового state;
4. сервер считал conversations одного устройства в общем recovery bucket;
5. bucket достигал лимита и возвращал `429 RATE_LIMITED`;
6. bootstrap истории завершался ошибкой.

Исправлено:

- rate-limit bucket изолирован по `user + device + conversation`;
- параллельные Client requests объединяются;
- claim/request имеют отдельные минимальные интервалы;
- Client соблюдает `Retry-After`;
- plaintext fallback не добавлен.

### 2. Sandbox Импульсы нельзя было потратить

До исправления Sandbox предоставлял balance/Plus state, но receipts и room goals уходили в production Cloud routes. Это создавало `409` для receipts и `503` для goals без cache. Собственного catalog/purchase path не было.

Исправлено:

- добавлен authoritative shared catalog;
- реализованы Local Sandbox catalog, purchases, goals, contributions, refunds и receipts;
- реализованы Cloud catalog и purchases;
- списание и выдача entitlement выполняются атомарно и идемпотентно;
- room operations проверяют membership, ban и owner role на Local Server.

### 3. Voice waveform выглядел плоским

Причина: среднее абсолютное значение умножалось на постоянный коэффициент без нормализации диапазона конкретной записи. Тихие записи сводились к одинаковому минимуму.

Исправлено:

- RMS + peak sampling;
- percentile normalization;
- локальное сглаживание;
- разные высоты столбцов;
- played segment меняет цвет и анимируется;
- сохранены seek, duration и playback rate.

### 4. Системный delete dialog и инертный lock control

- regular и secure delete использовали системный `window.confirm`;
- composer lock не был интерактивным элементом, но выглядел как кнопка.

Исправлено:

- общий in-app `ConfirmDialog`;
- серверное удаление вызывается только после подтверждения;
- lock element удалён из DOM и layout.

### 5. Download cards не имели installers

Причина: старый workflow не публиковал `.exe` без Authenticode secrets.

Безопасное исправление:

- signed production path сохранён;
- при отсутствии сертификата публикуются Client/Server `.exe` и Android `.apk` только с суффиксом `UNSIGNED-TEST`;
- unsigned prerelease не содержит `latest.yml` и `.blockmap` и не может быть принят production updater;
- release publication сериализована и не запускается повторно от созданного tag;
- сайт обнаруживает реальные GitHub Release assets и показывает signature classification.

## Автоматические suites

| Gate | Результат | Evidence |
|---|---:|---|
| `npm run check` | PASS | CI `29966678997`, job `verify` |
| `npm run test:unit` | PASS | CI `29966678997`, job `verify` |
| `npm run test:performance` | PASS | CI `29966678997`, job `verify` |
| `npm run audit:security` | PASS | CI `29966678997`, job `verify` |
| `npm run release:check` | PASS | CI `29966678997`, job `release-gate` |
| Linux `npm test` | PASS | CI `29966678997`, job `linux-tests` |
| schema 8 soak | PASS | CI `29966678997`, job `schema8-soak` |
| Android `assembleDebug` | PASS | CI `29966678997`, job `android-source` |
| Nexora 3.3 focused regressions | PASS | run `29966678998` |
| website validation/deployment gate | PASS | run `29966678986` |
| Windows artifact build | после merge/tag | signed либо explicit `UNSIGNED-TEST` path |
| release asset verification | после merge/tag | required names, checksums и updater boundary |

CI jobs `verify`, `release-gate`, `linux-tests`, `schema8-soak` и `android-source` завершились с conclusion `success` на одном runtime candidate SHA.

## Добавленные регрессионные тесты

- `test/pulse-sandbox-service.test.cjs`;
- `test/pulse-catalog-3.3.test.cjs`;
- `test/release-3.3.0-regressions.test.cjs`;
- обновлённый `test/build-config.test.cjs`;
- обновлённый `website/validate.mjs`;
- focused workflow `.github/workflows/nexora-3.3-regressions.yml`.

Проверяются:

- catalog product availability;
- atomic debit and entitlement;
- duplicate idempotency key;
- insufficient-balance rollback;
- owner-only room purchase;
- goal funding и cancellation refund;
- Sandbox receipts/goals без Cloud;
- conversation-scoped MLS recovery;
- отсутствие system delete confirm;
- отсутствие inert secure composer lock;
- normalized waveform contract;
- raw Stripe webhook body;
- website version, controls, typography и asset detection;
- prohibition of updater metadata in unsigned distribution.

## Schema и migration

### Local Server

- schema остаётся `8`;
- существующие SQLite collections для local Pulse state используются совместимо;
- ручная миграция не требуется.

### Pulse Cloud

Добавлена идемпотентная additive migration `cloud/schema-3.3.sql`:

- таблица `impulse_purchases`;
- unique `idempotency_key`;
- foreign keys к account, product, ledger transaction и entitlement;
- account/scope indexes;
- `CREATE TABLE/INDEX IF NOT EXISTS`, без удаления существующих данных.

## API

Добавлено:

- `GET /api/v3/pulse/catalog`;
- `POST /api/v3/pulse/purchases`;
- signed Cloud `GET /v1/servers/:serverId/users/:userId/catalog`;
- signed Cloud `POST /v1/servers/:serverId/users/:userId/purchases`.

Совместимо исправлено:

- `GET /api/v3/pulse/receipts` в Sandbox;
- room goals/create/contribute/cancel в Sandbox;
- Trust Welcome rate-limit scope.

## Ручная приёмка

Рекомендуемые release smoke scenarios после установки artifacts:

1. открыть старый DM, новый DM, старую и новую комнату на одном verified device;
2. переключаться между чатами и проверить отсутствие recovery storm/429;
3. отправить text, image, file и voice;
4. проверить waveform на тихой и громкой записи, seek и played color;
5. удалить regular и secure сообщение через in-app dialog;
6. проверить отсутствие lock icon;
7. выдать Sandbox Импульсы и купить user/room products;
8. создать room goal, внести вклад и проверить funding/refund;
9. проверить insufficient balance и повторный idempotency key;
10. проверить сайт на desktop/mobile, RU/EN, GitHub controls и downloads;
11. проверить signature labels и имена GitHub Release assets;
12. при unsigned release подтвердить отсутствие `latest.yml` и `.blockmap`.

## Реальные ограничения

- без Authenticode и Android release keystore binaries остаются `UNSIGNED-TEST`;
- test APK не заменяет physical-device matrix;
- независимый cryptographic/application-security audit не выполнялся;
- traffic-analysis resistance не заявляется;
- voice/video calls и screen sharing не входят в 3.3.0.

## Финальная фиксация после публикации

В PR/release evidence должны быть зафиксированы:

- merge commit SHA;
- tag SHA;
- release classification и URL;
- опубликованные asset names;
- SHA-256 manifest;
- live Pages marker;
- итоговые conclusions CI на merge commit.
