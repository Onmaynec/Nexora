# Release Verification — Nexora 3.3.4 Post-MLS Baseline

## Status

| Field | Value |
|---|---|
| Branch | `release/3.3.4-post-mls` |
| Pull request | `#70` |
| Baseline | published `v3.3.3` line |
| Classification | release candidate; signed when policy is available, otherwise `UNSIGNED-TEST` prerelease |
| Official tag | pending `v3.3.4` |
| GitHub Release | pending |
| Current result | implementation complete; final CI and publication evidence in progress |

This ledger records only evidence applicable to the mandatory 3.3.4 prerequisite. Signed-stable n-1→n acceptance and independent review remain Nexora 3.4.0 gates.

## Implemented scope

- executable Trust/MLS runtime and `ts-mls` removed;
- ordinary server-readable messaging remains writable;
- schema 8 legacy encrypted data retained without plaintext conversion;
- dedicated read-only viewer and export contract added;
- legacy HTTP and Socket.IO write paths terminate with `410/LEGACY_READ_ONLY`;
- Trust bootstrap removed from ordinary Client startup;
- active-session device metadata and remote revoke/disconnect added;
- non-restoring backup verification and rollback/fault coverage added;
- stable error envelope includes request correlation;
- release workflow supports signed assets or official `UNSIGNED-TEST` prerelease assets without updater metadata.

## Automated evidence required on final commit

| Gate | Required result |
|---|---|
| Metadata synchronization | package, lockfile, Client and Android all report `3.3.4` |
| Syntax and builder config | pass |
| Production web build | pass |
| Unit/API/integration/realtime | all tests pass |
| Performance | pass |
| Security invariant audit | pass; no high/critical production dependency finding |
| Schema 8 soak | pass |
| Android source build | pass |
| Release consistency | pass with no temporary migration/diagnostic artifacts |
| Project websites | pass |
| Focused 3.3 regressions | pass |

## Regression coverage

| Risk | Evidence |
|---|---|
| Ordinary chat blocked by Trust bootstrap | Client lifecycle regression and absence of Trust imports/runtime |
| Legacy HTTP write bypass | direct API tests return `410/LEGACY_READ_ONLY` |
| Legacy Socket.IO mutation | socket acknowledgements return terminal read-only code |
| Plaintext leakage/conversion | legacy serialization/export retains ciphertext and `serverDecrypted: false` |
| Session revoke during realtime delivery | targeted disconnect integration test |
| Current-device accidental remote revoke | `STATE_CONFLICT` contract |
| Backup verification mutates live state | reliability test verifies live DB/files unchanged |
| Restore mixes DB/files after failure | injected replacement failure and rollback assertions |
| Future schema downgrade | fail-before-mutation test |
| Disk-full migration | free-space fail-before-transaction test |
| Unsigned updater metadata exposure | release workflow and build-config regression assertions |
| Tampered/downgraded updater | updater unit tests and signature error contract |

## Release workflow guarantees

The publication workflow:

- accepts only package version `3.3.4` and official tag `v3.3.4`;
- rejects partial signing configuration;
- runs the complete repository release gate before packaging;
- builds source, PWA, Android, SPDX SBOM and Windows Client/Server assets;
- validates signed Client/Server identity and timestamp when signing policy is configured;
- labels unsigned installers `UNSIGNED-TEST` and forbids `latest.yml`, `server.yml` and blockmaps;
- performs installed-package smoke on the produced Client and Server installers;
- creates an immutable annotated tag;
- publishes checksums and machine-readable release evidence;
- re-downloads every published asset and verifies SHA-256 and channel-specific invariants.

## Current blockers

Only the following items block completion of 3.3.4:

1. final PR CI must pass on the release commit;
2. PR #70 must be reviewed and merged;
3. post-merge CI must pass;
4. annotated `v3.3.4` and the GitHub Release must be created;
5. published assets must pass re-download checksum/container checks.

Absence of Authenticode credentials does not block the prerequisite release; it changes classification to explicit `UNSIGNED-TEST` prerelease and disables updater metadata. Independent review and signed n-1→n upgrade acceptance are deferred to Nexora 3.4.0.

## Final evidence fields

The following values remain pending until publication:

- reviewed release commit SHA;
- final PR and post-merge CI run IDs;
- merge commit SHA;
- annotated tag object/commit SHA;
- GitHub Release URL;
- release workflow run ID;
- Client, Server, PWA, Android, source and SBOM SHA-256 values;
- signing classification and Authenticode evidence when applicable;
- post-publication re-download smoke result.
