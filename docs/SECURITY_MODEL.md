# Модель безопасности Nexora 3.2.4

## 1. Область документа

Документ описывает security model текущего `main`:

| Параметр | Значение |
|---|---|
| Version | `3.2.4` |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |

Документ не является независимым аудитом, криптографической сертификацией или гарантией конкретного deployment.

## 2. Защищаемые активы

- local accounts, sessions и TOTP state;
- membership, roles, bans, restrictions и room policies;
- обычные messages/files;
- device identity и private MLS state;
- secure-message plaintext и attachment keys;
- SQLite integrity, backups и audit;
- Cloud Identity и OAuth sessions;
- Pulse ledger, receipts и production entitlements;
- CA, signing, bot, webhook, provider и service credentials;
- release/update integrity.

## 3. Противники и риски

Модель учитывает:

- unauthenticated network client;
- room member, пытающегося повысить права;
- removed/banned user;
- compromised или revoked device;
- replay, scope substitution и race conditions;
- Trust/KeyPackage/recovery/upload resource abuse;
- malicious attachment metadata и MIME spoofing;
- update-feed/installer substitution;
- XSS, compromised dependency или malicious Client binary;
- operator/process с filesystem/database access;
- ошибочную Cloud/provider integration;
- secret leakage через logs, audit или diagnostics.

Не предполагается, что LAN/VPN participant автоматически trusted.

## 4. Trust boundaries

### Client

Client отвечает за:

- UI и local interaction state;
- device private keys;
- MLS encryption/decryption;
- secure-attachment encryption/decryption;
- encrypted IndexedDB state;
- fingerprint verification UI;
- active-device Welcome creation;
- local preview/playback/download verification.

Client renderer и installed binary входят в trusted computing base.

### Local Server

Local Server является authority для:

- local authentication и sessions;
- room membership, roles, bans и policies;
- public Trust directory и device status;
- resource ceilings и route rate limits;
- MLS group membership, epochs, commit/replay log;
- scoped Welcome requests и opaque protocol delivery;
- ciphertext persistence;
- storage quotas, backup, retention и audit.

Local Server не получает private MLS state или secure-message plaintext.

### Pulse Cloud

Pulse Cloud является authority для:

- Cloud Identity и MFA;
- OAuth 2.1 Authorization Code + PKCE;
- subscriptions, billing, receipts и provider reconciliation;
- Impulse ledger;
- signed production entitlements.

Local Server не создаёт authoritative production entitlement.

### Release/signing environment

Release environment отвечает за:

- immutable SemVer tag;
- verified source revision;
- Authenticode credentials;
- signed Client/Server assets;
- updater metadata;
- SBOM и checksums.

## 5. Authentication и authorization

Mutating browser operation требует:

1. authenticated session;
2. matching Origin;
3. valid CSRF token;
4. resource existence;
5. membership;
6. role/permission;
7. active-ban/restriction check;
8. room policy;
9. input validation;
10. rate/resource limit.

Trust mutation дополнительно требует device scope, active/verified status и, где применимо, one-time challenge/signature.

Active ban имеет приоритет над stale membership. Потеря доступа приводит к отказу REST и удалению realtime subscriptions.

## 6. Device Trust

### Registration

- Ed25519 proof-of-possession обязателен;
- MLS BasicCredential точно связан с `{ userId, deviceId }`;
- identity proof key и MLS signature key должны различаться;
- first-device bootstrap и subsequent verification имеют разные lifecycle rules;
- maximum 16 active Trust devices на user;
- duplicate registration остаётся idempotent;
- revocation освобождает capacity.

### Verification и revocation

- separate one-time scoped challenges;
- valid signature active verified device;
- immediate targeted Socket.IO disconnect;
- revoked Client удаляет device identity, MLS state, KeyPackages, decrypted cache и drafts;
- reenrollment создаёт новый lifecycle.

## 7. KeyPackage и Welcome governance

- maximum 25 KeyPackages в одном upload request;
- maximum 32 unclaimed KeyPackages per device;
- maximum 256 unclaimed KeyPackages per user;
- limits enforced atomically в SQLite;
- expired packages очищаются;
- KeyPackage claim one-time и scope-bound;
- Welcome bound к user, device и conversation.

В 3.2.4 pending verified device может запросить создание Welcome:

1. request проходит session, Origin/CSRF, access, ban, verified-device и rate-limit checks;
2. Server отправляет `mls.welcome_requested` только active verified devices, уже состоящим в group;
3. active Client создаёт и подписывает RFC 9420 commit/Welcome;
4. pending Client повторяет bounded one-time claim;
5. при отсутствии active member операция остаётся fail-closed.

Request не содержит private key, exporter secret или plaintext.

## 8. MLS message и recovery validation

Фиксированный profile: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

Server проверяет:

- authenticated account/device;
- active verified membership;
- conversation/group scope;
- monotonic epoch;
- commit hash uniqueness;
- ciphertext replay;
- client/message identity;
- room access.

Client recovery до persistence проверяет:

- exact group/conversation scope;
- contiguous epoch sequence;
- SHA-256 payload/commit hashes;
- duplicate hashes;
- intermediate и final public-state hashes.

Unrecoverable private-state loss завершается explicit error, а не downgrade.

## 9. Ciphertext-only boundary

После MLS activation Server отклоняет plaintext через:

- legacy send/forward/edit;
- drafts и scheduled messages;
- polls;
- bot path;
- multipart/resumable uploads;
- incompatible Socket.IO device session;
- другие legacy message-creation routes.

Secure serializer не возвращает plaintext.

## 10. Encrypted media

Secure files/images/voice используют:

- random AES-256-GCM key и IV;
- AAD, связывающий conversation, attachment ID и media kind;
- plaintext/ciphertext SHA-256 verification;
- exact ciphertext-size check;
- generic `application/octet-stream` storage;
- pending expiry и cancel;
- one-time atomic message claim;
- idempotent matching retry;
- local verified decrypt/preview/playback/download.

Filename, real MIME, caption, duration и waveform находятся внутри MLS content. Если запрещён любой class `files/images/voice`, opaque media path блокируется fail-closed.

## 11. Rate и resource governance

Shared bounded sliding-window limiter применяется к Trust, recovery и E2EE upload routes.

Contract:

- HTTP `429`;
- stable code `RATE_LIMITED`;
- `Retry-After`;
- bounded memory/persistent state;
- expired buckets очищаются maintenance.

Resource ceilings проверяются до или внутри atomic transaction. Client-side hidden action не считается защитой.

## 12. Audit и retention

Trust audit принимает только action-specific primitive allowlist. Arbitrary nested metadata и secret-like values не сохраняются.

Startup и hourly maintenance удаляют:

- expired sessions;
- login history старше 90 дней;
- stale persisted rate-limit buckets;
- expired Trust challenges/KeyPackages и pending upload state по соответствующим TTL.

## 13. Updater и Windows test mode

Packaged Client:

- использует official GitHub Releases provider по умолчанию;
- принимает custom feed только при explicit HTTPS configuration;
- не разрешает downgrade или prerelease update;
- сохраняет code-signature verification;
- не принимает unsigned updater assets как fallback;
- нормализует errors без stack/internal path disclosure.

`--test-mode` только tails local Client log. Он не включает DevTools, renderer Node integration, remote debugging или privileged IPC.

## 14. Server developer console

Console исполняет только allowlisted `DeveloperCommandService` commands:

- no shell;
- no eval;
- no arbitrary filesystem command;
- placeholders `<user>`/`[days]` обрабатываются как inert data;
- IPC возвращает stable `{ code, message }`;
- mutations audit without argument values.

## 15. Metadata limitations

Local Server видит или выводит:

- account/device identifiers;
- membership и conversation scope;
- sender/uploader;
- group/epoch и delivery order;
- attachment ID/ciphertext size;
- timestamps, IP/network/session context;
- Welcome request timing;
- replay hashes и traffic patterns.

Traffic-analysis resistance не заявляется.

## 16. Residual risks и non-guarantees

Не гарантируются:

- защита plaintext от compromised authorized Client;
- восстановление после полной потери private device state;
- retroactive encryption 3.1.x history/files;
- metadata confidentiality;
- independent security certification;
- stable signed Windows distribution без completed signing/runtime gates;
- suitability prerelease для high-risk communications.

## 17. Verification и reporting

См. [Security Policy](../SECURITY.md), [Security Verification Summary](../SECURITY_AUDIT.md), [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) и [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md).

Branch-local security claims регулируются [Branch Documentation Policy](BRANCH_DOCUMENTATION_POLICY.md).
