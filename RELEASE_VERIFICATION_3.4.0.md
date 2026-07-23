# Release Verification — Nexora 3.4.0 Stable Core

## Status

| Field | Value |
|---|---|
| Branch | `release/3.4.0-stable-core` |
| Pull request | `#69` |
| Classification | Release candidate |
| Official tag | not created |
| Stable GitHub Release | not published |
| Current result | implementation and automated verification in progress |

This file is the authoritative release ledger. A missing evidence value is a blocker, not an implicit pass.

## Baseline prerequisite

| Gate | Status | Evidence |
|---|---|---|
| Published stable `v3.3.4` exists | **BLOCKED** | current repository/release surfaces expose 3.3.3 UNSIGNED-TEST and signed baseline 3.1.2 |
| `v3.3.4` required Client/Server/checksum assets | **BLOCKED** | release workflow verifies these before any stable build |
| Working branch started from verified post-3.3.4 commit | **BLOCKED** | branch started from main SHA `1ecb2d830d0ce38c7c42453f4848823e89b67d9c` because 3.3.4 was unavailable |

The implementation may be reviewed, but merge/tag/stable publication is prohibited until the baseline is resolved by an explicit project decision consistent with the technical specification.

## Implemented scope

- executable Trust/MLS runtime and `ts-mls` dependency removed;
- schema 8 legacy data retained;
- legacy history viewer/export is immutable and never server-decrypts;
- ordinary chats no longer bootstrap Trust/MLS;
- server-owned device inventory and targeted revoke/disconnect implemented;
- backup verify API and restore/migration failpoints implemented;
- stable errors include request ID and safe details;
- Client/Server signed updater channels, monotonic version and tamper errors implemented;
- signing identity/timestamp verification and release workflow hardening implemented.

## Automated evidence

| Gate | Current status | Required final evidence |
|---|---|---|
| Syntax | running in PR CI | successful `scripts/check-syntax.cjs` job |
| Electron builder config | running in PR CI | successful config validation |
| Production web build | running in PR CI | successful Vite production build |
| Unit/API/integration/realtime | running in matrix diagnostics and CI | all test files green |
| Performance | pending current head | successful isolated performance test |
| Security audit | pending current head | invariant audit plus zero high/critical production dependency findings |
| Schema 8 soak | previously green; rerun required on release commit | successful soak run ID |
| Android source build | previously green; rerun required on release commit | successful `assembleDebug` run ID |
| Release consistency | blocked until docs/evidence synchronization completes | successful check on release commit |

## Regression-first coverage

| Risk | Tests/evidence |
|---|---|
| Legacy HTTP write bypass | `e2ee-runtime-guards.test.cjs`, `e2ee-attachments.test.cjs` |
| Legacy Socket.IO write bypass | `trust-socket.test.cjs`, `e2ee-attachment-transport.test.cjs` |
| Plaintext leakage/conversion | `e2ee-plaintext-guards.test.cjs`, immutable export assertions |
| Ordinary chat blocked by MLS bootstrap | client regression tests and removal of Trust bootstrap |
| Session revoke during realtime delivery | targeted socket disconnect integration test |
| Current-device accidental revoke | `STATE_CONFLICT` contract and UI flow |
| Backup verification mutates live state | `stable-core-reliability.test.cjs` |
| Restore mixes DB/files after failure | injected database replacement failure and rollback assertions |
| Future schema downgrade | schema 999 fail-before-mutation test |
| Disk-full migration | mocked `statfs` fail-before-transaction test |
| Tampered/downgraded updater | `update-service.test.cjs` and Authenticode verification script |

## Manual and external acceptance

| Gate | Status | Owner/evidence needed |
|---|---|---|
| Authenticode credentials configured | **BLOCKED** | protected release environment |
| Expected signer subject/thumbprint confirmed | **BLOCKED** | signing owner |
| Windows 10 clean install/repair/uninstall | **BLOCKED** | installed runtime evidence |
| Windows 11 clean install/repair/uninstall | **BLOCKED** | installed runtime evidence |
| Verified 3.3.4→3.4.0 installed upgrade | **BLOCKED** | source and target signed installers |
| PWA acceptance | pending | supported browser matrix |
| Android acceptance | pending | supported device/shell evidence |
| Independent security review | **BLOCKED** | reviewed commit SHA, scope, findings and closure evidence |

## Release workflow guarantees

The release workflow refuses the official stable tag unless:

- `v3.3.4` is a published non-prerelease with required assets;
- signing credentials, expected subject and thumbprint are all present;
- `release:check` passes;
- signed Client and Server installers plus blockmaps/metadata exist;
- Authenticode signatures and timestamps are valid;
- installed n-1→n smoke passes;
- SHA-256/evidence is generated;
- annotated tag is immutable;
- published assets are re-downloaded and re-verified.

Without signing policy, the workflow creates only a uniquely named unsigned-test prerelease and excludes updater metadata.

## Unresolved release blockers

1. verified published `v3.3.4` baseline is absent;
2. current CI/release gates must be green on the final commit;
3. signing/Windows installed acceptance is unavailable;
4. independent security review is pending;
5. PR review/merge/post-merge CI, annotated tag and GitHub Release have not occurred.

## Final evidence placeholders

These fields must be replaced with actual values before the release can be called complete:

- reviewed commit SHA: **pending**;
- CI run IDs: **pending**;
- independent review report: **pending**;
- merge commit: **pending**;
- annotated tag SHA: **pending**;
- GitHub Release URL: **pending**;
- Client/Server/PWA/Android/SBOM SHA-256: **pending**;
- Authenticode evidence: **pending**;
- post-publication redownload smoke: **pending**.
