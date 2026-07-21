# Changelog

Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.

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

[2.0.0]: https://github.com/Onmaynec/Nexora/releases/tag/v2.0.0
[1.0.2]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.2
[1.0.1]: https://github.com/Onmaynec/Nexora/releases/tag/v1.0.1
[0.3.0]: https://github.com/Onmaynec/Nexora/releases/tag/v0.3.0
