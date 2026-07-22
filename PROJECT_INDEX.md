# Индекс ветки Nexora 3.2.0 Trust Core / MLS

> Ветка `agent/nexora-3.2.0-trust-core-mls` — draft development поверх stable Nexora 3.1.2. Она не является release-ready E2EE.

Основная stable-карта проекта находится на `main`. Ниже перечислены branch-specific additions и integration points.

## Client secure-messaging contour

| Файл | Ответственность |
|---|---|
| `client/src/components/SecureMessagePane.jsx` | secure-conversation UI path и explicit secure/error states |
| `client/src/components/TrustDevicesCard.jsx` | device verification/revocation management surface |
| `client/src/components/SettingsPage.jsx` | Trust/device settings integration |
| `client/src/components/Workspace.jsx` | secure channel/device surfaces in workspace |
| `client/src/crypto/mls-engine.js` | browser MLS orchestration and message/commit processing |
| `client/src/crypto/mls-members.js` | member/device mapping and MLS membership helpers |
| `client/src/crypto/trust-client.js` | client ↔ Trust Core/Local Server integration |
| `client/src/crypto/trust-device-management.js` | device lifecycle, verification and revocation requests |
| `client/src/crypto/trust-store.js` | encrypted IndexedDB state/cache/draft persistence |
| `client/src/outbox.js` | secure-message retry/idempotency integration |
| `client/src/secure-messaging.css` | secure messaging UI styles |
| `client/src/trust-devices.css` | device-management UI styles |

## Local Server Trust/MLS contour

| Файл | Ответственность |
|---|---|
| `server/trust-schema8.cjs` | safe schema 8 migration and Trust/MLS persistence |
| `server/trust-core.cjs` | Trust Core service boundary and cryptographic operations adapter |
| `server/trust-routes.cjs` | device, credentials, KeyPackage/Welcome and secure-channel API |
| `server/trust-recovery.cjs` | recovery/revocation state machine |
| `server/trust-recovery-routes.cjs` | authenticated recovery API routes |
| `server/mls-transport.cjs` | ciphertext/commit transport, epoch/order/replay controls |
| `server/create-server-v31.cjs` | stable 3.1 composition integration point |
| `server/create-server.cjs` | runtime composition entrypoint |
| `server/v3-features.cjs` | existing message/realtime paths and plaintext guards integration |
| `server/model.cjs` | branch data serialization/model extensions |

## Data model direction

Schema 8 extends stable schema 7 with Trust/MLS records for:

- device public credentials and verification/revocation state;
- one-time KeyPackage publication/consumption;
- Welcome delivery state;
- group/conversation identifiers and monotonic epochs;
- signed commits, replay/order records and ciphertext envelopes;
- recovery state and audit metadata.

Migration must preserve the stable safety sequence: integrity/free-space checks, verified backup, transactional/idempotent migration before network listen, downgrade protection and post-migration verification.

## Secure protocol surfaces

Branch-specific API/realtime groups include:

- device registration/list/verify/revoke;
- Trust Core credential and KeyPackage publication;
- one-time KeyPackage/Welcome delivery;
- MLS group initialization/join/member changes;
- ciphertext application messages and signed commits;
- recovery/replacement-device operations;
- secure conversation bootstrap/state synchronization.

Exact route contracts remain development interfaces until API documentation and interoperability tests are frozen.

## Tests

| Файл | Проверяемая область |
|---|---|
| `test/trust-core.test.cjs` | Trust Core identity/group/crypto service behavior |
| `test/trust-schema8.test.cjs` | migration, integrity and schema invariants |
| `test/mls-interoperability.test.cjs` | client/server/Trust Core interoperability |
| `test/e2ee-plaintext-guards.test.cjs` | direct plaintext bypass attempts |
| `test/trust-recovery.test.cjs` | recovery, revocation and failure behavior |
| `test/trust-clock.test.cjs` | protocol time/expiry behavior |
| `test/pulse-local-integration.test.cjs` | regression isolation from stable Pulse/local contour |

Passing individual tests does not make the branch release-ready. Required completion includes full stable regression suite, native/WASM checks, Windows/Linux/Android CI, production build, security audit, multi-device matrix, migration on real schema 7 data and independent cryptographic review.

## Documentation

- `README.md` — branch warning and scope;
- `BRANCH_STATUS.md` — release classification/blockers;
- `docs/TRUST_CORE_3.2.0.md` — protocol architecture/readiness;
- `SECURITY.md` — branch-specific security reporting and limitations;
- `docs/ARCHITECTURE.md` — overall branch architecture.
