# Индекс проекта Nexora

## Текущая база

| Параметр | Значение |
|---|---|
| Repository version | `3.4.0` |
| Classification | Release candidate — Stable Core |
| Publication | Заблокирована до verified `v3.3.4`, Authenticode/Windows acceptance и independent security review |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Legacy Trust/MLS API | retired; write paths return `410/LEGACY_READ_ONLY` |
| Local Server database | SQLite schema 8 compatibility layer |

Этот индекс описывает ветку `release/3.4.0-stable-core` и PR #69. До merge он не является описанием опубликованного `main`.

## Entry points

| Файл | Назначение |
|---|---|
| `server/cli.cjs` | Local Server CLI и audited developer commands |
| `electron/server-main.cjs` | Windows Server shell, setup/admin IPC, updater и serialized shutdown |
| `electron/client-main.cjs` | Windows Client, profile isolation, certificate pinning и updater |
| `client/src/main.jsx` | React renderer для Windows, browser/PWA и Android |
| `android/app/.../MainActivity.kt` | Android WebView shell и strict TLS policy |
| `cloud/cli.cjs` | отдельный Pulse Cloud process |

## Local Server

| Файл | Ответственность |
|---|---|
| `server/create-server.cjs` | Application API v3, Socket.IO, sessions, rooms, messages, uploads и lifecycle |
| `server/create-server-v31.cjs` | composition root для Pulse и Stable Core |
| `server/stable-core.cjs` | device inventory/revoke, legacy read-only viewer/export, backup verify и signing status |
| `server/v3-features.cjs` | sync, drafts, scheduled messages, polls, moderation, bots, webhooks и legacy guards |
| `server/events.cjs` | monotonic event stream, visibility и notifications |
| `server/store.cjs` | `node:sqlite`, serialized mutation, FTS5, session metadata и atomic DB replacement |
| `server/schema7.cjs` | schema 6 → 7 migration и downgrade protection |
| `server/trust-schema8.cjs` | schema 7 → 8 compatibility migration, integrity, backup и future-schema guard |
| `server/model.cjs` | authorization, active-ban fail-closed access и safe encrypted-message serialization |
| `server/maintenance.cjs` | backup/verify/restore, retention, quota, rollback и cleanup |
| `server/security.cjs` | passwords, sessions, CSRF и public profiles |
| `server/certificates.cjs` | Local CA, SAN и certificate fingerprints |
| `server/pulse.cjs` | local/production Pulse compatibility contract |

Executable Trust Core, MLS transport, recovery routes and E2EE upload runtime are removed. Schema 8 tables remain only to preserve legacy IDs, timestamps, ciphertext and audit provenance.

## React Client

| Файл | Ответственность |
|---|---|
| `client/src/App.jsx` | auth/bootstrap, session-owned realtime, offline fallback и terminal revoke |
| `client/src/components/Workspace.jsx` | navigation and routing between ordinary and legacy conversations |
| `client/src/components/MessagePane.jsx` | ordinary server-readable messages, media, drafts and uploads |
| `client/src/components/LegacySecureHistoryPane.jsx` | immutable legacy ciphertext/local-cache viewer and export |
| `client/src/components/TrustDevicesCard.jsx` | server-owned device/session inventory and revoke UX |
| `client/src/legacy/legacy-trust-store.js` | read-only access to existing locally decrypted IndexedDB records |
| `client/src/outbox.js` | bounded retry for ordinary messages; terminal archive for old MLS entries |
| `client/src/offline-store.js` | bootstrap/message cache and delta-sync sequence |
| `client/src/api.js` | fetch, CSRF, version, device metadata, stable errors and uploads |

## Desktop, Android and updater

| Файл | Ответственность |
|---|---|
| `electron/client-connection.cjs` | HTTPS URL, Server ID, PEM SHA-256 pinning and explicit repin |
| `electron/update-service.cjs` | signed Client/Server channels, monotonic version and terminal states |
| `electron-builder.client.yml` | signed Windows Client NSIS configuration |
| `electron-builder.server.yml` | signed Windows Server NSIS and `server` metadata channel |
| `scripts/check-release-signing.cjs` | mandatory credential, subject and thumbprint policy |
| `scripts/verify-authenticode.ps1` | signature, signer identity and timestamp verification |
| `.github/workflows/release.yml` | baseline check, signing, n-1→n smoke, immutable tag/assets and re-verification |
| `android/` | Android source, deep link and strict TLS policy |

## Stable Core API

### Sessions and devices

- `GET /api/v3/devices` — active device/session inventory;
- `DELETE /api/v3/devices/:deviceId/sessions` — revoke another device;
- `DELETE /api/v3/devices/sessions/others` — revoke all except current;
- realtime: `session.revoked`, `device.updated`.

### Legacy secure history

- `GET /api/v3/legacy-secure/conversations`;
- `GET /api/v3/legacy-secure/conversations/:conversationId/messages`;
- `POST /api/v3/legacy-secure/conversations/:conversationId/export`;
- realtime state: `legacy_secure_history.state`;
- every Trust/E2EE write path and MLS socket mutation returns `LEGACY_READ_ONLY`.

### Operations

- `POST /api/v3/admin/backups/verify` — verify without restore;
- `GET /api/admin/release/signing-status` — safe operator status without secret/certificate material.

Mutating browser requests require authentication, Origin/CSRF, resource scope, permission, active policy, validation and rate/resource controls. Errors use `{ code, message, requestId, details }`.

## Tests and release gates

| Test/module | Scope |
|---|---|
| `test/stable-core.test.cjs` | inventory grouping and ciphertext-safe serialization |
| `test/trust-socket.test.cjs` | immediate targeted device disconnect and legacy socket rejection |
| `test/e2ee-runtime-guards.test.cjs` | direct API bypass attempts and no plaintext persistence |
| `test/e2ee-attachments.test.cjs` | immutable legacy attachment history/export |
| `test/stable-core-reliability.test.cjs` | backup verify, rollback, future schema and disk-full failpoint |
| `test/update-service.test.cjs` | Client/Server channels, tamper errors and no-downgrade |
| `test/security-hardening-3.2.3.test.cjs` | CSRF, bans, cleanup, admin signing status and retired APIs |
| `scripts/security-audit.cjs` | Stable Core controls and production dependency audit |
| `test/performance.test.cjs` | schema 8 performance and integrity |
| `scripts/soak-test.cjs` | long-running state, backup and integrity |

## Verification commands

| Команда | Назначение |
|---|---|
| `npm run check` | syntax, builder config and production web build |
| `npm run test:unit` | unit/API/integration/realtime suite |
| `npm run test:performance` | isolated performance smoke |
| `npm run audit:security` | security invariants and dependency audit |
| `npm run release:consistency` | version/docs/evidence consistency |
| `npm run release:check` | complete local release gate |
| `npm run test:soak` | long-running integrity and backup validation |
| `gradle -p android :app:assembleDebug --no-daemon` | Android source build |
| `npm run release:windows:signed` | signed Windows build after external prerequisites are configured |

## Release blockers

The branch must remain draft and must not publish `v3.4.0` while any item remains:

1. verified published stable `v3.3.4` is absent;
2. Authenticode credentials/expected signer identity are unavailable;
3. Windows 10/11 installed and n-1→n acceptance is incomplete;
4. independent review has unresolved or unperformed high/critical scope;
5. required CI/release checks are not green.
