# Nexora 3.2.0 Release Notes — Draft

> **Release status:** not published. This document describes the current PR #12 implementation and unresolved release blockers. It must not be used to claim independently audited E2EE.

## Trust Core and MLS secure messaging

Nexora 3.2.0 introduces a separate device Trust boundary and an MLS 1.0 secure-message path.

Implemented behavior:

- Ed25519 device identity with proof-of-possession registration;
- bootstrap verification for the first device and signed approval for subsequent devices;
- signed device revocation with immediate delivery denial;
- Trusted Devices settings UI with fingerprint comparison, approval, revocation and local self-wipe;
- one-time, expiring MLS KeyPackages;
- device/conversation-scoped Welcome delivery;
- MLS group lifecycle with monotonic epoch commits;
- ciphertext replay protection;
- missed-commit recovery after offline periods;
- explicit failure when local private group state is lost.

The fixed MLS profile is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

## Ciphertext-only secure path

For a conversation with an active MLS group:

- text is encrypted before it enters durable outbox;
- outbox stores and retries an MLS ciphertext envelope;
- Local Server persists ciphertext and delivery metadata but does not decrypt content;
- recipients decrypt on their own verified devices;
- decrypted cache, drafts and private MLS state are encrypted in IndexedDB;
- local search works over the encrypted decrypted-content cache;
- legacy plaintext creation is rejected by the server.

Plaintext guards cover legacy send, forward, edit, server draft, scheduled message, poll, bot message and upload paths after MLS activation. Runtime tests execute the direct REST and Socket.IO bypass attempts against a real schema 8 server.

## Encrypted files, images and voice

Secure conversations support development-stage encrypted media without using legacy plaintext upload:

- each payload receives a random AES-256-GCM key and 96-bit IV;
- AAD binds conversation ID, attachment ID and media kind;
- plaintext and ciphertext SHA-256 are verified;
- source filename, MIME, caption, voice duration and waveform are carried only inside MLS content;
- Local Server stores generic `application/octet-stream` ciphertext with an opaque ID;
- pending ciphertext is inaccessible before atomic MLS-message claim and expires after 24 hours;
- duplicate upload with the same ID/scope/hash is idempotent;
- payload substitution, hash mismatch, attachment reuse and scope mismatch are rejected;
- Client UI provides progress, cancel, image preview, voice recording/playback and explicit verified download;
- failed outbox entries retain only opaque attachment ID and MLS ciphertext for safe retry;
- the ordinary offline cache removes the decrypted attachment descriptor.

When any room file/image/voice class is disabled, the complete opaque media path fails closed because Local Server cannot safely classify encrypted content.

Local Server still sees account/device/conversation scope, uploader, attachment ID, ciphertext size, timing, network context and delivery events. This release draft does not claim metadata or traffic-pattern confidentiality.

## Local Server schema 8

Schema 8 adds Trust and MLS directory/delivery tables on top of the stable schema 7 database.

Migration behavior:

- source and destination `integrity_check`;
- minimum free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- `BEGIN IMMEDIATE` transaction;
- idempotent schema creation;
- downgrade protection during normal persistence and restore.

Rollback is restore-from-backup, not an in-place downgrade. See [docs/MIGRATION_3.2.0.md](docs/MIGRATION_3.2.0.md).

## Reliability fixes found during media testing

A rejected `SqliteStore.mutate()` operation previously left the internal serialized queue rejected. The original caller received the correct error, but later `flush()` or shutdown could rethrow the already handled failure. The queue now stores a handled continuation while the operation Promise remains rejected for its caller. A regression test verifies rollback, successful flush and subsequent mutation.

## Security gate additions

The release security audit checks:

- one-time/expiring Trust challenges;
- Ed25519 device-proof verification;
- CSRF plus device identifier requirements;
- signed verify/revoke client flow;
- non-extractable device identity keys;
- AES-GCM client-state wrapping;
- complete Trust scope wipe on self-revoke;
- fixed MLS ciphersuite and replay rejection;
- ciphertext-only serialization and server-side legacy plaintext guards;
- exact GCM attachment size and timing-safe ciphertext hash;
- opaque server metadata and one-time attachment claim;
- fail-closed room media policy;
- client AAD binding and post-download integrity;
- upload progress/cancel and descriptor isolation from ordinary outbox/cache.

## Compatibility

- target version: `3.2.0`;
- Local Server database: schema 8;
- browser/Windows/Android Client handshake: `3.2.0`;
- stable 3.1.2 remains the production baseline until this release is approved;
- 3.1.x clients are not supported for conversations that have activated the secure 3.2.0 path;
- existing 3.1.x message history/files are not retroactively encrypted.

## Current automated coverage

- schema 7 → 8 migration, idempotency and downgrade protection;
- functional clock and rejected mutation queue regressions;
- device registration, verification and revocation;
- challenge scope/single-use;
- KeyPackage atomic one-time claim;
- Welcome conversation scoping;
- commit epoch and replay enforcement;
- revoked-device delivery denial;
- missed-commit recovery;
- direct server plaintext downgrade attempts;
- attachment upload/idempotency/hash/pending/delete/fail-closed policy;
- real `mls:message` attachment claim, idempotent retry, reuse rejection and replay-reservation release;
- Alice/Bob KeyPackage → Add → Welcome → join → encrypt/decrypt interoperability;
- Pulse schema 8 compatibility;
- Windows production build/unit/security gate;
- Linux full test and release-check jobs;
- Android source build.

## Unresolved blockers

This draft is not releasable until the following are completed:

- metadata minimization/traffic-analysis review;
- expanded multi-device simultaneous commit, revoke/re-add and corrupted-state matrix;
- runtime E2E on Electron, PWA and Android;
- load/soak and long-offline recovery testing;
- final release verification report;
- signing-machine checks and signed installers;
- independent cryptographic and application-security review.
