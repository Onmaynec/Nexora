# Руководство по приёмочному тестированию Nexora

## Область проверки

- current version: `3.3.4` release candidate;
- distribution: signed when policy exists, otherwise explicit `UNSIGNED-TEST` prerelease;
- signed production baseline: `3.1.2`;
- Windows Client/Server, Browser/PWA и Android;
- Application API v3;
- Trust/MLS runtime retired; legacy history read-only;
- SQLite schema 8.

3.3.4 тестируется с disposable accounts и test data. Она не является signed stable Windows release и не заявляется как independently audited.

## Test record

Зафиксируйте Client/Server/Pulse versions, commit/tag/asset, release channel, OS/browser/device, deployment profile, Server ID и sanitized fingerprint, schema/integrity/readiness, tester/date и signing state.

## Connection и TLS

Проверьте valid HTTPS URL, Server ID/fingerprint confirmation, changed certificate approval, untrusted/SAN mismatch rejection, HTTP/mixed-content rejection, clear incompatible-Client error и external Android navigation outside app.

## Authentication и sessions

- registration/login/logout/password policy;
- TOTP and one-time recovery codes;
- Origin/CSRF rejection before mutation;
- login lock/rate limits;
- active session inventory;
- device metadata and expiry;
- targeted remote revoke;
- current-device remote revoke returns `STATE_CONFLICT`;
- `session.revoked` logs out and disconnects realtime immediately;
- expired session does not reconnect indefinitely.

## Rooms и administration

Проверьте owner/moderator/member boundaries, exactly one owner, moderator restrictions, ownership transfer atomicity, remove/ban/unban, blocked rejoin/write/upload bypass, read-only, slow mode, file/image/voice restrictions, invites, join requests, audit records and system messages.

Каждое ограничение проверяется прямым API request, а не только отсутствием UI button.

## Ordinary messaging

- ordinary dialog opens without Trust/MLS bootstrap;
- send/edit/delete/reply/forward/reactions/read state;
- offline outbox bounded retry and terminal errors;
- delivery preview updates without full bootstrap per message;
- drafts, scheduled messages, polls, search and notifications;
- removal/ban/session revoke during active Socket.IO delivery;
- no plaintext fallback path depends on retired MLS state.

## Files, images и voice

- valid and forbidden size/type combinations;
- actual MIME substitution;
- safe filename/path handling;
- resumable upload retry/cancel/cleanup;
- room media restrictions via direct API;
- corrupt image handling and safe preview scaling;
- microphone allow/deny/revoke/unsupported format;
- voice start/stop/cancel/preview/send;
- live amplitude, duration, playback progress, seek and error state.

## Legacy secure history

- legacy conversation opens in dedicated viewer;
- ordinary chats remain available even with missing/corrupt local MLS data;
- viewer has no composer/upload/record/edit/delete controls;
- server response/export contains ciphertext metadata and `serverDecrypted: false`;
- local decrypted content appears only when pre-existing cache exists;
- unavailable plaintext is explained explicitly;
- every Trust/E2EE HTTP mutation returns `410/LEGACY_READ_ONLY`;
- every MLS Socket.IO mutation returns terminal `LEGACY_READ_ONLY`;
- no request reserves files, messages, replay or enrollment records.

## Backup, restore и migration

- non-restoring backup verification leaves live DB/files unchanged;
- encrypted temporary material is cleaned after success/failure;
- simulated disk-full fails before transaction;
- future schema fails before mutation;
- restore replacement failure rolls back DB and uploads;
- schema 8 migration is idempotent;
- repeated close leaves status readable.

## Updater и installers

- Client `latest` and Server `server` channels;
- no downgrade/prerelease bypass;
- signature/checksum failure maps to `UPDATE_SIGNATURE_INVALID`;
- partial signing configuration rejected;
- signed subject/thumbprint/timestamp verified when configured;
- unsigned `v3.3.4` release is marked `UNSIGNED-TEST`;
- unsigned assets contain no updater metadata/blockmaps;
- Client and Server silent install and installed executable version smoke;
- published assets re-downloaded and SHA-256 verified.

## Automated commands

```bash
npm ci
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Также должны пройти focused 3.3 regressions и introductory/advanced website contracts.

## Acceptance decision

Release блокируется при failed automated gate, unresolved high/critical defect, missing migration/rollback evidence, inconsistent documentation/version metadata, partial release assets или неподтверждённом classification claim.

Результаты записываются в [Release Verification 3.3.4](docs/releases/3.3.4/RELEASE_VERIFICATION.md).
