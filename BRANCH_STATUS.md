# Статус выпуска Nexora 3.3.0

## Классификация

| Параметр | Значение |
|---|---|
| Repository branch | `agent/nexora-3.3.0-full-release` |
| Version | `3.3.0` |
| Base version | `3.2.5` |
| Source Pull Request | PR `#38` |
| Runtime candidate | `32743436bbce99dc9632d28eeb44367d8554fbb7` |
| Evidence head | release documentation commit after verified runtime candidate |
| Release tag | `v3.3.0` after merge and main CI |
| Distribution | signed release with Authenticode; otherwise complete `UNSIGNED-TEST` prerelease |
| Stable signed baseline | `3.1.2` until a signed 3.3.0 publication exists |
| Independent E2EE audit | not performed |

Nexora `3.3.0` remains a release candidate until PR merge, successful CI on the merge commit, immutable tag creation and GitHub Release asset verification.

## Implemented

### Trust and messages

- `Welcome claim` limits are isolated per conversation;
- Client coalescing and `Retry-After` eliminate the MLS recovery request storm;
- old and new DMs/rooms no longer share one device recovery bucket;
- no plaintext fallback was introduced;
- regular and secure message deletion is confirmed inside the application;
- the inert lock control was removed from the secure composer.

### Voice and media UX

- waveform is calculated using RMS/peak and normalized for each recording;
- the played segment changes color and animates;
- seek, duration and playback rate remain available;
- echo cancellation, noise suppression and auto gain are requested when supported.

### Plus, Impulses and Pulse

- a spendable catalog was added for profile, message, reaction and room customization;
- debit and entitlement issuance are atomic and idempotent;
- negative balance and duplicate charging are rejected;
- room purchases require the owner role;
- Sandbox independently serves catalog, receipts, goals, contributions, refunds and entitlements;
- Cloud schema includes the additive `impulse_purchases` migration;
- production entitlements are signed with Ed25519; Sandbox entitlements remain explicitly local.

### Website and distribution

- the website was redesigned for 3.3.0 with safe Cyrillic typography;
- RU/EN and GitHub controls have corrected hit testing;
- download cards resolve actual GitHub Release assets;
- without Authenticode, Client/Server `.exe` and Android `.apk` are published with `UNSIGNED-TEST` suffixes;
- the unsigned path publishes no `latest.yml` or `.blockmap`;
- Source ZIP, PWA ZIP, SPDX SBOM and SHA-256 checksums are produced in both modes;
- release publication is serialized and does not recursively start from its own newly created tag.

## Verified release candidate

Runtime candidate `32743436bbce99dc9632d28eeb44367d8554fbb7` passed:

- CI `29966678997`;
- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:check`;
- Linux `npm test`;
- schema 8 soak;
- Android `assembleDebug`;
- focused Nexora 3.3 regressions `29966678998`;
- Project website gate `29966678986`.

The current branch head contains only subsequent release-evidence and release-pipeline hardening changes and is required to pass the same current-head checks before merge.

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

- without Authenticode and an Android release keystore, binaries are `UNSIGNED-TEST`, not production-signed;
- Android test APK does not replace physical-device testing;
- independent cryptographic and application-security audit has not been performed;
- traffic-analysis resistance is not claimed;
- voice/video calls and screen sharing are outside 3.3.0.
