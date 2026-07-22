# Индекс ветки Nexora 3.2.0 Trust Core Foundation

> `agent/nexora-3.2.0-trust-core` — experimental foundation поверх stable Nexora 3.1.2. Она не является complete E2EE release.

Stable project map остаётся на `main`. Этот индекс описывает branch-specific Trust Core additions.

## Rust / WebAssembly Trust Core

| Файл | Ответственность |
|---|---|
| `native/Cargo.toml` | Rust workspace и pinned dependency graph |
| `native/nexora-trust-core/Cargo.toml` | Trust Core crate configuration, native/WASM targets |
| `native/nexora-trust-core/src/lib.rs` | device identities, MLS credentials/KeyPackages, group lifecycle, encryption/decryption, integrity snapshots и exported secrets |

Target cryptographic suite:

- OpenMLS `0.8.1` / MLS 1.0;
- X25519;
- ChaCha20-Poly1305;
- SHA-256;
- Ed25519.

## Client integration foundation

| Файл | Ответственность |
|---|---|
| `client/src/trust/api.js` | browser ↔ Trust API boundary |
| `client/src/trust/encrypted-state.js` | encrypted client-state experiment and persistence contract |

Эти modules не образуют complete secure messaging UI/outbox path самостоятельно.

## Local Server foundation

| Файл | Ответственность |
|---|---|
| `server/create-server-v32.cjs` | experimental Trust-aware server composition |
| `server/trust-schema8.cjs` | additive schema 8 migration foundation |
| `server/trust-repository.cjs` | Trust/device/group repository abstraction |
| `server/trust-discovery-routes.cjs` | discovery/device/KeyPackage-facing routes |
| `server/trust-v4-routes.cjs` | experimental Trust API surface |

Branch API routes are not frozen compatibility contracts and must not be exposed as stable production API.

## Tests

| Файл | Проверяемая область |
|---|---|
| `test/trust-schema8.test.cjs` | schema 8 migration/integrity behavior |
| `test/trust-repository.test.cjs` | repository persistence and scope invariants |
| `test/trust-local-integration.test.cjs` | Local Server integration foundation |
| `test/trust-encrypted-state.test.cjs` | encrypted client state behavior |

Native/WASM workflow files provide development diagnostics/build gates. Passing them does not replace cross-device, plaintext-bypass, recovery, attachment and full stable regression tests.

## Missing release contours

- complete Local Server Delivery Service;
- device verification/revocation and key transparency UX;
- one-time Welcome/KeyPackage production semantics;
- full MLS group add/remove/update/recovery lifecycle;
- secure UI, drafts, cache and durable outbox;
- exhaustive plaintext fallback prevention;
- attachment encryption construction;
- stable API/version/migration/release documentation;
- Windows/Linux/Android full CI and independent cryptographic review.

## Documentation

- `README.md` — branch scope and warnings;
- `BRANCH_STATUS.md` — classification and limitations;
- `docs/TRUST_CORE_3.2.0.md` — foundation design;
- `SECURITY.md` — branch security reporting;
- `docs/ARCHITECTURE.md` — branch architecture.
