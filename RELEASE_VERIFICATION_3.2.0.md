# Nexora 3.2.0 — Source/PWA Prerelease Verification

## Classification

- Version: `3.2.0`.
- Pull Request: `#12`.
- Branch: `agent/nexora-3.2.0-trust-core-mls`.
- Verified implementation commit: `9af91d129273d702cea2bf736354d25bac05d1e3`.
- GitHub Actions run: `29921551883` / CI run `#250`.
- Date: `2026-07-22`.
- Result: automated source/build/test/security/performance/soak gate passed.
- Source/PWA prerelease approval: **granted**.
- Stable signed production approval: **not granted**.
- Independent cryptographic review: **not completed**.

This report records automated verification of the implementation at the commit above. It supports a clearly marked source/PWA GitHub prerelease. It does not certify the protocol, metadata privacy, packaged client runtime, signed installers or suitability for high-risk communications.

## Automated gate results

### Windows verify

Runner job: `verify`.

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run check` | PASS |
| `npm run test:unit` | PASS |
| `npm run test:performance` | PASS |
| `npm run audit:security` | PASS |

`npm run check` includes Node syntax validation, Electron Builder configuration validation and the Vite production web build.

The isolated Windows performance smoke starts the schema 8 server, connects 20 WebSocket clients and requires 120 acknowledged room messages, persisted messages and a successful SQLite integrity check within the unchanged 20-second budget.

The security audit includes production dependency high/critical checks and static invariants for:

- CSRF, Origin, rate limits and login lock;
- backup/TOTP encryption and timing-safe verification;
- Electron certificate/session/renderer boundaries;
- Pulse signature/HTTPS boundary;
- bot token and webhook protections;
- one-time Trust challenges and Ed25519 device proofs;
- non-extractable identity keys and encrypted local Trust state;
- socket-to-device binding, verified-device-only MLS delivery and targeted revoke disconnect;
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

`npm test` executes the production web build, the cross-platform unit/API/integration suite and the isolated schema 8 performance smoke.

Trust/MLS-specific coverage includes:

- schema 7 → 8 migration, backup/integrity and downgrade protection;
- functional clock regression;
- device challenge, registration, verification and revocation;
- device-scoped Socket.IO delivery and immediate target disconnect;
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

`release:check` verifies synchronized `3.2.0` metadata, production build, unit/API/integration tests, isolated schema 8 performance budget and security audit.

### Schema 8 soak

Runner job: `schema8-soak`.

| Step | Result |
|---|---|
| `npm ci` | PASS |
| one-minute `npm run test:soak` | PASS |

The soak run uses the schema 8 server entrypoint, performs repeated mutations, creates backups and checks SQLite integrity and schema version on every cycle.

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

Verified code and tests establish the following behavior:

- secure-message plaintext is produced/consumed on clients and is not stored in the Local Server message text field;
- Local Server validates account, device, membership, group, epoch and replay state without decrypting MLS content;
- secure Socket.IO sessions are bound to one active verified Trust device;
- ciphertext is emitted only to active verified device rooms for current MLS members;
- legacy, unverified and mismatched-device sockets cannot send or receive MLS ciphertext;
- Trust revocation immediately disconnects the target device socket and the affected client clears local Trust/MLS state;
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

### Account-wide ciphertext delivery after device revocation

**Cause:** secure events were emitted to account/conversation rooms authenticated only by the HTTP session. A revoked or unverified device could retain an account-level Socket.IO connection even when Trust Core denied subsequent operations.

**Fix:** secure sockets present an active Trust `deviceId`; message/edit envelopes must match that verified socket device; ciphertext is emitted only to verified MLS member device rooms; revocation sends a targeted event and immediately disconnects the affected sockets; the client wipes local Trust/MLS state.

**Regression:** `test/trust-socket.test.cjs` exercises verified, unverified, legacy and mismatched-device sockets plus targeted revocation against a real schema 8 server.

### Performance assertion competed with the parallel unit suite

**Cause:** the 20-second load SLA ran inside `node --test test/*.test.cjs`, so hosted-runner CPU/SQLite contention from unrelated concurrent test files distorted the benchmark. A Windows run took 23.8 seconds while an immediate rerun passed.

**Fix:** `scripts/run-unit-tests.cjs` runs the functional suite without `performance.test.cjs`; `test:performance` runs the benchmark separately with test concurrency 1; Windows, Linux and `release:check` all execute the isolated performance stage. The 20-second budget was not increased.

**Regression:** the isolated schema 8 smoke completed in approximately 2.47 seconds during focused diagnosis and passed in CI run `#250` on Windows and Linux release paths.

### Rejected mutation poisoned store queue

**Cause:** `SqliteStore.mutate()` assigned the caller-visible rejected operation directly to the internal serialized queue. An expected business/security rejection was handled by its caller, but later `flush()`, shutdown or the next mutation could observe the stale rejection.

**Fix:** the caller retains the original operation Promise, while the internal queue stores a handled continuation. State rollback and original rejection semantics remain unchanged.

**Regression:** `test/store-queue.test.cjs` verifies rejected mutation rollback, successful `flush()`, subsequent mutation and subsequent `flush()`.

### Attachment test accessed pending ciphertext too early

**Cause:** the initial test expected a pending upload to be downloadable before message claim, contradicting the intended access boundary.

**Fix:** the test asserts pending download denial, atomically claims the attachment with a message, then verifies authorized ciphertext download. Production access control was not weakened.

### Security audit identifiers drifted from runtime contracts

**Cause:** several static checks searched obsolete error names or source locations.

**Fix:** assertions were aligned with stable contracts such as `MLS_MESSAGE_REPLAY`, device-scoped delivery and transactional `fileId` assignment while retaining strict multi-module checks.

## Distribution decision

The repository release workflow may publish `v3.2.0` as follows:

- with valid Authenticode secrets: signed Windows Client/Server artifacts plus normal release metadata;
- without signing secrets: source ZIP, built PWA ZIP, SPDX SBOM and SHA-256 checksums as an explicit GitHub prerelease.

Unsigned `.exe`, blockmap and `latest.yml` updater assets must not be published. Electron auto-update must not consume an unsigned build.

## Remaining stable-promotion blockers

The source/PWA prerelease is approved, but stable signed production promotion remains blocked by:

1. metadata minimization and traffic-analysis review beyond the documented boundary;
2. broader simultaneous-commit, revoke/re-add and corrupted local-state platform matrix;
3. runtime E2E on packaged Windows Electron Client/Server, installed PWA and physical Android devices;
4. longer-duration load/soak and extended offline field evidence;
5. Authenticode signing-machine checks and signed Windows updater artifacts when signing is unavailable in CI;
6. independent cryptographic and application-security review with no unresolved critical/high findings.

## Decision

Automated prerelease verification for implementation commit `9af91d129273d702cea2bf736354d25bac05d1e3` is **PASS**.

Source/PWA GitHub prerelease publication is **APPROVED**. Stable signed production promotion and audited-E2EE claims remain **BLOCKED** by the items above.
