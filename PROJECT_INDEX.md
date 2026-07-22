# Индекс проекта Nexora 3.2.0 — development

Этот индекс описывает PR #12 поверх stable Nexora 3.1.2. Production baseline остаётся `main`; Trust Core/MLS модули не считаются independently audited до отдельного release.

## Точки запуска

| Файл | Назначение |
|---|---|
| `server/cli.cjs` | консольный Nexora Local Server и audited developer commands |
| `electron/server-main.cjs` | Windows Server shell, setup/admin IPC и graceful shutdown |
| `electron/client-main.cjs` | Windows Client, trusted servers, isolated sessions и updater lifecycle |
| `client/src/main.jsx` | общий React renderer для desktop/browser/PWA/Android |
| `android/app/.../MainActivity.kt` | Android WebView shell, server picker и strict TLS policy |
| `cloud/cli.cjs` | запуск отдельного Pulse Cloud process |

## Local Server

| Файл | Ответственность |
|---|---|
| `server/create-server.cjs` | production composition: API v3, Socket.IO, Trust mount, operational runtime и graceful drain |
| `server/create-server-v31.cjs` | Cloud Identity/Pulse API, developer commands и 3.1.x integration layer |
| `server/v3-features.cjs` | sync, drafts, scheduled messages, polls, moderation, bots, webhooks, resumable upload и MLS plaintext guards |
| `server/events.cjs` | монотонный event stream, visibility и notifications |
| `server/store.cjs` | `node:sqlite`, transactional mutation, FTS5 и base data model |
| `server/schema7.cjs` | schema 6 → 7 migration и downgrade protection |
| `server/trust-schema8.cjs` | schema 7 → 8 backup/integrity migration, idempotency и downgrade protection |
| `server/trust-core.cjs` | device challenges, public key directory, KeyPackages, groups, epochs, Welcome, replay и audit |
| `server/trust-routes.cjs` | Trust API v4: registration, list, verify/revoke, groups, KeyPackages, Welcome и ciphertext delivery |
| `server/trust-recovery.cjs` | targeted KeyPackage claim и contiguous missed-commit recovery |
| `server/trust-recovery-routes.cjs` | recovery REST endpoints и conversation scope enforcement |
| `server/mls-transport.cjs` | ciphertext-only Socket.IO transport, authorization, epoch/replay checks и delivery |
| `server/model.cjs` | permissions, API serialization и ciphertext-only encrypted message view |
| `server/local-pulse.cjs` | account links, verified entitlement cache, event inbox/outbox и room product state |
| `server/maintenance.cjs` | backup/restore, retention, quota и orphan cleanup |
| `server/totp.cjs` | local TOTP, recovery codes и AES-256-GCM secret storage |
| `server/security.cjs` | passwords, sessions, CSRF и public profiles |
| `server/certificates.cjs` | local CA, SAN и certificate fingerprints |
| `server/pulse.cjs` | local/production Pulse compatibility contract |

Schema 8 добавляет Trust/MLS directory и delivery state, но не переписывает existing messages/files. Миграция выполняется до traffic после integrity/free-space checks и verified backup.

## Pulse Cloud

| Файл | Ответственность |
|---|---|
| `cloud/create-cloud-server.cjs` | базовый Pulse Cloud REST/billing composition |
| `cloud/create-cloud-server-v12.cjs` | Cloud Identity, OAuth, workers, operational health и 3.1.x routes |
| `cloud/identity-service.cjs` | registration, email verification, MFA, sessions и OAuth 2.1 PKCE |
| `cloud/store.cjs` | billing/ledger persistence и transactional invariants |
| `cloud/stripe-provider.cjs` | provider-hosted checkout и webhook adapter |
| `cloud/worker-service.cjs` | email, event delivery, reconciliation и expiry workers |
| `cloud/operational-runtime.cjs` | liveness/readiness, metrics, request IDs, redaction и drain state |

Pulse Cloud не хранит local messages, rooms, files, Local Server passwords, Trust private keys или local CA private key.

## React Client

| Файл | Ответственность |
|---|---|
| `client/src/App.jsx` | session/bootstrap, Trust configure, offline fallback, delta sync и outbox lifecycle |
| `client/src/components/Workspace.jsx` | navigation, rooms, moderation, integrations и secure/legacy message pane selection |
| `client/src/components/MessagePane.jsx` | legacy history, threads, polls, drafts и resumable upload |
| `client/src/components/SecureMessagePane.jsx` | ciphertext-only composer/history/search/edit/reply/reaction и fail-closed media UI |
| `client/src/components/TrustDevicesCard.jsx` | fingerprint, verify/revoke, self-revoke local wipe и device status |
| `client/src/components/SettingsPage.jsx` | profile, TOTP, Trust devices, sessions, notification/PWA preferences |
| `client/src/crypto/mls-engine.js` | `ts-mls@1.6.2` positional adapter, group/commit/Welcome/application processing |
| `client/src/crypto/mls-members.js` | credential/member directory extraction |
| `client/src/crypto/trust-client.js` | device lifecycle, KeyPackage pool, group create/join/recovery и encrypted send preparation |
| `client/src/crypto/trust-device-management.js` | signed verify/revoke challenge-response и self-revoke scope cleanup |
| `client/src/crypto/trust-store.js` | AES-GCM IndexedDB wrapping for device/MLS state/cache/drafts |
| `client/src/outbox.js` | durable idempotent legacy and MLS ciphertext queue |
| `client/src/offline-store.js` | legacy IndexedDB bootstrap/message cache |
| `client/src/api.js` | fetch/CSRF/Client version и chunk upload |
| `client/public/sw.js` | application-shell cache без API/Socket.IO |

## Desktop, Android и release

| Файл | Ответственность |
|---|---|
| `electron/client-connection.cjs` | HTTPS URL, public/local address, SAN и PEM SHA-256 |
| `electron/update-service.cjs` | signed Client updater, single-flight checks и stable diagnostic reasons |
| `android/` | Gradle Android source, deep link и strict TLS policy |
| `electron-builder.*.yml` | отдельные NSIS Client/Server installers |
| `.github/workflows/ci.yml` | Windows/Linux/Android verification |
| `.github/workflows/release.yml` | immutable tag, source/PWA/SBOM и conditional signed release |
| `scripts/security-audit.cjs` | stable security invariants плюс Trust/MLS downgrade, key/storage/replay assertions |
| `scripts/sync-release-metadata.cjs` | package/lockfile/Android/Client handshake version synchronization |

## API-группы

Stable API:

- `/api/auth/*`, `/api/users/me*`, `/api/users/:id/profile`, `/api/sessions*`;
- `/api/v3/sync`, `/api/v3/drafts*`, `/api/notifications*`;
- `/api/rooms*` — membership, roles, moderation, invites, reports и audit;
- `/api/conversations/:id/messages|polls|media|upload|uploads|settings`;
- `/api/messages/:id/edits|report|moderation|bookmark|listened`;
- `/api/v3/bot/*`, `/api/bots/*`, room webhooks/integrations;
- `/api/v3/cloud-account/*`, `/api/v3/pulse/*` и room-scoped Pulse;
- `/healthz/live`, `/healthz/ready`, `/metrics`, `/api/admin/*`.

Trust API v4:

- `POST /api/v4/trust/challenges`;
- device registration/list/detail/verify/revoke routes;
- user device/key-package discovery and targeted claim;
- conversation MLS group create/read;
- group commit create/list recovery;
- Welcome claim;
- ciphertext message delivery/read routes.

Mutating browser requests require session, Origin and CSRF. Trust mutations additionally require `X-Nexora-Device-ID` and an active scoped challenge where applicable. Client handshake version is `3.2.0`.

## Tests

| Файл | Назначение |
|---|---|
| `test/trust-schema8.test.cjs` | migration/idempotency/downgrade protection |
| `test/trust-clock.test.cjs` | functional clock compatibility and challenge TTL |
| `test/trust-core.test.cjs` | device proofs, KeyPackage, group epoch/replay and revocation |
| `test/trust-recovery.test.cjs` | targeted KeyPackage, Welcome scope and commit continuity |
| `test/e2ee-plaintext-guards.test.cjs` | direct legacy downgrade attempts |
| `test/mls-interoperability.test.cjs` | Alice/Bob KeyPackage → Welcome → encrypt/decrypt cycle |
| `test/pulse-local-integration.test.cjs` | Pulse compatibility on schema 8 |

## Проверки

| Команда | Назначение |
|---|---|
| `npm run check` | Node syntax, builder config и Vite production build |
| `npm test` | web build + full unit/API/integration/reliability/load/UI suite |
| `npm run test:unit` | Node test suite without repeated web build |
| `npm run audit:security` | stable + Trust/MLS invariants and production dependency audit |
| `npm run release:check` | release-sensitive build, metadata and full test/security gate |
| `npm run test:soak` | integrity soak, по умолчанию 60 минут |
| `gradle -p android :app:assembleDebug --no-daemon` | Android source build |
| `npm run dist:windows` | local test NSIS Client/Server |
| `npm run release:windows` | release checks, signing gate и installers |
