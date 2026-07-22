# Nexora 3.2.0 Release Notes — Source/PWA Prerelease Candidate

> **Release classification:** controlled-testing prerelease candidate. The automated source/build/test/security gates pass. Stable signed Windows distribution and independently audited E2EE are not claimed.

## Trust Core and MLS secure messaging

Nexora 3.2.0 introduces a separate device Trust boundary and an MLS 1.0 secure-message path.

Implemented behavior:

- Ed25519 device identity with proof-of-possession registration;
- bootstrap verification for the first device and signed approval for subsequent devices;
- signed device revocation with immediate targeted Socket.IO disconnect;
- Trusted Devices settings UI with fingerprint comparison, approval, revocation and local self-wipe;
- one-time, expiring MLS KeyPackages;
- device/conversation-scoped Welcome delivery;
- MLS group lifecycle with monotonic epoch commits;
- ciphertext replay protection;
- missed-commit recovery after offline periods;
- explicit failure when local private group state is lost.

The fixed MLS profile is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

## Device-scoped secure realtime

Secure Socket.IO delivery is no longer account-wide:

- the client connects with the active Trust `deviceId` and Client version;
- the server resolves that device against the authenticated account;
- `mls:message` and encrypted edit payloads must use the same active, verified device bound to the socket;
- ciphertext events are emitted only to active, verified devices that are active members of the relevant MLS group;
- legacy, unverified and mismatched-device sockets neither send nor receive secure-message ciphertext;
- revocation sends a targeted event, disconnects the revoked device immediately and leaves other account devices connected;
- the revoked client clears its local Trust scope, private MLS state, KeyPackages, decrypted cache and drafts before any future enrollment.

A runtime integration test exercises all of these boundaries against a real schema 8 server.

## Ciphertext-only secure path

For a conversation with an active MLS group:

- text is encrypted before it enters durable outbox;
- outbox stores and retries an MLS ciphertext envelope;
- Local Server persists ciphertext and delivery metadata but does not decrypt content;
- recipients decrypt on their own verified devices;
- decrypted cache, drafts and private MLS state are encrypted in IndexedDB;
- local search works over the encrypted decrypted-content cache;
- legacy plaintext creation is rejected by the server.

Plaintext guards cover legacy send, forward, edit, server draft, scheduled message, poll, bot message and upload paths after MLS activation. Runtime tests execute direct REST and Socket.IO bypass attempts against a real schema 8 server.

## Encrypted files, images and voice

Secure conversations support encrypted media without using legacy plaintext upload:

- each payload receives a random AES-256-GCM key and 96-bit IV;
- AAD binds conversation ID, attachment ID and media kind;
- plaintext and ciphertext SHA-256 are verified;
- source filename, MIME, caption, voice duration and waveform are carried only inside MLS content;
- Local Server stores generic `application/octet-stream` ciphertext with an opaque ID;
- pending ciphertext is inaccessible before atomic MLS-message claim and expires after 24 hours;
- duplicate upload with the same ID/scope/hash is idempotent;
- payload substitution, hash mismatch, attachment reuse and scope mismatch are rejected;
- Client UI provides progress, cancel, image preview, voice recording/playback and explicit verified download;
- failed outbox entries retain only opaque attachment ID and MLS ciphertext for safe retry;
- the ordinary offline cache removes the decrypted attachment descriptor.

When any room file/image/voice class is disabled, the complete opaque media path fails closed because Local Server cannot safely classify encrypted content.

Local Server still sees account/device/conversation scope, uploader, attachment ID, ciphertext size, timing, network context and delivery events. Nexora 3.2.0 does not claim metadata or traffic-pattern confidentiality.

## Local Server schema 8

Schema 8 adds Trust and MLS directory/delivery tables on top of the stable schema 7 database.

Migration behavior:

- source and destination `integrity_check`;
- minimum free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- `BEGIN IMMEDIATE` transaction;
- idempotent schema creation;
- downgrade protection during normal persistence and restore.

Rollback is restore-from-backup, not an in-place downgrade. See [docs/MIGRATION_3.2.0.md](docs/MIGRATION_3.2.0.md).

## Reliability fixes

A rejected `SqliteStore.mutate()` operation previously left the internal serialized queue rejected. The caller received the correct error, but later `flush()` or shutdown could rethrow the already handled failure. The queue now stores a handled continuation while the caller retains the rejected operation Promise. Regression coverage verifies rollback, successful flush and subsequent mutation.

The release candidate also runs a schema 8 soak job with repeated state mutations, backup creation and SQLite integrity verification.

## Security gate additions

The release security audit checks:

- one-time/expiring Trust challenges;
- Ed25519 device-proof verification;
- CSRF plus device identifier requirements;
- signed verify/revoke client flow;
- non-extractable device identity keys;
- AES-GCM client-state wrapping;
- complete Trust scope wipe on revocation;
- socket-to-device binding and verified-device-only MLS delivery;
- targeted disconnect after device revocation;
- fixed MLS ciphersuite and replay rejection;
- ciphertext-only serialization and server-side legacy plaintext guards;
- exact GCM attachment size and timing-safe ciphertext hash;
- opaque server metadata and one-time attachment claim;
- fail-closed room media policy;
- client AAD binding and post-download integrity;
- upload progress/cancel and descriptor isolation from ordinary outbox/cache;
- production dependency audit with no high or critical vulnerabilities.

## Automated candidate evidence

GitHub Actions CI run `#222` (`29919641225`) passed on commit `927ae6300392d161f987acb057435f5d0e6ca2f9`:

- Windows `npm run check`;
- Windows `npm run test:unit`;
- Windows `npm run audit:security`;
- Linux `npm test`;
- dedicated `npm run release:check`;
- one-minute schema 8 soak;
- Android `gradle -p android :app:assembleDebug --no-daemon`.

The final documentation-only candidate head is verified separately in [RELEASE_VERIFICATION_3.2.0.md](RELEASE_VERIFICATION_3.2.0.md).

## Compatibility

- target version: `3.2.0`;
- Local Server database: schema 8;
- browser/Windows/Android Client handshake: `3.2.0`;
- stable 3.1.2 remains the signed production baseline until stable promotion is approved;
- 3.1.x clients are not supported for conversations that activate the secure 3.2.0 path;
- existing 3.1.x message history/files are not retroactively encrypted.

## Distribution policy

When Windows Authenticode secrets are unavailable, the repository release workflow publishes only:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- SHA-256 checksums.

It intentionally withholds unsigned `.exe`, `latest.yml` and blockmap assets, so Electron auto-update cannot consume an unsigned build.

## Remaining stable-promotion gates

The following do not block a clearly marked source/PWA prerelease, but remain mandatory before stable production promotion:

- metadata minimization and traffic-analysis review beyond the documented boundary;
- broader simultaneous-commit, revoke/re-add and corrupted local-state platform matrix;
- packaged Windows Electron, installed PWA and physical Android runtime E2E;
- longer-duration load/soak and extended offline field evidence;
- Authenticode signing-machine checks and signed updater artifacts;
- independent cryptographic and application-security review with no unresolved high/critical findings.
