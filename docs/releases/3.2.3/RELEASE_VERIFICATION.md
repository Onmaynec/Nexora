# Nexora 3.2.3 — Release Verification

## Classification

- Version: `3.2.3`.
- Base release: `3.2.2`.
- Pull Request: `#20`.
- Branch: `agent/nexora-3.2.3-security-hardening`.
- Verified implementation head: `a3586fe7d399dc03a990c939c31a3ceabcbad000`.
- GitHub Actions: CI run `#308`, run ID `29937445396`.
- Date: `2026-07-22`.
- Result: automated security patch-release gate passed.

## Regression-first evidence

The first candidate contained security regression tests before production corrections. CI run `#290`, run ID `29934225971`, failed against the `3.2.2` implementation as expected because active-device limits, total KeyPackage limits, credential scope validation, the shared bounded limiter, security-state cleanup and strict client recovery validation did not yet exist.

## Confirmed root causes

- Trust registration did not parse and bind the MLS BasicCredential to the authenticated user and candidate device.
- Identity proof and MLS signature roles could reuse one Ed25519 public key.
- Active Trust devices and unclaimed KeyPackages had no total account-level storage ceilings.
- Trust audit metadata used a shallow key-name blacklist and accepted arbitrary nested objects.
- Trust directory, enrollment, KeyPackage and recovery routes had no dedicated bounded request limiter.
- Shared room conversation access trusted stale membership even when an active ban also existed.
- Client missed-commit recovery trusted server envelope fields without independently checking complete scope, contiguous epochs, commit hashes, duplicate hashes and every public-state hash.
- Expired sessions and old persistent security telemetry were not removed by periodic maintenance.

## Implemented corrections

- MLS BasicCredential must be the exact versioned `{ userId, deviceId }` credential for the authenticated registration attempt.
- Identity and MLS signature Ed25519 keys must be distinct.
- At most 16 active Trust devices are permitted per account; duplicate registration remains idempotent and revocation releases capacity.
- KeyPackage uploads are limited to 25 per request, 32 unclaimed packages per device and 256 per user, enforced atomically in SQLite.
- Trust audit metadata is reduced to action-specific primitive allowlists.
- Trust and E2EE attachment routes use a shared memory-bounded sliding-window limiter with stable `RATE_LIMITED` responses and `Retry-After`.
- Room conversation access fails closed for active bans.
- Missed MLS recovery validates the complete group envelope, exact epoch sequence, SHA-256 commit payloads, duplicate hashes and intermediate/final public-state hashes before persistence.
- Startup and hourly maintenance remove expired sessions, login history older than 90 days and stale persisted rate-limit buckets.

## Findings verified as already mitigated

- The Trust bootstrap lifecycle race was corrected in `3.2.2`.
- Mutating application and Trust APIs require CSRF tokens and validate request Origin.
- Socket.IO rejects disallowed origins through `allowRequest`.
- IndexedDB Trust material is AES-GCM sealed with non-extractable WebCrypto keys.
- Opaque E2EE attachments are bounded by actual ciphertext bytes, checked against `plaintextSize + AES-GCM tag`, hashed and charged to quota by actual stored ciphertext size.
- SQLite already enforces unique MLS commit hashes/group epochs and server-side message replay protection.

## Automated gates

CI run `#308` passed all required jobs:

- Windows `npm run check` — syntax/config validation and production PWA build;
- Windows `npm run test:unit` — unit, integration and API regressions;
- Windows `npm run test:performance`;
- Windows `npm run audit:security`;
- Linux `npm test`;
- dedicated `npm run release:check`;
- schema 8 soak;
- Android `gradle -p android :app:assembleDebug --no-daemon`.

## Compatibility

- Local Server schema: `8` — unchanged.
- Application API: v3 — unchanged.
- Trust/MLS/encrypted-media API: v4 — unchanged.
- No database migration is required from `3.2.0`, `3.2.1` or `3.2.2`.

## Distribution boundary

Without both Authenticode secrets, the release workflow publishes Source/PWA, SPDX SBOM and SHA-256 checksums as a prerelease. Unsigned `.exe`, `.blockmap` and `latest.yml` updater assets remain blocked.
