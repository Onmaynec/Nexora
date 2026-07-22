# Nexora 3.2.0 Release Status

## Classification

| Property | Value |
|---|---|
| Repository branch | `main` |
| Version | `3.2.0` |
| Source pull request | PR #12 |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Stable signed 3.2.0 approval | Not granted |
| Independent security review | Not completed |

Nexora `3.2.0` is approved for controlled Source/PWA prerelease testing. It is not a signed stable Windows release and must not be described as independently audited E2EE.

## Implemented scope

- SQLite schema 8 migration with backup, integrity, free-space and downgrade checks;
- Ed25519 device identity, proof-of-possession, verification and revocation;
- one-time KeyPackages and device/conversation-scoped Welcome delivery;
- monotonic MLS epochs, signed commits and replay protection;
- device-scoped secure Socket.IO authentication and delivery;
- immediate targeted disconnect after Trust revocation;
- client-side Trust/MLS key and state wipe;
- ciphertext-only secure messages, persistence and durable outbox;
- encrypted IndexedDB private state, KeyPackages, decrypted cache and drafts;
- Secure Message Pane and Trusted Devices UI;
- client-side AES-256-GCM files, images and voice;
- opaque attachment API with size/hash validation, pending expiry, cancel and one-time claim;
- upload progress, verified local decrypt, image preview and voice playback;
- fail-closed room media policy;
- server-side plaintext downgrade guards;
- migration, recovery, interoperability, realtime, media, performance, security and soak coverage.

## Automated evidence

Implementation CI run `#250` (`29921551883`) passed on commit `9af91d129273d702cea2bf736354d25bac05d1e3`.

Final documentation CI run `#253` (`29921974662`) passed on head `7dbbeeb72edd276fbd7aac11f5b3c23f442dcc9c`.

Verified gates:

- Windows `npm run check`;
- Windows `npm run test:unit`;
- Windows `npm run test:performance`;
- Windows `npm run audit:security`;
- Linux `npm test`;
- dedicated `npm run release:check`;
- schema 8 soak;
- Android `assembleDebug`.

The authoritative evidence is [RELEASE_VERIFICATION_3.2.0.md](RELEASE_VERIFICATION_3.2.0.md).

## Distribution decision

Without valid Authenticode secrets, the release workflow may publish only:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- SHA-256 checksums.

Unsigned `.exe`, blockmap and `latest.yml` must not be published. Electron updater must not consume an unsigned build.

## Remaining stable-promotion gates

1. packaged Windows Electron Client/Server runtime E2E;
2. installed PWA runtime and extended offline evidence;
3. physical Android device matrix and signed Android release validation;
4. broader simultaneous-commit, revoke/re-add and corrupted-state scenarios;
5. longer load/soak and long-offline recovery;
6. metadata minimization and traffic-analysis review;
7. Authenticode signing-machine and signed updater verification;
8. independent cryptographic and application-security review without unresolved high/critical findings.

## Security boundary

Local Server does not receive secure-message plaintext, private MLS state, secure-attachment key, original filename, actual MIME, caption, voice duration or waveform.

Local Server still observes account/device identifiers, membership, conversation/room scope, uploader, attachment ID, ciphertext size, timing, IP/network context and delivery events. The release does not claim traffic-analysis resistance.

## Usage restriction

The Source/PWA prerelease is intended for controlled testing with disposable accounts and data. It must not be used as the sole protection for high-risk communications or distributed as a signed/stable Windows release.
