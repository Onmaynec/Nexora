# Nexora 3.2.0 Trust Core / MLS — Architecture and Readiness

## Status

This document covers the development branch `agent/nexora-3.2.0-trust-core-mls`. It is an implementation record and release-readiness checklist, not a security certification.

Verified in the branch:

- Local Server schema 8 migration with backup, integrity checks and downgrade protection;
- Ed25519 device identity, verification and revocation;
- one-time MLS KeyPackage and conversation-scoped Welcome delivery;
- monotonic group epochs, signed commits and ciphertext replay protection;
- ciphertext-only secure-message transport and persistence;
- encrypted local MLS state, KeyPackages, decrypted cache and drafts;
- secure-message UI/outbox and trusted-device management UI;
- server-side plaintext guards for legacy message, forward, scheduled, poll, bot and upload paths;
- schema, Trust Core, recovery, plaintext-guard and Alice/Bob interoperability tests.

The branch remains draft because encrypted attachments, metadata policy, broader multi-device/failure testing, release documentation and independent cryptographic review are not complete.

## Security objective

The private-message path uses MLS 1.0 so that:

- message content is encrypted on the sending device;
- Local Server transports and persists ciphertext only for the secure path;
- membership changes advance a monotonic group epoch;
- removed or revoked devices cannot receive subsequent delivery;
- private MLS state and decrypted cache remain encrypted at rest on the client;
- replayed or substituted protocol messages are rejected.

Metadata such as account identifiers, conversation membership, delivery timing, ciphertext size and operational logs is not hidden automatically by MLS and requires separate minimization controls.

## Cryptographic profile

The implementation fixes the MLS ciphersuite to `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (`0x0001`):

- X25519 HPKE key agreement;
- AES-128-GCM AEAD;
- SHA-256;
- Ed25519 signatures.

The npm dependency is pinned exactly to `ts-mls@1.6.2`; the adapter uses the API actually published by that package rather than convenience exports present only in unreleased source revisions.

## Components

### Browser MLS engine

`client/src/crypto/mls-engine.js` creates and joins groups, generates KeyPackages, creates commits and MLS application messages, processes Welcome/commit/application messages, and serializes provider state.

Credential authentication is not `accept-all`: the engine resolves the `(userId, deviceId)` credential through Trust Core and verifies the registered signature key and active/verified state.

### Client Trust boundary

`client/src/crypto/trust-client.js`, `trust-device-management.js` and `trust-store.js` provide:

- non-extractable Ed25519 device identity keys;
- a separate MLS signing key bound to the same registered device credential;
- signed challenge-response for registration, verification and revocation;
- AES-GCM wrapping of private MLS state, KeyPackages, decrypted cache and drafts in IndexedDB;
- scope separation by Server ID and local user ID;
- complete local wipe after self-revocation.

The browser runtime is still part of the trusted computing base. XSS, compromised dependencies or a compromised client binary can access plaintext while the user is using the application.

### Local Server Trust Core

`server/trust-core.cjs` and the v4 Trust routes store only public device identity, MLS directory/delivery data, commitments, ciphertext and audit metadata. They enforce:

- authorization and conversation membership;
- device status and trust state;
- one-time, expiring and operation-scoped challenges;
- one-time KeyPackage/Welcome claims;
- monotonic epoch transitions;
- signed commit proof verification;
- replay hashes and expiration;
- immediate delivery denial after device revocation.

Local Server is the Delivery Service. It does not hold private MLS state and does not decrypt secure-message content.

### Schema 8

Schema 8 is additive to schema 7 and uses the existing migration safety model:

1. verify integrity and available disk space;
2. create and verify a pre-migration backup;
3. apply an idempotent transaction before network listen;
4. reject schema downgrade through legacy persistence;
5. verify post-migration integrity.

The rollback procedure is restore-from-backup, not an in-place destructive downgrade.

## Protocol lifecycle

### Device registration and verification

1. Client generates an Ed25519 identity key locally.
2. Client requests a scoped registration challenge.
3. Client signs the canonical Trust proof.
4. The first device receives bootstrap verification; later devices remain unverified.
5. A currently verified device signs a `verify_device` challenge for the pending device.
6. Revocation uses a separate `revoke_device` challenge and immediately removes delivery rights.

### KeyPackage and Welcome

- KeyPackages are single-use, expiring and bound to one active verified device.
- Claims run in an immediate transaction and record the requester.
- Welcome records are addressed to a specific device and conversation.
- Claiming or replaying the same package/Welcome is rejected.
- Clients replenish the KeyPackage pool after consumption.

### Group changes and recovery

- accepted commits advance exactly one epoch;
- duplicate, stale, skipped or substituted commits are rejected;
- clients can request a contiguous missed-commit chain after an offline period;
- a gap in the commit journal is a hard error;
- missing verified devices are added through claimed KeyPackages and an MLS Add commit;
- lost local group state does not downgrade to plaintext and requires explicit device recovery/re-enrollment.

### Application messages

- the composer produces an MLS application message before entering outbox;
- outbox stores and retries ciphertext envelopes only;
- Local Server validates account/device/conversation/group/epoch and replay state without decryption;
- recipients decrypt only after group-state and authenticated-data checks;
- local search operates over the encrypted decrypted-content cache;
- edits/replies/reactions are represented through the secure client path where supported.

## Plaintext bypass prevention

Once a conversation has an active MLS group, Local Server rejects plaintext creation through:

- legacy Socket.IO `message:send` and `message:forward`;
- legacy edit/upload paths;
- server drafts and scheduled messages;
- polls;
- bot message API;
- chunked upload initiation/completion;
- other v3 paths that call the legacy text-message service.

Attachments, images and voice are currently disabled in the secure pane rather than transmitted without encryption. This is a deliberate safe failure, not completed encrypted-media support.

## Remaining release blockers

- encrypted attachment format, key derivation, authenticated metadata and streaming/resumable upload design;
- metadata minimization and traffic-analysis review;
- multi-device concurrency, simultaneous commits, removal/re-add and corrupted-state matrix;
- browser/Electron/Android runtime integration tests beyond source build;
- load/soak and long-offline recovery testing;
- final version metadata, release notes, administrator/tester guides and verification report;
- independent cryptographic and application-security review.

## Required final gates

- `npm run release:check`;
- Windows production web/syntax/unit/security gate;
- Linux full test suite;
- Android `assembleDebug` and release-source validation;
- schema 7 fixture migration and backup restore exercise;
- direct REST/Socket.IO downgrade attempts;
- two-device and multi-device interoperability;
- encrypted IndexedDB corruption/isolation tests;
- release signing checks on the signing machine;
- external review of protocol usage, dependency supply chain and metadata exposure.

## Unsupported claims

Until the remaining blockers are closed, this branch does not establish that:

- every Nexora chat or attachment is E2EE;
- metadata is confidential;
- existing 3.1.x history is automatically re-encrypted;
- recovery from lost private state is seamless;
- the implementation has been independently audited;
- stable 3.1.2 clients interoperate with secure 3.2.0 conversations.
