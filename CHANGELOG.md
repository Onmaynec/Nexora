# Changelog

Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.

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

- Local Server schema 8 сохранена;
- Cloud DB получает additive migration impulse_purchases;
- API v3 и Trust/MLS API v4 расширены совместимо;
- обновление поддерживается с 3.2.0–3.2.5.

## [3.2.5] — 2026-07-22

### Исправлено

- команды `plus grant`, `plus revoke` и `impulses grant|revoke` теперь сохраняют канонический `userId` и не передают `undefined` в SQLite;
- MLS group-creation race ожидает Welcome в фоне вместо немедленного `MLS_WELCOME_PENDING`;
- история чата больше не очищается при каждом bootstrap refresh, а сообщения отправляются через оптимистичную encrypted outbox без блокирующего полного обновления;
- изображения и голосовые автоматически расшифровываются локально и отображаются в привычном inline-виде;
- интерактивная сеть ограничена только областью истории сообщений;
- элементы управления и scrollbars Nexora Server больше не используют выбивающиеся системные стили.

### Добавлено

- красивое доступное окно описания обновления внутри Nexora Client;
- локальная команда `release:windows` без требования сертификата и отдельная `release:windows:signed` для подписанного production build;
- real-SQLite regression coverage для Pulse Sandbox и UI/performance contracts 3.2.5.

### Совместимость

- schema 8, API v3 и Trust/MLS API v4 остаются совместимыми; миграция базы не требуется.

## [3.2.4] — 2026-07-22

### Fixed

- Client auto-update service is initialized before renderer access, keeps its scheduler alive and derives a stable result even when the updater does not emit a terminal event;
- manual Client update checks now return actionable current, available, network and missing-signed-release states;
- Server developer commands accept copied documentation placeholders such as `<netrox>` and `[1]`, and IPC preserves stable command error codes;
- verified devices waiting for MLS Welcome request recovery from active group members and retry the claim automatically, restoring text, media and voice sending when another active member is online.

### Added

- post-update release summary with “Подробнее”, “Закрыть” and “Не показывать снова”;
- Windows Client test mode with a live PowerShell log console and a dedicated Start Menu shortcut;
- branded Russian NSIS installer assets for Client and Server.

### Compatibility

- Local Server schema remains 8; API v3 and Trust/MLS API v4 remain compatible; no database migration is required.

## [3.2.3] — 2026-07-22

### Security

- Trust device registration validates that the MLS BasicCredential is exactly bound to the authenticated user and candidate device, and rejects reuse of one Ed25519 key for both identity proof and MLS signatures;
- active Trust devices are limited to 16 per user; duplicate registration remains idempotent and revoked devices release capacity;
- unclaimed MLS KeyPackage inventory is limited to 32 per device and 256 per user, with atomic enforcement and expired-row cleanup;
- Trust directory, enrollment, KeyPackage and recovery endpoints use bounded shared sliding-window rate limits with stable `RATE_LIMITED` errors and `Retry-After`;
- Trust audit metadata now uses an action-specific primitive allowlist instead of a shallow key blacklist;
- room conversation access fails closed when an inconsistent active ban and stale membership coexist;
- missed MLS commit recovery verifies group scope, contiguous epochs, ciphertext hash, duplicate hashes and every public-state hash before persisting state;
- hourly maintenance removes expired sessions, login history older than 90 days and stale persistent rate-limit buckets.

### Confirmed existing protections

- CSRF and Origin validation, Socket.IO Origin rejection, AES-GCM sealed IndexedDB state, exact opaque attachment size/hash/quota checks and server-side MLS replay constraints were already present and remain covered by release security gates.

### Compatibility

- Local Server schema remains 8; API v3 and Trust/MLS API v4 remain compatible; no database migration is required.

## [3.2.2] — 2026-07-22

### Fixed

- устранён renderer crash `TRUST_NOT_CONFIGURED` при холодном входе в Web/PWA и Electron Client;
- Trust scope теперь конфигурируется до запуска дочерних passive effects, читающих локальные E2EE-черновики;
- чтение encrypted draft в коротком pre-configuration окне возвращает пустое состояние вместо синхронного исключения;
- реальные ошибки Trust platform, регистрации устройства и IndexedDB по-прежнему отображаются явно.

### Changed

- версия Client, Server, Android metadata, package и lockfile синхронизирована как `3.2.2`;
- schema 8, API v3 и Trust/MLS API v4 сохранены без миграции и breaking changes.

### Tests

- добавлена регрессия порядка parent layout effect / child passive effect при первичной Trust-настройке;
- добавлен контракт безопасного чтения E2EE-черновиков до завершения Trust configuration.

## [3.2.1] — 2026-07-22

### Fixed

- после успешной аутентификации Client больше не зависает на экране «Собираем ваши чаты»: `/api/bootstrap` загружается до Trust enrollment и подключения device-scoped Socket.IO;
- закрытие Nexora Server больше не вызывает Electron main-process dialog `PulseRepositoryError: SQLite store закрыт`;
- Pulse и Trust status корректно формируют stopped-state snapshot после закрытия SQLite, не скрывая неожиданные ошибки базы;
- параллельные stop/quit вызовы Nexora Server сериализованы в один shutdown и не используют закрывающийся instance.

### Changed

- версия Client, Server, Android metadata, package и lockfile синхронизирована как `3.2.1`;
- schema 8, API v3 и Trust/MLS API v4 сохранены без миграции и breaking changes.

### Tests

- добавлена регрессия bootstrap-before-Trust;
- добавлены проверки Pulse status после закрытия repository и обязательного проброса неожиданных SQLite errors;
- добавлена интеграционная проверка schema 8 status после `instance.close()`.

## [3.2.0] — 2026-07-22 (Source/PWA prerelease)

### Added

- Local Server schema 8 с Trust device directory, одноразовыми challenge, KeyPackage, Welcome, MLS group/commit/replay state и Trust audit;
- Ed25519 device identity, proof-of-possession registration, подтверждение и отзыв устройств;
- Trusted Devices UI с fingerprint, verify/revoke, self-revoke и полной очисткой локального Trust scope;
- browser MLS engine для `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`;
- ciphertext-only Secure Message Pane, encrypted local drafts/cache/state и durable MLS outbox;
- AES-256-GCM encrypted files, images и voice с versioned descriptor внутри MLS application content;
- opaque v4 attachment API с exact-size/SHA-256 validation, pending expiry, cancel и one-time atomic claim;
- локальные image preview, voice recording/playback, upload progress/cancel и verified download;
- missed-commit recovery, conversation-scoped Welcome и Alice/Bob interoperability coverage;
- реальные REST/Socket.IO plaintext-downgrade и attachment transport regression tests;
- device-scoped secure realtime: socket-to-device binding, verified MLS member rooms, targeted revoke disconnect и local Trust wipe;
- schema 8 soak gate с повторными mutations, backup и SQLite integrity checks;
- migration/rollback, administrator/tester и Trust Core readiness documentation.

### Changed

- development version синхронизирована как 3.2.0 для package, lockfile, Android и Client handshake;
- Local Server schema 7 автоматически мигрирует к schema 8 до network listen с backup и integrity checks;
- conversation с активной MLS group больше не использует legacy plaintext message/upload path;
- room с запретом любого из `files/images/voice` блокирует весь opaque E2EE media path fail-closed;
- release security audit проверяет Trust challenge-response, non-extractable device keys, AES-GCM local wrapping, socket-to-device binding, verified-device-only MLS delivery, targeted revoke disconnect, replay protection, plaintext guards и encrypted-media boundary.

### Fixed

- отклонённая `SqliteStore.mutate()` операция больше не оставляет внутреннюю serial queue в rejected-состоянии и не ломает последующий `flush()`, shutdown или следующую mutation;
- pending attachment недоступен до MLS claim, а failed claim освобождает replay reservation без повторного использования attachment;
- ordinary outbox и offline cache не сохраняют attachment key, исходное имя или MIME отдельными plaintext-полями.

### Security

- Local Server не получает private MLS state и не расшифровывает secure-message content;
- attachment key, IV, source filename, actual MIME, caption, voice duration и waveform находятся только внутри MLS ciphertext;
- устройство должно быть active и verified для KeyPackage/Welcome/commit/ciphertext delivery, а secure Socket.IO event отправляется только в его device-scoped room;
- legacy, unverified и mismatched-device sockets не получают MLS ciphertext; отзыв доверия немедленно отключает целевой socket и инициирует локальную очистку Trust state;
- signed verify/revoke challenge одноразовый, expiring и operation-scoped;
- duplicate/stale/skipped epochs, replayed ciphertext и повторное использование KeyPackage/Welcome/attachment отклоняются;
- attachment ciphertext проверяется по exact GCM size и timing-safe SHA-256, а Client повторно проверяет ciphertext, GCM tag и plaintext hash перед preview/download;
- legacy send/forward/edit/draft/scheduled/poll/bot/upload paths блокируются сервером после MLS activation;
- сервер всё ещё видит uploader, conversation/room scope, attachment ID, ciphertext size, timing, network context и delivery events — metadata confidentiality не заявляется.

### Stable promotion blockers

- metadata minimization/traffic-analysis review beyond the documented boundary;
- расширенная simultaneous-commit/re-add/corrupted-state platform matrix и packaged runtime E2E;
- longer-duration load/soak и extended offline field evidence;
- Authenticode signing-machine checks и независимый cryptographic/application-security review.

Source/PWA prerelease не содержит unsigned updater assets и не заявляется как stable или independently audited E2EE.

## [3.1.2] — 2026-07-21

### Fixed

- крестик глобальной voice-панели полностью очищает active audio state и удаляет source;
- automatic Electron updater запускает initial check, использует single-flight и повторяет проверку каждые 6 часов;
- отсутствие signed latest.yml отображается стабильной причиной вместо необработанной ошибки;
- Pulse API v3 получил функциональную локальную sandbox-модель, управляемую Nexora Server.

### Added

- команды pulse sandbox, plus grant/revoke, impulses grant/revoke и pulse user;
- тестовая Plus-подписка с разовой выдачей 400 Импульсов и локальным audit/ledger.

### Security

- sandbox блокируется при production Pulse Cloud, не создаёт production-подписи и не разрешает реальные покупки;
- баланс sandbox не может стать отрицательным, все изменения выполняются сервером и журналируются.

## [3.1.1] — 2026-07-21

### Added

- liveness, readiness и защищённые Prometheus metrics для Local Server и Pulse Cloud;
- единый developer command registry для CLI и Windows Server Admin;
- аудит изменяющих административных команд без сохранения секретных аргументов.

### Changed

- graceful shutdown переводит сервисы в drain state до остановки workers, HTTP, Socket.IO и SQLite;
- Cloud health использует версию из package metadata вместо жёстко заданной строки.

### Security

- operational HTTP logs получают request ID и рекурсивно скрывают credentials, cookies, passwords, tokens, API keys и signatures;
- metrics endpoint требует bearer token либо loopback source;
- административная консоль не предоставляет shell или eval.

## [3.1.0] — 2026-07-21

### Added

- отдельный Pulse Cloud с double-entry ledger, Stripe Checkout/webhooks, квитанциями, возвратами, dispute handling и room goals;
- Cloud Identity с подтверждением email, TOTP MFA, recovery codes и OAuth 2.1 Authorization Code + PKCE;
- Local Server schema 7, безопасная миграция с backup/rollback и нормализованный entitlement/cache/event контур;
- подписанный Ed25519 account-link flow, Cloud event delta sync и применение entitlement revoke без перезапуска;
- Nexora Plus, 400 Импульсов за подтверждённый период, покупка пакетов, billing portal и cancel-at-period-end;
- новый Pulse Center, Client onboarding и Server setup wizard.

### Changed

- Client/Server версия поднята до 3.1.0 при сохранении API v3 и совместимости с основным messaging-контуром 3.x;
- production Pulse больше не использует локальную активацию Plus: Local Server принимает только подписанные Cloud-решения;
- Pulse UI переведён с sandbox-first API на `/api/v3/cloud-account/*`, `/api/v3/pulse/*` и room-scoped API;
- release check включает syntax, production web build, полный unit/API suite и security audit.

### Fixed

- failed provider event теперь можно безопасно повторить только с тем же payload hash;
- checkout idempotency key нельзя повторно использовать для другого account/product scope;
- schema 7 не откатывается обратно к schema 6 при обычной записи или restore;
- Stripe raw webhook body больше не перехватывается JSON parser Cloud Identity;
- OAuth browser flow и выдача code/attestation завершаются атомарно;
- Cloud write responses содержат подписанный authoritative server/user/room scope.

### Security

- Cloud passwords используют scrypt, TOTP secrets — AES-256-GCM, OAuth/session/email tokens хранятся только как hash;
- MFA recovery code одноразовый, refresh token вращается атомарно, authorization code защищён PKCE S256;
- Local Server проверяет session, CSRF, membership, ban, owner permission, signature, expiry и scope для каждой коммерческой операции;
- Cloud event inbox и provider events защищены от replay и payload substitution;
- Local Server не хранит card data, Cloud password, Cloud session, signing private key или OAuth refresh token.

## [3.0.0] — 2026-07-21

### Added

- единая версия вместо промежуточных 2.0.1–2.7.0: Windows, устанавливаемая PWA и Android-клиент работают с API v3;
- event sequence/delta sync, IndexedDB offline cache, устойчивая outbox и серверные черновики;
- тихая и отложенная отправка, опросы, упоминания, центр уведомлений, ветки и история редактирования;
- custom roles/categories, несколько приглашений, жалобы, апелляции, временные ограничения и pre-approval;
- resumable upload частями с SHA-256 и проверкой фактического MIME;
- TOTP/recovery codes, отдельные Electron sessions для серверов и эксплуатационные metrics/runtime controls;
- bot accounts, hashed scoped tokens, HMAC webhooks с SSRF/DNS-pinning защитой;
- исходный ZIP, PWA ZIP и SPDX SBOM в GitHub Release независимо от наличия Windows-сертификата.

### Changed

- Client/Server protocol поднят до API 3, SQLite — до schema 6 с автоматической pre-migration backup;
- публичные HTTPS-домены поддерживаются наряду с localhost/LAN/Radmin VPN;
- Windows stable release публикуется только после проверки полного набора подписанных assets;
- поиск получил фильтры, а крупные frontend-зависимости вынесены в отдельные chunks.

### Fixed

- карточка профиля больше не падает на `relationship: null` и не оставляет пустое окно после клика по аватару;
- `npm test` остаётся самодостаточным в чистом Linux checkout;
- отсутствие Authenticode secrets больше не скрывает весь релиз: создаётся безопасный Source/PWA prerelease без updater assets.

### Security

- Android всегда отменяет TLS error и запрещает cleartext/mixed content/third-party cookies;
- Electron изолирует cookies/cache по Server ID и сохраняет обязательную проверку подписи обновления;
- bot tokens хранятся только как hash, а webhook secrets шифруются локальным secret service;
- неподписанные `.exe`, `.blockmap` и `latest.yml` никогда не публикуются.

## [2.0.0] — 2026-07-20

### Added

- профили пользователей по клику на аватар, Saved Messages, закладки и chat archive/pin/filter;
- Nexora Plus/Pulse sandbox и подписанный production integration contract;
- коллективные цели комнат и премиальные profile/reaction entitlement;
- FTS5 message index и новые нормализованные schema 5 таблицы;
- GitHub Releases auto-update Client, Windows CI/release workflows и checksums;
- документация архитектуры, Pulse, релиза, безопасности и сопровождения.

### Changed

- persistence заменён на транзакционный diff/UPSERT вместо полного удаления/вставки коллекций;
- основной Client/Server protocol поднят до API 2 и minimum Client 2.0.0;
- dock, message actions, reaction picker и responsive boundaries переработаны;
- аватары открывают единый профиль во всех чатах, списках участников, заявках, блокировках и результатах поиска;
- нулевые счётчики скрываются.

### Fixed

- профиль нельзя было открыть по аватару;
- picker реакций закрывался до клика;
- action bar и hover dock выходили за свои панели;
- повреждённый Pulse Cloud URL выдавал необработанный `TypeError`;
- сохранены исправления подключения 1.0.2 и Windows-сборки 1.0.1.

### Security

- signed Pulse envelopes, HTTPS-only Billing, idempotency и scope/expiry checks;
- production Server не выпускает Plus entitlement самостоятельно, а принимает только подписанное решение Pulse Cloud;
- sandbox-вклады не могут превышать остаток цели, а отмена и истечение цели атомарно возвращают тестовые импульсы;
- ещё не реализованные локально Pulse-возможности закрыты capability gate;
- Electron разрешает только аудиозахват для голосовых и отклоняет запросы камеры;
- 0 production high/critical vulnerabilities на дату релиза.

## [1.0.2] — 2026-07-20

- исправлено применение подтверждённого локального сертификата в Electron session;
- исправлен строгий разбор полного Radmin/LAN IPv4-адреса.

## [1.0.1] — 2026-07-17

- стабильная SQLite-сборка без `better-sqlite3`/`node-gyp`;
- надёжность данных, комнаты, медиа, безопасность и Windows release surfaces.

## [0.3.0] — 2026-07-16

- объединённый RC с SQLite, профилями, поиском, outbox и Violet Grid.

[3.2.1]: https://github.com/Onmaynec/Nexora/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/Onmaynec/Nexora/releases/tag/v3.2.0
[3.1.2]: https://github.com/Onmaynec/Nexora/releases/tag/v3.1.2
[3.1.1]: https://github.com/Onmaynec/Nexora/releases/tag/v3.1.1
[3.1.0]: https://github.com/Onmaynec/Nexora/releases/tag/v3.1.0
[3.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v3.0.0
[2.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v2.0.0
[1.0.2]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.2
[1.0.1]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.1
[0.3.0]: https://github.com/Onmaynec/Nexora/releases/tag/v0.3.0
