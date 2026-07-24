# Nexora 3.3.4 — Post-MLS Baseline

**Status:** release candidate. This document does not represent a published release until PR #70 is merged and `v3.3.4` assets pass re-download verification.

## Product result

Nexora 3.3.4 establishes ordinary server-readable messaging as the only writable messaging core. The executable Trust/MLS runtime is removed, while existing schema 8 encrypted records remain available through an explicit read-only compatibility layer.

This patch is the mandatory post-MLS prerequisite for Nexora 3.4.0 Stable Core.

## Main changes

### Ordinary chats no longer depend on MLS

- Client authentication and Socket.IO startup use the active Local Server session directly.
- Ordinary dialogs continue through the existing `MessagePane`, server drafts, uploads, voice messages, offline cache and bounded outbox.
- Missing, stale or corrupt MLS state can no longer prevent an ordinary conversation from opening.

### Legacy secure history is immutable

- Trust Core, MLS routes, recovery workers, MLS Socket.IO transport, encrypted-upload write paths and the client MLS engine are removed.
- `ts-mls` is removed from dependencies and package payloads.
- Schema 8 compatibility records remain so IDs, timestamps, epochs, ciphertext and audit provenance are not discarded.
- Legacy conversations open in a dedicated read-only viewer without composer, upload or mutation controls.
- Server export preserves ciphertext and explicitly records `serverDecrypted: false`.
- Legacy HTTP and Socket.IO mutations terminate with `410/LEGACY_READ_ONLY`.

### Session and operational hardening

- Active sessions retain device ID, name, platform, client version, timestamps and expiry.
- Device inventory and targeted remote session revocation are available through server-owned state.
- Revocation emits `session.revoked`, disconnects the target session room and refreshes device state.
- Backup verification can validate a selected backup without replacing the live database or file store.
- Stable errors include `code`, `message`, `requestId` and safe `details`, while retaining the compatibility `error` field.

### Release-chain preparation

- Client and Server updater channels are separated (`latest` and `server`).
- Downgrade is disabled and signature/checksum failures use the stable `UPDATE_SIGNATURE_INVALID` code.
- Signed builds, when signing policy is configured, verify expected Authenticode subject, thumbprint and timestamp.
- Without signing credentials, the official `v3.3.4` release is explicitly marked `UNSIGNED-TEST` and contains no updater metadata or blockmaps.
- All release assets receive SHA-256 checksums and are re-downloaded after publication for immutable-asset verification.

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

## Compatibility and upgrade

- Supported upgrade baseline: published Nexora `3.3.3` → `3.3.4`.
- Application API v3 and ordinary room/message contracts remain available.
- SQLite remains schema 8; compatibility migration is idempotent and does not convert legacy ciphertext into plaintext.
- Legacy Trust/MLS writes are intentionally retired and always fail closed.
- Electron profiles remain isolated by Server ID and certificate identity.

Before upgrading:

1. create and verify a backup;
2. confirm database integrity and sufficient free disk space;
3. retain the existing client profile when locally decrypted legacy history is required;
4. install Client and Server from the same release line;
5. verify checksums and the published release evidence artifact.

## Distribution classification

- With complete protected signing policy: signed Client/Server assets and updater metadata may be published.
- Without signing policy: `v3.3.4` is an `UNSIGNED-TEST` GitHub prerelease; updater metadata and blockmaps are forbidden.
- The first independently reviewed signed stable 3.x line remains the goal of Nexora 3.4.0, not a claim of this prerequisite release.

## Known limitations

- Server cannot decrypt legacy ciphertext.
- Readable legacy plaintext depends on a pre-existing local client cache retained by the user.
- This release has internal automated security verification but does not claim an independent security assessment.
- Publication remains incomplete until CI, merge, annotated tag, GitHub Release and asset re-download smoke are recorded.
