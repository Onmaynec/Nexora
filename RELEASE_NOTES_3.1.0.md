# Nexora 3.1.0 — Pulse Experience & Cloud Productization

Nexora 3.1.0 превращает существующий self-hosted messenger в завершённую продуктовую версию с отдельным Pulse Cloud, сохраняя локальное хранение сообщений, комнат и файлов.

## Основные изменения

- Pulse Cloud с double-entry ledger, Stripe Checkout/webhooks, квитанциями, возвратами и room goals.
- Cloud Identity с подтверждением email, TOTP MFA, recovery codes и OAuth 2.1 Authorization Code + PKCE.
- Безопасная миграция Local Server SQLite schema 6 → 7 с backup, integrity check и rollback.
- Подписанная Ed25519 связь Local Account ↔ Cloud Account без передачи Cloud-пароля Local Server.
- Nexora Plus, 400 Импульсов за подтверждённый период, пакеты Импульсов, billing portal и отмена продления.
- Replay-safe Cloud event sync, entitlement revoke propagation и проверенный offline cache.
- Новый Pulse Center, Client onboarding и Server setup wizard.
- Синхронизированная версия 3.1.0 для Node package metadata, Android и release checks.

## Безопасность

- Cloud passwords хранятся как scrypt hash с индивидуальной солью.
- TOTP secrets шифруются AES-256-GCM.
- Session, email, OAuth authorization/access/refresh tokens сохраняются только как hash.
- Authorization codes и refresh tokens одноразовые; PKCE S256 обязателен для public clients.
- Local Server проверяет session, CSRF, membership, ban, role, idempotency, signature, expiry и scope.
- Платёжные карты обрабатываются provider-hosted checkout и не сохраняются Nexora.
- Базовые сообщения, комнаты, файлы и история не зависят от Plus или доступности Pulse Cloud.

## Обновление

Перед обновлением создайте резервную копию Nexora 3.0.0. Local Server выполнит migration до открытия сетевого порта. Подробности находятся в `docs/MIGRATION_3.1.0.md`, `docs/LOCAL_PULSE_INTEGRATION.md`, `docs/CLOUD_IDENTITY.md` и `docs/RELEASE_3.1.0.md`.

## Артефакты

Если в GitHub Actions настроены Authenticode secrets, release workflow публикует подписанные Windows Client/Server installers и updater metadata. Без signing secrets workflow публикует Source ZIP, PWA ZIP, SPDX SBOM и SHA-256 checksums как prerelease; неподписанные updater binaries намеренно не публикуются.
