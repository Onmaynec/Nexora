# GitHub Release и обновления Nexora

## Current release candidate

| Параметр | Значение |
|---|---|
| Version | `3.3.4` |
| Branch | `release/3.3.4-post-mls` |
| Pull request | `#70` |
| Official tag | pending annotated `v3.3.4` |
| Baseline | published `v3.3.3` line |
| Signed baseline | `3.1.2` |

## Publication contract

The release workflow accepts only package version `3.3.4` and official tag `v3.3.4`. It always runs `npm run release:check`, builds source/PWA/Android/SBOM/Windows evidence, performs installed package smoke, publishes SHA-256 checksums and re-downloads the immutable release assets.

### Complete signing policy

When certificate, password, expected subject and expected thumbprint are all configured:

- Client and Server installers are Authenticode-verified;
- signer subject, thumbprint and timestamp are validated;
- Client `latest.yml`, Server `server.yml` and blockmaps may be published;
- the release may be updater-eligible according to its actual evidence.

Partial signing configuration is rejected.

### Missing signing policy

When signing policy is absent:

- the official tag remains `v3.3.4`;
- GitHub Release is an explicit `UNSIGNED-TEST` prerelease;
- Windows and Android assets include `UNSIGNED-TEST` in their names;
- `latest.yml`, `server.yml` and all blockmaps are forbidden;
- production updater cannot consume the release.

## Immutable evidence

Required common assets:

- source ZIP;
- PWA ZIP;
- Android test APK;
- SPDX 2.3 SBOM;
- machine-readable release evidence;
- `SHA256SUMS.txt`;
- Client and Server installers in the applicable signing class.

After publication the workflow downloads every asset again, verifies SHA-256 values and rechecks signed/unsigned channel invariants. Existing tags cannot be moved to another commit.

## Separation from 3.4.0

Nexora 3.3.4 removes the prerequisite blocker by creating the verified post-MLS baseline. Independent security review, signed Windows 10/11 n-1→n acceptance and first stable signed 3.x promotion remain mandatory Nexora 3.4.0 gates.
