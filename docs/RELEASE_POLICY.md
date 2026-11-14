# Политика выпусков Nexora 3.6.0

## 1. Semantic Versioning

Nexora uses Semantic Versioning:

- `MAJOR` — incompatible product, API or data-contract change;
- `MINOR` — backward-compatible functionality;
- `PATCH` — backward-compatible bug, security or operational fix.

Version identity must match across:

- `package.json` and `package-lock.json`;
- Client handshake;
- Android `versionName` / `versionCode`;
- README, documentation and website;
- changelog and canonical release notes;
- verification and machine-readable release evidence;
- installers, updater metadata and official tag.

## 2. Release classes

### Development

Implementation is incomplete or contains unresolved source defects. It is not a product release.

### Implementation candidate

Feature implementation exists in a release branch/PR, but source checks, review, platform acceptance or release evidence remain incomplete. No official tag or GitHub Release is allowed.

### Release candidate

Exact source commit and automated gates are complete, but at least one external, signing or installed acceptance gate remains. The candidate is testable but not publishable as stable.

### Stable signed

Normal GitHub Release with:

- verified signed Windows Client and Server;
- verified signed Android artifact;
- complete Client/Server updater metadata;
- source/PWA archives, SPDX SBOM and checksums;
- independent review and installed platform evidence;
- immutable tag and post-publication re-download verification.

### Unsigned test

A non-stable test artifact may be used only when explicitly named `UNSIGNED-TEST` and isolated from stable/update channels. It must not publish `latest.yml` or `server.yml`. It is not an acceptable substitute for a release whose contract requires signed stable distribution.

### Security patch

Requires reproduction-first coverage, root-cause correction, regression tests, compatibility statement and coordinated disclosure when appropriate.

## 3. Classification of Nexora 3.6.0

`3.6.0` is a MINOR release named **Connect**.

Target distribution: **Stable signed**.

The implementation branch remains an **implementation candidate** while `release-evidence/current.json` contains blockers. The release workflow must not reinterpret pending evidence as approval.

No owner instruction in the current contract authorizes an unsigned normal/stable 3.6.0 publication. An unsigned artifact may only be a separately named test artifact and cannot satisfy the 3.6.0 Definition of Done.

## 4. Prerequisite baseline

The source baseline is published Nexora `3.5.0` Mobile Continuity.

Before final 3.6.0 approval, verify:

- `main` contains the expected 3.5.0 baseline;
- existing users, conversations, messages, uploads and Mobile Continuity state survive schema 10 migration;
- the previous supported installed version has a documented upgrade path;
- release evidence records the exact baseline and release head.

## 5. Automated source gates

Required on the exact release head:

```bash
npm ci
npm run release:consistency
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

The complete gate covers:

- version and documentation synchronization;
- syntax and Electron Builder configuration;
- production web build;
- unit, repository, API, integration and realtime tests;
- direct REST/Socket.IO bypass tests;
- performance budget;
- dependency/security invariants;
- schema 10 bounded soak and integrity;
- Android source build;
- project website validation.

Checks may not be disabled, downgraded to warnings or made less strict solely to obtain green status.

## 6. Connect-specific source blockers

Any of the following blocks merge or release approval:

- contact/block/privacy bypass through REST or Socket.IO;
- hidden presence, exact last-seen or read receipt disclosure;
- unrelated user/session can observe or join call signaling;
- signal replay with a changed payload is accepted;
- signaling payload or spam controls are unbounded;
- TURN secret/static credentials are exposed to a client or log;
- block, session revoke, account disable or shutdown does not terminate access;
- microphone/peer connection remains active after a terminal path;
- schema 9 → 10 migration lacks verified backup, transaction, integrity or downgrade protection;
- unresolved high/critical security finding.

## 7. External evidence gates

All records below must be factual, version-matched, completed and `passed`:

- `release-evidence/independent-security-review-3.6.0.json`;
- `release-evidence/windows-acceptance-3.6.0.json`;
- `release-evidence/android-acceptance-3.6.0.json`;
- `release-evidence/pwa-acceptance-3.6.0.json`;
- `release-evidence/connect-cross-platform-acceptance-3.6.0.json`.

A `passed` record requires:

- non-null completion timestamp;
- concrete environment/device/build identity;
- real test results and evidence references;
- no unresolved high/critical finding or release blocker.

Source CI cannot fabricate physical-device, signer or production TURN evidence.

## 8. Signing policy

### Windows

Protected release environment must provide:

- Windows certificate material;
- certificate password;
- approved signer subject;
- approved SHA-1 certificate thumbprint.

Both installers and installed executables must have valid Authenticode signatures matching the expected subject/thumbprint and a timestamp certificate.

### Android

Protected release environment must provide:

- keystore bytes through a protected secret;
- keystore password;
- key alias and key password;
- approved signer certificate SHA-256.

Gradle release build must run with signing required. `apksigner verify --verbose --print-certs` must succeed and the signer digest must match the approved identity.

Partial signing configuration fails closed.

## 9. Required stable assets

The signed 3.6.0 release must include:

- `Nexora-Client-Setup-3.6.0.exe`;
- `Nexora-Client-Setup-3.6.0.exe.blockmap`;
- `latest.yml`;
- `Nexora-Server-Setup-3.6.0.exe`;
- `Nexora-Server-Setup-3.6.0.exe.blockmap`;
- `server.yml`;
- `Nexora-Android-3.6.0.apk`;
- `Nexora-PWA-3.6.0.zip`;
- `Nexora-3.6.0-source.zip`;
- `Nexora-3.6.0.spdx.json`;
- `WINDOWS-SIGNATURE-EVIDENCE.json`;
- `ANDROID-SIGNATURE-EVIDENCE.txt`;
- `RELEASE-EVIDENCE.json`;
- `SHA256SUMS.txt`.

Missing, unsigned, mismatched or incomplete assets make the release non-publishable.

## 10. Updater policy

- Client channel: `latest` / `latest.yml`.
- Server channel: `server` / `server.yml`.
- Metadata version must equal `3.6.0`.
- Installer name, size and SHA-512/blockmap references must resolve to published assets.
- Windows updater signature verification remains enabled.
- Downgrade and prerelease consumption remain disabled.
- Unsigned test artifacts are never updater eligible.
- Partial or mismatched metadata must not be published.

## 11. Pull Request and merge

The 3.6.0 Pull Request must contain:

- implementation summary and user outcome;
- changed modules;
- schema migration/tables/indexes;
- API and realtime contracts;
- security controls and threat-boundary changes;
- tests and regression-first cases;
- exact CI run IDs and results;
- current blockers and external prerequisites.

Before merge:

- PR is not draft;
- exact-head required checks are green;
- review comments are resolved;
- no temporary patch workflow/chunk/log remains;
- release evidence remains truthful;
- external approval required by repository policy is complete.

The merge commit should start with `release: Nexora 3.6.0` only after the release is genuinely approved. That message enables the signed publication workflow on `main`.

## 12. Signed publication workflow

`.github/workflows/release.yml` is fail-closed and uses the protected `nexora-production-release` environment.

It must:

1. resolve exact `3.6.0` commit/tag identity;
2. reject an existing immutable release/tag mismatch;
3. require `release-approved`, `signed: true`, `signed-stable` evidence with zero blockers;
4. verify all external evidence records;
5. require complete Windows/Android signing material;
6. run full source and soak gates;
7. build/verify signed Windows, Android, PWA, source and SBOM assets;
8. verify updater metadata;
9. perform installed-package smoke;
10. create runtime evidence and checksums;
11. create immutable annotated `v3.6.0`;
12. publish GitHub Release;
13. re-download and verify every asset/checksum/signature;
14. publish success/failure status on the exact commit.

The workflow must not offer an unsigned stable fallback.

## 13. Tag policy

Official tag: `v3.6.0`.

- create only on the verified release commit;
- annotated and immutable;
- never force-replace or retarget;
- verify before publishing assets;
- corrections after publication require a new SemVer release.

## 14. Post-publication evidence

After publication record:

- release URL;
- tag object and peeled commit SHA;
- source/CI/release workflow run IDs;
- asset SHA-256 digests;
- Windows signer subject/thumbprint/timestamp;
- Android signer SHA-256;
- updater metadata validation;
- installed smoke result;
- re-download verification result;
- final stable status.

The release branch may be closed only after provenance is retained in canonical evidence.

## 15. Current limitation

At the implementation-candidate stage, the repository may prove source behavior and automated checks. It cannot claim signed stable publication, production TURN quality or cross-platform installed acceptance until the corresponding protected/external evidence is complete.
