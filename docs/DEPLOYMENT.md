# Руководство по развёртыванию Nexora 3.5.0

## 1. Область

Документ относится к Nexora `3.5.0` Mobile Continuity release candidate:

- Application API v3;
- SQLite schema 9;
- ordinary server-readable messaging as writable core;
- Trust/MLS runtime retired, legacy secure history read-only;
- ordered replay, durable outbox and resumable media;
- PWA and Android continuity;
- encrypted device-scoped push subscriptions and production push gateway;
- official stable publication blocked until all external evidence is complete.

## 2. Deployment profiles

| Profile | Purpose | Requirements |
|---|---|---|
| Local development | development/tests | localhost, Node.js 22.16+, npm |
| Private LAN/VPN | private installation | HTTPS, firewall, fingerprint verification |
| Public HTTPS | internet access | reverse proxy, public certificate, exact `allowedOrigins`, monitoring, backups |
| Controlled 3.5.0 RC | Mobile Continuity source/runtime acceptance | disposable data, exact commit, documented blockers |
| Production push | background mobile/PWA delivery | public HTTPS gateway, HMAC secret, provider credentials, monitoring |
| Pulse production | commercial Cloud integration | separate Cloud, provider, mail, key management, legal controls |

Direct port forwarding Local Server без reverse proxy, monitoring и firewall не является supported production topology.

## 3. Requirements

- Node.js `22.16+` и npm;
- writable application data directory;
- free space для SQLite, WAL, attachments, resumable temporary data и backups;
- valid HTTPS certificate/SAN;
- stable Server ID;
- exact `allowedOrigins`;
- firewall rules;
- monitoring/alerting;
- verified restore procedure;
- production secrets outside repository/logs.

## 4. Source start

```bash
npm ci
npm start
```

Development Client/Server:

```bash
npm run dev
```

After start verify:

- `GET /healthz/live`;
- `GET /healthz/ready`;
- schema 9/integrity;
- Server ID/fingerprint;
- storage capacity;
- expected Pulse mode;
- `mobileContinuity.pushGateway.configured` when production push is required.

## 5. Network exposure

- bind only required interface;
- terminate public TLS at trusted reverse proxy;
- expose only intended HTTPS origin;
- use exact origin allowlist;
- rate-limit at application and edge;
- retain request IDs and sanitized logs;
- use token-protected remote metrics;
- never bypass TLS warnings.

## 6. Client connection

Provide through trusted channel:

1. full HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Electron pins fingerprint to Server ID. Browser/PWA/Android use OS trust store. Private CA root must be installed deliberately.

## 7. Database и migration

Current Local Server database — schema 9.

Before migration-sensitive operation:

- source integrity;
- WAL checkpoint;
- free-space calculation;
- verified backup;
- future-schema guard;
- rollback plan.

The schema 8 → 9 migration is additive and idempotent. It creates durable push-subscription and resumable-upload state while preserving ordinary messaging and immutable legacy Trust/MLS ciphertext/provenance.

## 8. Backup и restore

Use supported backup tooling and `POST /api/v3/admin/backups/verify` for non-restoring verification.

Requirements:

- `server_admin` authorization;
- allowlisted backup ID;
- staged integrity/version checks;
- atomic DB/file-store replacement;
- rollback both DB and files on failure;
- temporary data cleanup after success/error.

Test restore before production rollout.

## 9. Messaging, replay and uploads

Writable data path:

- ordinary messages;
- files/images/voice;
- drafts/scheduled messages/polls;
- server-side search and moderation;
- cursor replay and per-conversation outbox;
- resumable upload init/chunk/complete/cancel.

Server enforces membership, role/permission, active ban, room restrictions, size/quota, actual MIME, safe filename, SHA-256, confirmed offsets, idempotency и rate limits. Completion repeats access, policy and quota checks after transfer.

Legacy Trust/MLS write paths must return `410/LEGACY_READ_ONLY` and never reserve/store new encrypted upload/message state.

## 10. Production push gateway

Push-token encryption requires:

```text
NEXORA_PUSH_TOKEN_KEY=<independent secret of at least 32 characters>
```

Production background delivery additionally requires:

```text
NEXORA_PUSH_GATEWAY_URL=https://push.example.com/v1/deliver
NEXORA_PUSH_GATEWAY_SECRET=<independent HMAC secret of at least 32 characters>
NEXORA_PUSH_GATEWAY_TIMEOUT_MS=8000
```

Security contract:

- gateway URL must use HTTPS and contain no embedded credentials;
- DNS is resolved before each request and pinned for the TLS connection;
- private, loopback, link-local, multicast and reserved targets are rejected;
- request body is authenticated with `X-Nexora-Timestamp` and `X-Nexora-Signature: sha256=<HMAC>`;
- provider token is decrypted only immediately before delivery and is never returned or logged;
- default preview is generic; sender/full content requires explicit user policy;
- retry state is persisted per event/subscription with bounded exponential backoff;
- invalid or unauthenticatable tokens are revoked;
- gateway/provider credentials must be kept in a protected secret store.

The gateway must accept the versioned JSON delivery contract and return a 2xx response. HTTP 404/410 or `PUSH_TOKEN_INVALID`/`TOKEN_NOT_REGISTERED` marks the subscription invalid.

## 11. Sessions и devices

Inventory is derived from active sessions. Remote revoke:

- invalidates target sessions;
- emits `session.revoked`;
- disconnects target Socket.IO sessions;
- emits `device.updated`;
- rejects current-device remote revoke with `STATE_CONFLICT`.

## 12. Windows packages

Local unsigned test packages:

```bash
npm run dist:windows
```

They are not official release assets and must not publish updater metadata.

Signed candidate:

```bash
npm run release:windows:signed
```

Requires protected Authenticode certificate/password plus expected signer subject/thumbprint.

## 13. Android packages

Source/debug verification:

```bash
gradle -p android :app:assembleDebug --no-daemon
```

Stable release build is fail-closed and requires:

```text
NEXORA_ANDROID_KEYSTORE_PATH
NEXORA_ANDROID_KEYSTORE_PASSWORD
NEXORA_ANDROID_KEY_ALIAS
NEXORA_ANDROID_KEY_PASSWORD
```

```bash
gradle -p android :app:assembleRelease -PnexoraRequireSigning=true --no-daemon
```

GitHub Actions decodes `ANDROID_KEYSTORE_BASE64`, builds the release APK, verifies it with `apksigner`, and compares the signer SHA-256 digest with protected `ANDROID_SIGNER_SHA256`. The stable workflow has no unsigned Android fallback.

## 14. PWA

The Service Worker caches only application shell/static resources. API, Socket.IO, `Set-Cookie` and `no-store` responses are excluded. Update activation is blocked while recording or upload is active. Acceptance must verify install, offline startup, draft-preserving update and old-cache cleanup on supported browsers.

## 15. Stable upgrade `3.4.0 → 3.5.0`

Official rollout requires:

- published verified non-prerelease `v3.4.0` with signed Client/Server installers, checksums and updater metadata;
- signed `3.5.0` Windows installers and Android APK;
- Authenticode and Android signer identity verification;
- Windows 10 and Windows 11 installed upgrade acceptance;
- Android install/upgrade, lifecycle, permission and deep-link acceptance;
- PWA install/offline/update acceptance;
- production push delivery acceptance;
- independent security review;
- full automated gates;
- immutable tag/assets and post-publication re-download verification.

## 16. Final verification

Before declaring deployment successful:

- liveness/readiness/integrity green;
- representative login/bootstrap/messages/replay/outbox/uploads pass;
- room authorization/ban/revoke behavior pass;
- backup verification and restore drill recorded;
- push diagnostics show configured transport without token content;
- no secrets or private data in logs/artifacts;
- exact version/commit/tag and release classification recorded.

> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
