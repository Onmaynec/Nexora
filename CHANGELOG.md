# Changelog

Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.

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

[3.1.0]: https://github.com/Onmaynec/Nexora/releases/tag/v3.1.0
[3.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v3.0.0
[2.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v2.0.0
[1.0.2]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.2
[1.0.1]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.1
[0.3.0]: https://github.com/Onmaynec/Nexora/releases/tag/v0.3.0
