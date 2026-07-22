# Обзор продукта Nexora

## 1. Назначение

Nexora — self-hosted платформа обмена сообщениями для частных серверов, небольших команд, сообществ и контролируемых корпоративных установок. Основной коммуникационный контур работает на Local Server и не требует передачи локальных комнат, сообщений и файлов в централизованный Cloud.

Состав продукта:

- **Nexora Client** — единый React-интерфейс для Windows, браузера/PWA и Android;
- **Nexora Local Server** — authority локальных аккаунтов, комнат, ролей, сообщений, файлов, realtime и политик доступа;
- **Nexora Pulse Cloud** — отдельный optional-контур Cloud Identity, billing, ledger и production entitlements;
- **Trust Core / MLS** — device-scoped secure messaging и encrypted media;
- **Operations layer** — health, metrics, backup/restore, maintenance, audit и release tooling.

## 2. Текущая версия

| Параметр | Значение |
|---|---|
| Current repository version | `3.2.3` |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |
| Migration с 3.2.0–3.2.2 | не требуется |

Линия `3.2.x` включает:

- `3.2.0` — Trust Core, MLS secure messaging и encrypted media;
- `3.2.1` — исправление login bootstrap и безопасного Server shutdown;
- `3.2.2` — исправление Trust configuration race при чтении encrypted drafts;
- `3.2.3` — resource governance, strict recovery validation, rate limiting и security-state cleanup.

## 3. Модель развёртывания

Поддерживаемые сценарии:

- localhost и локальная разработка;
- LAN и private VPN, включая Radmin VPN;
- публичный HTTPS-домен за reverse proxy;
- Windows Client/Server shells;
- устанавливаемая PWA;
- Android WebView shell с системным TLS trust store;
- отдельный Pulse Cloud deployment при использовании production commercial features.

Публичная установка требует HTTPS, firewall, точного `allowedOrigins`, мониторинга и резервного копирования. Прямой port forwarding Local Server не считается поддерживаемой production-конфигурацией.

## 4. Основные продуктовые контуры

### 4.1 Messaging

- direct messages, Saved Messages и rooms;
- replies, threads, reactions, mentions и polls;
- edit/delete/forward, bookmarks и edit history;
- silent/scheduled send и server drafts;
- full-text search, notifications и read state;
- offline cache, delta sync и durable outbox.

### 4.2 Rooms and moderation

- `owner`, `moderator`, `member` и custom roles;
- ownership transfer и moderator management;
- member removal, ban/unban и room ban list;
- join requests и multiple invitations;
- invite expiry, revocation и usage limits;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- reports, appeals и temporary restrictions;
- audit log и system messages.

### 4.3 Legacy media

Обычные диалоги используют server-validated uploads:

- size limits;
- safe names;
- SHA-256 verification;
- actual MIME detection;
- resumable chunks;
- previews и voice playback;
- storage quota и retention.

### 4.4 Secure media

Secure conversations используют client-side encryption:

- AES-256-GCM;
- AAD binding к conversation, attachment и media kind;
- opaque server metadata;
- exact ciphertext size и SHA-256 validation;
- pending expiry/cancel;
- one-time atomic message claim;
- idempotent retry;
- verified local decrypt/download;
- fail-closed room media policy;
- quota по фактически сохранённым ciphertext bytes.

### 4.5 Identity and access

Local identity:

- password sessions;
- secure HttpOnly/SameSite cookies;
- Origin/CSRF checks;
- persistent rate limits и login lock;
- TOTP и one-time recovery codes;
- session management и scheduled expiry cleanup.

Cloud Identity:

- email verification;
- Cloud MFA;
- OAuth 2.1 Authorization Code + PKCE;
- signed Local Account linking;
- отдельная Cloud session boundary.

### 4.6 Trust Core and MLS

Secure conversation включает:

- Ed25519 device identity;
- proof-of-possession registration;
- strict BasicCredential binding к `{ userId, deviceId }`;
- distinct identity и MLS signature keys;
- device verification/revocation;
- one-time KeyPackages и scoped Welcome;
- MLS group epochs и signed commits;
- replay protection;
- device-scoped Socket.IO delivery;
- ciphertext-only Local Server persistence;
- encrypted client-side private state/cache/drafts;
- strict missed-commit recovery validation;
- downgrade protection для legacy paths.

Local Server не получает secure-message plaintext, private MLS state или secure-attachment key. Он видит service metadata и traffic patterns. Независимый cryptographic/application-security audit не завершён.

### 4.7 Resource governance 3.2.3

- до 16 active Trust devices на user;
- до 25 KeyPackages в одном upload;
- до 32 unclaimed KeyPackages на device;
- до 256 unclaimed KeyPackages на user;
- atomic SQLite enforcement;
- bounded sliding-window route limits;
- stable `RATE_LIMITED` + `Retry-After` contract;
- action-specific primitive audit allowlists;
- startup/hourly cleanup stale security state.

### 4.8 Nexora Plus and Pulse

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

## 5. Платформы

| Платформа | Технология | Статус 3.2.3 |
|---|---|---|
| Windows Client | Electron + React | source/build verified; stable signed promotion требует Authenticode и packaged runtime gates |
| Windows Server | Electron shell + Node.js | source/build verified; stable signed promotion требует Authenticode и packaged runtime gates |
| Browser / PWA | React/Vite + Service Worker | Source/PWA prerelease permitted |
| Android | WebView shell | source build verified; physical-device runtime/signing остаются manual gate |
| Local Server CLI | Node.js | automated release gate passed |
| Pulse Cloud | Node.js service | production-oriented integration; external deployment/provider controls required |

## 6. Совместимость

- schema 8 сохраняется во всей линии `3.2.0–3.2.3`;
- Application API v3 не изменён;
- Trust/MLS/encrypted-media API v4 не изменён;
- update `3.2.0–3.2.2 → 3.2.3` не требует database migration;
- schema 7 → 8 migration применяется при переходе с 3.1.x;
- 3.1.x Client не поддерживает active secure conversation 3.2.x;
- существующая история 3.1.x не шифруется ретроактивно.

## 7. Security и privacy boundary

Nexora `3.2.3` не заявляет:

- независимую cryptographic/application-security certification;
- traffic-analysis resistance;
- сокрытие membership, timing, IP, ciphertext size и delivery metadata;
- seamless recovery после полной потери private device state;
- защиту plaintext от compromised authorized Client;
- stable signed Windows distribution без закрытия signing/runtime gates;
- криптовалюты, NFT или user-to-user transfer Impulses;
- voice/video calls или screen sharing как часть текущего релиза.

## 8. Stable promotion gates

До stable signed promotion требуются:

1. packaged Windows Electron Client/Server runtime E2E;
2. installed PWA и physical Android runtime matrix;
3. расширенная multi-device simultaneous-commit/revoke/re-add/corruption matrix;
4. более длительные load/soak и long-offline scenarios;
5. metadata minimization и traffic-analysis review;
6. Authenticode signing-machine verification и complete updater assets;
7. независимый cryptographic/application-security review без unresolved high/critical findings.

Текущее evidence: [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md).
