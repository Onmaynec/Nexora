# Nexora 3.5.0 — Mobile Continuity

Status: approved normal GitHub Release. Distribution: **unsigned Windows and Android binaries, manual download only**.

## Important security notice

The repository owner explicitly authorized publication of `v3.5.0` without Windows Authenticode or Android APK signing.

- Windows installers are named with the `-UNSIGNED.exe` suffix.
- The Android package is named with the `-UNSIGNED.apk` suffix.
- Automatic-updater metadata (`latest.yml` and `server.yml`) is intentionally not published.
- Users must verify `SHA256SUMS.txt` before installation.
- Windows SmartScreen and Android package-install warnings are expected.
- This release does not claim signed publisher identity.

The GitHub Release itself is a normal non-prerelease release and is marked as the latest version. "Normal release" describes its GitHub publication status, not the signing state of the binaries.

## Product result

Nexora 3.5.0 establishes one continuity contract across Windows, Browser/PWA and Android: durable drafts/outbox, ordered replay after reconnect, profile-isolated local state, safe PWA updates, contextual Android lifecycle/permissions, privacy-safe device notifications and resumable media.

## Implemented scope

- cursor replay with monotonic sequence, bounded retention and `RESYNC_REQUIRED` handling;
- reconnect order: session/access validation, replay or controlled resync, then per-conversation outbox flush;
- account/server-isolated IndexedDB, drafts, cursors and outbox diagnostics;
- service-worker shell-only cache, explicit update states and activation guard during recording/upload;
- Android strict HTTPS/same-origin shell, deep links, contextual microphone/notification permissions and lifecycle cleanup;
- device-scoped push registrations encrypted at rest with generic payload policy;
- production push-gateway transport with HTTPS-only endpoint validation, DNS pinning, private-address rejection, HMAC request authentication, bounded responses, durable per-subscription delivery state, retry/backoff and invalid-token revocation;
- resumable file/image/voice sessions with confirmed offsets, idempotent chunks, SHA-256, MIME checks, quota/policy revalidation, cancel and TTL cleanup;
- additive SQLite schema 9 migration with verified backup, integrity checks and downgrade protection;
- release workflow that builds explicit unsigned artifacts, performs installed-package smoke tests, generates SPDX SBOM and SHA-256 checksums, creates an immutable `v3.5.0` tag and re-downloads all assets for verification.

## Release assets

The workflow publishes:

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

Updater metadata is excluded because the desktop updater requires signature verification and must not be pointed at unsigned packages.

## Compatibility

Application API v3 is extended additively. Existing ordinary messaging and immutable legacy Trust/MLS history remain supported. No cross-server merged inbox, video/screen sharing, federation or mandatory cloud relay is introduced.

## Required configuration

Push registration requires `NEXORA_PUSH_TOKEN_KEY`.

Production background delivery additionally requires:

- `NEXORA_PUSH_GATEWAY_URL` — public HTTPS delivery endpoint;
- `NEXORA_PUSH_GATEWAY_SECRET` — shared HMAC secret of at least 32 characters;
- optional `NEXORA_PUSH_GATEWAY_TIMEOUT_MS` between 1000 and 30000 ms.

The gateway receives the decrypted provider token only over the pinned TLS connection. Nexora does not return or log that token. Notification previews remain generic unless the user explicitly selected `sender` or `full` preview policy.

## Verification performed before publication

- synchronized release metadata and consistency checks;
- syntax and Electron builder configuration checks;
- production web build;
- unit, API, integration and realtime tests;
- performance tests;
- security invariant and production dependency audit;
- schema 9 soak;
- Android release assembly;
- Windows Client and Server installer assembly;
- silent installed-package smoke on the Windows runner;
- explicit verification that Windows and Android binaries are unsigned;
- SPDX SBOM generation;
- SHA-256 checksum generation;
- immutable tag verification;
- post-publication asset re-download and checksum verification.

## Known operational limitations

- Windows and Android binaries do not provide cryptographic publisher identity;
- automatic desktop updates are not available for this release;
- production push delivery still requires an operator-configured gateway and provider credentials;
- platform-specific acceptance remains the responsibility of the deployment operator;
- a future signed build should replace these binaries when signing credentials become available.
