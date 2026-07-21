# Индекс проекта Nexora 2.0.0

## Точки запуска

| Файл | Назначение |
|---|---|
| `server/cli.cjs` | консольный локальный Server |
| `electron/server-main.cjs` | Nexora Server.exe и IPC admin panel |
| `electron/client-main.cjs` | Nexora Client.exe, trusted servers и certificate pinning |
| `client/src/main.jsx` | React web/desktop renderer |

## Сервер

| Файл | Ответственность |
|---|---|
| `server/create-server.cjs` | REST, Socket.IO, users/rooms/messages/media/admin/Pulse routes |
| `server/store.cjs` | `node:sqlite`, schema 5, migration, FTS5 и транзакционный diff/UPSERT |
| `server/maintenance.cjs` | backup/restore, AES-256-GCM, retention, quota и cleanup |
| `server/model.cjs` | права доступа, Saved Messages и API serialization |
| `server/security.cjs` | passwords, sessions, CSRF и публичные профили |
| `server/certificates.cjs` | local CA, SAN, fingerprints и Radmin/LAN addresses |
| `server/pulse.cjs` | Plus entitlement, wallet/goals, sandbox и signed Pulse Cloud contract |

Schema 5 нормализует users/sessions/contacts/blocks, rooms/members/bans/requests/audit, conversations/settings, messages/reactions/reads/bookmarks/FTS, files/voice listens/uploads, security events/rate limits и Pulse entities.

## React Client

| Файл | Ответственность |
|---|---|
| `client/src/App.jsx` | session/bootstrap/presence/notifications/outbox lifecycle |
| `components/Workspace.jsx` | dock, rails, rooms, contacts, files, details и profile modal |
| `components/MessagePane.jsx` | лента, actions/reactions, search, composer, upload и selection |
| `components/UserProfileModal.jsx` | Telegram-like profile surface |
| `components/PulsePage.jsx` | Plus, wallet, premium profile и room goals |
| `components/GlobalSearch.jsx` | global search и bookmarks |
| `components/SettingsPage.jsx` | profile/password/sessions/sound/trust/update preferences |
| `components/VoiceRecorder.jsx` | record/pause/resume/preview/wave/noise gate |
| `components/VoicePlayer.jsx` | waveform/speed/listened |
| `audio-player.js` | непрерывное воспроизведение между чатами |
| `outbox.js` | offline queue и retry |
| `api.js` | fetch/CSRF/version и XHR upload progress/cancel |
| `styles.css` | Violet Grid, responsive containment и motion |

## Desktop и релиз

| Файл | Ответственность |
|---|---|
| `electron/client-connection.cjs` | URL validation, HTTPS probe, SAN и PEM SHA-256 |
| `electron/update-service.cjs` | GitHub Client updater и generic Server updater |
| `electron/client-shell/*` | server list/fingerprint confirmation/connect diagnostics |
| `electron/server-shell/*` | admin overview/users/rooms/storage/security/logs |
| `electron-builder.*.yml` | отдельные NSIS installers |
| `.github/workflows/ci.yml` | Windows/Linux verification |
| `.github/workflows/release.yml` | signed Windows Release и checksums |

## Основные REST-группы

- `/api/auth/*`, `/api/users/me*`, `/api/users/:id/profile`, `/api/sessions*`;
- `/api/contacts*`, `/api/blocks*`, `/api/users/search`;
- `/api/rooms*` — membership, moderation, settings, invite, audit, export;
- `/api/conversations/:id/messages|media|upload|upload-capacity|settings`;
- `/api/messages/:id/bookmark|listened`, `/api/bookmarks`, `/api/files/:id`;
- `/api/search/messages`;
- `/api/pulse/overview|checkout`, `/api/pulse/rooms/:id/goals`, `/api/pulse/goals/:id/contributions`;
- `/api/admin/*`.

Изменяющие REST-запросы требуют session cookie, совпадающий Origin и `X-Nexora-CSRF`. Client передаёт `X-Nexora-Client-Version: 2.0.0`; API version — 2.

## Проверки

| Команда | Назначение |
|---|---|
| `npm run check` | 30 Node syntax checks, builder schema, Vite production build |
| `npm test` | 41 functional/reliability/load/connection/Pulse/UI-regression tests |
| `npm run audit:security` | security invariants + production npm audit |
| `npm run test:soak` | configurable integrity soak, default 60 минут |
| `npm run dist:windows` | test NSIS Client + Server |
| `npm run release:windows` | full checks + signing gate + installers |
