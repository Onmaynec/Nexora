# Nexora 3.1.0 — Pulse Experience & Cloud Productization

## Release scope

Nexora 3.1.0 объединяет существующий self-hosted messenger с production-oriented Pulse Cloud без переноса приватных сообщений в Cloud.

Основные части релиза:

- Pulse Cloud billing service и double-entry ledger;
- Cloud Identity, email verification, MFA и OAuth 2.1 + PKCE;
- Local Server schema 7 и подписанная интеграция с Cloud;
- event delta sync и entitlement revoke propagation;
- Nexora Plus, Impulse checkout, receipts, billing portal и cancel-at-period-end;
- room goals с server-side role/ban/membership checks;
- новый Pulse Center;
- Client onboarding и Server setup wizard;
- offline fallback на последний проверенный Ed25519 cache;
- Windows, web/PWA и Android compatibility.

## Upgrade

1. Создайте резервную копию 3.0.0.
2. Обновите Server и Client одновременно.
3. При первом запуске Local Server выполнит schema 6 → 7 до открытия порта.
4. Настройте Pulse Cloud variables из `.env.pulse.example`.
5. Проверьте `/healthz/full`, Local Server `/api/health` и `/api/v3/pulse/status`.
6. Проведите тестовый checkout и webhook delivery в Stripe sandbox до включения production prices.

Rollback описан в `docs/MIGRATION_3.1.0.md`. После записи данных schema 7 запуск бинарника 3.0.0 блокируется, чтобы исключить silent downgrade.

## Operational gates

Перед production deployment обязательны:

- `npm ci`;
- `npm run release:check`;
- Android `:app:assembleDebug` или подписанная release-сборка;
- корректные Ed25519 keys;
- рабочая transactional email delivery;
- Stripe webhook secret;
- HTTPS Cloud origin;
- backup/restore smoke test;
- проверка OAuth redirect URI allowlist.

## Trust boundary

Local Server хранит сообщения, комнаты, файлы, локальные аккаунты и проверенный entitlement cache. Pulse Cloud хранит Cloud Identity, billing account, ledger, subscription metadata, receipts и signed entitlements. Платёжные карты обрабатываются provider-hosted checkout и не сохраняются Nexora.
