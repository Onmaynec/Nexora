# Nexora 3.3.4 Release Checklist

## Repository identity

- [ ] `package.json`, lockfile, Client handshake and Android metadata show `3.3.4`.
- [ ] Canonical notes and verification exist under `docs/releases/3.3.4/`.
- [ ] Root release files are compatibility pointers only.
- [ ] `CHANGELOG.md`, README, docs portal, Security Policy, Branch Status and Support agree.
- [ ] Commit contains no secrets, databases, backups, user data or temporary migration/diagnostic files.
- [ ] Official tag is immutable `v3.3.4` and points to the reviewed release commit.

## Automated gates

- [ ] `npm ci` — PASS.
- [ ] metadata synchronization — PASS.
- [ ] release consistency — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm run test:unit` — PASS.
- [ ] `npm run test:performance` — PASS.
- [ ] `npm run audit:security` — PASS with no high/critical production dependency finding.
- [ ] Linux `npm test` — PASS.
- [ ] Schema 8 soak — PASS.
- [ ] Android `assembleDebug` — PASS.
- [ ] Focused Nexora 3.3 regressions — PASS.
- [ ] Introductory and advanced website contracts/build — PASS.

## Post-MLS architecture

- [ ] Ordinary server-readable messaging is the only writable messaging path.
- [ ] Client bootstrap does not import or initialize Trust/MLS runtime.
- [ ] `ts-mls`, Trust routes, recovery workers, MLS transport, encrypted-upload write runtime and Client MLS engine are absent.
- [ ] Schema 8 compatibility records preserve legacy IDs, epochs, timestamps, ciphertext and audit provenance.
- [ ] No migration converts legacy ciphertext into plaintext.
- [ ] Legacy viewer contains no composer, upload, voice-record or mutation controls.
- [ ] Legacy export records `serverDecrypted: false`.
- [ ] HTTP and Socket.IO legacy mutations return terminal `LEGACY_READ_ONLY`.

## Authentication, authorization and sessions

- [ ] Session, Origin and CSRF checks precede mutations.
- [ ] owner/moderator/member boundaries pass.
- [ ] Active bans override stale membership and direct API attempts.
- [ ] Removed/banned users lose REST and realtime access.
- [ ] Invitations enforce expiry, use limits and atomic final use.
- [ ] Active sessions expose device ID/name/platform/version/timestamps/expiry.
- [ ] Targeted remote revoke deletes sessions and disconnects their Socket.IO rooms.
- [ ] Current-device remote revoke fails with `STATE_CONFLICT`.
- [ ] Device changes emit `session.revoked` and `device.updated`.

## Uploads and media

- [ ] Ordinary file/image/voice restrictions are enforced server-side.
- [ ] Actual MIME, size, hash and safe filename checks pass.
- [ ] Resumable upload cancellation/retry/error cleanup pass.
- [ ] Corrupt images and unsupported/denied microphone paths fail safely.
- [ ] Voice live amplitude, playback progress, seeking and rate controls pass.
- [ ] Retired encrypted-upload routes cannot reserve or store new data.

## Backup, migration and reliability

- [ ] Source DB integrity and WAL checkpoint pass before migration-sensitive work.
- [ ] Free-space failure occurs before mutation.
- [ ] Backup verification does not replace live DB/files.
- [ ] Encrypted temporary material is removed after success and failure.
- [ ] Restore replacement failure rolls back database and file store.
- [ ] Future schema version fails before mutation.
- [ ] Schema 8 compatibility migration is idempotent.

## Errors and observability

- [ ] Stable errors include `code`, `message`, `requestId` and safe `details`.
- [ ] Stack, SQL, tokens and secrets are not exposed.
- [ ] Expected authorization, validation, conflict, rate-limit, read-only, backup and temporary-server states are distinguishable.
- [ ] Signing status exposes configuration state only and never credentials.

## Updater and distribution

- [ ] Client uses `latest`; Server uses `server` metadata channel.
- [ ] Signature/checksum failures use `UPDATE_SIGNATURE_INVALID`.
- [ ] Downgrade is disabled.
- [ ] Partial signing policy is rejected.
- [ ] Complete signing policy verifies subject, thumbprint and timestamp.
- [ ] Without signing policy, official `v3.3.4` is an explicit `UNSIGNED-TEST` prerelease.
- [ ] Unsigned assets contain no `latest.yml`, `server.yml` or blockmaps.
- [ ] Client and Server installers pass installed-package smoke.
- [ ] Source, PWA, Android, SBOM, release evidence and SHA-256 checksums are present.
- [ ] Published assets are re-downloaded and checksums/channel invariants re-verified.

## Completion and handoff

- [ ] PR #70 reviewed and marked ready.
- [ ] Final PR CI green on the reviewed head SHA.
- [ ] PR #70 merged with release commit identity.
- [ ] Post-merge CI green.
- [ ] Annotated `v3.3.4` and GitHub Release created.
- [ ] Canonical verification ledger updated with run IDs, SHAs, release URL and asset hashes.
- [ ] Old mixed-scope PR #69 closed as superseded.
- [ ] Nexora 3.4.0 branch recreated from the verified 3.3.4 baseline.

Authenticode credentials, independent review and signed Windows 3.3.4→3.4.0 acceptance are not prerequisite-release blockers; they remain mandatory for Nexora 3.4.0 signed stable promotion.
