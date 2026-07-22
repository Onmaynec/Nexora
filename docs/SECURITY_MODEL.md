# Модель безопасности Nexora 3.2.3

## 1. Область документа

Этот документ описывает текущую модель безопасности `main`:

- версия: `3.2.3`;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- Local Server database: SQLite schema 8;
- распространение: Source/PWA prerelease;
- signed production baseline: `3.1.2`.

Документ не является независимым аудитом, сертификацией криптографии или гарантией безопасности конкретного deployment.

## 2. Защищаемые активы

Nexora защищает:

- локальные аккаунты и sessions;
- membership, roles, bans и room policies;
- сообщения и файлы обычных диалогов;
- private device identity и MLS state;
- secure-message plaintext и attachment keys;
- backups и SQLite integrity;
- Cloud Identity и OAuth sessions;
- Pulse ledger, receipts и production entitlements;
- signing, bot, webhook и provider credentials;
- audit и operational evidence.

## 3. Основные противники и риски

Модель учитывает:

- неавторизованного сетевого клиента;
- участника комнаты, пытающегося повысить права;
- удалённого или заблокированного пользователя;
- compromised/revoked device;
- злоупотребление Trust, KeyPackage, recovery или upload routes;
- replay, scope substitution и race conditions;
- malicious attachment metadata и MIME spoofing;
- XSS, compromised dependency или malicious Client binary;
- администратора или процесс с filesystem/database access;
- ошибочную Cloud/provider integration;
- утечку secrets через logs, audit или diagnostics;
- повреждение database, migration или backup.

## 4. Границы доверия

### Client

Client отвечает за:

- пользовательский интерфейс;
- private device identity key;
- private MLS group state и private KeyPackages;
- шифрование и расшифровку secure messages;
- шифрование и расшифровку secure attachments;
- encrypted local cache и drafts;
- проверку recovery envelope до локального persist;
- локальную очистку Trust state после revocation.

Browser/Electron renderer входит в trusted computing base. Storage encryption не защищает plaintext от same-origin XSS, malware или compromised Client во время использования.

### Local Server

Local Server является authority для:

- local authentication и sessions;
- membership, roles, bans и restrictions;
- room policies и moderation;
- Trust public directory и verified/revoked state;
- MLS group membership, epochs и replay records;
- ciphertext persistence и delivery order;
- storage quota, retention, backup и audit;
- server-side rate/resource limits.

Local Server не должен получать private MLS state, secure-message plaintext или secure-attachment keys.

### Pulse Cloud

Pulse Cloud является authority для:

- Cloud Identity;
- email verification и MFA;
- OAuth 2.1 Authorization Code + PKCE;
- billing, receipts и provider-event state;
- double-entry Impulse ledger;
- signed production entitlements.

Local Server не создаёт authoritative production entitlement самостоятельно.

## 5. Authentication и session security

- passwords обрабатываются server-side;
- sessions используют secure HttpOnly/SameSite cookies;
- mutating browser requests требуют допустимый Origin и CSRF token;
- login attempts защищены persistent rate limits и temporary lock;
- local и Cloud TOTP поддерживают one-time recovery codes;
- expired sessions удаляются при startup и hourly maintenance;
- login history старше 90 дней удаляется по retention policy;
- operational logs не должны содержать cookies, passwords, tokens или signatures.

## 6. Authorization и room access

Каждая критичная операция проверяет:

1. authentication;
2. существование ресурса;
3. membership;
4. роль и permission;
5. ban/restriction;
6. room policy;
7. scope входных данных;
8. rate limit и resource limit.

Активный бан имеет приоритет над stale membership. Доступ должен завершаться fail-closed, а удалённый или заблокированный пользователь теряет REST- и realtime-доступ.

## 7. Device Trust

### Registration

- Client создаёт non-extractable Ed25519 identity key;
- registration доказывает possession private key;
- MLS BasicCredential должен быть точным versioned credential для `{ userId, deviceId }`;
- identity proof key и MLS signature key обязаны различаться;
- duplicate registration с теми же параметрами остаётся idempotent;
- максимум — 16 active Trust devices на локальную учётную запись.

### Verification и revocation

- первый device использует bootstrap verification;
- последующие devices требуют signed approval активного verified device;
- verify и revoke используют отдельные one-time operation-scoped challenges;
- revoked device теряет Trust/MLS API access;
- целевой secure Socket.IO connection отключается немедленно;
- Client удаляет identity, private MLS state, KeyPackages, decrypted cache и drafts.

## 8. KeyPackage governance

- KeyPackages являются one-time и scope-bound;
- максимум 25 packages в одном upload request;
- максимум 32 unclaimed packages на device;
- максимум 256 unclaimed packages на user;
- limits применяются атомарно в SQLite;
- expired rows очищаются maintenance process;
- claim/reuse/scope substitution должны отклоняться.

Эти ограничения предотвращают неограниченное накопление Trust resources и не изменяют MLS protocol compatibility.

## 9. MLS secure messaging

Фиксированный profile:

`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

Server проверяет:

- authenticated session и active verified device;
- membership и ban state;
- group/conversation scope;
- expected epoch;
- unique commit/message hashes;
- ciphertext replay state;
- допустимый delivery target.

После MLS activation plaintext creation через legacy send, forward, edit, draft, scheduled, poll, bot и upload paths отклоняется server-side.

## 10. Missed-commit recovery

Client не доверяет recovery envelope только потому, что он получен от Local Server. До persist проверяются:

- group ID и conversation scope;
- expected start/end epoch;
- точная непрерывная последовательность epochs;
- SHA-256 каждого commit payload;
- отсутствие duplicate commit hashes;
- intermediate public-state hashes;
- final public-state hash.

Разрыв или mismatch является hard failure. Непроверенное состояние не сохраняется.

## 11. Encrypted media

- Client использует random AES-256-GCM key и IV для payload;
- AAD связывает conversation, attachment ID и media kind;
- original filename, actual MIME, caption, duration и waveform находятся внутри MLS content;
- Server хранит `application/octet-stream` и opaque service metadata;
- actual ciphertext bytes ограничены до parsing;
- expected size соответствует `plaintextSize + GCM tag`;
- ciphertext SHA-256 проверяется перед persist;
- quota учитывает фактически сохранённые ciphertext bytes;
- pending object недоступен до atomic message claim;
- cancel, expiry, idempotent retry и one-time claim обязательны;
- Client повторно проверяет ciphertext, GCM tag и plaintext hash до preview/download.

Server не расшифровывает opaque attachment для проверки plaintext: это нарушило бы заявленную security boundary.

## 12. Route rate limiting

Trust directory, enrollment, KeyPackage, recovery и E2EE upload routes используют shared memory-bounded sliding-window limiter.

Требования:

- bounded number of buckets;
- operation-specific limits;
- stable error code `RATE_LIMITED`;
- `Retry-After` response header;
- stale persisted buckets очищаются startup/hourly maintenance;
- limiter не заменяет authentication, authorization или resource ceilings.

## 13. Audit и logging

- Trust audit metadata принимает только action-specific primitive allowlists;
- произвольные nested objects не сохраняются;
- secrets и private key material запрещены;
- operational logs используют request IDs и recursive redaction;
- mutating developer commands записываются в `integrationAudit` без secret arguments;
- audit не должен превращаться в канал хранения user content.

## 14. Database, migration и maintenance

- SQLite использует WAL и `synchronous=FULL`;
- связанные изменения выполняются транзакционно;
- schema 7 → 8 migration создаёт verified backup и проверяет integrity;
- downgrade к несовместимой schema блокируется;
- startup/hourly maintenance удаляет expired sessions, old login history, stale rate-limit buckets и expired Trust resources;
- backup/restore проверяет integrity до возврата service в ready state.

## 15. Verified controls и evidence

Для `3.2.3` автоматизированно проверены:

- credential/device scope;
- distinct Ed25519 key roles;
- device и KeyPackage ceilings;
- Trust audit allowlists;
- active-ban fail-closed access;
- bounded rate limiter и HTTP `429` contract;
- strict missed-commit recovery;
- expired security-state cleanup;
- существующие CSRF/Origin, Socket.IO Origin, IndexedDB sealing, attachment bounds и replay protections.

Evidence: [Security Review 3.2.3](../SECURITY_REVIEW_3.2.3.md) и [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md).

## 16. Metadata и residual risks

Local Server видит или может вывести:

- account/device identifiers;
- membership;
- room/conversation scope;
- sender/uploader;
- group/epoch и delivery order;
- attachment ID и ciphertext size;
- timestamps, IP/network/session context;
- replay hashes и traffic patterns.

Не заявляются:

- traffic-analysis resistance;
- retroactive encryption истории 3.1.x;
- seamless recovery после полной потери private device state;
- защита plaintext от compromised authorized Client;
- независимая cryptographic/application-security certification;
- stable signed Windows status для `3.2.3`.

## 17. Ответственное раскрытие

Уязвимости сообщаются приватно по [Security Policy](../SECURITY.md). Не публикуйте exploit, tokens, private keys, complete MLS state, реальные сообщения или персональные данные в публичном Issue.
