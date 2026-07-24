# Руководство по приёмочному тестированию Nexora

## 1. Область проверки

- current version: `3.3.3` published `UNSIGNED-TEST` prerelease;
- signed production baseline: `3.1.2`;
- Windows Client/Server, Browser/PWA и Android;
- Application API v3;
- Trust/MLS/encrypted-media API v4;
- SQLite schema 8.

3.3.2 тестируется с disposable accounts и test data. Она не является signed stable Windows release и не заявляется как independently audited E2EE. Критическая acceptance-проверка: установить Windows Server, запустить его и подтвердить отсутствие `MODULE_NOT_FOUND` для `shared/pulse-catalog.cjs` до открытия Server UI.

## 2. Test record

Зафиксируйте:

- Client, Server и Pulse Cloud versions;
- commit/tag или asset ID;
- release channel;
- OS/browser/device model;
- deployment profile;
- Server ID и sanitized fingerprint;
- schema/integrity/readiness;
- tester/date;
- signed/unsigned packaging state.

## 3. Connection и TLS

Проверьте:

- valid HTTPS URL;
- Server ID и fingerprint confirmation;
- changed certificate requires approval;
- browser/Android reject untrusted certificate;
- HTTP/mixed content rejected;
- SAN mismatch rejected;
- incompatible Client receives clear error;
- external Android links open outside app.

## 4. Authentication bootstrap regressions

- login loads `/api/bootstrap` before Trust enrollment;
- Workspace does not remain on “Собираем ваши чаты”;
- Trust scope configured before child draft effects;
- pre-configuration encrypted-draft read returns safe empty state;
- real Trust/WebCrypto/IndexedDB errors remain visible;
- logout/session expiry clears authorized state.

## 5. Core messaging

- direct messages, Saved Messages и rooms;
- text, reply, thread, reaction, mention и poll;
- edit/delete/forward/pin/bookmark;
- silent/scheduled send;
- drafts, archive, mute, filters и search;
- read state и notifications;
- offline cache, restart, durable outbox и delta sync without duplicates.

UI acceptance:

- no zero badges;
- menus/docks remain inside viewport;
- long names/files/99+ counters do not break layout;
- keyboard и narrow-window behavior usable;
- loading, error, offline и restricted states visible;
- reduced-motion honored.

## 6. Profiles, contacts и sessions

- profile opens from message/header/list/contact/search/member;
- null relationship state does not crash;
- profile update;
- password change;
- terminate one session;
- contact removal preserves history;
- block/unblock restrictions;
- local TOTP и one-time recovery code;
- expired session cleanup.

## 7. Rooms и moderation

Проверьте public/private rooms:

- direct join, request и invitation;
- owner/moderator/member boundaries;
- moderator appointment/removal;
- atomic ownership transfer;
- removal, ban/unban;
- active ban overrides stale membership;
- read-only, slow mode, announcement, pre-approval;
- file/image/voice restrictions;
- invite expiry, usage limit, revocation и concurrent last use;
- custom roles/categories;
- reports/appeals/restrictions;
- audit/system messages.

После removal/ban direct REST и realtime access denied.

## 8. Legacy media

- multiple upload;
- cancel/retry;
- resumable interruption/restart;
- size, SHA-256, actual MIME;
- fake extension handling;
- image/PDF/text preview;
- voice record/pause/resume/preview/send;
- waveform/speed/listened state;
- global voice dock closes and resets audio state.

## 9. Trust devices

### Credential validation

- valid registration;
- mismatched BasicCredential user/device rejected;
- one Ed25519 key reused for identity/MLS signature rejected;
- duplicate registration idempotent.

### Capacity

- devices 1–16 accepted according to lifecycle;
- 17th active device rejected;
- concurrent final-capacity attempt allows only valid capacity;
- revocation releases slot;
- unverified/revoked device cannot use Trust/MLS API.

### Verification/revocation

- first-device bootstrap;
- second-device fingerprint comparison;
- signed approval;
- separate one-time challenge;
- target secure socket disconnect;
- other devices stay connected;
- local identity/MLS/KeyPackages/cache/drafts wiped;
- reenrollment creates new lifecycle.

## 10. KeyPackage governance

- up to 25 items/request accepted;
- 26 rejected;
- maximum 32 unclaimed/device;
- maximum 256 unclaimed/user;
- overflow batch rolls back atomically;
- expired packages cleaned;
- claim is one-time and target-scoped;
- resource limit error stable.

## 11. MLS messaging

- secure conversation between verified devices;
- KeyPackage claim one-time;
- Welcome scoped to user/device/conversation;
- bidirectional send;
- restart/reconnect;
- replay rejected;
- stale/skipped epoch rejected;
- server serialization contains no plaintext;
- unrecoverable private-state loss explicit.

## 12. Strict missed-commit recovery

Positive contiguous recovery and failures for:

- wrong conversation/group;
- missing/skipped epoch;
- reordered epochs;
- duplicate commit hash;
- payload hash mismatch;
- intermediate public-state mismatch;
- final public-state mismatch;
- replayed chain.

Invalid chain must not persist partial local state.

## 13. MLS Welcome recovery 3.3.0+

### Positive

1. Enroll two verified devices.
2. Keep one active group member with valid state.
3. Remove local group state on pending device using test data.
4. Trigger secure text send.
5. Confirm one bounded `welcome/request`.
6. Confirm active member receives scoped notification.
7. Confirm active member creates commit/Welcome.
8. Confirm pending device claims Welcome and send completes.
9. Repeat for encrypted file/image и voice.

### Negative

- unauthenticated request rejected;
- CSRF/Origin mismatch rejected;
- non-member rejected;
- active ban rejected even with stale membership;
- unverified/revoked device rejected;
- device outside group receives no event;
- duplicate redundant requests suppressed/bounded;
- rate limit returns `429 RATE_LIMITED` и `Retry-After`;
- no active member results in explicit pending/fail-closed state;
- no plaintext fallback.

## 14. Plaintext downgrade

After MLS activation direct attempts must fail:

- legacy send;
- forward;
- edit;
- server draft;
- scheduled message;
- poll;
- bot message;
- multipart upload;
- resumable upload;
- legacy/mismatched Socket.IO device.

## 15. Secure files/images/voice

- Client AES-256-GCM encryption;
- progress/cancel;
- pending not downloadable before claim;
- atomic MLS claim;
- local decrypt/integrity;
- image preview/voice playback;
- matching retry idempotent;
- hash/size/scope substitution rejected;
- reuse rejected;
- cancel/expiry cleanup;
- outbox/cache contains opaque IDs/ciphertext only;
- disabled room class blocks complete path.

Test raw ciphertext byte limit and quota by actual stored ciphertext size.

## 16. Route rate limiting

For Trust directory, enrollment, KeyPackage, recovery и E2EE upload:

- requests inside window succeed;
- excess returns `429`;
- code is `RATE_LIMITED`;
- `Retry-After` present;
- request works after window;
- state remains bounded;
- one actor does not incorrectly consume unrelated scope;
- stale persisted bucket cleaned.

## 17. Trust audit и maintenance

- action-specific allowed primitive metadata retained;
- arbitrary nested object rejected/removed;
- secret-like nested fields not persisted;
- expired sessions removed;
- login history older than 90 days removed;
- recent history remains;
- stale rate-limit buckets removed;
- active state remains valid.

## 18. Windows updater 3.3.0+

Use installed packaged Client.

### Service

- initializes before renderer IPC;
- default provider points to official GitHub Releases;
- explicit custom feed requires HTTPS;
- HTTP feed rejected;
- initial check occurs;
- scheduled checks occur;
- concurrent checks single-flight;
- downgrade/prerelease disabled;
- signature verification enabled;
- missing signed assets return stable non-installable state.

### UI

- “Проверить обновления” shows checking;
- duplicate button action prevented;
- progress visible;
- current/available/downloaded/error terminal states visible;
- network error actionable and retryable;
- missing updater metadata understandable;
- no stack/internal path shown.

### Installed update

- previous signed Client → signed 3.3.2;
- download/install/restart;
- trusted server/session/settings preserved;
- post-update summary appears once;
- “Подробнее” opens exact official tag;
- “Закрыть” closes;
- “Не показывать снова” suppresses same version only.

## 19. Server console 3.3.0+

- known commands execute via registry;
- unknown command rejected;
- no shell/eval/filesystem escape;
- stable `{ code, message }` crosses IPC;
- `plus grant netrox 1` works;
- copied `plus grant <netrox> [1]` normalizes safely;
- equivalent Pulse/Impulse lookups normalize;
- malicious placeholder text is data, never evaluated;
- mutation audit exists without argument values.

## 20. Windows test mode и installer

- normal shortcut starts no console;
- “Nexora Client (Test Mode)” starts Client plus PowerShell log tail;
- `--test-mode` works;
- `NEXORA_CLIENT_TEST_MODE=1` works;
- console closes with Client;
- no DevTools/Node integration/remote debugging;
- log lines flattened/length-limited;
- Client/Server installer uses official icon, branded sidebar и Russian language;
- clean install/uninstall/upgrade accepted.

## 21. Pulse

- Cloud registration/email/MFA;
- OAuth PKCE S256/exact redirect;
- signed one-time Local Account link;
- sandbox grants and non-negative balance;
- production disables sandbox authority;
- checkout/webhook/receipt/cancel;
- duplicate event/idempotency no-op;
- outage does not block messaging.

## 22. Operations

- live/ready;
- readiness `503` during drain;
- metrics token/loopback policy;
- request IDs/no secrets in logs;
- allowlisted commands;
- emergency read-only;
- graceful shutdown no SQLite error/dialog;
- concurrent stop/quit serialized;
- backup/restore/integrity;
- startup/hourly maintenance.

## 23. Upgrade и compatibility

### 3.1.x → 3.3.2

- verified schema 7 backup;
- migration integrity/free-space/WAL/backup;
- schema 8 result;
- old data readable but not retroactively encrypted;
- downgrade blocked;
- restore rollback tested.

### 3.2.0–3.3.1 → 3.3.2

- no schema migration;
- schema remains 8;
- API v3/v4 compatible;
- existing rooms/Trust devices/media/Plus state retained;
- updater, console и Welcome patch works.

## 24. Automated gates

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

Authoritative evidence: [Release Verification 3.3.2](docs/releases/3.3.3/RELEASE_VERIFICATION.md).

## 25. Defect report

Include version/channel/commit, platform, deployment, reproduction, expected/actual, HTTP/stable code, `Retry-After`, request ID, Trust/group/epoch/update state и sanitized diagnostics.

Never publish passwords, cookies, tokens, recovery codes, invite codes, private keys, complete MLS state, user data или backup passphrase.
