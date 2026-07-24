# Security Review — Nexora 3.3.4 Post-MLS Baseline

## Classification

This document records the internal security review and automated closure evidence for Nexora `3.3.4`. It is not an independent assessment and must not be presented as certification.

The independent review required for the first signed stable 3.x line remains a Nexora 3.4.0 release gate. Its absence does not convert this prerequisite into a stable claim: when signing evidence is unavailable, 3.3.4 is published only as an explicit `UNSIGNED-TEST` prerelease.

## Reviewed implementation scope

- authentication, sessions, CSRF and remote session revocation;
- room authorization, active bans and direct API bypass;
- ordinary uploads and retirement of legacy encrypted-upload writes;
- legacy Trust/MLS HTTP and Socket.IO mutation paths;
- legacy history viewer/export and plaintext non-disclosure;
- schema 8 compatibility, backup verification and restore rollback;
- Electron profile isolation and certificate pinning;
- updater downgrade/signature handling and release asset classification;
- Pulse authority boundary and safe signing diagnostics;
- structured errors, request IDs and redaction.

## Internal findings and closures

### PB-001 — Ordinary chats depended on Trust bootstrap

- Severity: High availability impact.
- Root cause: the Client initialized Trust device state before starting ordinary session messaging.
- Fix: Trust bootstrap was removed from ordinary startup; `MessagePane` and session Socket.IO are independent of MLS state.
- Regression: deleted runtime/import assertions plus Client lifecycle coverage.
- Status: closed internally.

### PB-002 — Executable legacy write runtime remained reachable

- Severity: High scope/integrity impact.
- Root cause: schema compatibility data and active Trust/MLS services were composed together.
- Fix: Trust routes, recovery, socket transport, encrypted-upload writes, client MLS engine and `ts-mls` were removed; schema 8 remains compatibility data only.
- Regression: HTTP/socket writes return `LEGACY_READ_ONLY`; no plaintext or reservation side effects occur.
- Status: closed internally.

### PB-003 — Session lifecycle lacked device-scoped revoke

- Severity: Medium.
- Root cause: active sessions did not expose stable device metadata or targeted realtime disconnect.
- Fix: session records include device metadata; revoke deletes matching sessions and disconnects their Socket.IO rooms.
- Regression: multi-device revoke, current-device conflict and realtime disconnect tests.
- Status: closed internally.

### PB-004 — Backup validation was coupled to restore-oriented operations

- Severity: Medium operational impact.
- Root cause: operators lacked a non-mutating verification endpoint.
- Fix: locked backup verification validates integrity while preserving the live DB/files; stable `BACKUP_INTEGRITY_FAILED` errors expose no secret material.
- Regression: live-state invariance, encrypted temporary cleanup and restore rollback failpoints.
- Status: closed internally.

### PB-005 — Release-chain checks were incomplete for the Server channel

- Severity: High release-chain impact.
- Root cause: Client-centric updater assumptions and credential-presence checks without complete signer/timestamp verification.
- Fix: separate Client/Server channels, no-downgrade, stable signature errors, expected subject/thumbprint/timestamp validation and signed/unsigned asset separation.
- Regression: updater tests, builder-config tests and release workflow assertions.
- Status: closed internally; signed installed acceptance remains a 3.4.0 gate.

### PB-006 — Error responses lacked uniform request correlation

- Severity: Low/Medium operational impact.
- Root cause: legacy handlers returned inconsistent error shapes.
- Fix: stable `{ code, message, requestId, details }` envelope with compatibility `error` field and no-store headers.
- Regression: direct API assertions and UI request-ID rendering.
- Status: closed internally.

## Automated controls

- authentication, Origin and CSRF checks precede mutations;
- room membership, role and active-ban checks fail closed;
- legacy HTTP and Socket.IO writes are terminal;
- legacy server serialization/export never decrypts ciphertext;
- removed encrypted-upload paths cannot allocate new storage;
- remote session revoke immediately disconnects the target;
- migration verifies backup, integrity, free space and future-schema boundary before mutation;
- restore rolls back both database and file store on failure;
- updater rejects downgrade and signature/checksum failures;
- unsigned release assets cannot publish updater metadata;
- signing diagnostics expose configuration state but not credentials;
- dependency/security invariant audit remains part of `release:check`.

## Current result

No internally identified high or critical finding remains open in the reviewed 3.3.4 scope. This statement is limited to repository review and automated evidence; it is not an independent assurance claim.

Publication is permitted only after all CI gates pass and the resulting tag/assets pass immutable re-download verification. The release classification must reflect the actual signing evidence:

- complete verified Authenticode evidence: signed assets may be published;
- absent signing policy: official `v3.3.4` is an `UNSIGNED-TEST` prerelease with no updater metadata.

## Residual risks and deferred gates

- readable legacy plaintext depends on a pre-existing local client cache;
- operator/OS compromise is outside application-only guarantees;
- automated tests do not replace a future independent review;
- Windows 10/11 signed n-1→n acceptance and independent finding closure remain mandatory for Nexora 3.4.0 Stable Core;
- the 3.3.4 GitHub release and post-publication asset smoke must still be completed before this version becomes the verified prerequisite.
