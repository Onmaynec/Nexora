# Индекс проекта Nexora 3.0.0

## Точки запуска

| Файл | Назначение |
|---|---|
| `server/cli.cjs` | консольный Nexora Server |
| `electron/server-main.cjs` | Windows Server shell и IPC admin panel |
| `electron/client-main.cjs` | Windows Client, trusted servers, sessions и updater |
| `client/src/main.jsx` | общий React renderer для desktop/browser/PWA/Android |
| `android/app/.../MainActivity.kt` | безопасная Android WebView shell и server picker |

## Server

| Файл | Ответственность |
|---|---|
| `server/create-server.cjs` | REST, Socket.IO, auth/TOTP, users, rooms, messages, media, admin и Pulse |
| `server/v3-features.cjs` | sync/drafts/schedule/polls/moderation/bots/webhooks/resumable upload/metrics |
| `server/events.cjs` | монотонный event stream, visibility и notifications |
| `server/totp.cjs` | TOTP, recovery codes и AES-256-GCM secret storage |
| `server/store.cjs` | `node:sqlite`, schema 6, migration backup, FTS5 и transactional UPSERT |
| `server/maintenance.cjs` | backup/restore, retention, quota и cleanup |
| `server/model.cjs` | permissions, custom roles и API serialization |
| `server/security.cjs` | passwords, sessions, CSRF и public profiles |
| `server/certificates.cjs` | local CA, SAN и fingerprints |
| `server/pulse.cjs` | sandbox и signed Pulse Cloud contract |

Schema 6 хранит основные нормализованные коллекции и v3 registry: events, notifications, drafts, scheduled messages, polls, edit history, invites/reports/appeals/roles/categories, bots/tokens/webhooks/audit и Pulse ledger events.

## React Client

| Файл | Ответственность |
|---|---|
| `client/src/App.jsx` | session/bootstrap, offline fallback, delta sync и outbox lifecycle |
| `components/Workspace.jsx` | navigation, rooms, moderation, integrations и profile modal |
| `components/MessagePane.jsx` | history, threads, schedule/silent send, polls, drafts и resumable upload |
| `components/UserProfileModal.jsx` | profile surface с null-safe relationship state |
| `components/NotificationsPage.jsx` | mentions/replies/security activity |
| `components/SettingsPage.jsx` | profile, TOTP, sessions, notification/PWA preferences |
| `components/GlobalSearch.jsx` | FTS search с user/date/type filters |
| `offline-store.js` | IndexedDB bootstrap/message cache |
| `outbox.js` | durable idempotent message queue |
| `api.js` | fetch/CSRF/API version и chunk upload |
| `public/sw.js` | application-shell cache без API/Socket.IO |

## Desktop, Android и релиз

| Файл | Ответственность |
|---|---|
| `electron/client-connection.cjs` | HTTPS URL, public/local address, SAN и PEM SHA-256 |
| `electron/update-service.cjs` | signed GitHub Client updater и generic Server updater |
| `android/` | Gradle Android client source, deep link и strict TLS policy |
| `electron-builder.*.yml` | отдельные NSIS installers |
| `.github/workflows/ci.yml` | Windows/Linux/Android verification |
| `.github/workflows/release.yml` | immutable tag, source/PWA/SBOM и conditional signed release |

## API-группы

- `/api/auth/*`, `/api/users/me*`, `/api/users/:id/profile`, `/api/sessions*`;
- `/api/v3/sync`, `/api/v3/drafts*`, `/api/notifications*`;
- `/api/rooms*` — membership, roles, categories, moderation, invites, reports и audit;
- `/api/conversations/:id/messages|polls|media|upload|uploads|settings`;
- `/api/messages/:id/edits|report|moderation|bookmark|listened`;
- `/api/v3/bot/*`, `/api/bots/*`, `/api/rooms/:roomId/webhooks|integrations`;
- `/api/pulse/*` и `/api/admin/*`.

Изменяющие пользовательские REST-запросы требуют session cookie, совпадающий Origin и `X-Nexora-CSRF`. Client передаёт `X-Nexora-Client-Version: 3.0.0`; Server сообщает API version 3 и диапазон совместимых major 2–3. Bot API использует отдельный bearer token со scopes.

## Проверки

| Команда | Назначение |
|---|---|
| `npm run check` | Node syntax, builder config и Vite production build |
| `npm test` | самодостаточная web build + unit/integration/reliability/load/UI regression suite |
| `npm run audit:security` | security invariants + production dependency audit |
| `npm run test:soak` | integrity soak, по умолчанию 60 минут |
| `gradle -p android :app:assembleDebug` | Android source build |
| `npm run dist:windows` | локальные тестовые NSIS Client/Server |
| `npm run release:windows` | release checks, signing gate и installers |
