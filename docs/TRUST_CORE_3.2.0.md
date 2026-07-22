# Nexora Trust Core 3.2.0 — Foundation Design

## Status

This document covers the experimental `agent/nexora-3.2.0-trust-core` branch. It records the current foundation and remaining work; it is not a release note, audit or E2EE certification.

## Goal

Create a narrow Rust/WebAssembly trust boundary for MLS credentials, private state and cryptographic operations. The design should minimize cryptographic logic in the React application and prevent Local Server from becoming a holder of client private MLS keys.

## Current foundation

### Rust workspace

- pinned OpenMLS `0.8.1`;
- native and `wasm32` build targets;
- explicit crate boundary for Nexora Trust Core;
- no runtime download of unpinned cryptographic code.

### Ciphersuite

The branch targets MLS mandatory ciphersuite 1:

- X25519 for HPKE key agreement;
- ChaCha20-Poly1305 for authenticated encryption;
- SHA-256 for hashing/KDF components;
- Ed25519 for signatures.

### Identity and state

- persisted device signing identity;
- MLS credential material;
- KeyPackage generation/publication data;
- provider-state persistence with integrity snapshots;
- group create/load/join/add-member lifecycle;
- application-message encrypt/decrypt operations;
- exported group secret interface for future attachment encryption.

## Boundary responsibilities

### Trust Core owns

- generation and use of device signing keys;
- MLS credential and KeyPackage creation;
- private group state;
- group lifecycle cryptographic validation;
- application encryption/decryption;
- provider-state serialization/integrity;
- cryptographic error classification.

### Client integration owns

- user consent and device-verification UI;
- storage key acquisition and encrypted-state persistence;
- mapping UI actions to Trust Core calls;
- displaying explicit secure/insecure/error state;
- preventing silent plaintext fallback.

### Future Delivery Service owns

- authenticated device directory;
- KeyPackage/Welcome delivery;
- membership authorization;
- message ordering and replay records;
- ciphertext persistence and realtime delivery;
- device revocation propagation.

The foundation branch does not claim that the Delivery Service is complete.

## Exported group secrets

An exported MLS secret may be used as input to a separate attachment-encryption construction only after the construction defines:

- domain separation and context binding;
- per-attachment random nonce/key derivation;
- authenticated metadata;
- streaming/chunk behavior;
- key/epoch rotation;
- retry/idempotency semantics;
- deletion and cache policy.

Exporting a group secret alone does not make existing uploads encrypted.

## Storage requirements

Before production use, private state must be encrypted at rest and isolated per Nexora profile/server/device. Required negative tests include:

- copying state between profiles;
- stale snapshot rollback;
- truncated/corrupt storage;
- wrong storage key;
- concurrent writers;
- device revocation while offline;
- loss of local state without plaintext recovery fallback.

## Required next increments

1. Local Server Delivery Service and schema migration.
2. Device directory, verification, revocation and key transparency.
3. One-time KeyPackage/Welcome semantics.
4. Encrypted browser state, drafts and decrypted cache.
5. Complete secure outbox and realtime path.
6. Add/remove/update/recovery flows.
7. Plaintext-bypass guards for every message route.
8. Native/WASM/browser interoperability tests.
9. Attachment encryption design and tests.
10. Operator/user documentation, migration and rollback.
11. Full Windows/Linux/Android CI and external cryptographic review.

## Unsupported claims

This branch does not prove that stable Nexora, existing conversations, attachments or all metadata are end-to-end encrypted. Do not label a conversation secure solely because Trust Core code compiled or a local encrypt/decrypt test passed.
