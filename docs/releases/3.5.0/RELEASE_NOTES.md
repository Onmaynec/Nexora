# Nexora 3.5.0 — Mobile Continuity

Status: release candidate; unpublished. Baseline: Nexora 3.4.0, which must be published and verified before this release can proceed.

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
- signed-only stable release workflow for Windows and Android, including signer identity verification, checksums and post-publication re-download validation.

## Compatibility

Application API v3 is extended additively. Existing ordinary messaging and immutable legacy Trust/MLS history remain supported. No cross-server merged inbox, video/screen sharing, federation or mandatory cloud relay is introduced.

## Required configuration

Push registration requires `NEXORA_PUSH_TOKEN_KEY`.

Production background delivery additionally requires:

- `NEXORA_PUSH_GATEWAY_URL` — public HTTPS delivery endpoint;
- `NEXORA_PUSH_GATEWAY_SECRET` — shared HMAC secret of at least 32 characters;
- optional `NEXORA_PUSH_GATEWAY_TIMEOUT_MS` between 1000 and 30000 ms.

The gateway receives the decrypted provider token only over the pinned TLS connection. Nexora does not return or log that token. Notification previews remain generic unless the user explicitly selected `sender` or `full` preview policy.

Stable publication also requires protected Windows Authenticode and Android keystore secrets configured in GitHub Actions.

## Known release blockers

- published and verified stable `v3.4.0` with signed installers and updater metadata;
- real production push-gateway endpoint and credentials, followed by delivery acceptance;
- signed Android and Windows artifacts;
- Android/PWA/Windows installed acceptance matrix;
- independent security review with zero unresolved high/critical findings;
- full CI, soak, packaging, checksums, signature and post-download smoke evidence.
