# Nexora 3.4.0 — Stable Core

**Status:** release candidate. This document does not represent a published release.

## Product result

Nexora 3.4.0 establishes ordinary server-readable messaging as the only writable messaging core. It removes the executable Trust/MLS runtime while preserving schema 8 legacy records and ciphertext through an explicit read-only compatibility layer.

## Main changes

### Ordinary chats no longer depend on MLS

- Client connects Socket.IO using the current server session without Trust-device enrollment.
- Ordinary dialogs use the existing `MessagePane`, server drafts, uploads, voice, offline cache and bounded outbox.
- A stale/corrupt MLS epoch can no longer block an ordinary conversation from opening.

### Immutable legacy secure history

- Trust Core, MLS routes, recovery workers, socket transport, encrypted-upload writes and client MLS engine are removed.
- `ts-mls` is removed from dependencies and package payloads.
- Schema 8 records remain to preserve IDs, timestamps, group epochs, ciphertext and audit provenance.
- Legacy conversations open in a dedicated terminal-state viewer without composer or mutation controls.
- Server export never decrypts ciphertext and marks `serverDecrypted: false`.
- A client may read pre-existing locally decrypted IndexedDB records through readonly transactions.
- All legacy HTTP write paths return `410/LEGACY_READ_ONLY`; MLS socket mutations return the same stable code.

### Sessions and devices

- Server-owned device inventory is derived from active sessions.
- Sessions record device ID, name, platform, client version, creation, last-seen and expiry.
- Users can revoke one remote device or all devices except current.
- Revocation immediately emits `session.revoked`, disconnects target Socket.IO sessions and refreshes `device.updated`.
- Current-device remote revoke is rejected with `STATE_CONFLICT`; explicit logout is required.

### Backup, restore and migration

- Added non-restoring backup verification API for server administrators.
- Schema 8 migration verifies source integrity, WAL checkpoint, free space and backup before transaction.
- Future schemas are blocked before mutation.
- Restore stages DB and file store and rolls both back on failure.
- Temporary decrypted/staged data is removed after success or error.

### Stable diagnostics

- Stable error envelope includes `code`, `message`, `requestId` and safe `details` while preserving `error` for compatibility.
- Updater and device UI surface request IDs for operator support.
- Safe signing status API reports configuration state without certificate/password material.

### Signed Client and Server updater

- Windows Client uses `latest` metadata; Windows Server uses the `server` channel.
- Both require signature verification and reject downgrade/prerelease states.
- Signature/checksum failures use `UPDATE_SIGNATURE_INVALID`.
- Stable release requires expected certificate subject, thumbprint and timestamp evidence.
- Unsigned test assets use a separate `-unsigned-test.<run>` prerelease tag and never publish blockmap/update metadata.

## API additions

- `GET /api/v3/devices`
- `DELETE /api/v3/devices/:deviceId/sessions`
- `DELETE /api/v3/devices/sessions/others`
- `GET /api/v3/legacy-secure/conversations`
- `GET /api/v3/legacy-secure/conversations/:conversationId/messages`
- `POST /api/v3/legacy-secure/conversations/:conversationId/export`
- `POST /api/v3/admin/backups/verify`
- `GET /api/admin/release/signing-status`

Realtime additions: `session.revoked`, `device.updated`, `legacy_secure_history.state`.

## Compatibility

- Application API v3 and ordinary room/message contracts are retained.
- SQLite remains schema 8; the migration is compatibility-preserving and idempotent.
- Legacy ciphertext is not converted into plaintext.
- Legacy Trust/MLS writes are intentionally incompatible and terminate with `LEGACY_READ_ONLY`.
- Electron profiles remain isolated by Server ID and require explicit certificate/identity repin.

## Upgrade prerequisites

The official stable upgrade is defined as verified `3.3.4 → 3.4.0`. The release workflow refuses stable publication if `v3.3.4` is missing, draft/prerelease or lacks required signed installers/checksums.

Before production rollout:

1. create and verify a backup;
2. confirm free disk space and database integrity;
3. retain the legacy local client profile when local decrypted history is required;
4. perform Windows n-1→n installed smoke;
5. verify Authenticode subject/thumbprint/timestamp and SHA-256 assets;
6. close independent review findings.

## Known limitations and blockers

- A verified published stable `v3.3.4` baseline is not currently present.
- Signing credentials and Windows 10/11 acceptance are external prerequisites.
- Independent security review is pending.
- Locally decrypted legacy content is available only when a previous client retained it.
- The branch must remain draft and no official `v3.4.0` tag/release may be created until every release blocker is closed.
