# Nexora 3.2.0 Administrator Guide — Development

> This guide applies only to PR #12 / `agent/nexora-3.2.0-trust-core-mls`. Stable production administration remains documented in [ADMIN_GUIDE.md](ADMIN_GUIDE.md). Do not deploy this branch for real private conversations before the remaining release blockers and external review are closed.

## 1. Scope

Nexora 3.2.0 adds:

- Local Server schema 8;
- Trust device registration, verification and revocation;
- MLS secure text-message delivery;
- ciphertext-only persistence for secure messages;
- encrypted local client state;
- server-side plaintext downgrade guards.

It does not yet provide encrypted attachments, images or voice. Those controls fail closed in the secure client.

## 2. Pre-upgrade preparation

Before starting a 3.2.0 test server:

1. Stop automated update/restart tooling.
2. Verify the current server is Nexora 3.1.2 and schema 7.
3. Run the existing backup command and verify the backup.
4. Copy the active database, WAL/SHM files, uploads and configuration to protected offline storage.
5. Confirm free disk space exceeds `max(96 MiB, database size × 2 + 16 MiB)`.
6. Record Server ID, TLS fingerprint, Pulse mode and current version.
7. Notify testers that existing history remains legacy plaintext.
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

Detailed procedure and rollback: [docs/MIGRATION_SCHEMA8.md](docs/MIGRATION_SCHEMA8.md).

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
- records a Trust audit entry.

Self-revocation additionally deletes local wrapping key, device key material, KeyPackages, private group state, decrypted cache and drafts, then logs out.

After suspected compromise, revoke the device from a different verified device whenever possible. Rotate account password/session separately; session revocation and Trust device revocation are distinct controls.

## 5. Secure conversation behavior

When a conversation activates an MLS group:

- the client creates ciphertext before durable outbox;
- the server stores encrypted message envelopes only;
- previews use a neutral protected-message label;
- legacy plaintext send/forward/edit/draft/scheduled/poll/bot/upload routes return stable E2EE errors;
- media controls remain disabled.

Do not bypass a blocked secure feature by using an older client or direct API. A successful bypass is a security incident.

## 6. Operational monitoring

Monitor existing liveness/readiness/metrics plus Trust-specific signals:

- repeated `TRUST_CHALLENGE_INVALID` or `TRUST_PROOF_INVALID`;
- KeyPackage exhaustion or claim races;
- `MLS_EPOCH_CONFLICT`, stale/skipped commit errors;
- `MLS_CIPHERTEXT_REPLAYED`;
- commit log gaps;
- revoked-device access attempts;
- repeated lost-state or Welcome-pending errors;
- migration/backup/integrity failures.

Trust audit metadata is intentionally redacted: keys, signatures, credentials, packages, Welcome and ciphertext must not be logged.

## 7. Backup and restore

Regular backups continue to protect schema 8 server state, including public Trust/MLS delivery records. They do not contain client private MLS state.

Restoring a schema 8 backup:

- stop the server;
- verify backup integrity;
- restore through the existing maintenance path;
- restart with 3.2.0;
- confirm schema 8 remains authoritative;
- verify device/group/replay records and client recovery.

Restoring a schema 7 backup intentionally discards all post-migration Trust/MLS records. Clients must re-enroll/recreate groups after the server is upgraded again.

## 8. Incident response

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
3. Check message type and serializer output; secure messages must have empty server-visible text.
4. Check legacy REST/Socket.IO/bot/upload routes for unexpected success.
5. Do not publish plaintext/ciphertext/private state in a public issue.

### Lost client private state

The client must not silently recreate a member state or downgrade to plaintext. Revoke the lost/broken device and enroll a new device. Existing ciphertext that cannot be decrypted by any retained state may be unrecoverable.

## 9. Compatibility

- Nexora version: 3.2.0 development;
- Local Server schema: 8;
- stable API: v3;
- Trust API: v4;
- Client handshake: 3.2.0;
- stable 3.1.2 clients are not supported for secure conversations;
- existing history is not automatically encrypted.

## 10. Mandatory gate before release consideration

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Additionally require:

- schema 7 fixture migration and rollback exercise;
- two-device and multi-device runtime E2E;
- direct REST/Socket.IO downgrade attempts;
- long-offline recovery;
- encrypted media implementation and tests;
- signing-machine Windows checks;
- independent cryptographic/application-security review.

Until all are complete, keep PR #12 draft and do not create a stable `v3.2.0` tag.
