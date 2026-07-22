# Nexora 3.2.3 — Security hardening

Nexora 3.2.3 is a focused security patch for Trust Core resource governance, recovery validation and stale security-state cleanup.

## Fixed

- MLS BasicCredential is now strictly bound to the authenticated user and candidate device.
- Identity and MLS signature Ed25519 keys must be distinct.
- Active Trust devices are limited to 16 per account.
- Available KeyPackage inventory is limited to 32 per device and 256 per account.
- Trust directory, enrollment, KeyPackage and recovery operations have bounded route-specific rate limits.
- Trust audit metadata uses an action allowlist and cannot retain nested arbitrary structures.
- Room access rejects actively banned users even if stale membership data exists.
- Missed MLS commits are validated for group scope, exact epoch continuity, commit hash, duplicate replay and public state hash before local persistence.
- Expired sessions, old login history and stale rate-limit buckets are removed at startup and hourly.

## Existing controls verified

The review confirmed that Nexora already validates CSRF tokens and request Origin, rejects disallowed Socket.IO origins, seals persisted Trust state with WebCrypto AES-GCM/non-extractable keys, rejects server-side MLS commit/message replay, and charges E2EE attachment quota by actual ciphertext bytes after exact size and SHA-256 validation.

## Compatibility

- Version: 3.2.3
- Local Server schema: 8 (unchanged)
- Application API: v3 (unchanged)
- Trust/MLS/encrypted-media API: v4 (unchanged)
- Database migration: not required

## Distribution

Without configured Authenticode credentials, the release workflow publishes verified Source/PWA artifacts, SPDX SBOM and SHA-256 checksums. Unsigned updater assets remain blocked.
