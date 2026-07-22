# Release Verification — Nexora 3.3.0

Дата подготовки: 2026-07-23  
Pull Request: `#38`  
Рабочая ветка: `agent/nexora-3.3.0-full-release`

## Статус

Документ сопровождает release candidate и обновляется по результатам current-head CI, merge и GitHub Release. До заполнения финального SHA/tag/assets версия не считается опубликованной.

## Проверяемые первопричины

### 1. Чаты не открывались

Подтверждённая цепочка:

1. Client вызывал `welcome/claim` перед каждым полным MLS group sync;
2. при отсутствии Welcome запускался polling;
3. повторная инициализация выполнялась после неготового state;
4. сервер считал все conversations одного устройства в одном recovery bucket;
5. bucket достигал лимита и возвращал `429 RATE_LIMITED`;
6. bootstrap истории завершался ошибкой.

Исправление:

- conversation-scoped bucket;
- Client request coalescing;
- claim/request intervals;
- `Retry-After` backoff;
- отсутствие plaintext fallback.

### 2. Sandbox Импульсы нельзя было потратить

Подтверждённая цепочка:

1. Sandbox предоставлял balance/Plus state;
2. Client пытался загрузить receipts и goals через production Cloud routes;
3. receipts возвращал `409`, goals без cache возвращал `503`;
4. собственного catalog/purchase path не существовало.

Исправление:

- authoritative shared catalog;
- Local Sandbox catalog/purchases/goals/refunds;
- Cloud catalog/purchases;
- atomic ledger + entitlement;
- server-side room owner/membership/ban checks.

### 3. Voice waveform выглядел плоским

Подтверждённая причина: среднее абсолютное значение умножалось на постоянный коэффициент без нормализации диапазона записи. Тихие записи сводились к одинаковому минимуму.

Исправление:

- RMS + peak;
- percentile normalization;
- local smoothing;
- visible played state и playback animation.

### 4. Windows dialog и неработающий lock control

- secure delete использовал `window.confirm`;
- regular delete также использовал `window.confirm`;
- composer lock был не button, но визуально выглядел интерактивным.

Исправление:

- общий accessible `ConfirmDialog`;
- server action вызывается только после confirm;
- lock element удалён из DOM/layout.

### 5. Download cards не имели installers

Причина: release workflow намеренно не публиковал `.exe` при отсутствии Authenticode secrets.

Исправление без ослабления updater:

- signed path сохранён;
- unsigned fallback публикует Client/Server/Android как `UNSIGNED-TEST` prerelease;
- `latest.yml`/blockmap отсутствуют в unsigned path;
- website обнаруживает и маркирует реальные assets.

## Автоматические suites

| Gate | Назначение | Результат |
|---|---|---|
| `npm run check` | syntax, Electron config, production web build | ожидается current-head CI |
| `npm run test:unit` | unit, API, integration, security regression suites | ожидается current-head CI |
| `npm run test:performance` | isolated throughput smoke | ожидается current-head CI |
| `npm run audit:security` | security invariants и dependency review | ожидается current-head CI |
| `npm run release:check` | synchronized metadata + complete release gate | ожидается current-head CI |
| Linux `npm test` | cross-platform web/unit/performance | ожидается current-head CI |
| schema 8 soak | storage, backup, integrity, cleanup | ожидается current-head CI |
| Android `assembleDebug` | source build | ожидается current-head CI |
| `Nexora 3.3 regressions` | focused Pulse/Trust/UI/site tests | выполняется |
| website validation | sections, live data, downloads, accessibility | выполняется |
| Windows artifact build | signed или explicit unsigned installers | после merge/tag |
| release asset verification | required names, checksums, updater boundary | после merge/tag |

## Добавленные регрессионные тесты

- `test/pulse-sandbox-service.test.cjs`;
- `test/pulse-catalog-3.3.test.cjs`;
- `test/release-3.3.0-regressions.test.cjs`;
- `website/validate.mjs` обновлён для 3.3 layout;
- dedicated workflow `.github/workflows/nexora-3.3-regressions.yml`.

Проверяется:

- catalog product availability;
- atomic debit and entitlement;
- duplicate idempotency key;
- insufficient balance rollback;
- owner-only room purchase;
- goal funding and cancellation refund;
- Sandbox receipts/goals without Cloud;
- scoped MLS recovery;
- no system delete confirm;
- no inert secure composer lock;
- normalized waveform contract;
- raw Stripe webhook body;
- website version, controls, typography and asset detection;
- unsigned updater metadata prohibition.

## Schema и migration

### Local Server

- schema остаётся `8`;
- существующие arrays/SQLite tables для local Pulse state используются совместимо;
- ручная миграция не требуется.

### Pulse Cloud

Добавлена `cloud/schema-3.3.sql`:

- `impulse_purchases`;
- unique `idempotency_key`;
- foreign keys к account, product, ledger transaction и entitlement;
- account/scope indexes.

Migration выполняется через `CREATE TABLE/INDEX IF NOT EXISTS`, не удаляет существующие данные и может быть безопасно повторена.

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

## Ручные сценарии перед release

1. Открыть старый DM, новый DM, старую комнату и новую комнату на одном verified device.
2. Переключаться между чатами и убедиться в отсутствии recovery storm/429.
3. Отправить text, image, file и voice.
4. Проверить waveform на тихой и громкой записи, seek и played color.
5. Удалить обычное и secure сообщение через in-app dialog.
6. Убедиться, что lock icon отсутствует.
7. Включить Sandbox, выдать Импульсы, купить user item.
8. Создать room goal, внести вклад вторым member, достигнуть цели.
9. Отменить активную цель и проверить возврат.
10. Проверить insufficient balance и повторный idempotency key.
11. Проверить сайт на desktop/mobile, RU/EN, GitHub button и downloads.
12. Проверить названия/signature labels GitHub Release assets.
13. При unsigned release убедиться, что `latest.yml` и `.blockmap` отсутствуют.

## Финальная фиксация

После прохождения gates сюда должны быть внесены:

- final branch head SHA;
- current-head CI run ID и conclusions;
- merge commit SHA;
- tag SHA;
- release URL/classification;
- опубликованные asset names;
- live Pages build marker/verification;
- реальные оставшиеся ограничения.
