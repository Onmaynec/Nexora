# Nexora 3.5.0 — Mobile Continuity

Status: release candidate; unpublished. Baseline: Nexora 3.4.0, which must be published and verified before this release can proceed.

## Product result

Nexora 3.5.0 establishes one continuity contract across Windows, Browser/PWA and Android: durable drafts/outbox, ordered replay after reconnect, profile-isolated local state, safe PWA updates, contextual Android lifecycle/permissions, privacy-safe device notifications and resumable media.

## Implemented scope

- cursor replay with monotonic sequence, bounded retention and RESYNC_REQUIRED handling;
- reconnect order: session/access validation, replay or controlled resync, then per-conversation outbox flush;
- account/server-isolated IndexedDB, drafts, cursors and outbox diagnostics;
- service-worker shell-only cache, explicit update states and activation guard during recording/upload;
- Android strict HTTPS/same-origin shell, deep links, contextual microphone/notification permissions and lifecycle cleanup;
- device-scoped push registrations encrypted at rest with generic payload policy;
- resumable file/image/voice sessions with confirmed offsets, idempotent chunks, SHA-256, MIME checks, quota/policy revalidation, cancel and TTL cleanup;
- additive SQLite schema 9 migration with verified backup, integrity checks and downgrade protection.

## Compatibility

Application API v3 is extended additively. Existing ordinary messaging and immutable legacy Trust/MLS history remain supported. No cross-server merged inbox, video/screen sharing, federation or mandatory cloud relay is introduced.

## Required configuration

Push registration requires NEXORA_PUSH_TOKEN_KEY. A production push provider, release signing credentials, Android signing and platform acceptance environments are external prerequisites.

## Known release blockers

- published and verified v3.4.0;
- production push-provider integration and credentials;
- signed Android and Windows artifacts;
- Android/PWA/Windows installed acceptance matrix;
- independent security review with zero unresolved high/critical findings;
- full CI, soak, packaging, checksums, signature and post-download smoke evidence.
