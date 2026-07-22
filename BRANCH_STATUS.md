# Branch Status — `agent/nexora-3.2.0-trust-core-mls`

## Classification

- Target version: `3.2.0`.
- Base stable release: `3.1.2`.
- Pull Request: `#12`.
- Status: automated release candidate / GitHub prerelease eligible.
- Stable production promotion remains blocked until packaged runtime, signing and independent security-review gates are complete.

## Implemented and verified in code/tests

- Local Server schema 8 migration with backup, integrity and downgrade checks;
- Ed25519 device identity, verification and revocation;
- one-time KeyPackage and conversation-scoped Welcome delivery;
- monotonic MLS epochs, signed commits and replay protection;
- ciphertext-only secure transport, persistence and durable outbox;
- Socket.IO secure delivery scoped to active, verified MLS device rooms rather than account-wide rooms;
- immediate targeted socket disconnect when Trust is revoked;
- client-side revocation handling that removes local keys, MLS state, cache and drafts before reconnect;
- encrypted IndexedDB state, KeyPackages, decrypted cache and drafts;
- Secure Message Pane with no plaintext fallback;
- Trusted Devices settings UI with fingerprint, verify, revoke and self-wipe;
- AES-256-GCM encrypted files, images and voice with attachment keys/metadata inside MLS content;
- opaque attachment API with exact-size/hash validation, pending expiry, cancel and one-time atomic claim;
- client upload progress, cancellation, verified local decrypt, image preview and voice playback;
- fail-closed room policy for opaque media when any file/image/voice class is disabled;
- server-side guards for legacy send/forward/edit/draft/scheduled/poll/bot/upload paths;
- missed-commit recovery and explicit lost-state failure;
- schema, Trust Core, recovery, plaintext-guard, media, store-queue, device-scoped realtime and Alice/Bob interoperability tests;
- one-minute schema 8 soak with repeated mutations, backups and SQLite integrity checks;
- synchronized `3.2.0` package/lock/Android/client metadata and full release-check integration.

## Automated candidate gate

GitHub Actions CI run `#222` (`29919641225`) passed on commit `927ae6300392d161f987acb057435f5d0e6ca2f9`:

- Windows production check, unit suite and security audit;
- Linux full `npm test`;
- dedicated `npm run release:check`;
- schema 8 soak;
- Android `assembleDebug`.

A final documentation-only CI run must still bind the verification report to the exact release-candidate head.

## Remaining stable-release blockers

- metadata minimization and traffic-analysis review beyond the documented metadata boundary;
- broader simultaneous-commit, revoke/re-add and corrupted local-state platform matrix;
- packaged Windows Electron, installed PWA and physical Android runtime E2E;
- longer-duration load/soak and extended offline field evidence;
- Authenticode signing-machine checks and signed Windows updater artifacts;
- independent cryptographic and application-security review.

These blockers do not prevent publishing a clearly marked source/PWA GitHub prerelease. They do prevent a stable production claim, signed auto-update rollout or “audited E2EE” wording.

## Metadata boundary

Local Server does not receive secure-message plaintext, attachment key, source filename, actual MIME, voice duration or waveform. It still observes account/device identifiers, conversation/room scope, uploader, attachment ID, ciphertext size, timing, network context and delivery events. Nexora 3.2.0 does not claim traffic-analysis resistance.

## Documentation rule

Branch-local documents describe verified behavior and separate automated evidence from manual, signing and independent-review evidence. Stable 3.1.2 documentation remains authoritative for production until a signed 3.2.0 promotion is approved.

## Safety

A source/PWA prerelease may be used for controlled testing with disposable accounts and data. Do not use it for high-risk private communications, distribute unsigned updater binaries, or describe it as independently audited E2EE.
