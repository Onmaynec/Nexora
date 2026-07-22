# Nexora 3.2.3 Release Checklist

## 1. Classification и repository state

- [ ] Release classification указана: Development, Source/PWA prerelease или Stable signed release.
- [ ] `package.json`, lockfile, Client handshake и Android metadata показывают `3.2.3`.
- [ ] Tag — `v3.2.3`, annotated/signed и указывает на verified release commit.
- [ ] `CHANGELOG.md`, `RELEASE_NOTES_3.2.3.md`, `SECURITY_REVIEW_3.2.3.md` и `RELEASE_VERIFICATION_3.2.3.md` актуальны.
- [ ] README, Security Policy, Architecture, Branch Status и Documentation Portal согласованы.
- [ ] Release commit не содержит secrets, databases, backups, generated user data или temporary patchers.
- [ ] `3.2.3` не описывается как independently audited E2EE или signed stable Windows release.

## 2. Regression-first security evidence

- [ ] Confirmed findings воспроизведены тестами до production correction.
- [ ] Initial failing CI evidence сохранено.
- [ ] Findings, уже mitigated в предыдущей версии, документированы без cosmetic replacement.
- [ ] Rejected recommendations имеют техническое обоснование.
- [ ] Root cause и correction записаны в Security Review/Verification.
- [ ] Final implementation и documentation candidates прошли полный CI.

## 3. Automated gates

- [ ] `npm ci` — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm run test:unit` — PASS.
- [ ] `npm run test:performance` — PASS.
- [ ] `npm run audit:security` — PASS.
- [ ] `npm run release:check` — PASS.
- [ ] Linux `npm test` — PASS.
- [ ] schema 8 soak — PASS.
- [ ] Android `gradle -p android :app:assembleDebug --no-daemon` — PASS.
- [ ] Dependency audit не содержит недокументированных high/critical findings.

## 4. Compatibility

- [ ] Local Server schema остаётся 8.
- [ ] Application API остаётся v3.
- [ ] Trust/MLS/encrypted-media API остаётся v4.
- [ ] Update с 3.2.0–3.2.2 не требует database migration.
- [ ] Existing secure conversations остаются protocol-compatible.
- [ ] Schema 7 → 8 migration по-прежнему работает для 3.1.x source data.
- [ ] Incompatible downgrade блокируется.

## 5. Lifecycle regressions 3.2.1–3.2.2

- [ ] `/api/bootstrap` выполняется до Trust enrollment после authentication.
- [ ] Login не зависает на «Собираем ваши чаты».
- [ ] Trust scope использует authoritative Server ID из bootstrap.
- [ ] Parent layout configuration выполняется до child encrypted-draft effects.
- [ ] Pre-configuration draft read возвращает empty state вместо `TRUST_NOT_CONFIGURED`.
- [ ] Реальные WebCrypto/IndexedDB/registration errors не скрываются.
- [ ] Server stop/quit single-flight.
- [ ] Pulse/Trust status после SQLite close формирует stopped-state snapshot.
- [ ] Unexpected repository/database errors propagates.

## 6. Trust credential и key roles

- [ ] Device registration проверяет Ed25519 proof of possession.
- [ ] MLS BasicCredential точно связывает authenticated `userId` и candidate `deviceId`.
- [ ] Credential другого user/device scope отклоняется.
- [ ] Identity proof и MLS signature keys различаются.
- [ ] Reuse одного key для двух ролей отклоняется.
- [ ] First-device bootstrap и later-device signed approval проверены.
- [ ] Verify/revoke challenges one-time, expiring и operation-scoped.

## 7. Trust device ceiling

- [ ] До 16 active devices/user разрешены.
- [ ] 17-й active device отклоняется без partial state.
- [ ] Duplicate registration остаётся idempotent.
- [ ] Revocation освобождает capacity.
- [ ] Concurrent final-capacity registration не превышает 16 records.
- [ ] Revoked device теряет Trust/MLS API access.
- [ ] Target secure Socket.IO disconnect immediate.
- [ ] Другие devices account остаются connected.
- [ ] Revoked Client wipes identity, MLS state, KeyPackages, cache и drafts.

## 8. KeyPackage governance

- [ ] Максимум 25 KeyPackages/request.
- [ ] 26-item request отклоняется полностью.
- [ ] Максимум 32 unclaimed packages/device.
- [ ] Максимум 256 unclaimed packages/user.
- [ ] Overflowing batch rollback atomic.
- [ ] Concurrent upload/claim не обходит limits.
- [ ] Expired packages очищаются maintenance process.
- [ ] Claim one-time и scope-bound.
- [ ] Reuse/scope substitution отклоняется.

## 9. Route rate limiting

- [ ] Trust directory routes имеют dedicated limit.
- [ ] Enrollment routes имеют dedicated limit.
- [ ] KeyPackage routes имеют dedicated limit.
- [ ] Recovery routes имеют dedicated limit.
- [ ] E2EE upload routes имеют dedicated limit.
- [ ] Limiter memory-bounded.
- [ ] Exceeded request возвращает HTTP `429`.
- [ ] Stable code — `RATE_LIMITED`.
- [ ] `Retry-After` присутствует и корректен.
- [ ] После expiry window requests возобновляются.
- [ ] Buckets разных operations не смешиваются ошибочно.
- [ ] Stale persisted buckets удаляются startup/hourly maintenance.
- [ ] Rate limiting не заменяет authorization/resource ceilings.

## 10. Room access fail-closed

- [ ] Active ban блокирует conversation access при stale membership.
- [ ] REST message/media/recovery operations отклоняются.
- [ ] Socket.IO room delivery прекращается.
- [ ] Removed/banned user не получает realtime events.
- [ ] Error не раскрывает SQL/internal details.
- [ ] Normal active membership без ban продолжает работать.

## 11. Trust audit metadata

- [ ] Audit использует action-specific primitive allowlists.
- [ ] Arbitrary nested objects не сохраняются.
- [ ] Secret-like nested values не попадают в audit.
- [ ] Private keys, tokens, signatures и message content не сохраняются.
- [ ] Required initiator/action/target/scope/time остаются доступны.
- [ ] Existing audit readers совместимы.

## 12. MLS secure messaging

- [ ] Fixed profile — `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.
- [ ] Welcome user/device/conversation scoped.
- [ ] Epoch increments monotonic.
- [ ] Stale/skipped/duplicate epochs отклоняются.
- [ ] Commit/message replay отклоняется.
- [ ] Secure Socket.IO bind к authenticated active verified device.
- [ ] Ciphertext доставляется только verified MLS-member devices.
- [ ] Ciphertext-only serialization, persistence и outbox.
- [ ] Alice/Bob interoperability — PASS.

## 13. Strict missed-commit recovery

- [ ] Complete group envelope проверяется.
- [ ] Group/conversation scope exact.
- [ ] Start/end epoch exact.
- [ ] Epoch sequence contiguous и ordered.
- [ ] SHA-256 каждого commit payload verified.
- [ ] Duplicate commit hashes rejected.
- [ ] Intermediate public-state hashes verified.
- [ ] Final public-state hash verified.
- [ ] Invalid state не persists.
- [ ] Positive recovery persists only after complete validation.
- [ ] Unrecoverable state возвращает explicit failure.

## 14. Plaintext downgrade protection

После MLS activation отклоняются:

- [ ] legacy send;
- [ ] forward;
- [ ] edit;
- [ ] server draft;
- [ ] scheduled message;
- [ ] poll;
- [ ] bot message;
- [ ] multipart upload;
- [ ] resumable upload;
- [ ] legacy/mismatched-device Socket.IO session.

- [ ] Serializer не раскрывает secure-message plaintext.
- [ ] UI не предлагает silent plaintext fallback.

## 15. Encrypted files, images и voice

- [ ] Random AES-256-GCM key/IV на payload.
- [ ] AAD binds conversation, attachment ID и media kind.
- [ ] Plaintext и ciphertext hashes verified.
- [ ] Raw ciphertext bounded до parsing.
- [ ] Exact `plaintextSize + 16` validation.
- [ ] Quota charged по actual stored ciphertext bytes.
- [ ] Filename/MIME/caption/duration/waveform остаются внутри MLS content.
- [ ] Pending object недоступен до atomic claim.
- [ ] Pending expiry/cancel cleanup.
- [ ] Matching retry idempotent.
- [ ] Scope/hash/size substitution rejected.
- [ ] Attachment reuse rejected.
- [ ] Local decrypt/preview/playback/download verified.
- [ ] Outbox/cache не сохраняет plaintext descriptor fields.
- [ ] Любой room media ban блокирует complete opaque path fail-closed.

## 16. Sessions и maintenance

- [ ] Expired sessions удаляются startup/hourly.
- [ ] Login history старше 90 дней удаляется.
- [ ] Fresh login history сохраняется.
- [ ] Stale rate-limit buckets удаляются.
- [ ] Active buckets не удаляются преждевременно.
- [ ] Expired Trust/KeyPackage resources очищаются.
- [ ] Maintenance failure observable.
- [ ] Cleanup не нарушает SQLite integrity.

## 17. Application security

- [ ] Secure sessions, Origin и CSRF — PASS.
- [ ] Role, membership, ban и room-policy direct API tests — PASS.
- [ ] Ownership transfer atomic + audit/system message.
- [ ] Invitation expiry/limit/concurrent last-use — PASS.
- [ ] Local TOTP/recovery one-time use — PASS.
- [ ] Bot token hash/scope/expiry — PASS.
- [ ] Webhook HTTPS/SSRF/DNS/HMAC — PASS.
- [ ] Electron isolation и certificate pinning — PASS.
- [ ] Android rejects cleartext/mixed content/TLS errors.

## 18. Pulse Cloud и Cloud Identity

- [ ] Email verification и Cloud sessions.
- [ ] Cloud MFA/recovery code one-time use.
- [ ] OAuth 2.1 Authorization Code + PKCE S256.
- [ ] Exact redirect URI.
- [ ] Local Account link one-time и scope-bound.
- [ ] Envelope/entitlement signature, key ID, expiry и scope.
- [ ] Provider-event replay/payload substitution protection.
- [ ] Checkout idempotency scope binding.
- [ ] Cloud delta/revoke idempotent.
- [ ] Cloud outage не блокирует local messaging.
- [ ] Sandbox не создаёт production authority или negative balance.

## 19. Operational runtime

- [ ] Local Server/Pulse live и ready endpoints.
- [ ] Readiness `503` during drain.
- [ ] Metrics Bearer-protected или loopback-only.
- [ ] Logs содержат request ID и recursive redaction.
- [ ] Graceful shutdown ordering verified.
- [ ] Developer commands без shell/eval escape.
- [ ] Mutating commands audited без secret args.
- [ ] Backup/restore и emergency read-only verified.

## 20. UI, accessibility и offline

- [ ] Profile opens из всех contexts и handles null relationship.
- [ ] Zero badges hidden.
- [ ] Reaction picker/actions keyboard accessible.
- [ ] 1920×1080, 1366×768 и narrow layouts.
- [ ] Long content и counters.
- [ ] `prefers-reduced-motion` respected.
- [ ] Offline cache/outbox/delta sync без duplicates.
- [ ] Secure cache/drafts encrypted и wiped on revoke.
- [ ] Loading/success/error/offline/restricted/rate-limited states видимы.

## 21. Platform runtime gates

### Windows

- [ ] Clean Client/Server install Windows 10/11 x64.
- [ ] Upgrade from supported baseline.
- [ ] Packaged Trust/MLS/encrypted-media runtime E2E.
- [ ] Authenticode valid и timestamped.
- [ ] SmartScreen/reputation reviewed.
- [ ] Uninstall preserves Server data unless explicit removal.

### PWA

- [ ] Installed PWA application-shell update.
- [ ] Service Worker excludes API/Socket.IO.
- [ ] Offline authorized cache.
- [ ] Trust/MLS recovery after restart/reconnect.

### Android

- [ ] Physical-device matrix.
- [ ] HTTPS-only deep link.
- [ ] Changed/untrusted certificate rejected.
- [ ] File/microphone permissions.
- [ ] Trust/MLS/encrypted-media runtime.
- [ ] Signed APK/AAB и upgrade path для stable promotion.

## 22. GitHub release и updater

- [ ] `main` и release tags protected; required CI и 2FA enabled.
- [ ] Source/PWA prerelease содержит source ZIP, PWA ZIP, SPDX SBOM и checksums.
- [ ] Unsigned `.exe`, blockmap и `latest.yml` отсутствуют.
- [ ] Stable Windows release содержит complete signed asset set.
- [ ] Stable release не marked prerelease.
- [ ] Updater n-1 → n verified.
- [ ] Source/PWA prerelease возвращает `no_installable_update`.
- [ ] Published stable assets immutable.

## 23. Stable promotion review

- [ ] Metadata minimization/traffic-analysis review completed.
- [ ] Extended multi-device concurrency/revoke/re-add/corruption matrix completed.
- [ ] Longer load/soak и long-offline evidence completed.
- [ ] Independent cryptographic review completed.
- [ ] Independent application-security review completed.
- [ ] No unresolved high/critical findings.
- [ ] Release owner records final signed production approval.

Пока stable-promotion items не завершены, `3.2.3` остаётся Source/PWA prerelease и не публикуется через stable Electron updater.
