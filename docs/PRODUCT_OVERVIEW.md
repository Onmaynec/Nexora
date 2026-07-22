# Nexora Product Overview

## 1. Назначение

Nexora — self-hosted платформа обмена сообщениями, предназначенная для частных серверов, небольших команд, сообществ и контролируемых корпоративных установок. Основной контур работает на Local Server и не требует передачи локальных сообщений, комнат и файлов в централизованный Cloud.

Продукт состоит из следующих частей:

- **Nexora Client** — единый React-интерфейс для Windows, браузера/PWA и Android;
- **Nexora Local Server** — authority локальных аккаунтов, комнат, ролей, сообщений, файлов, realtime и политик доступа;
- **Nexora Pulse Cloud** — отдельный optional-контур Cloud Identity, billing, ledger и production entitlements;
- **Trust Core / MLS path** — device-scoped secure messaging и encrypted media в линии 3.2.0.

## 2. Целевая модель развёртывания

Nexora поддерживает:

- localhost и локальную разработку;
- LAN и private VPN, включая Radmin VPN;
- публичный HTTPS-домен за reverse proxy;
- Windows Client/Server shells;
- устанавливаемую PWA;
- Android WebView shell с системным TLS trust store.

Публичная установка требует HTTPS, firewall, явного `allowedOrigins`, мониторинга и резервного копирования. Прямой port forwarding локального server port не считается безопасной production-конфигурацией.

## 3. Продуктовые контуры

### 3.1 Messaging

- direct messages, Saved Messages и rooms;
- replies, threads, reactions, mentions и polls;
- edit/delete/forward, bookmarks и edit history;
- silent/scheduled send и server drafts;
- full-text search, notifications и read state;
- offline cache, delta sync и durable outbox.

### 3.2 Rooms and moderation

- `owner`, `moderator`, `member` и custom roles;
- ownership transfer и moderator management;
- member removal, ban/unban и room ban list;
- join requests и multiple invitations;
- invite expiry, revocation и usage limits;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- audit log и system messages.

### 3.3 Media

Legacy conversations используют server-validated uploads:

- size limits;
- safe names;
- SHA-256 verification;
- actual MIME detection;
- resumable chunks;
- previews и voice playback.

Secure conversations 3.2.0 используют client-side encrypted media:

- AES-256-GCM;
- opaque server metadata;
- exact ciphertext size и SHA-256 validation;
- pending expiry/cancel;
- one-time atomic message claim;
- verified local decrypt/download;
- fail-closed room media policy.

### 3.4 Identity and access

Local identity:

- password sessions;
- HttpOnly cookies;
- Origin/CSRF checks;
- rate limits и login lock;
- TOTP и one-time recovery codes;
- session management.

Cloud Identity:

- email verification;
- Cloud MFA;
- OAuth 2.1 Authorization Code + PKCE;
- signed Local Account linking;
- отдельный Cloud session boundary.

### 3.5 Trust Core and MLS

В `3.2.0` secure conversation включает:

- Ed25519 device identity;
- proof-of-possession registration;
- device verification/revocation;
- one-time KeyPackages и scoped Welcome;
- MLS group epochs и signed commits;
- replay protection;
- device-scoped Socket.IO delivery;
- ciphertext-only Local Server persistence;
- encrypted client-side private state и cache;
- downgrade protection для legacy paths.

Local Server не получает secure-message plaintext, private MLS state или secure-attachment key. Он видит service metadata и traffic pattern. Независимый криптографический аудит не завершён.

### 3.6 Nexora Plus and Pulse

Pulse Cloud является authority для:

- Cloud Identity;
- subscription state;
- Impulse double-entry ledger;
- receipts;
- provider webhooks;
- refund/dispute/cancellation handling;
- signed production entitlements.

Local Server не создаёт production entitlement самостоятельно и не хранит payment-card data, Cloud password, Cloud MFA secret или Cloud signing private key.

Local sandbox предназначен только для QA/demo и не выполняет реальные платежи.

## 4. Платформы и каналы распространения

| Платформа | Технология | Статус 3.2.0 |
|---|---|---|
| Windows Client | Electron + React | source/build verified; stable signed promotion требует Authenticode/runtime gates |
| Windows Server | Electron shell + Node.js | source/build verified; stable signed promotion требует Authenticode/runtime gates |
| Browser / PWA | React/Vite + Service Worker | prerelease distribution permitted |
| Android | WebView shell | source build verified; physical-device runtime/signing остаются отдельным gate |
| Local Server CLI | Node.js | automated release gate passed |
| Pulse Cloud | Node.js service | production-oriented integration; deployment/provider configuration external |

## 5. Версионная политика

- `3.1.2` — последняя signed production baseline, не использующая E2EE от оператора Local Server;
- `3.2.0` — текущая версия репозитория и Source/PWA prerelease candidate с Trust Core, MLS и encrypted media;
- API v3 сохраняет основной application contract;
- Trust/MLS operations используют API v4;
- Local Server schema 8 является upgrade от schema 7;
- история и файлы 3.1.x не шифруются ретроактивно.

## 6. Границы и исключения

Nexora 3.2.0 не заявляет:

- независимый cryptographic/application-security audit;
- traffic-analysis resistance;
- сокрытие membership, timing, IP, ciphertext size и delivery metadata;
- бесшовное восстановление после полной потери private device state;
- stable signed Windows distribution без завершения signing gates;
- совместимость 3.1.x клиента с активной secure conversation 3.2.0;
- криптовалюты, NFT или передачу Impulses между пользователями;
- voice/video calls или screen sharing как часть текущего релиза.

## 7. Критерии production promotion 3.2.0

До stable promotion требуются:

1. packaged Windows Electron, installed PWA и physical Android runtime E2E;
2. расширенная multi-device concurrency/revoke/re-add/corruption matrix;
3. более длительные load/soak и long-offline scenarios;
4. metadata minimization и traffic-analysis review;
5. Authenticode signing-machine verification и signed updater assets;
6. независимый cryptographic/application-security review без unresolved high/critical findings.

Фактическое состояние gate фиксируется в [Release Verification 3.2.0](../RELEASE_VERIFICATION_3.2.0.md).
