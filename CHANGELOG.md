# Changelog

Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.

## [3.3.2] — 2026-07-23

### Исправлено

- version metadata, current documentation и release evidence приведены к одному источнику истины;
- current-ссылки на устаревшую Release Verification 3.2.4 заменены актуальными;
- Architecture, Security Model, Android README, Project Index, Security/Support policies, Admin/Tester/Deployment/Operations guides, Product Overview, Release Policy/Checklist, branch index, issue template и публичный сайт больше не содержат противоречивых current claims;
- current feature baselines, ранее ошибочно обозначенные как текущая версия 3.2.4, нормализованы как линия 3.3.0+ при сохранении исторических release-specific документов.

### CI и выпуск

- добавлен release consistency gate для package, lockfile, Android metadata, Client handshake, 24 current documentation surfaces, website fallbacks и release evidence;
- добавлены негативные регрессии для Android version drift, stale Security Policy и устаревшей current verification-ссылки;
- release evidence workflow скачивает опубликованные Client, Server, Android и PWA assets, проверяет SHA-256, PE/ZIP integrity и обязательное содержимое;
- `CHANGELOG.md` закреплён как единственный канонический release history, а `RELEASE_HISTORY.md` оставлен указателем.

### Организационная очистка

- конфликтующие устаревшие PR #30 и #31 закрыты;
- obsolete automation PR #6 и #7 закрыты;
- экспериментальный Rust/OpenMLS PR #11 закрыт как superseded отдельным текущим JavaScript/`ts-mls` Trust/MLS-контуром.

### Совместимость

- schema 8, API v3 и Trust/MLS API v4 сохранены;
- runtime code, зависимости, migrations и пользовательские функции не изменены.

## [3.3.1] — 2026-07-23

### Исправлено

- установленный Windows Nexora Server больше не завершается при запуске с `MODULE_NOT_FOUND: ../shared/pulse-catalog.cjs`;
- обязательный каталог `shared/**/*` включён в Electron Server payload и `app.asar`;
- release config validation проверяет packaging manifest, наличие Pulse catalog и exports `catalogItem`/`publicCatalog`.

### Тесты и выпуск

- дефект сначала подтверждён падающим regression test, затем исправлен тем же контрактом;
- Windows check, unit/API/integration, performance, security, Linux, schema 8 soak, Android и focused 3.3 gates прошли;
- тег `v3.3.1` указывает на release commit `a7d5a7f020051bb837b67df437de90b2cd96958a`;
- GitHub Release опубликован как явно маркированный `UNSIGNED-TEST` prerelease с Client, Server, Android, source, PWA, SPDX SBOM и SHA-256 checksums;
- `latest.yml` и `.blockmap` не опубликованы, поэтому production updater не принимает неподписанные сборки.

### Совместимость

- Local Server schema 8, API v3 и Trust/MLS API v4 сохранены;
- миграция базы, новые зависимости и изменение конфигурации не требуются.

## [3.3.0] — 2026-07-23

### Добавлено

- серверный каталог Импульсов для оформления профиля, сообщений, реакций и возможностей комнат;
- атомарные Cloud/Sandbox purchases с double-entry ledger, idempotency и entitlements;
- самостоятельные Sandbox goals, contributions, refunds и receipts без обращения к отключённому Cloud;
- доступные in-app confirmation dialogs для удаления обычных и защищённых сообщений;
- полный release pipeline для signed builds или явно маркированных Client/Server/Android UNSIGNED TEST artifacts;
- переработанный сайт 3.3.0 с live GitHub data, direct downloads, signature labels и RU/EN.

### Исправлено

- MLS Welcome recovery больше не исчерпывает общий device bucket при открытии личных диалогов и комнат;
- Client объединяет параллельные recovery requests, соблюдает backoff и Retry-After;
- Sandbox endpoints больше не создают 409 для receipts и 503 для room goals;
- Cloud Account fallback не показывает undefined, а LOCAL TEST MODE не выходит за границы;
- voice waveform нормализуется по RMS/peak, отображает разную высоту и played-state;
- инертная иконка замка удалена из secure composer;
- website headings не пересекаются на кириллице, language/GitHub controls доступны для pointer и keyboard;
- Stripe webhook raw body не изменяется JSON middleware.

### Безопасность

- room purchases проверяют owner role, membership и ban на сервере;
- отрицательный баланс, client-defined price и повторное списание запрещены;
- unsigned test binaries не публикуют latest.yml или blockmap и недоступны production updater;
- plaintext downgrade и paywall для базового общения не добавлены.

### Совместимость

- Local Server schema 8, Application API v3 и Trust/MLS API v4 сохранены;
- migration базы, breaking changes и новые runtime dependencies отсутствуют.
