# Модель безопасности Nexora 3.4.0 Stable Core

## Status and scope

| Параметр | Значение |
|---|---|
| Version | `3.4.0` release candidate |
| Distribution | not published; stable publication is blocked |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Legacy Trust/MLS | runtime removed; immutable compatibility history only |
| Local Server database | SQLite schema 8 |
| Independent review | pending; no production security claim is made |

This document defines the implemented security boundary. It is not an independent audit, cryptographic certification or guarantee for an operator's deployment.

## Protected assets

- local accounts, password/TOTP state and sessions;
- device inventory and profile/certificate pins;
- room membership, roles, bans, restrictions and policies;
- ordinary messages, uploads, audit and realtime visibility;
- legacy MLS ciphertext, IDs, timestamps and provenance;
- SQLite, WAL, backups and file store;
- updater metadata, installers, checksums and signing credentials;
- Cloud Identity, Pulse ledger, receipts and signed entitlements;
- CA, bot, webhook, provider and service credentials.

## Threat actors and failure classes

- unauthenticated or CSRF-capable browser client;
- room member attempting IDOR/role escalation;
- removed, banned or session-revoked user;
- compromised device/session;
- replay, duplicate delivery, stale offline state and races;
- malicious uploads, path traversal, MIME spoofing and resource exhaustion;
- corrupt WAL/DB, disk-full and interrupted migration/restore;
- tampered, unsigned or downgraded update;
- secret leakage through logs, diagnostics or release evidence;
- legacy MLS write-path resurrection or accidental plaintext conversion.

## Unified authorization pipeline

Each REST, Socket.IO, worker or administrative operation must establish:

1. valid authentication/session and current device scope;
2. allowed Origin and CSRF for browser mutations;
3. resource existence within current server/tenant scope;
4. membership or another lawful access relation;
5. role/permission and privilege hierarchy;
6. active ban/block/revoke and room policy;
7. validated input and legal state transition;
8. rate/resource limit;
9. atomic/idempotent side effect where retries or races are possible.

A client guard is never an authorization control.

## Sessions and devices

Active sessions form the server-owned device inventory. Session records include device identity metadata, creation, last-seen and expiry.

Revocation removes target sessions and immediately:

- emits `session.revoked` only to target session rooms;
- disconnects target Socket.IO connections;
- emits `device.updated` for the account;
- prevents later REST/realtime access because authentication resolves against current store state.

The remote revoke endpoint refuses the current device with `STATE_CONFLICT`; logout is the explicit terminal action.

Electron uses a per-Server-ID partition for cookies, IndexedDB and cache. Certificate/Server-ID changes are blocked until explicit repin; silent trust replacement is prohibited.

## Legacy Trust/MLS boundary

The executable Trust/MLS runtime and `ts-mls` dependency are removed. No route, socket handler, background worker or upload service may create, modify, recover or decrypt legacy groups.

Security invariants:

- schema 8 records are preserved;
- ciphertext is never represented as false plaintext;
- server export contains ciphertext metadata and `serverDecrypted: false`;
- optional locally decrypted content is read only from pre-existing client IndexedDB records;
- every `/api/v4/trust*` and `/api/v4/e2ee*` mutation returns `410/LEGACY_READ_ONLY`;
- `mls:message` and `mls:message-edit` are rejected with the same code;
- ordinary conversations never depend on MLS bootstrap or epoch synchronization;
- old MLS outbox entries are archived terminally and never replayed through ordinary plaintext send.

## CSRF, Origin and sessions

Browser mutations require a session-bound CSRF token and accepted Origin. Session cookies remain `HttpOnly`, `SameSite` and `Secure` where TLS is active. Authentication failures use `AUTH_REQUIRED`; CSRF/Origin failures use stable safe errors and include a request ID.

## Rooms, roles and bans

Authorization resolves room scope server-side. User-supplied room/owner IDs do not establish access. Active bans override stale membership. Owner/moderator/member boundaries and higher-privilege subject protection remain enforced in the existing room services.

When access is lost, the user must stop receiving REST data, replayed offline data and realtime events.

## Upload security

Ordinary upload paths enforce server-side size, actual MIME/type inspection, safe names/paths, checksums, quota and room policy. Rejected multipart/resumable data is cancelled or removed. Executable/dangerous data remains prohibited by existing allow/deny policy.

Legacy encrypted-upload paths are unavailable and fail before reserving file/message/replay records.

## Backup, migration and restore

Before schema mutation:

- source database integrity is checked;
- WAL is checkpointed;
- current schema is read and future schema is rejected;
- free space is checked;
- a backup is created and verified.

Migration is transactional/idempotent and occurs before network listen. Restore validates staged database and uploads, swaps them under a file lock and rolls both back on failure. Temporary decrypted/staged data is removed on success and error.

The verification API validates an existing backup without changing the live DB or file store.

## Updater and release chain

Stable Client and Server installers require:

- a complete signing policy (`CSC_LINK`, password, expected subject and thumbprint);
- valid Authenticode signature and timestamp;
- checksum/metadata verification;
- separate `latest` and `server` channels;
- monotonic version and `allowDowngrade = false`;
- no unsigned fallback;
- immutable tag/assets and re-download verification.

Signature/checksum failures map to `UPDATE_SIGNATURE_INVALID`. Custom feeds must use HTTPS. Unsigned test assets use a distinct prerelease tag and cannot include updater metadata.

Signing credentials are read only in the protected release environment and are never returned by the signing-status API, logs or evidence.

## Error and logging controls

Errors expose only stable `{ code, message, requestId, details }`; compatibility `error` mirrors the safe message. Stack, SQL, filesystem paths, tokens, keys and provider secrets are not returned.

Structured logs use correlation IDs and recursive redaction. Updater logs redact local paths. Metrics must avoid message content, credentials and high-cardinality user/object identifiers.

## Rate/resource governance

Bounded sliding-window limits protect login, messaging, uploads and other existing operations. `RATE_LIMITED` responses carry `Retry-After`. The client ordinary outbox uses bounded exponential retry, respects terminal errors and stops after a maximum number of attempts.

## Verification coverage

Automated coverage includes:

- direct legacy HTTP/socket bypass attempts;
- no plaintext persistence and no temporary upload leakage;
- active-ban fail-closed access;
- CSRF before device revoke;
- immediate session disconnect;
- backup verify/rollback/disk-full/future-schema failpoints;
- updater tamper/no-downgrade/channel separation;
- production dependency audit;
- schema 8 soak and Android strict TLS build.

## Residual risks and mandatory external gates

- no verified stable `v3.3.4` baseline is currently available;
- Authenticode credentials and installed Windows 10/11 acceptance are external;
- independent security review has not yet closed the required scope;
- legacy ciphertext can be human-readable only when a previous client retained locally decrypted cache;
- a compromised operator/OS account remains outside application-only protection.

These conditions prohibit merge to a release commit, official `v3.4.0` tag and stable GitHub Release.
