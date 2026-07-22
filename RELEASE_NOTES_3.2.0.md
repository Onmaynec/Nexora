# Nexora 3.2.0 Release Notes — Draft

> **Release status:** not published. This document describes the current PR #12 implementation and its unresolved release blockers. It must not be used to claim independently audited E2EE.

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

Plaintext guards cover legacy send, forward, edit, server draft, scheduled message, poll, bot message and upload paths after MLS activation.

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

Rollback is restore-from-backup, not an in-place downgrade. See [MIGRATION_SCHEMA8.md](docs/MIGRATION_SCHEMA8.md).

## Security gate additions

The release security audit now checks:

- one-time/expiring Trust challenges;
- Ed25519 device-proof verification;
- CSRF plus device identifier requirements;
- signed verify/revoke client flow;
- non-extractable device identity keys;
- AES-GCM client-state wrapping;
- complete Trust scope wipe on self-revoke;
- fixed MLS ciphersuite;
- replay rejection;
- ciphertext-only serialization;
- server-side legacy plaintext guards.

## Compatibility

- target version: `3.2.0`;
- Local Server database: schema 8;
- browser/Windows/Android Client handshake: `3.2.0`;
- stable 3.1.2 remains the production baseline until this release is approved;
- 3.1.x clients are not supported for conversations that have activated the secure 3.2.0 path;
- existing 3.1.x message history is not retroactively encrypted.

## Current test coverage

- schema 7 → 8 migration and idempotency;
- functional clock regression;
- device registration, verification and revocation;
- challenge scope/single-use;
- KeyPackage atomic one-time claim;
- Welcome conversation scoping;
- commit epoch and replay enforcement;
- revoked-device delivery denial;
- missed-commit recovery;
- server plaintext downgrade attempts;
- Alice/Bob KeyPackage → Add → Welcome → join → encrypt/decrypt interoperability;
- Pulse schema 8 compatibility;
- Windows production build/unit/security gate;
- Linux full test suite;
- Android source build.

## Unresolved blockers

This draft is not releasable until the following are completed:

- encrypted attachments, images and voice with authenticated metadata;
- metadata minimization/traffic-analysis review;
- expanded multi-device simultaneous commit, revoke/re-add and corrupted-state matrix;
- runtime E2E on Electron, PWA and Android;
- load/soak and long-offline recovery testing;
- final administrator/tester documents and release verification report;
- signing-machine checks and signed installers;
- independent cryptographic and application-security review.

The secure pane intentionally disables attachments instead of falling back to an unencrypted upload.
