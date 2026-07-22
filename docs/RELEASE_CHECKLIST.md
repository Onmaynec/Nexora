# Nexora 3.2.0 Release Checklist

## Release classification

- [ ] Intended classification is explicitly selected: Development, Source/PWA prerelease, or Stable signed release.
- [ ] Documentation and GitHub Release text use the same classification.
- [ ] `3.2.0` is not described as independently audited E2EE.
- [ ] Stable signed promotion is blocked while any mandatory manual/signing/security gate remains incomplete.

## Version and repository state

- [ ] `package.json` and `package-lock.json` show `3.2.0`.
- [ ] Client handshake shows `3.2.0`.
- [ ] Android `versionName` is `3.2.0` and `versionCode` is `30200`.
- [ ] tag is `v3.2.0`, annotated/signed and points to the verified release commit.
- [ ] release commit contains no temporary diagnostics, secrets, databases or generated user data.
- [ ] `CHANGELOG.md`, `RELEASE_NOTES_3.2.0.md` and `RELEASE_VERIFICATION_3.2.0.md` are current.
- [ ] README, Security Policy, Architecture and release status agree on version, schema and distribution state.

## Automated release gate

- [ ] `npm ci` — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm run test:unit` — PASS.
- [ ] `npm run test:performance` — PASS.
- [ ] `npm run audit:security` — PASS.
- [ ] `npm run release:check` — PASS.
- [ ] Linux `npm test` — PASS.
- [ ] schema 8 soak — PASS.
- [ ] `gradle -p android :app:assembleDebug --no-daemon` — PASS.
- [ ] production dependency audit reports no high/critical vulnerability accepted without documented release decision.

## Schema 8 migration and data

- [ ] schema 7 → 8 migration tested on a copy of supported data.
- [ ] source `PRAGMA integrity_check` returns `ok`.
- [ ] free-space calculation passes.
- [ ] WAL checkpoint completes.
- [ ] verified pre-migration backup is created.
- [ ] migration is transactional and idempotent.
- [ ] destination integrity check returns `ok`.
- [ ] downgrade through persistence/restore is blocked.
- [ ] existing 3.1.x messages/files remain readable and are not presented as retroactively encrypted.
- [ ] restore-from-backup rollback procedure is tested.

## Trust devices

- [ ] device registration verifies Ed25519 proof of possession.
- [ ] first-device bootstrap behavior is documented and tested.
- [ ] later-device verification requires an active verified device and scoped one-time challenge.
- [ ] revocation requires a scoped one-time challenge and valid signature.
- [ ] revoked device loses Trust/MLS API access.
- [ ] revoked device Socket.IO connection is disconnected immediately.
- [ ] other account devices remain connected.
- [ ] revoked Client wipes device identity, private MLS state, KeyPackages, decrypted cache and drafts.
- [ ] fingerprint comparison UX is accessible and unambiguous.

## MLS secure messaging

- [ ] fixed ciphersuite is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.
- [ ] KeyPackages are one-time, expiring and scope-bound.
- [ ] Welcome delivery is user/device/conversation scoped.
- [ ] epoch increments are monotonic.
- [ ] stale, skipped and duplicate epochs are rejected.
- [ ] ciphertext replay is rejected.
- [ ] missed-commit recovery requires a contiguous chain.
- [ ] unrecoverable local state loss fails explicitly.
- [ ] secure Socket.IO sessions bind authenticated account and active verified device.
- [ ] ciphertext is emitted only to active verified MLS-member device rooms.
- [ ] Alice/Bob interoperability test passes.

## Plaintext downgrade protection

After MLS activation, direct attempts are rejected for:

- [ ] legacy send;
- [ ] forward;
- [ ] edit;
- [ ] server draft;
- [ ] scheduled message;
- [ ] poll;
- [ ] bot message;
- [ ] multipart upload;
- [ ] resumable upload;
- [ ] mismatched or legacy Socket.IO device session.

- [ ] serializer exposes no secure-message plaintext.
- [ ] UI does not silently offer legacy fallback after secure-path failure.

## Encrypted files, images and voice

- [ ] Client uses random AES-256-GCM key and IV per payload.
- [ ] AAD binds conversation, attachment ID and media kind.
- [ ] plaintext and ciphertext hashes are verified.
- [ ] source filename, actual MIME, caption, duration and waveform remain inside MLS content.
- [ ] Local Server stores generic opaque ciphertext metadata.
- [ ] exact GCM size and SHA-256 are validated.
- [ ] pending ciphertext is inaccessible before atomic message claim.
- [ ] pending expiry and cancel cleanup work.
- [ ] matching retry is idempotent.
- [ ] scope/hash/size substitution is rejected.
- [ ] attachment reuse is rejected.
- [ ] Client supports progress and cancel.
- [ ] Client verifies local decrypt before preview/playback/download.
- [ ] ordinary outbox/cache do not retain plaintext attachment descriptor fields.
- [ ] disabling any room class `files/images/voice` blocks the complete opaque media path fail-closed.

## Identity, rooms and application security

- [ ] session, Origin and CSRF protections pass.
- [ ] authorization, membership, role, ban and room-policy checks pass for direct API requests.
- [ ] ownership transfer is atomic and produces audit/system records.
- [ ] removed/banned users lose REST and realtime access.
- [ ] invitation expiry, limit and concurrent final-use behavior pass.
- [ ] local TOTP and one-time recovery codes pass.
- [ ] bot token hash/scope/expiry and webhook HTTPS/SSRF/HMAC protections pass.
- [ ] Electron context isolation, session isolation and certificate pinning pass.
- [ ] Android rejects cleartext, mixed content and TLS errors.

## Pulse Cloud and Cloud Identity

- [ ] email verification and Cloud sessions pass.
- [ ] Cloud MFA and one-time recovery code pass.
- [ ] OAuth 2.1 Authorization Code + PKCE S256 uses exact redirect URI.
- [ ] Local Account link attestation is one-time and scope-bound.
- [ ] envelope/entitlement key ID, signature, expiry and scope checks pass.
- [ ] provider event replay/payload substitution protection passes.
- [ ] checkout idempotency cannot cross account/product scope.
- [ ] Cloud event delta and entitlement revoke apply idempotently.
- [ ] Cloud outage does not block local messaging or authorize new monetary writes.
- [ ] sandbox creates no production signature/payment and cannot produce a negative balance.

## Operational runtime

- [ ] `/healthz/live` and `/healthz/ready` pass for Local Server and Pulse Cloud.
- [ ] readiness becomes `503` during drain.
- [ ] `/metrics` is Bearer-protected or loopback-only.
- [ ] logs contain request IDs and redact credentials recursively.
- [ ] graceful shutdown closes workers, HTTP/Socket.IO and SQLite in order.
- [ ] developer-command registry has no shell/eval escape.
- [ ] mutating commands are audited without secret argument values.
- [ ] backup/restore and emergency read-only procedures are verified.

## UI, accessibility and offline

- [ ] profile opens from all supported contexts and handles null relationship state.
- [ ] zero badges are hidden.
- [ ] reaction picker and message actions support mouse and keyboard.
- [ ] 1920×1080, 1366×768 and narrow layouts pass.
- [ ] long names, filenames and counters do not break layout.
- [ ] `prefers-reduced-motion` is respected.
- [ ] offline cache, durable outbox and delta sync recover without duplicates.
- [ ] secure cache/drafts persist encrypted and are wiped on revoke.
- [ ] loading, success, error, offline, restricted and disabled states are visible.

## Platform runtime gates

### Windows

- [ ] clean Client/Server install on Windows 10 x64.
- [ ] clean Client/Server install on Windows 11 x64.
- [ ] upgrade from supported baseline preserves data and trust settings.
- [ ] packaged Trust/MLS and encrypted-media runtime E2E passes.
- [ ] Authenticode for both installers is valid and timestamped.
- [ ] SmartScreen/reputation has been reviewed.
- [ ] uninstall preserves Server data unless explicitly removed.

### PWA

- [ ] installed PWA updates application shell correctly.
- [ ] Service Worker does not cache API/Socket.IO.
- [ ] offline authorized cache behavior passes.
- [ ] Trust/MLS/encrypted-media runtime works after restart and reconnect.

### Android

- [ ] physical-device matrix passes.
- [ ] HTTPS-only deep link passes.
- [ ] changed/untrusted certificate is rejected.
- [ ] file and microphone permission flows pass.
- [ ] Trust/MLS/encrypted-media runtime passes.
- [ ] signed APK/AAB and upgrade path are verified for stable promotion.

## GitHub release and updater

- [ ] `main` and release tags are protected; required CI and 2FA are enabled.
- [ ] Source/PWA prerelease contains source ZIP, PWA ZIP, SPDX SBOM and checksums only.
- [ ] no unsigned `.exe`, blockmap or `latest.yml` is published.
- [ ] stable Windows release contains the complete signed asset set.
- [ ] stable release is not marked prerelease.
- [ ] updater n-1 → n passes on installed Client.
- [ ] Source/PWA prerelease returns `no_installable_update`.
- [ ] published stable assets are immutable.

## Stable promotion review

- [ ] metadata minimization and traffic-analysis review completed.
- [ ] extended simultaneous-commit, revoke/re-add and corrupted-state matrix completed.
- [ ] longer-duration load/soak and long-offline evidence completed.
- [ ] independent cryptographic review completed.
- [ ] independent application-security review completed.
- [ ] no unresolved high/critical findings remain.
- [ ] release owner records final signed production approval.

Until all stable-promotion items are complete, `3.2.0` remains a clearly marked Source/PWA prerelease and must not be promoted through the Electron stable updater.
