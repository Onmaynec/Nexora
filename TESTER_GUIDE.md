# Руководство по приёмочному тестированию Nexora 3.4.0

## 1. Область проверки

- version: `3.4.0` Stable Core release candidate;
- published prerequisite: verified `v3.3.4` требуется до stable release;
- signed production baseline: `3.1.2`;
- Windows Client/Server, Browser/PWA и Android;
- Application API v3;
- Trust/MLS runtime retired;
- legacy secure history read-only;
- SQLite schema 8.

Тестирование выполняется на disposable accounts/test data. Release candidate нельзя описывать как signed stable или independently audited до появления соответствующих evidence.

## 2. Test record

Зафиксируйте:

- Client, Server и Pulse versions;
- exact branch/commit/tag или asset ID;
- release channel и signed/unsigned state;
- OS/browser/device model;
- deployment profile;
- Server ID и sanitized fingerprint;
- schema/integrity/readiness;
- tester и UTC date/time;
- request IDs для failures.

## 3. Connection и TLS

Проверьте:

- valid HTTPS URL;
- Server ID/fingerprint confirmation;
- changed certificate требует explicit approval;
- browser/Android reject untrusted certificate;
- HTTP и mixed content rejected;
- SAN mismatch rejected;
- incompatible Client получает stable error;
- external Android links открываются вне app.

## 4. Authentication и bootstrap

- login загружает `/api/bootstrap` без Trust enrollment;
- Workspace не зависает на initial loading;
- logout/session expiry очищает authorized state;
- exact Origin и CSRF проверяются на mutations;
- invalid/expired session получает `AUTH_REQUIRED`;
- request ID отображается для operator support.

## 5. Core messaging

- direct messages, Saved Messages и rooms;
- text, reply, thread, reaction, mention и poll;
- edit/delete/forward/pin/bookmark;
- silent/scheduled send;
- drafts, archive, mute, filters и search;
- read state и notifications;
- offline cache, restart, bounded outbox и delta sync без duplicates;
- stale/corrupt legacy MLS state не мешает открыть ordinary conversation.

UI acceptance:

- zero badges не отображаются;
- menus/docks остаются внутри viewport;
- long names/files/99+ counters не ломают layout;
- keyboard и narrow-window behavior usable;
- loading, error, offline и restricted states visible;
- reduced-motion honoured.

## 6. Profiles, contacts, devices и sessions

- profile открывается из message/header/list/contact/search/member;
- null relationship state не crash;
- profile и password update;
- local TOTP и one-time recovery code;
- server-owned device inventory содержит device ID/name/platform/version/created/last-seen/expiry;
- targeted remote revoke отключает только target sessions;
- `session.revoked` и `device.updated` приходят realtime;
- current-device remote revoke возвращает `STATE_CONFLICT`;
- “revoke all others” сохраняет текущую session;
- expired session cleanup.

## 7. Rooms и moderation

Для public/private rooms проверьте:

- direct join, request и invitation;
- owner/moderator/member boundaries;
- exactly one owner;
- moderator appointment/removal;
- atomic ownership transfer;
- removal, ban/unban и ban list;
- active ban overrides stale membership;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- invite expiry, usage limit, revocation и concurrent last use;
- reports/appeals/restrictions;
- audit/system messages.

После removal/ban direct REST и realtime access должны быть denied.

## 8. Files, images и voice

- multiple upload;
- cancel/retry;
- resumable interruption/restart;
- size/quota и chunk/file SHA-256;
- actual MIME detection и fake extension/header rejection;
- dangerous/executable file rejection;
- image/PDF/text preview;
- corrupt image handling;
- voice record/stop/cancel/preview/send;
- microphone denial и unsupported format;
- waveform reacts to amplitude;
- played progress, seek, speed и listened state;
- global voice dock closes and resets audio state;
- room media restrictions cannot be bypassed through direct API.

## 9. Legacy secure history

Проверьте schema 8 legacy conversation:

- открывается dedicated read-only viewer;
- composer, upload, record, edit и delete отсутствуют;
- locally retained decrypted IndexedDB data читается только read-only;
- Server export содержит ciphertext/provenance и `serverDecrypted: false`;
- отсутствующая local plaintext cache объясняется terminal state;
- legacy HTTP mutations возвращают `410/LEGACY_READ_ONLY`;
- MLS Socket.IO mutations возвращают terminal `LEGACY_READ_ONLY` ack;
- никакой write path не создаёт plaintext message/file.

## 10. Backup, restore и migration

- schema 7 → 8 compatibility migration idempotent;
- source integrity/WAL/free-space/backup checks выполняются до mutation;
- disk-full failpoint не изменяет live state;
- future schema блокируется до mutation;
- backup verify не заменяет live DB/files;
- invalid backup ID не выходит из allowlisted directory;
- restore replacement failure откатывает DB и files;
- temporary staged/decrypted data удаляется после success/error.

## 11. Updater и release acceptance

Automated:

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Signed stable acceptance для `3.4.0`:

- published verified `v3.3.4` существует;
- complete Authenticode policy configured;
- Client channel `latest`, Server channel `server`;
- downgrade/prerelease consumption rejected;
- tampered signature/checksum → `UPDATE_SIGNATURE_INVALID`;
- Client/Server installers, blockmaps и metadata signed/complete;
- clean install/repair/uninstall на Windows 10 и Windows 11;
- installed `3.3.4 → 3.4.0` upgrade на обеих ОС;
- product version после upgrade равна `3.4.0`;
- published assets повторно скачаны и checksums/signatures verified.

## 12. Security acceptance

- IDOR и role bypass через direct API rejected;
- active ban/session revoke fail closed;
- upload fake MIME и hash mismatch rejected;
- rate limiting возвращает `429`, `RATE_LIMITED`, `Retry-After`;
- public error envelope не раскрывает stack/SQL/tokens;
- logs recursively redact credentials;
- independent review указывает exact reviewed ancestor commit;
- unresolved high/critical findings равны zero до stable release.

## 13. Release decision

PR можно переводить в ready только после green CI на exact head. Merge/tag/release `v3.4.0` запрещены, пока не закрыты verified `v3.3.4`, signing, Windows 10/11 acceptance и independent review evidence.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
