# Nexora 3.5.0 — Release Verification

Status: publication approved as a normal, non-prerelease GitHub Release with explicitly unsigned Windows and Android binaries.

## Publication contract

| Property | Required value |
|---|---|
| Tag | `v3.5.0` |
| GitHub prerelease | `false` |
| Latest release | `true` |
| Windows signing | `NotSigned` and visible in asset names/evidence |
| Android signing | verification must fail and unsigned state must be recorded |
| Automatic updater metadata | not published |
| Checksums | SHA-256 for every uploaded asset |
| SBOM | SPDX 2.3 |
| Source gate | complete exact-head CI success |
| Post-publication verification | full asset re-download and checksum verification |

## Internal gates

| Gate | Status | Evidence |
|---|---|---|
| Schema 8 → 9 migration, backup and integrity | Implemented | automated migration and API integration tests |
| Replay/outbox ordering and idempotency | Implemented | regression tests and reconnect contract |
| PWA shell cache/update lifecycle | Implemented | source/build checks |
| Android lifecycle and permission policy | Implemented | Android source tests and release assembly |
| Push token privacy | Implemented | AES-256-GCM storage, no-plaintext API/diagnostics and round-trip tests |
| Production push transport | Implemented | HTTPS-only endpoint, DNS pinning, private-target rejection, HMAC authentication, bounded response, durable retry and token revocation tests |
| Resumable media offset/hash/policy | Implemented | API and integration tests |
| Multi-profile isolation | Implemented | scoped cache/outbox contracts |
| Windows package build | Required | unsigned Client and Server NSIS installers |
| Installed Windows smoke | Required | silent install and installed runtime version verification |
| Android package build | Required | unsigned release APK |
| Artifact signing-state evidence | Required | `WINDOWS-UNSIGNED-EVIDENCE.json` and `ANDROID-UNSIGNED-EVIDENCE.txt` |
| Supply-chain metadata | Required | SPDX SBOM, `RELEASE-EVIDENCE.json`, `SHA256SUMS.txt` |
| Asset integrity after publication | Required | re-download every release asset and verify SHA-256 |

## Security boundary

This publication deliberately relaxes only the requirement for binary publisher signatures. It does not relax application security controls:

- TLS verification remains fail-closed;
- certificate pinning remains active;
- CSRF, Origin, authorization, role and ban checks remain server-owned;
- updater signature verification remains enabled;
- unsigned updater metadata is therefore excluded;
- private/reserved push-gateway targets remain rejected;
- upload MIME, hash, quota and room-policy checks remain enforced;
- push tokens remain encrypted at rest and absent from logs/API responses.

## Required release assets

- `Nexora-Client-Setup-3.5.0-UNSIGNED.exe`;
- `Nexora-Server-Setup-3.5.0-UNSIGNED.exe`;
- `Nexora-Android-3.5.0-UNSIGNED.apk`;
- `Nexora-PWA-3.5.0.zip`;
- `Nexora-3.5.0-source.zip`;
- `Nexora-3.5.0.spdx.json`;
- `WINDOWS-UNSIGNED-EVIDENCE.json`;
- `ANDROID-UNSIGNED-EVIDENCE.txt`;
- `RELEASE-EVIDENCE.json`;
- `SHA256SUMS.txt`.

The release must not contain `latest.yml` or `server.yml`, because the desktop updater requires signed application packages.

## Honest limitations

- SHA-256 protects integrity but does not establish publisher identity by itself.
- Windows SmartScreen and Android installation warnings are expected.
- Installation is manual.
- Production push delivery requires separately configured gateway/provider credentials.
- Independent platform acceptance and code-signing can be completed in a later signed repackaging release.
