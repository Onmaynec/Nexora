# Индекс проекта Nexora

## Текущая база

| Параметр | Значение |
|---|---|
| Repository version | `3.3.2` |
| Distribution | Published `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |
| Advanced documentation | `https://onmaynec.github.io/Nexora/advanced/` |

Этот индекс отражает текущий `main`. Архитектурные и security boundaries: [Architecture](docs/ARCHITECTURE.md), [Security Model](docs/SECURITY_MODEL.md), [Security Policy](SECURITY.md). Инженерный портал и правила его генерации описаны в [Advanced Documentation](docs/ADVANCED_DOCUMENTATION.md).

## Entry points

| Файл | Назначение |
|---|---|
| `server/cli.cjs` | Local Server CLI и audited developer commands |
| `electron/server-main.cjs` | Windows Server shell, setup/admin IPC и serialized graceful shutdown |
| `electron/client-main.cjs` | Windows Client, server trust, isolated sessions и updater lifecycle |
| `client/src/main.jsx` | общий React renderer для desktop, browser/PWA и Android |
| `advanced-website/src/main.jsx` | отдельный React/Vite renderer продвинутой документации |
| `advanced-website/scripts/generate-content.mjs` | package/repository/release source index, REST/realtime extraction и OpenAPI 3.1 generation |
| `android/app/.../MainActivity.kt` | Android WebView shell, server picker и strict TLS policy |
| `cloud/cli.cjs` | отдельный Pulse Cloud process |

## Local Server

| Файл | Ответственность |
|---|---|
| `server/create-server.cjs` | production composition, API v3/v4, Socket.IO, runtime и shutdown |
| `server/create-server-v31.cjs` | Cloud Identity/Pulse API и integration layer |
| `server/v3-features.cjs` | sync, drafts, scheduled messages, polls, moderation, bots, webhooks и legacy guards |
| `server/events.cjs` | monotonic event stream, visibility и notifications |
| `server/store.cjs` | `node:sqlite`, serialized transactional mutation, FTS5 и base persistence |
| `server/schema7.cjs` | schema 6 → 7 migration и downgrade protection |
| `server/trust-schema8.cjs` | schema 7 → 8 migration, backup/integrity и downgrade protection |
| `server/trust-core.cjs` | device proof, BasicCredential binding, limits, KeyPackages, groups, epochs, Welcome, replay и audit |
| `server/trust-routes.cjs` | Trust API v4 device/group/message routes, MLS Welcome request и route limiting |
| `server/mls-welcome-recovery.cjs` | verified requester validation и device-scoped Welcome recovery notification |
| `server/trust-recovery.cjs` | targeted KeyPackage claim и contiguous commit recovery |
| `server/trust-recovery-routes.cjs` | recovery scope, rate limit и response contract |
| `server/mls-transport.cjs` | device-scoped ciphertext Socket.IO transport |
| `server/e2ee-attachments.cjs` | opaque attachment upload, ciphertext bounds, quota, expiry и claim |
| `server/rate-limit.cjs` | shared memory-bounded sliding-window limiter и persistent cleanup support |
| `server/model.cjs` | permissions, active-ban fail-closed access и encrypted-message serialization |
| `server/local-pulse.cjs` | Cloud links, verified entitlement cache и event state |
| `server/maintenance.cjs` | backup/restore, retention, quota, orphan и security-state cleanup |
| `server/totp.cjs` | local TOTP, recovery codes и encrypted secret storage |
| `server/security.cjs` | passwords, sessions, CSRF и public profiles |
| `server/certificates.cjs` | Local CA, SAN и certificate fingerprints |
| `server/pulse.cjs` | local/production Pulse compatibility contract |

## Pulse Cloud

| Файл | Ответственность |
|---|---|
| `cloud/create-cloud-server.cjs` | base Cloud REST и billing composition |
| `cloud/create-cloud-server-v12.cjs` | Cloud Identity, workers, operational runtime и management routes |
| `cloud/identity-service.cjs` | registration, email verification, MFA, sessions и OAuth 2.1 PKCE |
| `cloud/store.cjs` | billing/ledger persistence и transactional invariants |
| `cloud/stripe-provider.cjs` | provider-hosted checkout и webhook adapter |
| `cloud/worker-service.cjs` | email, event delivery, reconciliation и expiry workers |
| `cloud/operational-runtime.cjs` | liveness/readiness, metrics, request IDs, redaction и drain |

Pulse Cloud не хранит local message content, room history, local files, Local Server passwords, Trust private keys или Local CA private key.

## React Client

| Файл | Ответственность |
|---|---|
| `client/src/App.jsx` | authentication bootstrap-before-Trust, Trust configuration, offline fallback и outbox lifecycle |
| `client/src/components/Workspace.jsx` | navigation, rooms, moderation, integrations и message-pane selection |
| `client/src/components/MessagePane.jsx` | legacy messages, threads, polls, drafts и resumable upload |
| `client/src/components/SecureMessagePane.jsx` | secure messaging, encrypted media, local decrypt/preview и fail-closed UI |
| `client/src/components/TrustDevicesCard.jsx` | fingerprint, verify/revoke и self-wipe |
| `client/src/components/SettingsPage.jsx` | profile, TOTP, Trust devices, sessions, preferences и observable Client update controls |
| `client/src/crypto/mls-engine.js` | `ts-mls@1.6.2` adapter и MLS lifecycle |
| `client/src/crypto/mls-members.js` | credential/member extraction |
| `client/src/crypto/mls-recovery.mjs` | strict group scope, epoch, commit hash и public-state validation |
| `client/src/crypto/trust-client.js` | device lifecycle, BasicCredential creation, KeyPackage pool, commit recovery и automatic Welcome request/claim |
| `client/src/crypto/trust-device-management.js` | signed verify/revoke и local scope cleanup |
| `client/src/crypto/trust-store.js` | encrypted IndexedDB device/MLS/cache/draft records |
| `client/src/outbox.js` | durable idempotent legacy и MLS ciphertext queue |
| `client/src/offline-store.js` | legacy bootstrap/message cache |
| `client/src/api.js` | fetch, CSRF, Client version, Trust/recovery и upload helpers |
| `client/public/sw.js` | application-shell cache без API/Socket.IO |

## Advanced Documentation

| Файл | Ответственность |
|---|---|
| `advanced-website/src/App.jsx` | hash routing, bilingual UI, search, TOC, version selector, source links, Mermaid и Aether background |
| `advanced-website/src/content.js` | 27 curated RU/EN engineering sections |
| `advanced-website/scripts/generate-content.mjs` | current version, Markdown/release import, REST/realtime/error extraction и conservative OpenAPI |
| `advanced-website/scripts/validate.mjs` | content, route contract, accessibility marker, responsive and output validation |
| `advanced-website/content/` | historical Documentation Kit snapshots with explicit outdated-content boundary |
| `website/advanced-link.js` | единственное функциональное дополнение к существующему beginner website |
| `.github/workflows/advanced-docs.yml` | pull-request tests and production build artifact |
| `.github/workflows/pages.yml` | composition and deployment of both websites through GitHub Pages |

## Desktop, Android и release

| Файл | Ответственность |
|---|---|
| `electron/client-connection.cjs` | HTTPS URL, SAN, Server ID и PEM SHA-256 trust |
| `electron/update-service.cjs` | GitHub signed updater, scheduled/single-flight checks, terminal fallback и stable diagnostics |
| `electron/release-experience.cjs` | post-update summary state, official release link и Windows test-log console |
| `electron/server-main.cjs` | single-flight stop/quit и stopped-state handling |
| `android/` | Android source, deep link и strict TLS policy |
| `electron-builder.client.yml` | Windows Client NSIS configuration |
| `electron-builder.server.yml` | Windows Server NSIS configuration |
| `.github/workflows/ci.yml` | Windows, Linux, release-gate, soak и Android verification |
| `.github/workflows/release.yml` | immutable tag, Source/PWA/SBOM и conditional signed assets |
| `.github/workflows/current-release-guard.yml` | current release drift guard для main и pull requests |
| `scripts/security-audit.cjs` | application, Trust/MLS, resource-limit и dependency invariants |
| `scripts/sync-release-metadata.cjs` | package/lock/Android/handshake version synchronization |
| `scripts/check-release-consistency.cjs` | CI gate для package, lock, Android, current docs и release evidence |
| `scripts/verify-release-assets.cjs` | post-publication download, checksum и smoke verification |
| `scripts/run-unit-tests.cjs` | isolated functional suite |
| `test/performance.test.cjs` | warmed schema 8 performance budget и integrity |

## API groups

### Application API v3

- `/api/auth/*`, `/api/users/me*`, `/api/users/:id/profile`, `/api/sessions*`;
- `/api/v3/sync`, `/api/v3/drafts*`, `/api/notifications*`;
- `/api/rooms*` — membership, roles, moderation, invitations, reports и audit;
- `/api/conversations/:id/messages|polls|media|upload|uploads|settings`;
- `/api/messages/:id/edits|report|moderation|bookmark|listened`;
- `/api/v3/bot/*`, `/api/bots/*`, room webhooks и integrations;
- `/api/v3/cloud-account/*`, `/api/v3/pulse/*` и room-scoped Pulse;
- `/healthz/live`, `/healthz/ready`, `/metrics`, `/api/admin/*`.

### Trust/MLS/encrypted-media API v4

- Trust challenge creation;
- device registration, list, detail, verification и revocation;
- user device и KeyPackage discovery;
- bounded KeyPackage upload и scoped claim;
- MLS group create/read;
- commit create/recovery;
- Welcome request from an active verified group device and one-time Welcome claim;
- ciphertext message send/read;
- opaque encrypted attachment upload, cancel, claim и download.

Mutating browser requests требуют session, Origin и CSRF. Trust operations дополнительно требуют active device scope, credential/signature validation и route/resource limits.

## Ключевые лимиты, действующие в 3.3.2

| Ресурс | Лимит |
|---|---|
| Active Trust devices на user | 16 |
| KeyPackages в одном upload request | 25 |
| Unclaimed KeyPackages на device | 32 |
| Unclaimed KeyPackages на user | 256 |

Trust/recovery/E2EE routes используют bounded sliding-window limiter и возвращают `RATE_LIMITED` с `Retry-After`.

## Ключевое тестовое покрытие

| Тест | Scope |
|---|---|
| `test/regression-3.2.1.test.cjs` | bootstrap-before-Trust и Server shutdown/closed-state status |
| `test/regression-3.2.2.test.cjs` | Trust layout ordering и safe pre-configuration draft read |
| `test/security-hardening-3.2.3.test.cjs` | credential/key roles, limits, rate limiting, bans, cleanup и strict recovery |
| `test/update-service.test.cjs` | GitHub provider, manual terminal fallback, scheduling и updater errors |
| `test/client-update-ui.test.cjs` | progress, terminal result, retry и duplicate-check prevention |
| `test/developer-commands.test.cjs` | registry execution, audit и copied placeholder normalization |
| `test/mls-welcome-recovery.test.cjs` | verified pending-device request и redundant-request suppression |
| `test/release-experience.test.cjs` | post-update dialog, dismissal, GitHub details link и test-mode switch |
| `test/release-consistency.test.cjs` | единая версия и отказ при Android/documentation drift |
| `test/release-3.3.2-regressions.test.cjs` | current release metadata, documentation и asset-evidence regressions |
| `test/trust-schema8.test.cjs` | migration, idempotency и downgrade protection |
| `test/trust-clock.test.cjs` | functional clock и challenge TTL |
| `test/trust-core.test.cjs` | device proofs, KeyPackages, groups, epochs, Welcome, replay и audit |
| `test/trust-recovery.test.cjs` | targeted claim, Welcome scope и commit continuity |
| `test/trust-socket.test.cjs` | device-scoped delivery и targeted disconnect |
| `test/e2ee-plaintext-guards.test.cjs` | direct legacy downgrade attempts |
| `test/mls-interoperability.test.cjs` | Alice/Bob MLS interoperability |
| `test/e2ee-attachments.test.cjs` | encrypted attachment construction и validation |
| `test/e2ee-attachment-transport.test.cjs` | opaque attachment REST/Socket.IO lifecycle |
| `test/store-queue.test.cjs` | mutation queue recovery после rejected operation |
| `test/pulse-local-integration.test.cjs` | Pulse compatibility на schema 8 |
| `test/performance.test.cjs` | warmed 20-client / 120-message budget и integrity |
| `advanced-website/test/advanced-docs.test.mjs` | bilingual navigation, source extraction, contract fields, realtime references and auth inference |

## Verification commands

| Команда | Назначение |
|---|---|
| `npm run check` | syntax, builder configuration и production web build |
| `npm run test:unit` | unit/API/integration suite |
| `npm run test:performance` | isolated performance smoke |
| `npm test` | web build + functional/performance suites |
| `npm run audit:security` | security invariants и dependency audit |
| `npm run release:consistency` | package/lock/Android/docs/evidence version consistency |
| `npm run release:check` | synchronized metadata и complete release-sensitive gate |
| `npm run test:soak` | long-running state, backup и integrity validation |
| `npm run test:advanced` | advanced portal source extraction, tests and structural validation |
| `npm run build:advanced` | Vite production build and OpenAPI 3.1 generation |
| `gradle -p android :app:assembleDebug --no-daemon` | Android source build |
| `npm run dist:windows` | local test NSIS packages |
| `npm run release:windows` | release gate, signing gate и Windows installers |
