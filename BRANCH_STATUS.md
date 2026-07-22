# Branch Status — `agent/nexora-3.2.0-trust-core-mls`

## Classification

- Target version: `3.2.0` development.
- Base stable release: `3.1.2`.
- Pull Request: `#12`.
- Status: draft / experimental / not releasable.
- Production use: prohibited until the remaining blockers and external review are complete.

## Implemented and verified in code/tests

- Local Server schema 8 migration with backup, integrity and downgrade checks;
- Ed25519 device identity, verification and revocation;
- one-time KeyPackage and conversation-scoped Welcome delivery;
- monotonic MLS epochs, signed commits and replay protection;
- ciphertext-only secure transport, persistence and durable outbox;
- encrypted IndexedDB state, KeyPackages, decrypted cache and drafts;
- Secure Message Pane with no plaintext fallback;
- Trusted Devices settings UI with fingerprint, verify, revoke and self-wipe;
- AES-256-GCM encrypted files, images and voice with attachment keys/metadata inside MLS content;
- opaque attachment API with exact-size/hash validation, pending expiry, cancel and one-time atomic claim;
- client upload progress, cancellation, verified local decrypt, image preview and voice playback;
- fail-closed room policy for opaque media when any file/image/voice class is disabled;
- server-side guards for legacy send/forward/edit/draft/scheduled/poll/bot/upload paths;
- missed-commit recovery and explicit lost-state failure;
- schema, Trust Core, recovery, plaintext-guard, media, store-queue and Alice/Bob interoperability tests;
- `3.2.0` package/lock/Android/client version metadata and release-check integration.

## Remaining release blockers

- metadata minimization and traffic-analysis review;
- broader multi-device concurrency, revoke/re-add and corrupted-state matrix;
- browser/Electron/Android runtime E2E beyond build verification;
- load, soak and long-offline recovery tests;
- final release verification report and signing-machine checks;
- independent cryptographic and application-security review.

## Metadata boundary

Local Server does not receive secure-message plaintext, attachment key, source filename, actual MIME, voice duration or waveform. It still observes account/device identifiers, conversation/room scope, uploader, attachment ID, ciphertext size, timing, network context and delivery events. This branch does not claim traffic-analysis resistance.

## Documentation rule

Branch-local documents describe verified branch behavior and explicitly mark unsupported claims. Stable 3.1.2 documentation remains authoritative for production until a verified 3.2.0 release is merged.

## Safety

Do not use this branch for real private conversations or describe it as audited E2EE. Encrypted media is implemented but remains development-only until the complete platform matrix, soak/load, signing and independent review gates are finished. Test only with disposable accounts, devices, rooms and data.
