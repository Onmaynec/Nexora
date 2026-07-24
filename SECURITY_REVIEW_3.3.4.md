# Security Review — Nexora 3.3.4 Post-MLS Baseline

## Classification

This is the internal review scope and closure ledger for release candidate `3.3.4`. It is not an independent security assessment. The independent review required by the release contract remains pending.

## Reviewed implementation scope

- authentication, sessions, CSRF and device revocation;
- room authorization, bans and direct API bypass;
- ordinary uploads and legacy encrypted-upload retirement;
- legacy Trust/MLS HTTP and Socket.IO write paths;
- local legacy cache adapter and export behavior;
- SQLite migration, backup verification and restore rollback;
- Electron profile isolation and certificate pinning;
- Client/Server updater, release signing and asset publication;
- Pulse authority boundary and safe signing diagnostics;
- structured errors, request IDs and redaction.

## Internal findings and closures

### SC-001 — Ordinary chats depended on Trust bootstrap

- Severity: High for availability.
- Root cause: client registered/loaded Trust state before connecting ordinary Socket.IO messaging.
- Fix: removed Trust bootstrap from `App.jsx`; ordinary messaging now uses the active server session.
- Regression evidence: client lifecycle tests and absence of Trust imports/runtime.
- Status: closed internally; independent retest pending.

### SC-002 — Active MLS write runtime remained reachable

- Severity: High for scope/integrity.
- Root cause: schema compatibility and executable Trust/MLS services were composed together.
- Fix: removed Trust routes/recovery/socket/MLS transport/E2EE upload runtime and `ts-mls`; retained schema 8 only as compatibility data.
- Regression evidence: direct HTTP/socket `LEGACY_READ_ONLY`, no record reservation and no plaintext persistence tests.
- Status: closed internally; independent retest pending.

### SC-003 — Session inventory was not device-owned

- Severity: Medium.
- Root cause: sessions lacked stable device metadata and targeted disconnect lifecycle.
- Fix: device metadata is persisted in sessions; inventory groups active sessions; revoke deletes sessions and disconnects target socket rooms.
- Regression evidence: multi-device integration test and current-device conflict test.
- Status: closed internally; independent retest pending.

### SC-004 — Backup verification required restore-oriented flow

- Severity: Medium for operations.
- Root cause: no dedicated non-mutating verification endpoint.
- Fix: added locked `verifyBackup` operation and admin API with stable `BACKUP_INTEGRITY_FAILED`.
- Regression evidence: live DB/files unchanged; encrypted temporary cleanup; restore rollback failpoint.
- Status: closed internally; independent retest pending.

### SC-005 — Updater did not fully enforce Server channel and signer identity

- Severity: High for release-chain integrity.
- Root cause: Client-only updater gating and credential-presence checks without expected signer/timestamp validation.
- Fix: separate `latest`/`server` channels, no-downgrade, stable signature errors, expected subject/thumbprint/timestamp verifier and complete signed asset gate.
- Regression evidence: updater unit tests, builder config tests and release workflow assertions.
- Status: closed internally; installed Windows retest pending.

### SC-006 — Stable errors lacked uniform request correlation

- Severity: Low/Medium for safe operations.
- Root cause: several legacy handlers returned `{ error, code }` only.
- Fix: request ID middleware and stable `{ code, message, requestId, details }` envelope with compatibility `error`.
- Regression evidence: direct API error assertions and UI requestId rendering.
- Status: closed internally; full endpoint review pending.

## Automated controls

- active-ban fail-closed room access;
- Origin/CSRF before mutations;
- terminal legacy HTTP/socket writes;
- no plaintext exposure in server legacy serialization/export;
- no legacy upload temporary leakage;
- immediate session disconnect;
- migration integrity/free-space/backup/future-schema gates;
- restore rollback for DB and file store;
- updater signature/checksum and downgrade rejection;
- Authenticode signer/timestamp verification;
- production dependency high/critical audit;
- recursive redaction and safe operator status.

## Security review scope and automated evidence

Before merge/tag/stable publication, an independent reviewer must record:

- exact reviewed commit SHA;
- reviewer identity/organization and date;
- reviewed scope: sessions, CSRF, roles, uploads, Electron IPC/pinning, updater/signing, Pulse, backup/export and legacy retirement;
- each finding with severity, root cause, fix, regression test and closure evidence;
- explicit confirmation that no high/critical finding remains open;
- retest of SC-001 through SC-006;
- safe public summary that does not expose secrets or exploit detail.

## Current result

**BLOCKED.** No external reviewed commit, finding ledger or closure statement has been supplied. Consequently:

- the PR remains draft;
- no claim of independent review is permitted;
- no official `v3.3.4` tag or stable GitHub Release may be created.

## Residual risks

- signing credentials and Windows environments are external;
- a verified stable `v3.3.4` baseline is absent;
- legacy plaintext availability depends on pre-existing local client cache;
- operator/OS compromise remains outside application-only guarantees;
- automated tests do not replace installed platform acceptance or independent review.
