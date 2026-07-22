# Nexora 3.2.4 Release Checklist

## 1. Classification и repository state

- [ ] Classification selected: Development, Source/PWA prerelease или Stable signed Windows.
- [ ] `package.json`, lockfile, Client handshake и Android metadata show `3.2.4`.
- [ ] Tag is immutable `v3.2.4` and points to verified commit.
- [ ] `CHANGELOG.md`, release notes, security review и verification are current.
- [ ] README, docs portal, Security Policy, Architecture, Branch Status и Support agree.
- [ ] Commit has no secrets, databases, backups, user data или temporary patchers.
- [ ] 3.2.4 is not described as independently audited or signed stable without evidence.

## 2. Automated gates

- [ ] `npm ci` — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm run test:unit` — PASS.
- [ ] `npm run test:performance` — PASS.
- [ ] `npm run audit:security` — PASS.
- [ ] `npm run release:check` — PASS.
- [ ] Linux `npm test` — PASS.
- [ ] Schema 8 soak — PASS.
- [ ] Android `assembleDebug` — PASS.
- [ ] No undocumented high/critical dependency finding.

## 3. Compatibility

- [ ] Application API remains v3.
- [ ] Trust/MLS/encrypted-media API remains v4-compatible.
- [ ] Local Server schema remains 8.
- [ ] No migration required from 3.2.0–3.2.3.
- [ ] Schema 7 → 8 migration remains tested for 3.1.x data.
- [ ] Restore-based rollback documented and tested.
- [ ] Older Client compatibility/failure message verified.

## 4. Authentication и application security

- [ ] Session/Origin/CSRF checks pass.
- [ ] owner/moderator/member boundaries pass.
- [ ] Active ban overrides stale membership.
- [ ] Removed/banned users lose REST/realtime access.
- [ ] Invitation expiry/limit/concurrent final use pass.
- [ ] TOTP/recovery codes pass.
- [ ] Upload size/hash/actual-MIME controls pass.
- [ ] Bot/webhook scope, SSRF и HMAC pass.
- [ ] Electron/Android TLS and renderer boundaries pass.

## 5. Trust devices и resources

- [ ] BasicCredential exactly binds `{ userId, deviceId }`.
- [ ] Identity and MLS signature keys are distinct.
- [ ] Device proof-of-possession required.
- [ ] First/later device lifecycle correct.
- [ ] 16 active-device limit atomic.
- [ ] Duplicate registration idempotent.
- [ ] Revocation releases capacity and disconnects target.
- [ ] Local Trust/MLS/cache/draft wipe after revoke.
- [ ] KeyPackage 25/request limit.
- [ ] KeyPackage 32/device and 256/user limits atomic.
- [ ] Expired inventory cleanup.

## 6. Rate limits и audit

- [ ] Trust/recovery/E2EE routes use bounded limiter.
- [ ] Excess returns HTTP `429`.
- [ ] Stable code `RATE_LIMITED`.
- [ ] `Retry-After` present.
- [ ] State remains bounded and stale buckets cleaned.
- [ ] Trust audit uses action-specific primitive allowlists.
- [ ] Nested secret-like metadata not persisted.

## 7. MLS secure messaging

- [ ] Fixed profile remains `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.
- [ ] KeyPackage and Welcome one-time/scope-bound.
- [ ] Epoch monotonicity and replay rejection.
- [ ] Device-scoped Socket.IO active verified delivery.
- [ ] Ciphertext-only persistence/serialization/outbox.
- [ ] Alice/Bob interoperability.
- [ ] Strict recovery group/sequence/hash/public-state validation.
- [ ] Invalid recovery never persists partial state.
- [ ] Unrecoverable state fails explicitly.

## 8. MLS Welcome recovery 3.2.4

- [ ] `welcome/request` requires session, Origin/CSRF, access, active-ban and verified device.
- [ ] Bounded rate limiter applied.
- [ ] Only active verified group devices receive notification.
- [ ] Active Client creates signed commit/Welcome.
- [ ] Pending Client retries bounded one-time claim.
- [ ] Text, encrypted media and voice use recovered common path.
- [ ] No active member remains fail-closed.
- [ ] No private key/plaintext traverses Server.
- [ ] Duplicate/redundant requests suppressed or bounded.

## 9. Plaintext downgrade

After MLS activation reject:

- [ ] legacy send/forward/edit;
- [ ] server draft/scheduled/poll;
- [ ] bot message;
- [ ] multipart/resumable upload;
- [ ] legacy or mismatched Socket.IO device;
- [ ] UI fallback to plaintext.

## 10. Encrypted files/images/voice

- [ ] AES-256-GCM random key/IV.
- [ ] AAD scope binding.
- [ ] Plaintext/ciphertext hashes.
- [ ] Exact ciphertext size/quota by stored bytes.
- [ ] Private descriptor remains in MLS content.
- [ ] Pending inaccessible before claim.
- [ ] Expiry/cancel/idempotent retry.
- [ ] Scope/hash/size substitution rejected.
- [ ] One-time claim/reuse rejection.
- [ ] Local verified preview/playback/download.
- [ ] Room media restrictions fail-closed.

## 11. Updater 3.2.4

- [ ] Service initialized before renderer IPC.
- [ ] Packaged default provider is official GitHub Releases.
- [ ] Custom feed requires explicit HTTPS config.
- [ ] HTTP feed rejected.
- [ ] Initial and scheduled checks work.
- [ ] Checks are single-flight.
- [ ] UI shows checking/progress/current/available/downloaded/error/retry.
- [ ] Returned-result fallback provides terminal state.
- [ ] Downgrade/prerelease disabled.
- [ ] Code-signature verification enabled.
- [ ] Missing signed assets produce non-installable state.
- [ ] No stack/internal path disclosure.

## 12. Post-update, test mode и installer

- [ ] Summary appears once per version.
- [ ] “Подробнее” opens exact official tag.
- [ ] “Закрыть” works.
- [ ] “Не показывать снова” scopes to version.
- [ ] Normal shortcut opens no log console.
- [ ] Test shortcut/`--test-mode`/env switch tail local log.
- [ ] Console exits with Client.
- [ ] No DevTools/Node integration/remote debugging.
- [ ] Log records flattened/length-limited.
- [ ] Client/Server NSIS use official icon, branded sidebar and Russian language.
- [ ] Clean install/update/uninstall accepted.

## 13. Server console

- [ ] Only registered DeveloperCommandService commands execute.
- [ ] Stable `{ code, message }` crosses IPC.
- [ ] `<user>`/`[days]` copied placeholders normalize safely.
- [ ] No shell/eval/filesystem escape.
- [ ] Mutations audited without argument values.

## 14. Pulse и operations

- [ ] Cloud Identity/MFA/OAuth PKCE.
- [ ] Signed link/entitlement scope and replay protection.
- [ ] Ledger/idempotency/non-negative wallet.
- [ ] Sandbox isolated from production authority.
- [ ] live/ready/metrics policy.
- [ ] request IDs and credential redaction.
- [ ] graceful drain/shutdown.
- [ ] startup/hourly expired-session/login-history/rate-bucket cleanup.
- [ ] backup/restore/emergency read-only procedures.

## 15. Platform runtime

### Windows

- [ ] Clean Client/Server install Windows 10.
- [ ] Clean Client/Server install Windows 11.
- [ ] Upgrade preserves data/settings/trust.
- [ ] Signed Authenticode installers/timestamps.
- [ ] Installed updater n-1 → 3.2.4.
- [ ] Packaged MLS Welcome recovery for text/media/voice.
- [ ] Test-mode shortcut on clean account.

### PWA

- [ ] Installed shell update.
- [ ] No API/Socket.IO Service Worker caching.
- [ ] Offline authorized cache.
- [ ] Trust/MLS/recovery after restart/reconnect.

### Android

- [ ] Physical-device matrix.
- [ ] HTTPS-only deep link and TLS rejection.
- [ ] File/microphone permissions.
- [ ] Trust/MLS/encrypted media/recovery.
- [ ] Signed APK/AAB and upgrade path.

## 16. GitHub release

- [ ] `main`/tags protected and 2FA enabled.
- [ ] Source/PWA prerelease contains only allowed artifacts.
- [ ] No unsigned updater assets published.
- [ ] Stable release contains complete signed set.
- [ ] Published stable assets immutable.
- [ ] Release page links correct docs and checksums.

## 17. Stable promotion review

- [ ] Metadata/traffic-analysis review.
- [ ] Extended simultaneous Welcome/commit/revoke/re-add/corrupted-state matrix.
- [ ] Longer load/soak/long-offline evidence.
- [ ] Independent cryptographic review.
- [ ] Independent application-security review.
- [ ] No unresolved high/critical findings.
- [ ] Release owner approval recorded.

Until all stable gates complete, 3.2.4 remains Source/PWA prerelease and must not be promoted through stable updater.
