# Nexora GitHub Release and Update Guide

## 1. Repository controls

The public repository is [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora). Public visibility is required by the default GitHub-based Client updater when no user GitHub token is supplied.

Production controls:

- protect `main` and release tags;
- prohibit force-push and tag replacement;
- require Windows, Linux, release-gate, soak and Android checks where applicable;
- require 2FA for maintainers;
- use a protected `windows-release` GitHub Environment with manual approval;
- restrict release/signing secrets;
- never rewrite an already published stable release.

## 2. Release classifications

| Classification | Allowed artifacts | Updater eligibility |
|---|---|---|
| Source/PWA prerelease | source ZIP, PWA ZIP, SPDX SBOM, checksums | no |
| Stable signed Windows | signed Client/Server installers, blockmap, `latest.yml`, source/PWA/SBOM/checksums | yes |
| Local unsigned build | local development output only | no |

Current status:

- `3.2.0` — Source/PWA prerelease;
- `3.1.2` — last confirmed signed production baseline.

## 3. Secrets

Windows signing secrets:

- `WINDOWS_CERTIFICATE_BASE64` — PFX/P12 or supported `electron-builder` certificate source;
- `WINDOWS_CERTIFICATE_PASSWORD` — certificate password.

`GITHUB_TOKEN` is provided by GitHub Actions.

Do not store secrets in source files, `.env`, `update-config.json`, logs, release notes or artifacts. Pulse Cloud/provider credentials are separate deployment secrets and must not be reused for Windows signing.

## 4. Version preparation

Version metadata must match across:

- `package.json`;
- `package-lock.json`;
- Client handshake;
- Android `versionName`/`versionCode`;
- release notes and verification report;
- release tag.

Before release:

```bash
git switch main
git pull --ff-only
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

For current version `3.2.0`, the SemVer tag is `v3.2.0`.

Example signed tag:

```bash
git tag -s v3.2.0 -m "Nexora 3.2.0"
git push origin main
git push origin v3.2.0
```

When signed Git tags are not configured, use an annotated tag rather than a lightweight tag.

## 5. Release workflow

`.github/workflows/release.yml`:

1. resolves a verified release commit/tag;
2. checks tag and package metadata consistency;
3. runs the required release checks;
4. creates source ZIP, built PWA ZIP, SPDX SBOM and `SHA256SUMS.txt`;
5. checks for valid Authenticode secrets;
6. when signing is available, builds and verifies Client/Server Windows assets;
7. publishes stable Latest only after the complete signed asset set passes verification;
8. otherwise publishes an explicit Source/PWA prerelease and omits updater assets.

A manual run must target an existing approved tag. Building an arbitrary untagged state as a release is prohibited.

An unpublished draft or prerelease may be regenerated. A published stable release is immutable; corrections require a new patch version and tag.

## 6. Stable Windows asset set

A stable updater-eligible release contains:

- signed Client `.exe`;
- Client `.blockmap`;
- valid `latest.yml`;
- signed Server `.exe`;
- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- `SHA256SUMS.txt`.

Missing or unsigned installer metadata makes the release non-installable by the Client updater.

## 7. Electron updater policy

The Client updater:

- initializes after `app.whenReady()`;
- performs an initial check;
- schedules checks every six hours;
- uses single-flight for concurrent requests;
- cleans listeners and timers at shutdown;
- applies the signature/install policy;
- returns `no_installable_update` when a valid signed asset set is unavailable.

The updater must reject:

- unsigned installers;
- invalid or foreign `latest.yml`;
- incomplete asset sets;
- invalid code signatures;
- prerelease Source/PWA-only distributions.

## 8. Update verification

1. Install the previous signed stable Client with the same `appId`.
2. Publish the next complete signed stable patch.
3. Confirm initial update check.
4. Confirm single-flight behavior for concurrent manual/automatic checks.
5. Verify downloading/downloaded states.
6. Close the Client and verify signed installation.
7. Confirm trusted servers, isolated sessions and settings remain intact.
8. Test a Source/PWA-only prerelease and confirm `no_installable_update`.
9. Test missing/corrupt metadata in an isolated feed and confirm a stable diagnostic without stack/secret disclosure.

## 9. Internal update feed

A private/internal HTTPS feed may be set through `update-config.json`:

```json
{
  "clientFeedUrl": "https://updates.example.local/nexora/client",
  "serverFeedUrl": "https://updates.example.local/nexora/server"
}
```

Or use:

- `NEXORA_CLIENT_UPDATE_URL`;
- `NEXORA_SERVER_UPDATE_URL`.

HTTP feeds are rejected. A private feed does not bypass signature verification or install policy.

## 10. Server update and rollback

Before update:

1. create a verified backup;
2. record the current version and schema;
3. review migration and rollback documentation;
4. verify Client compatibility;
5. validate free disk space;
6. stop traffic according to the operational procedure.

After update:

- verify `/healthz/live` and `/healthz/ready`;
- verify SQLite integrity and schema;
- verify Client connection and realtime;
- verify backup creation and storage access.

Schema 8 rollback is restore-from-backup. Do not run an older binary that does not support schema 8. Never replace an asset under an already released version number.

## 11. 3.2.0 distribution decision

The automated gate permits a clearly marked Source/PWA prerelease. Stable signed production promotion remains blocked until packaged runtime, signing and independent security-review gates documented in [Release Verification 3.2.0](../RELEASE_VERIFICATION_3.2.0.md) are complete.

See also [Release Policy](RELEASE_POLICY.md) and [Release Checklist](RELEASE_CHECKLIST.md).
