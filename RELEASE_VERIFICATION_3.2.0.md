# Nexora 3.2.0 — Development Release Verification

## Classification

- Version: `3.2.0` development.
- Pull Request: `#12`.
- Branch: `agent/nexora-3.2.0-trust-core-mls`.
- Verified implementation commit: `e837df182c7dc7096979d9eeb5e364bd094e7708`.
- GitHub Actions run: `29916106945` / CI run `#205`.
- Date: `2026-07-22`.
- Result: automated development gate passed.
- Stable release approval: **not granted**.
- Independent cryptographic review: **not completed**.

This report records automated verification of the implementation present at the commit above. It does not certify the protocol, client runtime, metadata privacy, signed installers or production suitability.

## Automated gate results

### Windows verify

Runner job: `verify`.

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run check` | PASS |
| `npm run test:unit` | PASS |
| `npm run audit:security` | PASS |

`npm run check` includes Node syntax validation, Electron builder configuration validation and the Vite production web build.

The security audit includes production dependency high/critical checks and static invariants for:

- CSRF, Origin, rate limits and login lock;
- backup/TOTP encryption and timing-safe verification;
- Electron certificate/session/renderer boundaries;
- Pulse signature/HTTPS boundary;
- bot token and webhook protections;
- one-time Trust challenges and Ed25519 device proofs;
- non-extractable identity keys and encrypted local Trust state;
- fixed MLS ciphersuite, replay rejection and ciphertext-only serialization;
- direct legacy plaintext guards;
- opaque attachment exact-size/hash validation;
- one-time attachment claim and fail-closed room media policy;
- client AES-GCM AAD and post-download integrity;
- progress/cancel support and descriptor isolation from ordinary outbox/cache.

### Linux full test suite

Runner job: `linux-tests`.

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm test` | PASS |

The full suite includes the production web build plus unit, API, integration, migration, reliability, security and interoperability tests.

Trust/MLS-specific coverage includes:

- schema 7 → 8 migration, backup/integrity and downgrade protection;
- functional clock regression;
- device challenge, registration, verification and revocation;
- KeyPackage/Welcome one-time and scope rules;
- epoch/replay/recovery behavior;
- Alice/Bob MLS interoperability;
- real REST/Socket.IO plaintext downgrade attempts;
- opaque attachment upload, idempotency, hash, pending access/delete and room policy;
- real `mls:message` attachment claim, duplicate retry, reuse rejection and replay-reservation cleanup;
- rejected `SqliteStore.mutate()` queue recovery.

### Dedicated release gate

Runner job: `release-gate`.

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run release:check` | PASS |

`release:check` verifies synchronized `3.2.0` metadata and reruns production build, complete Node test suite and security audit.

### Android source build

Runner job: `android-source`.

| Step | Result |
|---|---|
| Java 17 / Gradle 8.13 setup | PASS |
| `gradle -p android :app:assembleDebug --no-daemon` | PASS |

This confirms Android source/build compatibility. It is not a physical-device runtime E2E result and does not verify a signed release APK/AAB.

## Version and schema verification

Verified branch metadata:

- `package.json`: `3.2.0`;
- `package-lock.json`: `3.2.0`;
- Client handshake: `3.2.0`;
- Android `versionName`: `3.2.0`;
- Android `versionCode`: `30200`;
- Local Server database schema: `8`;
- stable application API remains v3;
- Trust/MLS/encrypted-media API uses v4 routes.

## Implemented security boundary

Verified code and tests establish the following development behavior:

- secure-message plaintext is produced/consumed on clients and is not stored in the Local Server message text field;
- Local Server validates account, device, membership, group, epoch and replay state without decrypting MLS content;
- legacy plaintext message/upload paths reject an active MLS conversation;
- private MLS state, KeyPackages, decrypted cache and drafts are encrypted in client IndexedDB;
- attachment bytes are encrypted client-side with AES-256-GCM;
- attachment key, IV, source name, actual MIME, caption, duration and waveform are delivered inside MLS content;
- Local Server stores opaque ciphertext with generic metadata and validates exact GCM size and SHA-256;
- pending ciphertext is unavailable until atomically claimed by an MLS message;
- ordinary outbox retains only opaque attachment ID and MLS ciphertext;
- failed mutations no longer poison the serialized store queue.

## Server-visible metadata

The automated gate does not imply metadata confidentiality. Local Server can still observe or infer:

- account and device identifiers;
- room/conversation membership;
- sender/uploader identity;
- group/epoch and delivery order;
- attachment ID and ciphertext size;
- timestamps, IP/network/session context;
- message/replay/ciphertext hashes;
- operational errors and traffic patterns.

## Root causes fixed during verification

### Rejected mutation poisoned store queue

**Cause:** `SqliteStore.mutate()` assigned the caller-visible rejected operation directly to the internal serialized queue. An expected business/security rejection was handled by its caller, but later `flush()`, shutdown or the next mutation could observe the stale rejection.

**Fix:** the caller retains the original operation Promise, while the internal queue stores a handled continuation. State rollback and the original rejection semantics remain unchanged.

**Regression:** `test/store-queue.test.cjs` verifies rejected mutation rollback, successful `flush()`, subsequent mutation and subsequent `flush()`.

### Attachment test accessed pending ciphertext too early

**Cause:** the initial test expected a pending upload to be downloadable before message claim, contradicting the intended access boundary.

**Fix:** the test now asserts pending download denial, atomically claims the attachment with a message, then verifies authorized ciphertext download. Production access control was not weakened.

### Security audit identifiers drifted from runtime contracts

**Cause:** several static checks searched obsolete error names or source locations.

**Fix:** assertions were aligned with actual stable contracts such as `MLS_MESSAGE_REPLAY` and the transactional `fileId` assignment while retaining strict multi-module checks.

## Remaining release blockers

The branch must remain draft until all of the following are completed with retained evidence:

1. metadata minimization and traffic-analysis review;
2. broader multi-device simultaneous-commit, revoke/re-add and corrupted-state matrix;
3. runtime E2E on packaged Windows Electron Client/Server, installed PWA and physical Android devices;
4. load/soak and long-offline recovery testing;
5. signing-machine checks and signed Windows release artifacts;
6. independent cryptographic and application-security review with no unresolved critical/high findings;
7. final release decision tied to the exact candidate commit and immutable artifacts.

## Decision

Automated development verification for commit `e837df182c7dc7096979d9eeb5e364bd094e7708` is **PASS**.

Production readiness, stable tagging, merge approval and audited-E2EE claims remain **BLOCKED** by the items above.
