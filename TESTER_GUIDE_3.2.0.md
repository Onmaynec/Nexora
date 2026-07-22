# Nexora 3.2.0 Trust/MLS Tester Guide — Development

> Test only disposable installations and accounts. This branch is not an independently audited stable release. Stable testing remains documented in [TESTER_GUIDE.md](TESTER_GUIDE.md).

## 1. Test matrix

Minimum environments:

- Windows Client + Windows Local Server;
- browser/PWA + Local Server;
- Android source build + Local Server;
- two browser profiles on one machine;
- two physical/logically isolated machines where available;
- schema 7 fixture upgraded to schema 8;
- Pulse sandbox and production-mode-disabled sandbox checks.

Minimum identities:

- Alice, first verified device A1;
- Alice, pending second device A2;
- Bob, verified device B1;
- optional Bob second device B2;
- room owner, moderator and member accounts for room scenarios.

## 2. Evidence rules

Record:

- branch commit SHA;
- OS/browser/Electron/Android version;
- Server ID and schema version;
- device IDs/fingerprints with middle portions redacted;
- conversation/group record ID;
- epoch sequence;
- HTTP/socket error codes;
- CI or local command output.

Never attach:

- private device key;
- private MLS group state;
- attachment AES key/IV or complete descriptor;
- wrapping key;
- complete recovery code/token/cookie;
- real message/file plaintext;
- production account data.

## 3. Migration tests

### 3.1 Successful schema 7 → 8

1. Start from a verified schema 7 fixture containing users, rooms, messages, files and Pulse cache.
2. Record database size and free disk space.
3. Start 3.2.0.
4. Confirm network listen happens only after migration.
5. Verify a `.pre-schema-8-*.bak` exists.
6. Run `PRAGMA integrity_check` on active DB and backup.
7. Verify `schema_version=8` and `schema_8_verified_at`.
8. Authenticate existing accounts and read existing data.
9. Restart; verify no second migration backup is created.

Expected: no data loss, no schema downgrade, no mixed availability.

### 3.2 Insufficient space

Simulate free space below `max(96 MiB, DB × 2 + 16 MiB)`.

Expected: `MIGRATION_DISK_SPACE_LOW`, no schema changes, no network listen.

### 3.3 Corrupt source/backup

Use a disposable corrupt fixture.

Expected: `DATABASE_CORRUPT` or `MIGRATION_BACKUP_FAILED`, no partial schema 8 state.

### 3.4 Restore and rollback

- restore schema 8 backup and confirm schema stays 8;
- restore pre-schema-8 backup offline and start matching 3.1.2;
- confirm Trust/MLS records created after migration are absent;
- upgrade restored schema 7 backup again and verify idempotent success.

Detailed procedure: [docs/MIGRATION_3.2.0.md](docs/MIGRATION_3.2.0.md).

## 4. Device identity tests

### 4.1 First device bootstrap

1. Login Alice on A1.
2. Open Trusted Devices.
3. Verify A1 is active/verified/current.
4. Reload/restart and ensure device/fingerprint persists.

Expected: private key remains non-extractable and no duplicate device appears.

### 4.2 Second device pending

1. Login Alice on A2.
2. Verify A2 is unverified and secure messaging is unavailable.
3. Confirm A2 cannot verify itself or claim secure delivery.
4. Compare fingerprint with A1.
5. Approve A2 from A1.

Expected: signed one-time challenge, A2 becomes verified, KeyPackage pool is replenished.

### 4.3 Challenge scope and replay

Try to:

- use registration challenge for verify/revoke;
- change target device ID;
- change context/fingerprint;
- reuse consumed challenge;
- use expired challenge;
- replace proof signature.

Expected stable errors: scope mismatch, invalid/consumed/expired proof; no state change.

### 4.4 Revoke other device

1. Revoke A2 from A1.
2. Confirm A2 status revoked.
3. On A2 attempt KeyPackage upload/claim, Welcome, commits and ciphertext delivery.

Expected: all secure operations denied immediately.

### 4.5 Self-revoke

1. On A1 choose revoke current device.
2. Confirm destructive warning.
3. Complete operation.
4. Inspect IndexedDB in the test profile.

Expected: wrapping key, device record, KeyPackages, group state, decrypted cache and drafts are removed; session logs out.

## 5. Alice/Bob MLS lifecycle

### 5.1 Create and join

1. Start DM Alice A1 ↔ Bob B1.
2. Send first secure text from Alice.
3. Capture protocol order: KeyPackage claim → Add commit → Welcome → group membership.
4. Bob opens conversation and joins.
5. Confirm both clients have same group ID/epoch/public state hash.

Expected: Local Server message row has encrypted type, empty plaintext text and ciphertext envelope.

### 5.2 Application message

Send unique disposable text in both directions.

Expected:

- sender encrypts before outbox;
- server API/socket payload contains ciphertext and neutral preview only;
- receiver decrypts correctly;
- message hash/replay state exists;
- sender local cache supports search after decrypt;
- retry with same client ID does not create duplicate.

### 5.3 Reply/edit/reaction/delete

Exercise each supported secure operation from owner/sender/other participant roles.

Expected: no plaintext appears in REST/socket/database/logs; unauthorized edit/delete is rejected server-side.

## 6. Offline and recovery

### 6.1 Missed commit chain

1. Take Bob offline at epoch N.
2. Add/revoke another verified device to produce commits N+1…N+k.
3. Reconnect Bob.

Expected: commits returned in ascending contiguous order, applied sequentially, final epoch equals server group epoch.

### 6.2 Commit gap

Delete/corrupt a commit only in a disposable database.

Expected: `MLS_COMMIT_LOG_GAP`; no guessed state and no plaintext fallback.

### 6.3 Lost local state

Delete Alice IndexedDB group state while server still lists A1 as member.

Expected: explicit lost-state error requiring revoke/re-enrollment. Client must not recreate from public server data or send plaintext.

### 6.4 Long offline

Test reconnect after KeyPackage/Welcome/replay-cache expiration boundaries.

Expected: expired records are rejected/cleaned; recovery either succeeds through retained commit state or fails explicitly.

## 7. Epoch and replay tests

Attempt:

- duplicate commit;
- stale commit;
- previous epoch mismatch;
- skipped epoch;
- substituted commit bytes with reused hash/metadata;
- repeated ciphertext;
- same ciphertext under another conversation/group/device;
- ciphertext from revoked device.

Expected: stable conflict/permission/replay codes, no duplicate message, no epoch jump.

## 8. Plaintext downgrade matrix

After the conversation has an active MLS group, attempt direct calls to:

- Socket.IO `message:send`;
- `message:forward`;
- legacy edit;
- server draft create/update;
- scheduled message create;
- poll create;
- bot message API;
- legacy multipart upload;
- chunked upload initiate/chunk/complete;
- old client send path.

Expected: server rejects with E2EE-specific stable code. Hidden UI is not sufficient; verify direct requests and confirm rejected temporary data is removed.

## 9. Encrypted files, images and voice

### 9.1 Successful file/image flow

1. In an active secure conversation select a disposable file below 25 MiB.
2. Record UI phases: read → encrypt → upload → verify → seal descriptor → send MLS envelope.
3. Confirm progress reaches 100% and no legacy upload route is used.
4. On recipient device open the message and choose local decrypt.
5. For an image, verify preview; for a generic file, verify explicit download.
6. Compare downloaded plaintext hash with the source fixture.

Expected:

- server file metadata uses generic name/MIME and kind `encrypted`;
- ciphertext size equals plaintext size + 16-byte GCM tag;
- server ciphertext SHA-256 matches upload;
- message server-visible text is empty;
- original name/MIME/key/IV/caption are present only after MLS decrypt;
- descriptor ID/hash/size matches server envelope;
- ciphertext hash, GCM tag and plaintext hash all validate before preview/download.

### 9.2 Voice recording

Test:

- microphone permission granted;
- permission denied;
- unsupported `MediaRecorder`;
- start, stop, cancel and automatic five-minute stop;
- duration/waveform and playback after recipient decrypt.

Expected: denied/unsupported recording is a clear UI error; cancel creates no upload/message; server never receives duration, waveform or actual audio MIME.

### 9.3 Upload cancellation and retry

- cancel during encryption/upload;
- disconnect after opaque upload but before MLS enqueue;
- disconnect after enqueue but before Socket.IO acknowledgement;
- retry the same outbox entry;
- discard a failed outbox entry.

Expected:

- cancellation before enqueue removes pending ciphertext;
- after enqueue only opaque attachment ID and MLS ciphertext remain in ordinary outbox;
- retry is idempotent and does not create a second file/message;
- discard attempts pending delete and safely tolerates already-claimed/expired state.

### 9.4 Pending/claim lifecycle

Directly verify:

- pending attachment cannot be downloaded;
- same ID/scope/hash upload is idempotent;
- same ID with another payload is rejected;
- wrong ciphertext hash is rejected without a file record;
- `mls:message` atomically claims the attachment;
- claimed attachment becomes downloadable only to conversation participants;
- second message cannot reuse the same attachment;
- failed claim releases MLS replay reservation;
- expired pending attachment is removed by cleanup.

### 9.5 Descriptor/ciphertext corruption

Modify separately:

- attachment ID in MLS descriptor;
- ciphertext size/hash in server envelope fixture;
- AES key/IV;
- AAD conversation ID or media kind;
- downloaded ciphertext byte;
- plaintext hash.

Expected: explicit descriptor/ciphertext/key/plaintext error, no preview/download and no plaintext fallback.

### 9.6 Room media policy

For an MLS-enabled room, disable each of `allowFiles`, `allowImages` and `allowVoice` separately.

Expected: complete opaque media API returns `E2EE_MEDIA_POLICY_RESTRICTED` in every case. The server must not trust client-supplied kind/MIME to bypass the restriction.

## 10. Storage isolation and corruption

### 10.1 Scope isolation

Create Trust state for:

- same user on two Server IDs;
- two users on same Server ID.

Expected: records/AAD/wrapping keys cannot be read across scopes.

### 10.2 Ciphertext corruption

Modify IV/ciphertext/AAD-linked record in IndexedDB.

Expected: decrypt fails; record is ignored/removed according to component policy; no plaintext fallback.

### 10.3 Draft/cache/outbox retention

Verify:

- secure drafts never reach server draft API;
- decrypted cache expires/removes as designed;
- decrypted attachment descriptor/key is not copied into ordinary offline cache;
- ordinary outbox has opaque attachment ID and MLS ciphertext only;
- self-revoke clears Trust stores;
- logout without revoke preserves expected device state only for the same profile.

## 11. Room and authorization tests

For an MLS-enabled room:

- owner/moderator/member boundaries remain server-enforced;
- banned/removed/restricted user cannot receive new ciphertext;
- ownership transfer and role changes do not bypass device verification;
- removed member leaves realtime room and MLS delivery membership;
- revoked device of an otherwise active user is denied;
- room read-only/slow-mode remains enforced before ciphertext acceptance;
- opaque media follows fail-closed room settings.

## 12. Metadata review

Record which data remains visible to Local Server:

- account/device IDs;
- conversation/group membership;
- epoch and delivery order;
- sender device ID;
- uploader and attachment ID;
- timestamps/IP/session information;
- message and attachment ciphertext sizes;
- message/replay/ciphertext hashes;
- operational errors.

Confirm Local Server does not receive attachment key, IV, filename, actual MIME, caption, voice duration, waveform or plaintext bytes. Report unnecessary visible fields. Do not claim metadata confidentiality.

## 13. Automated commands

```bash
npm ci
npm run check
npm run test:unit
npm run audit:security
npm test
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Relevant automated files:

- `test/e2ee-runtime-guards.test.cjs`;
- `test/e2ee-attachments.test.cjs`;
- `test/e2ee-attachment-transport.test.cjs`;
- `test/store-queue.test.cjs`;
- `test/e2ee-plaintext-guards.test.cjs`;
- `test/mls-interoperability.test.cjs`.

Optional controlled soak:

```bash
npm run test:soak
```

Record exact command, commit and duration.

## 14. Release acceptance

A candidate may move out of draft only when:

- all automated gates pass on Windows/Linux/Android;
- migration/rollback exercise passes with retained evidence;
- multi-device/runtime E2E passes;
- encrypted media implementation and corruption/policy tests pass;
- metadata review is accepted;
- signing-machine artifacts pass verification;
- independent cryptographic/application-security review has no unresolved critical/high findings;
- release notes/verification document match the exact commit.

Until then, result is development verification only.
