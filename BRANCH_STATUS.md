# Статус выпуска Nexora 3.3.0

## Классификация

| Параметр | Значение |
|---|---|
| Version | `3.3.0` |
| Base version | `3.2.5` |
| Source Pull Request | PR `#38`, merged |
| Merge commit | `a46c080e12b9081b448dad6426bf7c44156114cd` |
| Release tag | `v3.3.0` → merge commit |
| GitHub Release | `Nexora 3.3.0 — UNSIGNED TEST BUILDS` |
| Release URL | `https://github.com/Onmaynec/Nexora/releases/tag/v3.3.0` |
| Distribution | verified `UNSIGNED-TEST` prerelease |
| Production updater metadata | not published |
| Stable signed baseline | `3.1.2` until a signed 3.3.x publication exists |
| Independent E2EE audit | not performed |

Nexora `3.3.0` is published. The source tag is immutable and points to the merged runtime commit. Client, Server, Android, PWA, source, SPDX SBOM and checksum assets were built and verified by GitHub Actions.

## Implemented

### Trust and messages

- `Welcome claim` limits are isolated per conversation;
- Client coalescing, minimum request intervals and `Retry-After` stop the MLS recovery request storm;
- old and new DMs/rooms no longer consume a shared device recovery bucket;
- no plaintext fallback was introduced;
- regular and secure message deletion is confirmed inside the application;
- the inert lock control was removed from the secure composer.

### Voice and media UX

- waveform is calculated using RMS/peak and normalized for each recording;
- bars have different heights and the played segment changes color and animates;
- seek, duration and playback rate remain available;
- echo cancellation, noise suppression and auto gain are requested when supported.

### Plus, Impulses and Pulse

- a spendable catalog was added for profile, message, reaction and room customization;
- debit and entitlement issuance are atomic and idempotent;
- negative balance and duplicate charging are rejected;
- room purchases require membership, no active ban and owner role;
- Sandbox independently serves catalog, receipts, goals, contributions, refunds and entitlements;
- Cloud schema includes the additive `impulse_purchases` migration;
- production entitlements are signed with Ed25519; Sandbox entitlements remain explicitly local.

### Website and distribution

- the website was redesigned with safe Cyrillic typography and corrected responsive layout;
- RU/EN and GitHub controls have corrected hit testing;
- download cards resolve actual GitHub Release assets;
- Client/Server `.exe` and Android `.apk` are published with `UNSIGNED-TEST` suffixes because signing keys are absent;
- `latest.yml` and `.blockmap` are absent, so production auto-update cannot consume unsigned builds;
- Source ZIP, PWA ZIP, SPDX SBOM and SHA-256 checksums are published.

## Verification

### Release candidate

PR head `7d83bce963d5a774f9c107a5cf8d3a05130c1d44` passed:

- CI `29967109170`;
- focused Nexora 3.3 regressions `29967109182`;
- Project website `29967109165`.

### Merge commit

Merge commit `a46c080e12b9081b448dad6426bf7c44156114cd` passed:

- CI `29967637087`;
- Project website `29967637097`.

### Publication

- the initial release run `29967729776` failed inside the combined source/PWA/SBOM/Android preparation step;
- recovery run `29968722912` split the operations, pinned Gradle `8.13`, validated each artifact and completed successfully;
- immutable asset evidence is stored in `release-evidence/v3.3.0.json`;
- `updaterMetadataPublished` is `false`;
- all seven required assets have GitHub SHA-256 digests.

## Published assets

- `Nexora-Client-Setup-3.3.0-UNSIGNED-TEST.exe`;
- `Nexora-Server-Setup-3.3.0-UNSIGNED-TEST.exe`;
- `Nexora-Android-3.3.0-UNSIGNED-TEST.apk`;
- `Nexora-PWA-3.3.0.zip`;
- `Nexora-3.3.0-source.zip`;
- `Nexora-3.3.0.spdx.json`;
- `SHA256SUMS.txt`.

## Compatibility

- Local Server schema: `8`, without a new local migration;
- Cloud DB: idempotent additive migration `cloud/schema-3.3.sql`;
- Application API: v3, compatible extension;
- Trust/MLS/encrypted-media API: v4, compatible recovery fix;
- upgrade supported from Nexora `3.2.0–3.2.5`.

## Security boundary

Local Server does not receive plaintext secure messages, private MLS state, secure-attachment keys, source names, actual MIME, attachment signatures, voice duration or waveform. It sees service metadata: account/device identifiers, membership, conversation scope, timing, network context, ciphertext size and delivery events.

Pulse catalog does not paywall communication and does not alter Trust permissions. Rights, scope and debit are checked server-side. Plaintext downgrade, client-defined price and direct room-scope bypass were not added.

## Real limitations

- current Client/Server/APK assets are unsigned test builds, not production-signed binaries;
- Android test APK does not replace a physical-device matrix;
- independent cryptographic and application-security audit has not been performed;
- traffic-analysis resistance is not claimed;
- voice/video calls and screen sharing are outside 3.3.0.
