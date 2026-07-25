# Nexora 3.4.0 Release Checklist

## 1. Classification и repository state

- [ ] Classification: Stable Core release candidate until all gates complete.
- [ ] `package.json`, lockfile, Client handshake и Android metadata show `3.4.0`.
- [ ] PR head is exact reviewed merge candidate.
- [ ] `CHANGELOG.md`, canonical release notes, security review и verification are current.
- [ ] README, docs portal, Security Policy, Architecture, Branch Status и Support agree.
- [ ] Commit has no secrets, databases, backups, user data, temporary patchers или generated failure logs.
- [ ] No document describes `3.4.0` as published/signed/independently approved without evidence.

## 2. Prerequisite baseline

- [ ] Published non-draft/non-prerelease `v3.3.4` exists.
- [ ] `v3.3.4` has required Client installer.
- [ ] `v3.3.4` has required Server installer.
- [ ] `v3.3.4` has `SHA256SUMS.txt`.
- [ ] Baseline assets download and verify.
- [ ] Release branch descends from merged post-MLS baseline commit.

## 3. Automated gates

- [ ] `npm ci` — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm run test:unit` — PASS.
- [ ] `npm run test:performance` — PASS.
- [ ] `npm run audit:security` — PASS.
- [ ] `npm run release:check` — PASS.
- [ ] Linux `npm test` — PASS.
- [ ] Schema 8 soak — PASS.
- [ ] Android `assembleDebug` — PASS.
- [ ] Focused Nexora 3.4 regressions — PASS.
- [ ] Introductory website validation/build — PASS.
- [ ] Advanced Documentation generation/validation/build — PASS.
- [ ] No high/critical production dependency finding.

## 4. Compatibility and Stable Core boundary

- [ ] Application API remains v3.
- [ ] Local Server schema remains 8.
- [ ] Ordinary messaging is the only writable messaging path.
- [ ] Executable Trust/MLS runtime and `ts-mls` remain removed.
- [ ] Legacy schema 8 records remain preserved.
- [ ] Legacy viewer/export is read-only.
- [ ] Server never decrypts legacy ciphertext.
- [ ] Legacy HTTP mutations return `410/LEGACY_READ_ONLY`.
- [ ] MLS Socket.IO mutations return terminal `LEGACY_READ_ONLY` ack.
- [ ] Ordinary chats open despite stale/corrupt legacy MLS state.

## 5. Authentication and authorization

- [ ] Session/Origin/CSRF checks pass.
- [ ] owner/moderator/member boundaries pass.
- [ ] Exactly one room owner maintained.
- [ ] Atomic ownership transfer passes.
- [ ] Active ban overrides stale membership.
- [ ] Removed/banned users lose REST/realtime access.
- [ ] Invite expiry/limit/revocation/concurrent final use pass.
- [ ] TOTP/recovery codes pass.
- [ ] Stable public error envelope does not leak internals.

## 6. Devices and sessions

- [ ] Device inventory is derived from server sessions.
- [ ] Device ID/name/platform/version/created/last-seen/expiry exposed safely.
- [ ] Targeted remote revoke invalidates only target sessions.
- [ ] `session.revoked` emitted.
- [ ] Target Socket.IO connections disconnected immediately.
- [ ] `device.updated` emitted.
- [ ] Current-device remote revoke returns `STATE_CONFLICT`.
- [ ] Revoke-all-others preserves current session.

## 7. Uploads, images and voice

- [ ] Authorization and room media restrictions checked server-side.
- [ ] Size/quota and chunk/file SHA-256 checks pass.
- [ ] Actual MIME signature checked.
- [ ] Fake extension/header rejected.
- [ ] Dangerous/executable content rejected.
- [ ] Safe filename enforced.
- [ ] Temporary data removed after cancel/error.
- [ ] Corrupt image handled safely.
- [ ] Microphone denial/unsupported format handled.
- [ ] Voice waveform, played progress, seek and speed pass.
- [ ] Direct API cannot bypass read-only/slow/media restrictions.

## 8. Backup, restore and migration

- [ ] Source integrity checked before mutation.
- [ ] WAL checkpoint and free-space checks pass.
- [ ] Verified backup created.
- [ ] Backup verification is non-restoring and server-admin-only.
- [ ] Backup ID constrained to allowlisted directory.
- [ ] Future schema blocked before mutation.
- [ ] Schema 8 migration idempotent.
- [ ] Disk-full failpoint leaves live state unchanged.
- [ ] DB/file replacement failure rolls both back.
- [ ] Temporary staged data cleaned after success/error.

## 9. Authenticode and packaging

- [ ] `WINDOWS_CERTIFICATE_BASE64` configured.
- [ ] `WINDOWS_CERTIFICATE_PASSWORD` configured.
- [ ] Expected signer subject configured.
- [ ] Expected signer thumbprint configured.
- [ ] Partial signing configuration rejected.
- [ ] Client installer signed and timestamped.
- [ ] Server installer signed and timestamped.
- [ ] Signer subject/thumbprint match policy.
- [ ] Client blockmap and `latest.yml` complete.
- [ ] Server blockmap and `server.yml` complete.
- [ ] Installer/metadata versions equal `3.4.0`.
- [ ] No unsigned official-release fallback exists.

## 10. Windows installed acceptance

- [ ] Windows 10 clean install.
- [ ] Windows 10 repair/uninstall.
- [ ] Windows 10 installed `3.3.4 → 3.4.0` upgrade.
- [ ] Windows 11 clean install.
- [ ] Windows 11 repair/uninstall.
- [ ] Windows 11 installed `3.3.4 → 3.4.0` upgrade.
- [ ] Installed Client product version equals `3.4.0`.
- [ ] Installed Server product version equals `3.4.0`.
- [ ] Installed executables pass Authenticode verification.
- [ ] Machine-readable Windows evidence identifies exact release candidate.

## 11. Independent security review

- [ ] Reviewer and scope recorded.
- [ ] Reviewed commit is exact release commit or ancestor.
- [ ] Authentication/authorization/session revocation reviewed.
- [ ] Legacy read-only/no-plaintext boundary reviewed.
- [ ] Upload/MIME/hash/quota controls reviewed.
- [ ] Backup/restore/migration failure paths reviewed.
- [ ] Updater/signing/tag publication reviewed.
- [ ] Unresolved critical findings = 0.
- [ ] Unresolved high findings = 0.
- [ ] Closure evidence committed in machine-readable file.

## 12. Release assets

- [ ] Signed Client installer and blockmap.
- [ ] `latest.yml`.
- [ ] Signed Server installer and blockmap.
- [ ] `server.yml`.
- [ ] Source ZIP.
- [ ] PWA ZIP.
- [ ] Android evidence APK.
- [ ] SPDX SBOM.
- [ ] Authenticode evidence JSON.
- [ ] Release evidence JSON.
- [ ] `SHA256SUMS.txt`.
- [ ] Canonical release notes used.

## 13. Tag and publication

- [ ] PR ready, review threads resolved, all checks green.
- [ ] Merge commit subject triggers only Nexora `3.4.0` stable workflow.
- [ ] Official annotated tag `v3.4.0` points to approved merge commit.
- [ ] Existing mismatched tag causes failure.
- [ ] GitHub Release is neither draft nor prerelease.
- [ ] Published assets are immutable.

## 14. Post-publication verification

- [ ] Re-download every asset.
- [ ] SHA-256 matches `SHA256SUMS.txt`.
- [ ] Authenticode subject/thumbprint/timestamp verified again.
- [ ] Client/Server updater metadata verified again.
- [ ] Source/PWA/SBOM content checks pass.
- [ ] Release URL, tag SHA, run IDs and digests recorded.
- [ ] `release-evidence/current.json` updated to published state.
- [ ] Release branch closed/deleted after provenance retention.

Official `v3.4.0` is complete only when every applicable item is checked with real evidence.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
