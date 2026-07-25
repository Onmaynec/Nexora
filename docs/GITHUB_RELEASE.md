# GitHub Release и обновления Nexora 3.6.0

## 1. Repository controls

Repository: [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora).

Required controls:

- protected `main`;
- required CI, security, performance, Android and website checks;
- no force-push to release refs;
- immutable official tags and published assets;
- maintainer 2FA;
- protected environment `nexora-production-release`;
- restricted Windows/Android signing secrets;
- reviewer approval for production environment access.

## 2. Current classification

| Version | State |
|---|---|
| `3.6.0` | Connect implementation candidate; signed stable publication blocked by external evidence |
| `3.5.0` | Published unsigned manual-download baseline |
| `3.4.0` | Stable Core source baseline in `main` |
| `3.1.2` | Last confirmed signed production baseline |

No `v3.6.0` tag or GitHub Release is allowed while `release-evidence/current.json` reports `implementation-candidate`, `signed: false` or any release blocker.

## 3. Protected secrets

### Windows Authenticode

The protected environment supplies:

- certificate material;
- certificate password;
- expected signer subject;
- expected certificate SHA-1 thumbprint.

The workflow maps these to the Electron Builder/signing validation contract. Partial configuration fails.

### Android

The protected environment supplies:

- base64 keystore;
- keystore password;
- key alias;
- key password;
- approved signer certificate SHA-256.

The keystore is materialized only in the runner temporary directory and is never committed or uploaded as an artifact.

### GitHub

`GITHUB_TOKEN` is provided by Actions. It is used only for commit status, immutable tag and GitHub Release operations.

Secrets must never appear in source, `.env`, logs, notes, screenshots, diagnostics or release assets.

## 4. Release approval state

Before workflow dispatch or a release merge commit, update machine-readable evidence factually:

```json
{
  "version": "3.6.0",
  "tag": "v3.6.0",
  "status": "release-approved",
  "published": false,
  "signed": true,
  "distribution": "signed-stable",
  "releaseBlockers": []
}
```

The publication policy must require signed artifacts, updater metadata, checksums, SBOM and cross-platform acceptance.

All external evidence files must be `passed`, have a completion timestamp and contain real result records:

- independent security review;
- Windows installed acceptance;
- Android installed acceptance;
- PWA installed acceptance;
- Connect cross-platform call acceptance.

Do not edit a pending record to `passed` without the underlying evidence.

## 5. Exact-head source gate

Run on the exact candidate commit:

```bash
npm ci
npm run release:check
npm run release:tag-check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Confirm:

- version metadata is synchronized;
- schema 10 migration/restore/downgrade tests pass;
- contact/privacy/direct bypass tests pass;
- call session/signal/TURN security tests pass;
- performance and bounded soak pass;
- production dependency audit reports no high/critical findings;
- Android and web production builds pass;
- temporary repair/diagnostic workflows and chunks are absent.

## 6. Merge contract

PR #110 targets `main` from `release/3.6.0-connect`.

Before merge:

- PR is ready for review, not draft;
- exact-head checks are green;
- all review threads are resolved;
- implementation, migration, security, compatibility and test report is complete;
- release evidence is either a truthful blocked candidate or a fully approved release state;
- repository policy approvals are satisfied.

Only a genuinely release-approved merge should use a merge commit beginning with:

```text
release: Nexora 3.6.0
```

That prefix starts the signed publication workflow on `main`. A candidate-only merge must not accidentally use the release trigger.

## 7. Signed release workflow

`.github/workflows/release.yml` publishes only Nexora 3.6.0 signed stable.

Execution sequence:

1. checkout exact merge commit or explicit release ref;
2. verify package version and official tag identity;
3. refuse overwrite of an existing GitHub Release;
4. verify approved machine-readable release state and all external evidence;
5. materialize protected Android keystore;
6. verify Windows signing policy;
7. mark exact commit release status pending;
8. run complete source/security/soak gates;
9. build source ZIP, PWA ZIP and SPDX SBOM;
10. build signed Android APK and verify signer SHA-256;
11. build signed Windows Client/Server installers;
12. verify Authenticode subject, thumbprint and timestamp;
13. verify Client/Server blockmaps and updater metadata;
14. perform silent installed-package smoke;
15. generate runtime release evidence and SHA-256 checksums;
16. create immutable annotated `v3.6.0`;
17. publish GitHub Release `Nexora 3.6.0 — Connect`;
18. re-download every asset and verify checksums/signatures/updater files;
19. mark release commit success or failure.

No step may be skipped for a normal stable release.

## 8. Windows assets and verification

Required:

- `Nexora-Client-Setup-3.6.0.exe`;
- Client blockmap;
- `latest.yml`;
- `Nexora-Server-Setup-3.6.0.exe`;
- Server blockmap;
- `server.yml`.

For both installers and installed executables:

- Authenticode status is `Valid`;
- signer subject contains the approved identity;
- signer certificate thumbprint exactly matches the protected expected value;
- a timestamp certificate is present;
- product version starts with `3.6.0`.

Updater metadata version must equal `3.6.0` and reference published installer/blockmap assets.

## 9. Android asset and verification

Required:

- `Nexora-Android-3.6.0.apk`;
- `ANDROID-SIGNATURE-EVIDENCE.txt`.

The workflow builds with:

```text
gradle -p android :app:assembleRelease -PnexoraRequireSigning=true --no-daemon
```

`apksigner verify --verbose --print-certs` must succeed. The normalized signer SHA-256 must match the protected approved digest.

A debug key, unsigned APK, unexpected signer or partial keystore configuration blocks publication.

## 10. Other required assets

- `Nexora-PWA-3.6.0.zip`;
- `Nexora-3.6.0-source.zip`;
- `Nexora-3.6.0.spdx.json`;
- `WINDOWS-SIGNATURE-EVIDENCE.json`;
- `RELEASE-EVIDENCE.json`;
- `SHA256SUMS.txt`.

The SPDX document must be valid SPDX 2.3 and contain package records. Checksums cover all release assets except the checksum file itself.

## 11. Tag policy

Official tag: `v3.6.0`.

- annotated;
- points to the exact verified release commit;
- created only after source, evidence and packaging gates pass;
- never force-replaced or retargeted;
- existing mismatched tag is a terminal failure;
- post-publication correction requires a new SemVer release.

## 12. Post-publication verification

The workflow re-downloads the published release into a clean directory and verifies:

- each `SHA256SUMS.txt` entry exists and matches;
- Windows installers remain validly signed by the approved certificate;
- Android APK remains signed by the approved certificate;
- `latest.yml`, `server.yml` and both blockmaps are present;
- runtime release evidence is present;
- no asset changed between build and GitHub publication.

After the automated run, preserve:

- release URL;
- tag object and commit SHA;
- CI/release workflow run IDs;
- final asset digests;
- signer evidence;
- installed smoke result;
- post-download result.

## 13. Failure handling

On any failure:

- do not publish remaining assets manually;
- do not create or retarget the official tag;
- do not expose partial updater metadata;
- preserve exact run/job/artifact IDs;
- fix the root cause on the release branch;
- rerun complete gates on a new exact head;
- verify no incomplete draft/release/tag remains visible.

If a tag was created but publication did not complete, do not delete/replace it casually. Treat the immutable state as a release incident and follow repository policy.

## 14. Current blockers

At the implementation-candidate stage the expected blockers are:

- independent security review;
- production TURN configuration and verification;
- Windows 10/11 installed signed acceptance;
- Android and PWA installed acceptance;
- Windows↔Android, Windows↔PWA and Android↔PWA call matrix;
- protected Windows and Android signing credentials;
- final asset/signature/checksum/re-download evidence.

These are real external prerequisites, not documentation placeholders. Until completed, stable publication remains unauthorized.
