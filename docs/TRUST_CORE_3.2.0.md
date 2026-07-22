# Nexora 3.2.0 Trust Core / MLS — Architecture and Readiness

## Status

This document covers the `3.2.0` source/PWA prerelease candidate on branch `agent/nexora-3.2.0-trust-core-mls`. It is an implementation and automated-verification record, not a security certification or stable signed-release approval.

Verified in the branch implementation and automated tests:

- Local Server schema 8 migration with backup, integrity checks and downgrade protection;
- Ed25519 device identity, verification and revocation;
- one-time MLS KeyPackage and conversation-scoped Welcome delivery;
- monotonic group epochs, signed commits and ciphertext replay protection;
- ciphertext-only secure-message transport and persistence;
- device-scoped Socket.IO binding and verified MLS-member-only ciphertext delivery;
- immediate targeted disconnect plus client Trust-state wipe after revocation;
- encrypted local MLS state, KeyPackages, decrypted cache and drafts;
- secure-message UI/outbox and trusted-device management UI;
- AES-256-GCM encrypted files, images and voice with authenticated descriptor inside MLS content;
- opaque attachment upload, exact-size/hash checks, one-time claim, cancel and cleanup;
- server-side plaintext guards for legacy message, forward, scheduled, poll, bot and upload paths;
- schema, Trust Core, recovery, plaintext-guard, media, store-queue, device-scoped realtime and Alice/Bob interoperability tests;
- schema 8 soak with repeated mutations, backup creation and integrity checks.

The automated candidate is eligible for a clearly marked source/PWA prerelease. Stable promotion remains blocked by packaged/physical-device runtime evidence, signing-machine checks and independent cryptographic/application-security review.

## Security objective

The private-message path uses MLS 1.0 so that:

- message content is encrypted on the sending device;
- attachment keys and source metadata are delivered only inside MLS application content;
- Local Server transports and persists ciphertext only for the secure path;
- membership changes advance a monotonic group epoch;
- removed or revoked devices cannot receive subsequent delivery;
- private MLS state and decrypted cache remain encrypted at rest on the client;
- replayed or substituted protocol messages are rejected.

Metadata such as account/device identifiers, conversation membership, delivery timing, IP/network context, ciphertext size, attachment ID, uploader and operational logs is not hidden automatically by MLS or attachment encryption.

## Cryptographic profile

### MLS messages

The implementation fixes the MLS ciphersuite to `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (`0x0001`):

- X25519 HPKE key agreement;
- AES-128-GCM AEAD;
- SHA-256;
- Ed25519 signatures.

The npm dependency is pinned exactly to `ts-mls@1.6.2`; the adapter uses the API actually published by that package rather than convenience exports present only in unreleased source revisions.

### Attachments

Each file, image or voice payload is encrypted independently on the client with:

- a new random 256-bit AES key;
- a new random 96-bit IV;
- AES-256-GCM with a 128-bit authentication tag;
- AAD bound to `conversationId`, `attachmentId` and logical media kind;
- SHA-256 over plaintext and ciphertext for explicit post-transfer verification.

The versioned attachment descriptor contains the AES key, IV, original name, MIME, media kind, plaintext/ciphertext sizes, hashes, voice duration and waveform. The descriptor is serialized into MLS application plaintext and therefore reaches Local Server only as MLS ciphertext.

This design is not a claim of streaming encryption. The current client encrypts a maximum 25 MiB attachment in memory before upload.

## Components

### Browser MLS engine

`client/src/crypto/mls-engine.js` creates and joins groups, generates KeyPackages, creates commits and MLS application messages, processes Welcome/commit/application messages, and serializes provider state.

Credential authentication is not `accept-all`: the engine resolves the `(userId, deviceId)` credential through Trust Core and verifies the registered signature key and active/verified state.

### Client Trust and media boundary

`client/src/crypto/trust-client.js`, `trust-device-management.js`, `trust-store.js` and `e2ee-media.js` provide:

- non-extractable Ed25519 device identity keys;
- a separate MLS signing key bound to the same registered device credential;
- signed challenge-response for registration, verification and revocation;
- AES-GCM wrapping of private MLS state, KeyPackages, decrypted cache and drafts in IndexedDB;
- scope separation by Server ID and local user ID;
- complete local wipe after self-revocation or a remote revocation event targeting the current device;
- Socket.IO authentication with the active Trust device ID and forced disconnect on Trust failure;
- attachment AES-256-GCM encryption/decryption and AAD binding;
- XHR upload progress and abort;
- server-envelope ID/hash/size validation;
- post-download ciphertext and plaintext hash validation;
- local image preview, voice playback and explicit download.

The ordinary localStorage outbox stores only MLS ciphertext and opaque attachment ID. It does not store the attachment AES key, original name or MIME as separate plaintext fields. The decrypted offline message cache removes the attachment descriptor; the recoverable descriptor remains within encrypted Trust-store content.

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
- socket-to-device ownership and trust-state validation;
- ciphertext emission only to active, verified MLS member device rooms;
- immediate delivery denial and targeted Socket.IO disconnect after device revocation.

Local Server is the Delivery Service. It does not hold private MLS state and does not decrypt secure-message content.

### Opaque attachment service

`server/e2ee-attachments.cjs` accepts only `application/octet-stream` ciphertext for an active MLS conversation. It validates:

- authenticated local session and CSRF through the Trust route boundary;
- membership, room ban, posting restrictions and rate limits;
- attachment UUID and caller/conversation scope;
- plaintext size limit and exact `ciphertext = plaintext + 16-byte tag` size;
- timing-safe SHA-256 ciphertext equality;
- storage quota and duplicate/payload-substitution semantics;
- room media policy.

The server generates the stored filename and generic MIME. A pending attachment is unavailable for download and expires after 24 hours. `mls:message` atomically claims it in the same state mutation that creates the encrypted message. A claimed attachment cannot be rebound or deleted through the pending-delete route.

When a room disables any of files, images or voice, the server blocks the complete opaque E2EE media path. This is deliberate fail-closed behavior: the server cannot reliably classify encrypted content without weakening confidentiality.

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
6. Revocation uses a separate `revoke_device` challenge, removes group delivery rights, disconnects the targeted socket and causes the affected client to clear its local Trust scope.

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
- the sending socket must be bound to the same active verified device named by the MLS envelope;
- ciphertext is emitted only to active verified devices in the current MLS group;
- recipients decrypt only after group-state and authenticated-data checks;
- local search operates over the encrypted decrypted-content cache;
- edits/replies/reactions are represented through the secure client path where supported.

### Encrypted attachment

1. Client reads the selected Blob and creates a random attachment ID, AES key and IV.
2. Client encrypts bytes with conversation/attachment/kind AAD and computes both hashes.
3. Client uploads opaque ciphertext with ID, plaintext size and ciphertext hash.
4. Server stores it as pending and returns only opaque envelope metadata.
5. Client places the descriptor inside an MLS application message and enqueues that MLS ciphertext with the attachment ID.
6. `mls:message` reserves the MLS replay hash and atomically claims the pending attachment while creating the message.
7. Recipient verifies the MLS message, descriptor-to-server envelope, downloaded ciphertext hash, GCM tag and plaintext hash before preview or download.
8. If claim fails, the replay reservation is released and the pending attachment remains safely scoped or expires.

## Plaintext bypass prevention

Once a conversation has an active MLS group, Local Server rejects plaintext creation through:

- legacy Socket.IO `message:send` and `message:forward`;
- legacy edit/upload paths;
- server drafts and scheduled messages;
- polls;
- bot message API;
- chunked upload initiation/chunk/completion;
- other v3 paths that call the legacy text-message service.

Encrypted media uses only the v4 opaque endpoint and MLS message binding. It does not fall back to legacy multipart or resumable plaintext upload.

## Remaining release blockers

- metadata minimization and traffic-analysis review beyond the documented boundary;
- broader simultaneous-commit, re-add and corrupted local-state platform matrix;
- packaged Electron, installed PWA and physical Android runtime integration;
- longer-duration load/soak and extended offline field evidence;
- final Authenticode signing-machine release checks;
- independent cryptographic and application-security review.

## Required final gates

- `npm run release:check`;
- Windows production web/syntax/unit/security gate;
- Linux full test suite;
- schema 8 soak with repeated writes, backups and integrity checks;
- Android `assembleDebug` and release-source validation;
- schema 7 fixture migration and backup restore exercise;
- direct REST/Socket.IO downgrade attempts;
- attachment upload/claim/replay/corruption/policy tests;
- two-device and broader multi-device interoperability;
- encrypted IndexedDB corruption/isolation tests;
- release signing checks on the signing machine;
- external review of protocol usage, dependency supply chain and metadata exposure.

## Unsupported claims

Until the remaining blockers are closed, this branch does not establish that:

- every Nexora chat or attachment is protected by independently reviewed E2EE;
- metadata or traffic patterns are confidential;
- existing 3.1.x history/files are automatically re-encrypted;
- recovery from lost private state is seamless;
- the implementation has been independently audited;
- stable 3.1.2 clients interoperate with secure 3.2.0 conversations.
