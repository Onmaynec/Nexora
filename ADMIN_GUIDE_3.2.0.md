# Nexora 3.2.0 Administrator Guide — Source/PWA Prerelease

> This guide applies to the controlled-testing 3.2.0 source/PWA prerelease candidate from PR #12. Stable signed production administration remains documented in [ADMIN_GUIDE.md](ADMIN_GUIDE.md). Do not use this candidate for high-risk private communications or represent it as independently audited E2EE.

## 1. Scope

Nexora 3.2.0 adds:

- Local Server schema 8;
- Trust device registration, verification and revocation;
- MLS secure-message delivery bound to active verified Trust devices;
- device-scoped Socket.IO ciphertext delivery and immediate revoke disconnect;
- ciphertext-only persistence for secure messages;
- encrypted local client state;
- encrypted files, images and voice through an opaque attachment API;
- server-side plaintext downgrade guards.

The candidate passed automated build/test/security/soak gates and may be used for controlled source/PWA testing. It does not claim metadata confidentiality, traffic-analysis resistance, signed Windows distribution or independent cryptographic review.

## 2. Pre-upgrade preparation

Before starting a 3.2.0 test server:

1. Stop automated update/restart tooling.
2. Verify the current server is Nexora 3.1.2 and schema 7.
3. Run the existing backup command and verify the backup.
4. Copy the active database, WAL/SHM files, uploads and configuration to protected offline storage.
5. Confirm free disk space exceeds `max(96 MiB, database size × 2 + 16 MiB)`.
6. Record Server ID, TLS fingerprint, Pulse mode and current version.
7. Notify testers that existing history and legacy files remain in their previous form.
8. Use disposable accounts and rooms.

## 3. Schema 8 startup

On first start, the server:

- flushes pending writes;
- checks schema prerequisite and SQLite integrity;
- checks free space;
- checkpoints WAL;
- creates `.pre-schema-8-<timestamp>.bak`;
- applies schema 8 in `BEGIN IMMEDIATE`;
- verifies destination integrity;
- starts network listeners only after success.

A failed migration must leave the server unavailable rather than serving mixed schema state.

Required operator checks:

```sql
PRAGMA integrity_check;
SELECT value FROM meta WHERE key='schema_version';
SELECT value FROM meta WHERE key='schema_8_verified_at';
```

Expected schema version: `8`.

Detailed procedure and rollback: [docs/MIGRATION_3.2.0.md](docs/MIGRATION_3.2.0.md).

## 4. Trust device lifecycle

### First device

The first device registered for a local account receives bootstrap verification after proving possession of its generated Ed25519 identity key.

Confirm in Settings → Trusted Devices:

- status `доверенное`;
- unique fingerprint;
- current-device marker;
- recent last-seen timestamp.

### Additional devices

A second device is registered as unverified. It cannot participate in secure delivery until an existing verified device approves it.

Approval procedure:

1. Open Trusted Devices on an already verified device.
2. Compare the full fingerprint over a separate trusted channel.
3. Confirm the pending device only after the values match.
4. Verify that the target device changes to `verified` and publishes KeyPackages.

Do not approve devices based only on display name or notification text.

### Revocation

Revoking a device:

- consumes a signed, operation-scoped challenge;
- marks the device revoked;
- removes it from active group delivery;
- blocks new KeyPackage/Welcome/commit/ciphertext access;
- emits a targeted revocation event and disconnects every socket bound to that device;
- causes the affected client to clear local Trust keys, MLS state, cache and drafts;
- records a Trust audit entry.

Self-revocation additionally deletes local wrapping key, device key material, KeyPackages, private group state, decrypted cache and drafts, then logs out.

After suspected compromise, revoke the device from a different verified device whenever possible. Rotate account password/session separately; session revocation and Trust device revocation are distinct controls.

## 5. Secure conversation behavior

When a conversation activates an MLS group:

- the client creates ciphertext before durable outbox;
- the server stores encrypted message envelopes only;
- the secure socket must present the same active verified `deviceId` used by the MLS envelope;
- ciphertext events go only to active verified device rooms for current MLS members;
- previews use a neutral protected-message label;
- legacy plaintext send/forward/edit/draft/scheduled/poll/bot/upload routes return stable E2EE errors;
- files, images and voice use only the v4 opaque attachment API and MLS descriptor binding.

Do not bypass a blocked secure feature by using an older client or direct API. A successful bypass is a security incident.

## 6. Encrypted media operations

### Server-visible data

For encrypted media, Local Server may observe:

- account/device and conversation/room identifiers;
- uploader and attachment ID;
- ciphertext size and SHA-256;
- upload/download timing, network source and delivery events.

It must not receive or log:

- attachment AES key or IV;
- source filename;
- actual MIME/media type;
- caption plaintext;
- voice duration or waveform;
- decrypted bytes.

### Pending lifecycle

A ciphertext upload is initially `pendingE2ee`:

- it cannot be downloaded before MLS-message claim;
- the uploader may cancel/delete it before claim;
- it expires after 24 hours;
- hourly Trust cleanup removes expired pending records/files;
- one MLS message atomically claims it;
- claimed attachment cannot be rebound or deleted through the pending route.

Do not delete `.e2ee` files manually without checking database references.

### Room policy

Opaque ciphertext prevents server-side type classification. Therefore, if a room disables any one of files, images or voice, the server blocks the complete E2EE media path with `E2EE_MEDIA_POLICY_RESTRICTED`.

This is intentional fail-closed behavior. Do not weaken it by trusting client-supplied MIME or media kind.

## 7. Operational monitoring

Monitor existing liveness/readiness/metrics plus Trust/media signals:

- repeated `TRUST_CHALLENGE_INVALID` or `TRUST_PROOF_INVALID`;
- KeyPackage exhaustion or claim races;
- `MLS_EPOCH_CONFLICT`, stale/skipped commit errors;
- `MLS_MESSAGE_REPLAY`;
- commit log gaps;
- revoked-device access attempts;
- `TRUST_SOCKET_DEVICE_MISMATCH`, `TRUST_DEVICE_UNVERIFIED` or repeated secure-socket reconnect failures;
- target sockets that remain connected after revocation;
- repeated lost-state or Welcome-pending errors;
- `E2EE_ATTACHMENT_HASH_MISMATCH` or ID/scope conflicts;
- unexpected growth of pending encrypted attachments;
- repeated `E2EE_MEDIA_POLICY_RESTRICTED` attempts;
- migration/backup/integrity failures.

Trust audit metadata is intentionally redacted: keys, signatures, credentials, packages, Welcome, ciphertext and attachment descriptors must not be logged.

## 8. Backup and restore

Regular backups protect schema 8 server state, including public Trust/MLS delivery records and opaque ciphertext files. They do not contain client private MLS state or attachment descriptor keys.

Restoring a schema 8 backup:

- stop the server;
- verify backup integrity;
- restore through the existing maintenance path;
- restore matching uploads;
- restart with 3.2.0;
- confirm schema 8 remains authoritative;
- verify device/group/replay and attachment records;
- test client recovery with disposable data.

Restoring a schema 7 backup intentionally discards all post-migration Trust/MLS records and encrypted media created after the backup. Clients must re-enroll/recreate groups after the server is upgraded again.

## 9. Incident response

### Suspected device compromise

1. Preserve server/Trust audit logs without secret data.
2. Revoke the device from another verified device.
3. Revoke its HTTP sessions and change account password if authentication compromise is possible.
4. Confirm the device is removed from active MLS membership in subsequent epoch changes.
5. Test that KeyPackage/Welcome/commit/ciphertext endpoints deny it.
6. Open a private Security Advisory if behavior differs.

### Suspected plaintext exposure

1. Stop the test server and preserve the database/logs.
2. Identify whether the conversation had an active MLS group at event time.
3. Secure messages must have empty server-visible text.
4. Encrypted files must have generic server name/MIME and opaque ciphertext only.
5. Check legacy REST/Socket.IO/bot/upload routes for unexpected success.
6. Do not publish plaintext, attachment keys, ciphertext or private state in a public issue.

### Lost client private state

The client must not silently recreate a member state or downgrade to plaintext. Revoke the lost/broken device and enroll a new device. Existing ciphertext or attachments that cannot be decrypted by retained client state may be unrecoverable.

## 10. Compatibility

- Nexora version: 3.2.0 development;
- Local Server schema: 8;
- stable API: v3;
- Trust/media API: v4;
- Client handshake: 3.2.0;
- stable 3.1.2 clients are not supported for secure conversations;
- existing history/files are not automatically re-encrypted.

## 11. Mandatory gate before release consideration

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Additionally require:

- schema 7 fixture migration and rollback exercise;
- two-device and broader multi-device runtime E2E;
- direct REST/Socket.IO downgrade attempts;
- encrypted media upload/claim/replay/corruption/policy tests;
- long-offline recovery and load/soak;
- signing-machine Windows checks;
- independent cryptographic/application-security review.

Until all are complete, keep PR #12 draft and do not create a stable `v3.2.0` tag.
