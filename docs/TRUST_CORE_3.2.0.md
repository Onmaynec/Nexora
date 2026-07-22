# Nexora 3.2.0 Trust Core / MLS — Architecture and Readiness

## Status

This document covers the experimental `agent/nexora-3.2.0-trust-core-mls` branch. It is a development design record, not a security certification or release note.

## Security objective

The target private-message path uses MLS 1.0 so that:

- message content is encrypted on the sending device;
- Local Server transports and persists ciphertext only for the secure path;
- membership changes advance a monotonic group epoch;
- removed or revoked devices cannot continue using old delivery authorization;
- private MLS state and decrypted cache remain encrypted at rest on the client;
- replayed or substituted protocol messages are rejected.

Metadata such as account identifiers, room membership, delivery timing, ciphertext size and operational logs requires a separate minimization review and is not automatically hidden by MLS.

## Components

### Trust Core

The Trust Core is the cryptographic boundary responsible for device signing identity, MLS credentials, KeyPackages, group lifecycle, encryption/decryption and provider-state integrity.

The branch targets the MLS mandatory ciphersuite using:

- X25519 key agreement;
- ChaCha20-Poly1305 AEAD;
- SHA-256;
- Ed25519 signatures.

### Browser MLS engine

The browser-side engine coordinates UI/outbox operations with Trust Core, validates secure-channel state and converts application actions into MLS application messages or signed group commits.

### Encrypted client state

IndexedDB storage is intended to encrypt:

- private MLS group state;
- signing/device material exposed to the browser integration boundary;
- one-time KeyPackages;
- decrypted message cache;
- secure drafts and recovery state.

Rollback, corruption, key-loss and cross-profile isolation require explicit tests before release.

### Local Server Delivery Service

Local Server remains responsible for:

- authentication and device authorization;
- room membership and role checks;
- device verification/revocation state;
- one-time KeyPackage/Welcome delivery;
- monotonic event order and epoch/replay records;
- ciphertext storage and scoped realtime delivery;
- removing delivery access after user/device revocation.

It must not accept a plaintext fallback for a conversation marked secure.

### Schema 8

Schema 8 is additive to the stable schema 7 baseline and must use the existing migration safety model:

1. integrity and disk-space checks;
2. verified pre-migration backup;
3. transactional/idempotent migration before network listen;
4. schema downgrade protection;
5. post-migration integrity verification.

## Protocol lifecycle

### Device registration

1. Device creates a signing identity through Trust Core.
2. Local Server records the public device credential and verification state.
3. Verification/revocation events are authenticated, monotonic and audited.
4. Private signing material remains client-side.

### KeyPackage publication and consumption

- KeyPackages are single-use and bound to an active, non-revoked device.
- Local Server must consume delivery state atomically.
- Duplicate, expired, foreign or replayed KeyPackages are rejected.
- Welcome data is delivered only to the intended device and cannot be consumed twice.

### Group changes

- create/add/remove/update operations produce signed MLS commits;
- accepted commits advance exactly one valid epoch;
- stale, duplicate or skipped-epoch commits are rejected;
- membership and device revocation are rechecked before delivery;
- a removed member/device loses subsequent ciphertext delivery.

### Application messages

- secure conversations send MLS ciphertext only;
- Server validates authorization, conversation scope, epoch and replay token without decrypting content;
- Client decrypts only after group/epoch/authentication checks;
- outbox retries must remain idempotent and must not silently downgrade to plaintext.

## Recovery and revocation

Recovery must define and test:

- replacement-device enrollment;
- lost-device revocation;
- recovery authorization and audit;
- group rekey after revocation;
- behavior when local encrypted state is lost or corrupted;
- prevention of rollback to stale group state;
- explicit user-visible failure instead of plaintext fallback.

## Plaintext bypass prevention

Release readiness requires server and client guards for every path that can create or relay a message:

- REST message creation;
- Socket.IO events;
- durable outbox retry;
- drafts/scheduled messages;
- replies, edits and forwarding;
- bots, webhooks and integrations;
- imports, recovery and compatibility routes;
- attachment metadata and upload completion.

A hidden UI action is not a security control. Secure-channel enforcement must be server-side and verified by negative API tests.

## Required tests before release

- native and WASM Trust Core build/test gates;
- deterministic provider-state persistence and corruption tests;
- known-answer and cross-runtime encryption/decryption;
- two-device and multi-device interoperability;
- add/remove/update/revoke and concurrent commit scenarios;
- KeyPackage/Welcome single-use and replay tests;
- epoch rollback, duplicate, out-of-order and substitution tests;
- direct REST/Socket.IO plaintext bypass attempts;
- outbox restart/offline/resync without duplicate or downgrade;
- encrypted IndexedDB isolation, corruption and rollback;
- migration from real schema 7 data and rollback procedure;
- Windows, browser/PWA and Android integration matrix;
- load/soak, external review and release security audit.

## Non-goals and unsupported claims

Until all release gates pass, this branch does not establish that:

- all Nexora chats are E2EE;
- attachments or all metadata are confidential;
- existing 3.1.x conversations are automatically migrated securely;
- the implementation is independently audited;
- production key recovery is safe;
- stable clients interoperate with this branch.

## Documentation completion gate

A release candidate must include updated README, architecture, security policy/audit, administrator and tester guides, migration/rollback guide, protocol/API reference, changelog, release notes and verification report. All documents must distinguish verified behavior from planned work.
