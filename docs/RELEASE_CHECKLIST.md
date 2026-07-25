# Nexora 3.6.0 Connect — Release Checklist

Every checked item requires real evidence. An unchecked external prerequisite blocks merge-to-release, tag and GitHub Release.

## 1. Identity and repository state

- [ ] Version is `3.6.0` in package, lockfile, Client handshake, Android and website.
- [ ] Branch is `release/3.6.0-connect`; changes were not made directly in `main`.
- [ ] PR targets the latest verified `main` baseline.
- [ ] README, docs portal, architecture, security, operations and release records agree.
- [ ] Canonical release notes/verification and root compatibility pointers exist.
- [ ] `CHANGELOG.md` contains `3.6.0`.
- [ ] No secret, database, backup, user data, temporary patch chunk/workflow or failure log is committed.
- [ ] Candidate documents do not claim publication/signing/acceptance without evidence.

## 2. Baseline and compatibility

- [ ] Published verified Nexora `3.5.0` baseline exists.
- [ ] Release branch descends from the intended 3.5.0/main source.
- [ ] Existing DMs, rooms, messages, files, sessions and Mobile Continuity state survive upgrade.
- [ ] Application API remains v3 and new contracts are additive.
- [ ] Legacy Trust/MLS runtime remains retired.
- [ ] Legacy ciphertext history remains immutable/read-only.
- [ ] Ordinary messaging remains writable and server-authorized.

## 3. Schema 10 migration

- [ ] Source schema 9 prerequisite enforced.
- [ ] Future schema rejected before mutation.
- [ ] Source `integrity_check` passes.
- [ ] Free-space check passes/fails safely.
- [ ] WAL checkpoint completes.
- [ ] Verified pre-schema backup is created.
- [ ] Migration runs in one immediate transaction.
- [ ] Failure rolls back without partial schema/state.
- [ ] Destination integrity passes.
- [ ] Rerun is idempotent.
- [ ] Supported restore/replacement path upgrades schema 9 to 10.
- [ ] `connect_privacy` exists with checks.
- [ ] `connect_call_history` and participant/time indexes exist.
- [ ] `connect_idempotency` and expiry index exist.
- [ ] `connect_audit` and actor/target indexes exist.

## 4. Automated source gates

- [ ] `npm ci` — PASS.
- [ ] `npm run release:consistency` — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm run test:unit` — PASS.
- [ ] `npm run test:performance` — PASS.
- [ ] `npm run audit:security` — PASS; no high/critical production finding.
- [ ] `npm run release:check` — PASS.
- [ ] `npm run test:soak` — PASS with schema 10/integrity.
- [ ] Linux `npm test` — PASS.
- [ ] Windows verification/performance — PASS.
- [ ] Android `assembleDebug` — PASS.
- [ ] Website validation/build — PASS.
- [ ] Exact-head required checks are green.

## 5. Contacts and requests

- [ ] `pending`, `accepted`, `rejected`, `cancelled`, `expired` transitions are server-owned.
- [ ] Retry-sensitive routes require valid `Idempotency-Key`.
- [ ] Identical retry does not duplicate side effects.
- [ ] Concurrent accept/cancel is deterministic.
- [ ] Concurrent accept/block cannot leave invalid contact state.
- [ ] Search is cursor-paginated, rate-limited and privacy-filtered.
- [ ] Disabled/blocked users and private profile fields are hidden.
- [ ] Removal does not delete existing message history.
- [ ] Audit/events exclude sensitive search data.

## 6. Block and privacy

- [ ] Block removes contact and cancels pending requests.
- [ ] Block prevents new request/call/signaling access.
- [ ] Stale socket cannot bypass block.
- [ ] Block terminates an active call.
- [ ] Unblock does not restore contact/permissions.
- [ ] Presence supports `everyone/contacts/shared_rooms/nobody`.
- [ ] Last seen supports `exact/approximate/hidden`.
- [ ] Read receipts are filtered at query and realtime emission.
- [ ] Privacy change applies without reconnect.
- [ ] Multi-device presence remains online while one valid socket remains.
- [ ] Final disconnect/revoke removes stale online state.

## 7. Profile and deep-link safety

- [ ] Profile fields are scoped to self/contact/shared-room/hidden relationship.
- [ ] Blocked/hidden profile returns generic unavailable state.
- [ ] Deep link contains Server ID/type/object ID only.
- [ ] Wrong Server ID cannot silently switch profile.
- [ ] Hidden object details are not disclosed in errors.
- [ ] Electron external URL/IPC policy remains allowlisted.
- [ ] Android is HTTPS-only and external origins leave WebView.
- [ ] Deep-link routing is covered on Windows/PWA/Android.

## 8. Call authorization and state machine

- [ ] States and allowed transitions match the documented call machine.
- [ ] Ringing/connecting have bounded timeouts.
- [ ] Caller and callee existence/session/contact/block policy validated.
- [ ] First eligible callee session claims ringing call.
- [ ] All later signals/TURN requests require exact bound session.
- [ ] Third party cannot answer/signal/end/request TURN.
- [ ] Same account’s unrelated session cannot take over.
- [ ] Call ID replay for different target/session returns conflict.
- [ ] Terminal call history is minimal and correct.
- [ ] Server stores no voice media, SDP or ICE candidates.

## 9. Signaling and abuse controls

- [ ] Signal kind, sequence, expiry and payload shape validated.
- [ ] Empty/malformed SDP rejected.
- [ ] Oversized SDP/ICE rejected without crash/reflection.
- [ ] Sequence gaps rejected.
- [ ] Identical replay is idempotent.
- [ ] Same sequence with changed payload returns `CALL_STATE_CONFLICT`.
- [ ] Replay history is bounded.
- [ ] Per-account/device/target ring limits enforced.
- [ ] Per-account/device/call signaling limits enforced.
- [ ] `RATE_LIMITED` includes a positive retry delay.

## 10. TURN

- [ ] Production TURN URLs configured.
- [ ] Strong secret stored only in protected runtime configuration.
- [ ] Static credentials absent from all clients.
- [ ] Credentials are short-lived and session/call scoped.
- [ ] Secret/credentials absent from logs, history, diagnostics and assets.
- [ ] `TURN_UNAVAILABLE` is safe/actionable.
- [ ] Relay-only NAT traversal is accepted in real environments.
- [ ] Secret rotation/incident procedure documented.

## 11. Client media lifecycle and accessibility

- [ ] Microphone allow/deny/revoke handled.
- [ ] Missing/removing input device handled.
- [ ] Input switching works.
- [ ] Mute/unmute works.
- [ ] Output selection works or is explicitly unsupported/disabled.
- [ ] Call timer and reconnect state are correct.
- [ ] End/decline/missed/failed/block/revoke/shutdown release microphone and peer connection.
- [ ] Navigation/unmount/profile switch releases temporary resources.
- [ ] No empty failure suppression in Connect call lifecycle.
- [ ] Controls keyboard reachable with labels/visible focus/logical order.
- [ ] Reduced motion disables nonessential call animation.
- [ ] Stable error codes and request ID map consistently.

## 12. Session revoke, account disable and shutdown

- [ ] Caller session revoke terminates ringing/active call.
- [ ] Callee bound-session revoke terminates call.
- [ ] Account disable invalidates sessions and call access.
- [ ] Block terminates call and future signaling.
- [ ] Server shutdown emits terminal state and cleans resources.
- [ ] Subsequent stale signal/TURN request fails closed.
- [ ] No reconnect restores revoked access.

## 13. Existing product regression

- [ ] Authentication/bootstrap/password/TOTP.
- [ ] Rooms and owner/moderator/member boundaries.
- [ ] Ordinary messages/replies/reactions/edits/deletes/forward/pin.
- [ ] Files/images/voice and room restrictions.
- [ ] Drafts/outbox/offline/resumable upload.
- [ ] PWA lifecycle and push policy.
- [ ] Device inventory/session revoke.
- [ ] Backup/restore.
- [ ] Legacy secure history and `LEGACY_READ_ONLY`.
- [ ] Pulse contracts/boundaries.

## 14. Independent security review

- [ ] Reviewer, scope and date recorded.
- [ ] Exact reviewed commit/ancestor recorded.
- [ ] Contact/block/profile IDOR reviewed.
- [ ] Presence/read-receipt disclosure reviewed.
- [ ] Call participant/session binding reviewed.
- [ ] Signal replay/rate/payload controls reviewed.
- [ ] TURN credential generation/logging reviewed.
- [ ] Electron/Android navigation/media permission reviewed.
- [ ] Migration/restore/release workflow reviewed.
- [ ] Unresolved critical findings = 0.
- [ ] Unresolved high findings = 0.
- [ ] Evidence file is `passed` with real results.

## 15. Installed cross-platform acceptance

- [ ] Windows 10 signed clean install/repair/uninstall/upgrade.
- [ ] Windows 11 signed clean install/repair/uninstall/upgrade.
- [ ] Installed Client/Server version/signature verified.
- [ ] Android signed install/upgrade and permission lifecycle.
- [ ] PWA install/update/media lifecycle.
- [ ] Windows ↔ Android call matrix.
- [ ] Windows ↔ PWA call matrix.
- [ ] Android ↔ PWA call matrix.
- [ ] Caller/callee reversal.
- [ ] Direct and TURN-only paths.
- [ ] Network handover.
- [ ] Permission denial/recovery and device removal.
- [ ] Block/session revoke during call.
- [ ] Evidence files identify exact candidate and environments.

## 16. Signing and packaging

- [ ] Protected environment `nexora-production-release` configured.
- [ ] Complete Windows certificate/password/subject/thumbprint configured.
- [ ] Partial Windows signing input rejected.
- [ ] Client installer signed, timestamped, expected signer.
- [ ] Server installer signed, timestamped, expected signer.
- [ ] Complete Android keystore/password/alias/key password configured.
- [ ] Approved Android signer SHA-256 configured.
- [ ] Android release build requires signing and matches approved signer.
- [ ] No unsigned stable fallback exists.

## 17. Required assets

- [ ] Signed Client installer.
- [ ] Client blockmap.
- [ ] `latest.yml`.
- [ ] Signed Server installer.
- [ ] Server blockmap.
- [ ] `server.yml`.
- [ ] Signed Android APK.
- [ ] PWA ZIP.
- [ ] Source ZIP.
- [ ] SPDX SBOM.
- [ ] Windows signature evidence.
- [ ] Android signature evidence.
- [ ] Runtime release evidence.
- [ ] `SHA256SUMS.txt`.
- [ ] Canonical release notes.

## 18. Pull Request and approval

- [ ] PR body contains implementation/migration/security/compatibility/test report.
- [ ] PR body lists exact-head CI runs and current external blockers.
- [ ] Review threads resolved.
- [ ] No temporary tooling/chunks/markers remain.
- [ ] Evidence is truthful and version-matched.
- [ ] PR marked ready only after required source checks.
- [ ] Release merge approved only after external/signing gates.

## 19. Tag and GitHub Release

- [ ] Release-approved merge commit begins `release: Nexora 3.6.0`.
- [ ] Annotated immutable `v3.6.0` points to exact approved commit.
- [ ] Existing mismatched tag causes failure.
- [ ] GitHub Release title is `Nexora 3.6.0 — Connect`.
- [ ] Release is normal/latest, not draft/prerelease.
- [ ] Every required asset uploaded once.
- [ ] Updater metadata is complete and version-matched.

## 20. Post-publication verification

- [ ] Re-download every asset into a clean directory.
- [ ] Every SHA-256 matches.
- [ ] Windows signatures/signer/timestamp revalidated.
- [ ] Android signer revalidated.
- [ ] Updater metadata/blockmaps revalidated.
- [ ] Installed smoke result preserved.
- [ ] Tag object/commit SHA preserved.
- [ ] CI/release run IDs preserved.
- [ ] Release URL/digests/final status written to evidence.
- [ ] Branch closed only after provenance retention.

Nexora `3.6.0` is complete only when every applicable item is checked with verifiable evidence and the signed GitHub Release has been re-downloaded and validated.
