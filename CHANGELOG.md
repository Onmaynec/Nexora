# Changelog

Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.

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

[3.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v3.0.0
[2.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v2.0.0
[1.0.2]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.2
[1.0.1]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.1
[0.3.0]: https://github.com/Onmaynec/Nexora/releases/tag/v0.3.0
