# Индекс проекта Nexora 3.1.2

Этот файл описывает stable-ветку `main`: Local Server/Client API v3, SQLite schema 7, Pulse Cloud 3.1 и эксплуатационные исправления 3.1.1–3.1.2. Экспериментальные Trust Core/MLS модули 3.2.0 находятся в отдельных development branches и не входят в этот индекс.

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
| `server/create-server.cjs` | production composition: API v3, Socket.IO, operational runtime и graceful drain |
| `server/create-server-v31.cjs` | Cloud Identity/Pulse API, developer commands и 3.1.x integration layer |
| `server/v3-features.cjs` | sync, drafts, scheduled messages, polls, moderation, bots, webhooks, resumable upload и metrics |
| `server/events.cjs` | монотонный event stream, visibility и notifications |
| `server/totp.cjs` | локальный TOTP, recovery codes и AES-256-GCM secret storage |
| `server/store.cjs` | `node:sqlite`, transactional mutation, FTS5 и base data model |
| `server/schema7.cjs` | безопасная schema 6 → 7 migration и downgrade protection |
| `server/local-pulse.cjs` | account links, verified entitlement cache, event inbox/outbox и room product state |
| `server/maintenance.cjs` | backup/restore, retention, quota и orphan cleanup |
| `server/model.cjs` | permissions, custom roles и API serialization |
| `server/security.cjs` | passwords, sessions, CSRF и public profiles |
| `server/certificates.cjs` | local CA, SAN и certificate fingerprints |
| `server/pulse.cjs` | legacy/local Pulse compatibility contract |

Schema 7 добавляет нормализованные Local Server сущности для Cloud account links, link sessions, sync cursor/inbox/outbox, pinned keys, verified entitlements, checkout state, transactions и room product state. Миграция выполняется до открытия traffic, после integrity/disk-space checks и проверенного backup.

## Pulse Cloud

| Файл | Ответственность |
|---|---|
| `cloud/create-cloud-server.cjs` | базовый Pulse Cloud REST/billing composition |
| `cloud/create-cloud-server-v12.cjs` | Cloud Identity, OAuth, workers, operational health и 3.1.x routes |
| `cloud/identity-service.cjs` | регистрация, email verification, MFA, sessions и OAuth 2.1 PKCE |
| `cloud/store.cjs` | Cloud billing/ledger persistence и transactional invariants |
| `cloud/stripe-provider.cjs` | provider-hosted checkout и webhook adapter |
| `cloud/worker-service.cjs` | email, event delivery, reconciliation и expiry workers |
| `cloud/operational-runtime.cjs` | liveness/readiness, metrics, request IDs, redaction и drain state |

Pulse Cloud хранит Cloud Identity, provider/customer mapping, subscription metadata, receipts, double-entry Impulse ledger и signing material. Он не хранит локальные сообщения, комнаты, файлы, Local Server passwords или local CA private key.

## React Client

| Файл | Ответственность |
|---|---|
| `client/src/App.jsx` | session/bootstrap, offline fallback, delta sync и outbox lifecycle |
| `client/src/components/Workspace.jsx` | navigation, rooms, moderation, integrations и profile modal |
| `client/src/components/MessagePane.jsx` | history, threads, scheduled/silent send, polls, drafts и resumable upload |
| `client/src/components/PulsePageV31.jsx` | Cloud Identity linking, Plus, wallet, transactions, receipts и room goals |
| `client/src/components/UserProfileModal.jsx` | profile surface с null-safe relationship state |
| `client/src/components/NotificationsPage.jsx` | mentions/replies/security activity |
| `client/src/components/SettingsPage.jsx` | profile, TOTP, sessions, notification/PWA preferences |
| `client/src/components/GlobalSearch.jsx` | FTS search с user/date/type filters |
| `client/src/offline-store.js` | IndexedDB bootstrap/message cache |
| `client/src/outbox.js` | durable idempotent message queue |
| `client/src/api.js` | fetch/CSRF/API version и chunk upload |
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

## API-группы

- `/api/auth/*`, `/api/users/me*`, `/api/users/:id/profile`, `/api/sessions*`;
- `/api/v3/sync`, `/api/v3/drafts*`, `/api/notifications*`;
- `/api/rooms*` — membership, roles, categories, moderation, invites, reports и audit;
- `/api/conversations/:id/messages|polls|media|upload|uploads|settings`;
- `/api/messages/:id/edits|report|moderation|bookmark|listened`;
- `/api/v3/bot/*`, `/api/bots/*`, `/api/rooms/:roomId/webhooks|integrations`;
- `/api/v3/cloud-account/*`, `/api/v3/pulse/*`, room-scoped Pulse routes и Local event sync;
- `/healthz/live`, `/healthz/ready`, `/metrics` и `/api/admin/*`;
- Pulse Cloud Identity/OAuth, checkout, subscription, receipt, event-delta и room-goal routes.

Изменяющие пользовательские REST-запросы требуют session cookie, совпадающий Origin и `X-Nexora-CSRF`. Client передаёт `X-Nexora-Client-Version: 3.1.2`; Server сообщает API version 3 и поддерживает основной диапазон Client major 2–3. Bot API использует отдельный bearer token со scopes. Pulse service-to-service запросы используют scoped credentials, request metadata, idempotency и подписанные Ed25519 envelopes.

## Проверки

| Команда | Назначение |
|---|---|
| `npm run check` | Node syntax, builder config и Vite production build |
| `npm test` | web build + unit/API/integration/reliability/load/UI regression suite |
| `npm run test:unit` | Node test suite без повторной web build |
| `npm run audit:security` | security invariants + production dependency audit |
| `npm run release:check` | release-sensitive build и полный unit/API gate |
| `npm run test:soak` | integrity soak, по умолчанию 60 минут |
| `gradle -p android :app:assembleDebug --no-daemon` | Android source build |
| `npm run dist:windows` | локальные тестовые NSIS Client/Server |
| `npm run release:windows` | release checks, signing gate и installers |
