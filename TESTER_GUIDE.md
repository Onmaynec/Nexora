# Nexora Acceptance Test Guide

## 1. Test scope

This guide covers:

- signed production baseline `3.1.2`;
- current `3.2.0` Source/PWA prerelease;
- Windows Client/Server, PWA and Android source/runtime surfaces;
- application API v3, Trust/MLS API v4 and SQLite schema 8.

The `3.2.0` prerelease is intended for controlled testing with disposable accounts and data. It is not independently audited E2EE and is not a signed stable Windows release.

## 2. Test environment record

Record before testing:

- Client version and platform;
- Local Server version and schema;
- Pulse Cloud version/mode where applicable;
- operating system and browser;
- deployment type: localhost, LAN, private VPN or public HTTPS;
- Server ID and sanitized certificate fingerprint;
- test date and responsible tester;
- Git commit/tag or release asset identifier.

## 3. Connection and TLS

1. Obtain the full HTTPS URL, Server ID and SHA-256 fingerprint through a trusted channel.
2. Connect with Windows Client, PWA or Android.
3. Confirm that a new certificate requires explicit trust.
4. Confirm that a changed fingerprint requires renewed approval.
5. Verify that browser/PWA and Android reject an untrusted certificate.
6. Verify that HTTP and mixed content are rejected where required.

Expected failures:

- incomplete IPv4/URL is rejected;
- certificate SAN mismatch is rejected;
- incompatible Client receives a clear compatibility error;
- external Android links open outside the application;
- TLS errors are never bypassed automatically.

## 4. Core messaging

Test:

- direct messages, Saved Messages and rooms;
- text, reply, thread, reaction, mention and poll;
- edit, delete, forward, pin and bookmark;
- silent and scheduled send;
- drafts, archive, mute, filters and search;
- read state, notifications and unread divider;
- offline cache, restart, durable outbox and delta sync without duplicates.

UI acceptance:

- no zero badges;
- reaction picker remains interactive;
- menus and docks stay within viewport/panel boundaries;
- long names, filenames and 99+ counters do not break layout;
- keyboard navigation and narrow-window behavior remain usable.

## 5. Profiles, contacts and sessions

- open the same profile card from message, header, chat list, contacts, search and room members;
- verify null/empty relationship state does not produce a blank screen;
- update display name, bio/status and avatar;
- change password and terminate a specific session;
- remove a contact without deleting history;
- block/unblock and verify direct-message restrictions;
- enable local TOTP and consume a recovery code once.

## 6. Rooms and moderation

Create public and private rooms and verify:

- direct join, join request and invitation join;
- `owner`, `moderator`, `member` permission boundaries;
- moderator appointment/removal;
- atomic ownership transfer;
- removal, ban and unban;
- read-only and slow mode;
- file/image/voice restrictions;
- multiple invitations, expiry, usage limit and revocation;
- custom roles/categories;
- reports, appeals, temporary restrictions and pre-approval;
- audit entries and system messages.

After removal or ban, direct REST calls and realtime events for the room must be denied.

## 7. Legacy files and voice

- upload multiple files;
- cancel and retry an upload;
- interrupt a resumable upload and continue it;
- verify size, SHA-256 and actual MIME behavior;
- verify fake image extension is rejected or handled as binary;
- open image, PDF/text preview and media archive;
- record, pause, resume, preview and send voice;
- verify waveform, playback speeds and listened state;
- close the global voice dock and confirm complete audio-state reset.

## 8. Trust devices — 3.2.0

### Enrollment

- create the first device and verify bootstrap state;
- enroll a second device;
- compare fingerprints through a trusted channel;
- approve the second device from an active verified device;
- confirm unverified device cannot perform secure operations.

### Revocation

- revoke a second device;
- confirm targeted Socket.IO disconnect is immediate;
- confirm other devices remain connected;
- confirm revoked Client wipes device identity, private MLS state, KeyPackages, cache and drafts;
- confirm revoked device cannot receive new KeyPackage, Welcome, commit or ciphertext events;
- verify reenrollment requires a new device lifecycle.

## 9. MLS secure messaging — 3.2.0

- create a secure conversation between verified devices;
- verify one-time KeyPackage claim;
- verify Welcome scope is bound to user, device and conversation;
- send messages in both directions;
- restart one Client and recover a contiguous commit chain;
- verify replayed ciphertext is rejected;
- verify stale/skipped epoch is rejected;
- verify explicit failure after unrecoverable private-state loss;
- verify local decrypted search/cache behavior;
- verify server serialization exposes no plaintext message text.

### Downgrade tests

After MLS activation, attempt direct legacy operations:

- send;
- forward;
- edit;
- server draft;
- scheduled message;
- poll;
- bot message;
- multipart upload;
- resumable upload.

Every plaintext path must fail closed. No secure operation may silently fall back to legacy plaintext.

## 10. Secure files, images and voice — 3.2.0

- upload encrypted file, image and voice payloads;
- verify progress and cancel behavior;
- verify pending ciphertext cannot be downloaded before message claim;
- atomically claim attachment through an MLS message;
- verify authorized local decrypt and integrity;
- verify image preview and voice playback;
- repeat upload with same ID/scope/hash and confirm idempotency;
- change hash, size, scope or descriptor and confirm rejection;
- attempt attachment reuse in another message and confirm rejection;
- cancel pending upload and confirm cleanup;
- verify failed outbox retains only opaque attachment ID and MLS ciphertext;
- verify ordinary cache does not retain decrypted attachment descriptor.

Room policy:

- disable files, images or voice;
- confirm the complete opaque secure-media path is blocked;
- confirm no plaintext fallback is offered.

## 11. Cloud Identity and Pulse

### Cloud Identity

- register and verify email;
- enable Cloud MFA;
- exercise OAuth 2.1 Authorization Code + PKCE S256;
- verify exact redirect URI matching;
- link Local Account using one-time signed flow;
- reject replayed link/nonce;
- unlink after current-password reauthentication;
- confirm local messaging remains available during Cloud outage.

### Local sandbox

Execute:

```text
pulse sandbox on
plus grant <user>
pulse user <user>
impulses grant <user> 50 qa
impulses revoke <user> 10 qa
plus revoke <user>
```

Verify:

- initial test Plus activation grants 400 Impulses once;
- repeated active grant does not duplicate the grant;
- balance never becomes negative;
- checkout is disabled;
- all mutations appear in audit/ledger;
- production Pulse configuration disables local sandbox authority.

### Production provider sandbox

- checkout and verified webhook;
- receipt and billing portal;
- cancel-at-period-end;
- entitlement revoke propagation;
- duplicate provider event/idempotency no-op;
- payload or scope substitution rejection;
- Cloud outage fallback to last verified cache without blocking messaging.

## 12. Operational runtime

- `GET /healthz/live` returns success;
- `GET /healthz/ready` reports database/schema/runtime state;
- readiness becomes `503` during drain;
- `/metrics` requires Bearer token when configured;
- without token, metrics are loopback-only;
- logs contain request ID and no credentials;
- allowlisted developer commands execute;
- shell/eval and unknown commands are rejected;
- emergency read-only permits reads and blocks mutations;
- graceful shutdown completes without SQLite corruption.

## 13. Migration and recovery

From a verified schema 7 backup:

1. start the 3.2.0 Local Server;
2. confirm source integrity and free-space checks;
3. confirm pre-migration backup creation;
4. confirm schema 8 and post-migration integrity;
5. confirm existing 3.1.x data remains readable;
6. confirm old binary/downgrade path is blocked;
7. restore the verified backup according to the documented rollback procedure.

Do not use production data as the first migration test.

## 14. Platform matrix

### Windows

- clean Client/Server installation;
- update from previous signed stable version;
- certificate/session persistence;
- updater initial check and six-hour schedule;
- single-flight checks;
- `no_installable_update` diagnostic;
- Authenticode and updater assets for stable release only.

### PWA

- install/update application shell;
- offline shell and authorized local cache;
- no API/Socket.IO Service Worker caching;
- secure-state persistence across restart.

### Android

- source build with JDK 17 / SDK 36 / Gradle 8.13;
- HTTPS-only deep link;
- TLS error cancellation;
- external navigation handling;
- microphone and file permission flow;
- physical-device runtime matrix for stable promotion.

## 15. Automated gates

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

The authoritative automated evidence for 3.2.0 is [RELEASE_VERIFICATION_3.2.0.md](RELEASE_VERIFICATION_3.2.0.md).

## 16. Defect report

Include:

- Client/Server/Cloud versions;
- platform and OS;
- deployment type;
- exact reproduction steps;
- expected and actual result;
- timestamp and request ID;
- sanitized screenshot/log;
- whether the issue is a regression;
- migration/Trust/MLS state where relevant, without secrets.

Never publish passwords, cookies, OAuth tokens, TOTP/recovery codes, invite codes, bot/Pulse credentials, private CA keys, device private keys, MLS private state, user data or backup passphrase.
