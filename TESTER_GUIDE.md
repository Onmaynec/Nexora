# Руководство по приёмочному тестированию Nexora 3.6.0 Connect

## 1. Scope

Test target:

- version `3.6.0` Connect implementation candidate;
- baseline `3.5.0`;
- SQLite schema 10;
- Windows Client/Server, Browser/PWA and Android;
- contacts, requests, block/privacy, scoped presence/read receipts;
- one-to-one WebRTC voice calls and profile deep links;
- ordinary server-readable messaging and read-only legacy Trust/MLS history.

Use disposable accounts, devices and servers. Do not describe the candidate as signed stable, independently audited or cross-platform accepted until the corresponding evidence is complete.

## 2. Test record

Record for every run:

- exact branch, commit and PR;
- Client/Server/Android/PWA version;
- schema version and integrity result;
- OS/browser/device model and build;
- server deployment and TURN profile;
- network path (LAN, relay-only, handover, constrained);
- tester and UTC timestamp;
- account/device/session roles using protected identifiers;
- request IDs and stable error codes;
- screenshots/log references with secrets/content redacted.

## 3. Automated source gate

```bash
npm ci
npm run release:consistency
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
NEXORA_SOAK_MINUTES=1 NEXORA_SOAK_INTERVAL_MS=500 npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Expected:

- all commands exit zero;
- no disabled assertion or skipped required suite;
- no high/critical production dependency finding;
- schema 10 remains intact through performance/soak;
- temporary repair/diagnostic workflow files are absent.

## 4. Schema 9 → 10 migration

Test on a copied 3.5.0 database with representative users, sessions, rooms, messages, files, push/outbox state and legacy records.

Verify:

- migration runs before network listen;
- source integrity failure stops startup;
- low free space stops before mutation;
- verified pre-schema backup is created;
- transaction rollback preserves source data on failpoint;
- destination schema is 10 and passes integrity;
- all four Connect tables/indexes exist;
- rerun is idempotent;
- schema newer than 10 is rejected;
- restore of schema 9 through supported path upgrades to 10;
- existing conversations/media and schema 8 legacy history remain accessible.

## 5. Authentication, Origin and CSRF

For every mutating REST path:

- unauthenticated request → `401/AUTH_REQUIRED`;
- missing/incorrect browser CSRF → `403/CSRF_INVALID`;
- untrusted Origin is rejected;
- invalid/expired/revoked session cannot mutate;
- public error contains `code`, `message`, `requestId`, safe `details`;
- no stack, SQL, filesystem path, token or secret is disclosed.

Repeat important operations through direct REST/Socket.IO, not only UI.

## 6. Contacts and requests

Create Alice, Bob and Mallory.

### Lifecycle

- Alice searches Bob by username/display name.
- Alice creates a request with a valid `Idempotency-Key`.
- Repeat the same key: no second request/side effect.
- Bob accepts: contact and DM are available.
- Test reject and sender cancel on separate requests.
- Expired request cannot be accepted.
- Invalid actor cannot accept/reject/cancel another request.

### Race tests

- concurrent accept/cancel produces one winner and one `STATE_CONFLICT`;
- concurrent accept/block cannot leave an active contact while block exists;
- duplicate identical transition is idempotent;
- changed operation with reused key does not create an unrelated side effect.

### Search and privacy

- query shorter than minimum returns bounded empty result;
- cursor pagination is stable and duplicate-free;
- rate limit returns `RATE_LIMITED` with retry delay;
- blocked/disabled users are hidden;
- shared-room-only profile does not expose private fields.

## 7. Block and unblock

After Alice/Bob are contacts:

- Bob blocks Alice;
- contact relation is removed;
- pending requests are cancelled;
- Alice cannot create a new request;
- Alice cannot start or continue a call;
- Alice loses Bob’s presence detail/read receipt according to policy;
- stale Alice socket cannot signal an existing call;
- errors use `CONTACT_BLOCKED` or access-hidden `RESOURCE_NOT_FOUND` without revealing private reason to unrelated users;
- Bob unblocks Alice;
- contact and previous permissions are not restored automatically.

## 8. Presence and last seen

Test policies:

- `everyone`;
- `contacts`;
- `shared_rooms`;
- `nobody`.

Test last-seen modes:

- `exact`;
- `approximate`;
- `hidden`.

Verify:

- privacy change applies without reconnect;
- unauthorized viewer never receives exact/hidden data in bootstrap or realtime;
- replacement snapshot removes stale online subjects;
- block removes future presence details;
- disconnecting one of two active devices keeps user online;
- disconnect/revoke of the final valid device removes online state;
- coalesced updates do not create an event storm.

## 9. Read receipts

For a DM and a room:

- reader policy `nobody`: sender receives no `conversation:read` and history `readCount` remains zero;
- `contacts`: visible to contact only;
- `shared_rooms`: visible only when current shared-room scope exists;
- `everyone`: visible according to ordinary conversation access;
- block/privacy change applies to subsequent query and event without reconnect;
- unrelated user never receives receipt events;
- duplicate read event does not create duplicate state.

## 10. Profiles and deep links

### Profile card

Open profile from search, contact, message/header and room member.

Verify:

- self/contact/shared-room/blocked scopes expose different allowed fields;
- hidden user produces generic inaccessible state;
- profile actions match current relationship but direct API remains authoritative;
- copy username/deep link does not include token, cookie, content or private fields.

### Deep link

Test a URL carrying current Server ID, `type=profile` and stable user ID.

- correct server/account opens exact profile;
- wrong Server ID does not silently switch target;
- malformed/unknown ID returns generic unavailable state;
- hidden profile details do not appear in error text;
- Electron and Android keep navigation on allowlisted server origin and open unrelated HTTPS externally.

## 11. Call state machine

Test each path:

```text
ringing -> connecting -> active -> ended
ringing -> declined
ringing -> missed
connecting -> failed
active -> reconnecting -> active
active -> failed
```

Verify:

- no infinite ringing/connecting;
- call timer starts at answer;
- terminal history has correct direction/outcome/timestamps/duration;
- no SDP, ICE, credential or media content in history/diagnostics/audit;
- ending twice is idempotent;
- an incompatible state transition returns `CALL_STATE_CONFLICT`.

## 12. Signaling security

With Alice/Bob in a call and Mallory unrelated:

- Mallory cannot signal, answer, end or request TURN for the call ID;
- Alice’s second session cannot use Alice’s first-session call/TURN scope;
- the first eligible Bob session claims the ringing call;
- Bob’s other device cannot take over after claim;
- invalid call ID or target is rejected;
- malformed/empty SDP is rejected;
- oversized SDP/ICE is rejected without crash/reflection;
- sequence gap is rejected;
- identical sequence/payload retry is idempotent;
- same sequence with changed payload returns `CALL_STATE_CONFLICT`;
- signaling account/device/call windows return `RATE_LIMITED` with retry delay;
- event target is the bound session, not an unrelated global/user listener.

## 13. TURN

### Configured

- credentials available only to an authenticated participant in the bound session;
- username/credential expires within configured short TTL;
- username is call/session scoped;
- static secret never appears in response/log/diagnostics;
- STUN entries have no credential; TURN entries have generated credential;
- relay-only call works in the external acceptance environment.

### Unavailable

Remove/invalidly configure TURN secret or URLs:

- endpoint returns `503/TURN_UNAVAILABLE`;
- UI shows actionable guidance;
- no infinite connecting state;
- no client fallback to hardcoded/static credential.

## 14. Device and permission lifecycle

On every platform:

- microphone allow;
- microphone deny;
- permission revoke after prior allow;
- no audio input device;
- device unplug/removal during call;
- switch microphone;
- mute/unmute;
- output selection where `setSinkId` is supported;
- output selector disabled/explained where unsupported;
- foreground/background/navigation/profile switch;
- process/WebView/render restart.

Expected:

- denial maps to `MEDIA_PERMISSION_DENIED` guidance;
- missing device maps to explicit no-device state;
- retry after permission correction is possible;
- terminal/unmount releases all tracks and peer connection;
- OS microphone indicator turns off;
- no crash or orphan audio playback.

## 15. Reconnect and network handover

Test:

- transient Socket.IO disconnect;
- Wi-Fi↔mobile/LAN handover;
- ICE failure/restart;
- TURN-only path;
- long network interruption.

Expected:

- active call enters `reconnecting` where recoverable;
- successful recovery returns to `active`;
- bounded timeout ends unrecoverable call;
- stale/expired signals are ignored;
- revoked policy/session is not restored by reconnect.

## 16. Revocation, disable and shutdown

During ringing and active call separately:

- revoke caller session;
- revoke callee bound session;
- disable caller account;
- disable callee account;
- create block;
- gracefully stop Local Server.

Verify terminal event/history and immediate failure of subsequent signaling/TURN. A stale socket must not continue the call.

## 17. Accessibility

- all call controls reachable by keyboard;
- visible focus and logical tab order;
- buttons have accessible names;
- call state uses live region without excessive announcements;
- Escape decline/end behavior is consistent;
- mute shortcut works without trapping ordinary input;
- reduced-motion disables pulse/large motion;
- narrow window and Android viewport remain usable;
- error/permission guidance is screen-reader accessible.

## 18. Cross-platform installed matrix

Required real installed calls:

- Windows ↔ Android;
- Windows ↔ Browser/PWA;
- Android ↔ Browser/PWA.

For each pair run:

- direct path where available;
- TURN-only path;
- caller/callee reversal;
- permission denial/recovery;
- device removal;
- network handover;
- block/session revoke during call;
- end cleanup.

Record exact signed build, OS/browser/device, network and evidence reference.

## 19. Existing product regression

Confirm no regression in:

- login/bootstrap/profile/password/TOTP;
- rooms, owner/moderator/member boundaries;
- ordinary messages, edit/delete/reply/forward/pin;
- files/images/voice and room restrictions;
- drafts/outbox/offline/resumable media;
- push/PWA lifecycle;
- device inventory/session revoke;
- backup/restore;
- read-only legacy secure history and `LEGACY_READ_ONLY` enforcement;
- Pulse boundaries.

## 20. Signed package acceptance

Windows 10 and Windows 11:

- installer Authenticode valid;
- signer subject/thumbprint/timestamp match approved evidence;
- clean install, repair, uninstall;
- installed binaries version `3.6.0` and signatures valid;
- Client/Server updater metadata and blockmaps complete;
- previous supported version → 3.6.0 update succeeds without data/profile loss.

Android:

- APK signer SHA-256 matches approved evidence;
- install/upgrade succeeds;
- saved servers and authorized local state preserved;
- HTTPS/TLS/navigation/audio permission policy remains fail-closed.

PWA:

- production assets install;
- service worker does not cache authenticated API/Socket.IO responses;
- update/activation does not interrupt active media without explicit lifecycle handling.

## 21. Release decision

PR may move from draft only when exact-head required checks and review requirements are satisfied.

Merge/tag/GitHub Release remain blocked until:

- all source gates pass;
- no unresolved high/critical finding exists;
- independent review is complete;
- production TURN is verified;
- signed Windows/Android acceptance is complete;
- cross-platform call matrix is complete;
- release evidence reports zero blockers and truthful approval.
