# Release Verification — Nexora 3.3.0

Дата финализации: 2026-07-23
Pull Request: `#38`
Merge commit: `a46c080e12b9081b448dad6426bf7c44156114cd`
Tag: `v3.3.0`
Release: `https://github.com/Onmaynec/Nexora/releases/tag/v3.3.0`

## Итоговый статус

Nexora `3.3.0` опубликована как проверенный `UNSIGNED-TEST` prerelease. Tag `v3.3.0` неизменно указывает на merge commit. Release не является draft, содержит полный обязательный набор assets и не публикует production updater metadata.

| Параметр | Значение |
|---|---|
| Release name | `Nexora 3.3.0 — UNSIGNED TEST BUILDS` |
| Draft | `false` |
| Prerelease | `true` |
| Distribution | `unsigned-test` |
| `latest.yml` / `.blockmap` | отсутствуют |
| Immutable asset evidence | `release-evidence/v3.3.0.json` |
| Recovery run | `29968722912` — PASS |

## Проверенные первопричины и исправления

### 1. Чаты и комнаты не открывались

Подтверждённая цепочка:

1. Client вызывал `welcome/claim` перед MLS group sync;
2. при отсутствии Welcome запускался polling;
3. повторная инициализация выполнялась после неготового state;
4. сервер считал conversations одного устройства в общем recovery bucket;
5. bucket достигал лимита и возвращал `429 RATE_LIMITED`;
6. bootstrap истории завершался ошибкой.

Исправлено:

- server bucket изолирован по `user + device + conversation`;
- параллельные Client recovery requests объединяются;
- claim/request имеют отдельные минимальные интервалы;
- Client соблюдает `Retry-After` и conversation-scoped backoff;
- фоновые циклы не создают общий request storm;
- plaintext fallback не добавлен.

### 2. Sandbox Импульсы нельзя было потратить

До исправления Sandbox предоставлял balance/Plus state, но receipts и room goals уходили в production Cloud routes. Это создавало `409` для receipts и `503` для goals без cache. Собственного catalog/purchase path не было.

Исправлено:

- добавлен authoritative shared catalog;
- реализованы Local Sandbox catalog, purchases, goals, contributions, refunds, receipts и entitlements;
- реализованы Cloud catalog и purchases;
- списание и выдача entitlement выполняются атомарно и идемпотентно;
- отрицательный баланс и повторное списание запрещены;
- room operations проверяют существование комнаты, membership, active ban и owner role на Local Server.

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

- общий доступный in-app `ConfirmDialog`;
- server action вызывается только после подтверждения;
- Escape, focus restoration, busy state и backdrop dismissal обработаны;
- lock element удалён из DOM и layout.

### 5. На сайте отсутствовали installers

Причина: прежний release path не публиковал `.exe` при отсутствии Authenticode secrets.

Безопасное исправление:

- signed production path сохранён;
- без сертификата Client/Server `.exe` и Android `.apk` публикуются только с суффиксом `UNSIGNED-TEST`;
- unsigned prerelease не содержит `latest.yml` и `.blockmap` и не может быть принят production updater;
- сайт разрешает реальные GitHub Release assets и показывает distribution classification;
- Source ZIP, PWA ZIP, SPDX SBOM и SHA-256 manifest публикуются вместе с installers.

### 6. Первичная публикация 3.3.0 завершилась ошибкой

Исходный run `29967729776` прошёл release gate, но упал в объединённом шаге `Build source, PWA, SBOM and Android test artifact`. Один шаг выполнял четыре независимые операции, а версия Gradle в release job не была закреплена. Поэтому failure boundary был слишком широким и отличался от успешно проверенного CI Android toolchain.

Исправление pipeline:

- Gradle закреплён на `8.13`, как в CI;
- source archive, PWA archive, SPDX SBOM и Android APK разделены на отдельные steps;
- каждый artifact проверяется на существование, ненулевой размер и формат;
- добавлен production-safe SPDX fallback generator `scripts/generate-spdx-sbom.cjs`;
- fallback покрыт `test/spdx-sbom.test.cjs`;
- recovery run `29968722912` прошёл полностью и опубликовал release;
- одноразовые recovery/observer workflows после завершения удалены.

Точный упавший подкомандный вызов первоначального монолитного шага не был отдельно размечен самим workflow. Подтверждённая первопричина уровня pipeline — непинованный Android toolchain и отсутствие изоляции независимых artifact operations. После изоляции и pinning все операции прошли.

## Автоматические проверки

### PR head

PR head `7d83bce963d5a774f9c107a5cf8d3a05130c1d44`:

| Gate | Результат | Evidence |
|---|---:|---|
| `npm run check` | PASS | CI `29967109170`, job `verify` |
| `npm run test:unit` | PASS | CI `29967109170`, job `verify` |
| `npm run test:performance` | PASS | CI `29967109170`, job `verify` |
| `npm run audit:security` | PASS | CI `29967109170`, job `verify` |
| `npm run release:check` | PASS | CI `29967109170`, job `release-gate` |
| Linux `npm test` | PASS | CI `29967109170`, job `linux-tests` |
| schema 8 soak | PASS | CI `29967109170`, job `schema8-soak` |
| Android `assembleDebug` | PASS | CI `29967109170`, job `android-source` |
| focused Nexora 3.3 regressions | PASS | run `29967109182` |
| Project website | PASS | run `29967109165` |

### Merge commit

Merge commit `a46c080e12b9081b448dad6426bf7c44156114cd`:

- CI `29967637087` — PASS;
- Project website `29967637097` — PASS;
- immutable tag `v3.3.0` создан на этом commit.

### Publication

Recovery publication run `29968722912`:

- source/tag validation — PASS;
- `npm ci` — PASS;
- `npm run release:check` — PASS;
- `npm run release:tag-check` — PASS;
- source archive — PASS;
- PWA archive — PASS;
- SPDX SBOM — PASS;
- Android debug APK — PASS;
- unsigned Windows Client build — PASS;
- unsigned Windows Server build — PASS;
- checksum manifest — PASS;
- GitHub prerelease creation — PASS;
- required asset verification — PASS;
- updater metadata prohibition — PASS.

## Добавленные тесты

- `test/pulse-sandbox-service.test.cjs`;
- `test/pulse-catalog-3.3.test.cjs`;
- `test/release-3.3.0-regressions.test.cjs`;
- `test/spdx-sbom.test.cjs`;
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
- unsigned updater metadata prohibition;
- SPDX fallback validity и исключение dev-only packages.

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

## Published assets

| Asset | Size | GitHub digest |
|---|---:|---|
| `Nexora-Client-Setup-3.3.0-UNSIGNED-TEST.exe` | 105,353,047 bytes | `sha256:c5e79b5f04ee2dc912a0adcae1457d837f428151a8e20189fbe76f495745e243` |
| `Nexora-Server-Setup-3.3.0-UNSIGNED-TEST.exe` | 106,523,620 bytes | `sha256:1fc91dbd631818bec5f673a1b2f9b068e84bf9b8f3626d6f399214d39909ca83` |
| `Nexora-Android-3.3.0-UNSIGNED-TEST.apk` | 848,686 bytes | `sha256:2cd4f1fb52dd59843131ebebe6806308b0ec2d8818ece8b54dbbe354beaa29b9` |
| `Nexora-PWA-3.3.0.zip` | 1,258,671 bytes | `sha256:78cff1a71ee1c54fab30b36ff721f830c9800deb1492ee3d8cb905aa1b330145` |
| `Nexora-3.3.0-source.zip` | 1,783,226 bytes | `sha256:2ce56e992afcde4c1c110d23f8ea140ea66827d04255a630859251505977a24b` |
| `Nexora-3.3.0.spdx.json` | 134,466 bytes | `sha256:b3cca2def42b2453f9d02da7ec7b9dd4b14462e78d030566cf0a3da6fd37b4f3` |
| `SHA256SUMS.txt` | 597 bytes | `sha256:553fe901b5ab2f5179da80a16c9b72aa97b48cf6a735b9f22aa500f1fe5d21f3` |

Authoritative machine-readable evidence: `release-evidence/v3.3.0.json`.

## Ручная приёмка

Рекомендуемые smoke scenarios для опубликованных installers:

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
12. подтвердить отсутствие `latest.yml` и `.blockmap`.

## Реальные ограничения

- текущие Windows и Android binaries не подписаны Authenticode/release keystore и предназначены для контролируемого тестирования;
- unsigned Client не получает production auto-update metadata;
- Android test APK не заменяет physical-device matrix;
- независимый cryptographic/application-security audit не выполнялся;
- traffic-analysis resistance не заявляется;
- voice/video calls и screen sharing не входят в 3.3.0.
