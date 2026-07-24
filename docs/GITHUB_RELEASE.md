# GitHub Release и обновления Nexora 3.4.0

## 1. Repository controls

Repository: [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora).

Required controls:

- protected `main` и release tags;
- no force-push/tag replacement;
- required CI/release/soak/Android/website checks;
- maintainer 2FA;
- protected release environment;
- restricted signing secrets;
- immutable published stable release.

## 2. Current classification

| Version | State |
|---|---|
| `3.4.0` | Stable Core release candidate; official tag/release blocked |
| `3.3.4` | merged post-MLS prerequisite source; published release evidence required |
| `3.1.2` | last confirmed signed production baseline |

Trust/MLS runtime is retired in current Stable Core. Legacy schema 8 history remains read-only and is not updater/write compatibility.

## 3. Required secrets

Windows signing:

- `WINDOWS_CERTIFICATE_BASE64`;
- `WINDOWS_CERTIFICATE_PASSWORD`;
- `WINDOWS_CERTIFICATE_SUBJECT`;
- `WINDOWS_CERTIFICATE_THUMBPRINT`.

`GITHUB_TOKEN` is supplied by Actions. Do not store secrets in source, `.env`, update config, logs, notes or artifacts.

Partial signing configuration is forbidden.

## 4. Version preparation

The following must match `3.4.0`:

- `package.json`;
- `package-lock.json`;
- Client handshake;
- Android versionName/versionCode;
- README, Project Index, Architecture, Security Model and current operational docs;
- changelog, release notes, verification and security review;
- `release-evidence/current.json`;
- official tag `v3.4.0` after approval.

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

## 5. Baseline prerequisite

Before 3.4.0 packaging, workflow verifies published `v3.3.4`:

- release exists and is not draft/prerelease;
- Client installer exists;
- Server installer exists;
- `SHA256SUMS.txt` exists;
- downloaded assets match checksums and expected signature policy.

Missing or incomplete `v3.3.4` is a terminal release blocker.

## 6. External evidence

Workflow reads:

- `release-evidence/independent-security-review-3.4.0.json`;
- `release-evidence/windows-acceptance-3.4.0.json`;
- `release-evidence/current.json`.

Independent review must approve an ancestor of the exact release commit and report zero unresolved high/critical findings.

Windows acceptance must record Windows 10 and Windows 11 installed `3.3.4 → 3.4.0` upgrade results.

## 7. Stable release workflow

`.github/workflows/release.yml`:

1. resolves exact release commit/version;
2. validates `3.4.0` identity and official tag contract;
3. verifies published `v3.3.4` baseline;
4. validates external review/Windows evidence;
5. requires complete Authenticode policy;
6. runs `npm run release:check`;
7. builds source, PWA, Android evidence and SPDX SBOM;
8. builds signed Client and Server installers;
9. verifies signer subject, thumbprint and timestamp;
10. verifies `latest.yml` and `server.yml`;
11. performs installed package upgrade smoke;
12. generates release evidence and SHA-256 checksums;
13. creates immutable annotated tag;
14. publishes GitHub Release;
15. re-downloads and verifies every published asset.

The 3.4.0 workflow has no unsigned official-release fallback.

## 8. Stable asset set

- `Nexora-Client-Setup-3.4.0.exe`;
- Client `.blockmap`;
- `latest.yml`;
- `Nexora-Server-Setup-3.4.0.exe`;
- Server `.blockmap`;
- `server.yml`;
- source ZIP;
- PWA ZIP;
- Android evidence APK;
- SPDX SBOM;
- Authenticode evidence;
- release evidence;
- `SHA256SUMS.txt`.

Missing/unsigned/inconsistent asset makes the release non-publishable.

## 9. Updater behavior

- Client uses `latest` channel;
- Server uses `server` channel;
- downgrade and prerelease updates disabled;
- installer signature and checksum mismatch → `UPDATE_SIGNATURE_INVALID`;
- metadata version must equal package/installer version;
- unsigned local builds are not updater eligible.

## 10. Tag policy

Official tag: `v3.4.0`.

- create only after approved merge commit;
- annotated/verified, never lightweight replacement;
- refuse if existing tag points to another commit;
- never overwrite published release assets;
- correction requires a new SemVer release.

## 11. Manual dispatch

Manual workflow dispatch may target only the exact official tag/version supported by the checked-out release workflow. It must not bypass baseline, signing, Windows or independent-review gates.

## 12. Post-publication verification

After publication:

- verify GitHub Release is not draft/prerelease;
- verify tag target;
- re-download all assets;
- verify SHA-256;
- verify Authenticode and timestamp;
- inspect Client/Server updater metadata;
- verify source/PWA/SBOM contents;
- record release URL, tag SHA, run IDs and digests;
- update canonical verification/evidence;
- close/delete release branch after provenance is retained.
