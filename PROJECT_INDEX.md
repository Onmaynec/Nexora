# Nexora Project Index

## Current baseline

| Property | Value |
|---|---|
| Repository version | `3.2.0` |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS API | v4 |
| Local Server database | SQLite schema 8 |

This index maps the current `main` implementation. For architecture and security boundaries, use [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

## Entry points

| File | Responsibility |
|---|---|
| `server/cli.cjs` | Local Server CLI and audited developer commands |
| `electron/server-main.cjs` | Windows Server shell, setup/admin IPC and graceful shutdown |
| `electron/client-main.cjs` | Windows Client, server trust, isolated sessions and updater lifecycle |
| `client/src/main.jsx` | shared React renderer for desktop, browser/PWA and Android |
| `android/app/.../MainActivity.kt` | Android WebView shell, server picker and strict TLS policy |
| `cloud/cli.cjs` | separate Pulse Cloud process |

## Local Server

| File | Responsibility |
|---|---|
| `server/create-server.cjs` | production composition, API v3/v4, Socket.IO, runtime and shutdown |
| `server/create-server-v31.cjs` | Cloud Identity/Pulse API and 3.1.x integration layer |
| `server/v3-features.cjs` | sync, drafts, scheduled messages, polls, moderation, bots, webhooks and legacy guards |
| `server/events.cjs` | monotonic event stream, visibility and notifications |
| `server/store.cjs` | `node:sqlite`, transactional mutation, FTS5 and base persistence |
| `server/schema7.cjs` | schema 6 → 7 migration and downgrade protection |
| `server/trust-schema8.cjs` | schema 7 → 8 migration, backup/integrity and downgrade protection |
| `server/trust-core.cjs` | device challenges, directory, KeyPackages, groups, epochs, Welcome, replay and audit |
| `server/trust-routes.cjs` | Trust API v4 device/group/message routes |
| `server/trust-recovery.cjs` | targeted KeyPackage claim and contiguous commit recovery |
| `server/trust-recovery-routes.cjs` | recovery routes and scope enforcement |
| `server/mls-transport.cjs` | device-scoped ciphertext Socket.IO transport |
| `server/e2ee-attachments.cjs` | opaque encrypted attachment upload, validation, expiry and claim |
| `server/model.cjs` | permissions, API serialization and encrypted-message view |
| `server/local-pulse.cjs` | Cloud links, verified entitlement cache and event state |
| `server/maintenance.cjs` | backup/restore, retention, quota and orphan cleanup |
| `server/totp.cjs` | local TOTP, recovery codes and encrypted secret storage |
| `server/security.cjs` | passwords, sessions, CSRF and public profiles |
| `server/certificates.cjs` | Local CA, SAN and certificate fingerprints |
| `server/pulse.cjs` | local/production Pulse compatibility contract |

## Pulse Cloud

| File | Responsibility |
|---|---|
| `cloud/create-cloud-server.cjs` | base Cloud REST and billing composition |
| `cloud/create-cloud-server-v12.cjs` | Cloud Identity, workers, operational runtime and management routes |
| `cloud/identity-service.cjs` | registration, email verification, MFA, sessions and OAuth 2.1 PKCE |
| `cloud/store.cjs` | billing/ledger persistence and transactional invariants |
| `cloud/stripe-provider.cjs` | provider-hosted checkout and webhook adapter |
| `cloud/worker-service.cjs` | email, event delivery, reconciliation and expiry workers |
| `cloud/operational-runtime.cjs` | liveness/readiness, metrics, request IDs, redaction and drain |

Pulse Cloud does not store local message content, room history, local files, Local Server passwords, Trust private keys or Local CA private key.

## React Client

| File | Responsibility |
|---|---|
| `client/src/App.jsx` | session/bootstrap, Trust configuration, offline fallback and outbox lifecycle |
| `client/src/components/Workspace.jsx` | navigation, rooms, moderation, integrations and message-pane selection |
| `client/src/components/MessagePane.jsx` | legacy messages, threads, polls, drafts and resumable upload |
| `client/src/components/SecureMessagePane.jsx` | secure messaging, encrypted media, local decrypt/preview and fail-closed UI |
| `client/src/components/TrustDevicesCard.jsx` | fingerprint, verify/revoke and self-wipe |
| `client/src/components/SettingsPage.jsx` | profile, TOTP, Trust devices, sessions and preferences |
| `client/src/crypto/mls-engine.js` | `ts-mls@1.6.2` adapter and MLS lifecycle |
| `client/src/crypto/mls-members.js` | credential/member extraction |
| `client/src/crypto/trust-client.js` | device lifecycle, KeyPackage pool, group/recovery and secure send preparation |
| `client/src/crypto/trust-device-management.js` | signed verify/revoke and local scope cleanup |
| `client/src/crypto/trust-store.js` | encrypted IndexedDB device/MLS/cache/draft records |
| `client/src/outbox.js` | durable idempotent legacy and MLS ciphertext queue |
| `client/src/offline-store.js` | legacy bootstrap/message cache |
| `client/src/api.js` | fetch, CSRF, Client version and legacy upload helpers |
| `client/public/sw.js` | application-shell cache without API/Socket.IO |

## Desktop, Android and release

| File | Responsibility |
|---|---|
| `electron/client-connection.cjs` | HTTPS URL, SAN, Server ID and PEM SHA-256 trust |
| `electron/update-service.cjs` | signed updater, single-flight checks and stable diagnostics |
| `android/` | Android source, deep link and strict TLS policy |
| `electron-builder.client.yml` | Windows Client NSIS configuration |
| `electron-builder.server.yml` | Windows Server NSIS configuration |
| `.github/workflows/ci.yml` | Windows, Linux, release-gate, soak and Android verification |
| `.github/workflows/release.yml` | immutable tag, Source/PWA/SBOM and conditional signed assets |
| `scripts/security-audit.cjs` | security invariants and dependency audit |
| `scripts/sync-release-metadata.cjs` | package/lock/Android/handshake version synchronization |
| `scripts/run-unit-tests.cjs` | isolated functional suite |
| `test/performance.test.cjs` | isolated schema 8 performance budget |

## API groups

### Application API v3

- `/api/auth/*`, `/api/users/me*`, `/api/users/:id/profile`, `/api/sessions*`;
- `/api/v3/sync`, `/api/v3/drafts*`, `/api/notifications*`;
- `/api/rooms*` for membership, roles, moderation, invitations, reports and audit;
- `/api/conversations/:id/messages|polls|media|upload|uploads|settings`;
- `/api/messages/:id/edits|report|moderation|bookmark|listened`;
- `/api/v3/bot/*`, `/api/bots/*`, room webhooks and integrations;
- `/api/v3/cloud-account/*`, `/api/v3/pulse/*` and room-scoped Pulse;
- `/healthz/live`, `/healthz/ready`, `/metrics`, `/api/admin/*`.

### Trust/MLS API v4

- Trust challenge creation;
- device registration, list, detail, verification and revocation;
- user device and KeyPackage discovery;
- scoped KeyPackage claim;
- MLS group create/read;
- commit create/recovery;
- Welcome claim;
- ciphertext message send/read;
- opaque encrypted attachment upload, cancel, claim and download.

Mutating browser requests require session, Origin and CSRF. Trust operations additionally require active device scope and signed/scoped challenges where applicable.

## Key test coverage

| Test | Scope |
|---|---|
| `test/trust-schema8.test.cjs` | migration, idempotency and downgrade protection |
| `test/trust-clock.test.cjs` | functional clock and challenge TTL |
| `test/trust-core.test.cjs` | device proofs, KeyPackages, groups, epochs, replay and revocation |
| `test/trust-recovery.test.cjs` | targeted claim, Welcome scope and commit continuity |
| `test/trust-socket.test.cjs` | device-scoped delivery and targeted disconnect |
| `test/e2ee-plaintext-guards.test.cjs` | direct legacy downgrade attempts |
| `test/mls-interoperability.test.cjs` | Alice/Bob MLS interoperability |
| `test/e2ee-attachments.test.cjs` | encrypted attachment construction and validation |
| `test/e2ee-attachment-transport.test.cjs` | opaque attachment REST/Socket.IO lifecycle |
| `test/store-queue.test.cjs` | mutation queue recovery after rejected operation |
| `test/pulse-local-integration.test.cjs` | Pulse compatibility on schema 8 |
| `test/performance.test.cjs` | 20-client / 120-message performance budget and integrity |

## Verification commands

| Command | Purpose |
|---|---|
| `npm run check` | syntax, builder configuration and production web build |
| `npm run test:unit` | unit/API/integration suite |
| `npm run test:performance` | isolated performance test |
| `npm test` | web build plus functional and performance suites |
| `npm run audit:security` | security invariants and dependency audit |
| `npm run release:check` | synchronized metadata and complete release-sensitive gate |
| `npm run test:soak` | long-running state, backup and integrity validation |
| `gradle -p android :app:assembleDebug --no-daemon` | Android source build |
| `npm run dist:windows` | local test NSIS packages |
| `npm run release:windows` | release gate, signing gate and Windows installers |
