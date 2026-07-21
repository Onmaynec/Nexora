# Nexora Cloud Identity 3.1.0

## Назначение

Cloud Identity отделён от Local Account. Local Server продолжает самостоятельно хранить локальные учётные записи, сессии и сообщения. Cloud Account используется только для Nexora Plus, Импульсов, переносимых прав и платёжной истории.

Cloud Identity не имеет доступа к сообщениям, комнатным файлам, локальному паролю или локальным сессиям пользователя.

## Регистрация и подтверждение email

`POST /v1/identity/register` создаёт Cloud Account и Identity в одной транзакции. Пароль проверяется сервером и хранится как `scrypt` hash с индивидуальной солью. До подтверждения email вход запрещён.

Одноразовые email-токены:

- хранятся только как SHA-256 hash;
- имеют срок действия;
- инвалидируются после использования;
- удаляются из payload outbox после успешной доставки;
- повторная отправка не раскрывает существование аккаунта через внутренние ошибки.

## MFA

Поддерживается TOTP с окном ±30 секунд и одноразовые recovery codes. TOTP-secret шифруется AES-256-GCM отдельным `IDENTITY_ENCRYPTION_KEY`. Recovery codes хранятся только как hash и после использования помечаются использованными.

## OAuth 2.1

Authorization Code flow использует:

- PKCE S256 для public clients;
- одноразовый authorization code;
- точное совпадение `client_id` и `redirect_uri`;
- короткий TTL code;
- opaque access и refresh tokens;
- хранение только token hash;
- rotation refresh token;
- отзыв старого refresh token в той же транзакции.

Metadata доступна через `/.well-known/oauth-authorization-server`.

## Связь с Local Server

Local Server создаёт одноразовую link session с nonce и открывает `/v1/oauth/authorize`. После Cloud login/MFA Cloud формирует Ed25519-signed attestation с:

- `serverId`;
- `localUserId`;
- `linkId`;
- nonce;
- `cloudAccountId`;
- сроком действия.

Local Server принимает attestation только один раз и только после совпадения всего scope. Cloud-пароль, Cloud session cookie и OAuth refresh token в Local Server не передаются.

## Обязательные secrets

- `IDENTITY_ENCRYPTION_KEY` — случайные 32 байта в base64url;
- `ENTITLEMENT_SIGNING_PRIVATE_KEY` — Ed25519 private key только в Pulse Cloud;
- `CLOUD_EMAIL_DELIVERY_API_KEY`;
- `NEXORA_PULSE_API_KEY`;
- `CLOUD_ADMIN_API_KEY`.

Secrets запрещено хранить в репозитории, логах, SQLite backup без шифрования или клиентском bundle.
