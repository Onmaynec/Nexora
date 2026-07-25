# Руководство администратора Nexora 3.6.0 Connect

## 1. Scope and status

| Параметр | Значение |
|---|---|
| Repository version | `3.6.0` |
| Classification | Connect implementation candidate |
| Published baseline | Nexora `3.5.0` |
| Signed production baseline | `3.1.2` |
| Application API | v3, additively extended |
| Local Server database | SQLite schema 10 |
| Voice transport | WebRTC direct or operator TURN relay; no server recording |
| Legacy Trust/MLS | runtime retired; retained history read-only |
| Stable publication | blocked pending review, TURN, signing and installed platform evidence |

This guide describes candidate administration. It does not certify a published or production-approved `v3.6.0`.

## 2. Deployment boundary

Local Server may run on localhost, private LAN/VPN or public HTTPS behind a controlled reverse proxy.

For public deployment require:

- trusted HTTPS and exact `allowedOrigins`;
- minimal firewall exposure;
- separate protected OS account and encrypted storage;
- monitoring, alerts and verified backup/restore;
- production secrets in environment/secret storage only;
- operator-controlled TURN for reliable calls across NAT;
- no direct unmanaged port-forwarding without reverse proxy and monitoring.

Network reachability is not authorization. REST and Socket.IO operations validate session/device, Origin/CSRF, resource scope, relationship/room policy, block/revoke, state transition, input bounds and rate limits.

## 3. Installation and startup

```bash
npm ci
npm start
```

After startup verify:

- process and readiness;
- full HTTPS URL;
- Server ID and certificate SHA-256 fingerprint;
- `GET /healthz/live` and `GET /healthz/ready`;
- SQLite schema `10` and integrity `ok`;
- adequate free disk space;
- expected Pulse and Connect status;
- TURN configuration matches deployment intent.

First local account receives `server_admin` according to existing bootstrap policy.

## 4. TURN configuration

Configure in protected runtime environment:

```text
NEXORA_TURN_URLS=stun:stun.example:3478,turns:turn.example:5349?transport=tcp
NEXORA_TURN_SECRET=<strong protected secret>
NEXORA_TURN_TTL_SECONDS=600
```

Operational rules:

- never put static credentials in Client/PWA/Android source;
- never log the secret or generated username/credential;
- use a short TTL within server bounds;
- keep server clocks synchronized;
- test relay-only calls from real external networks;
- document secret rotation and outage handling;
- expose only required TURN ports/transports.

Without valid URLs/secret, call credential requests return `TURN_UNAVAILABLE`; do not bypass by adding a client fallback.

## 5. Client trust and navigation

Distribute through a trusted channel:

1. exact HTTPS Local Server URL;
2. Server ID;
3. certificate SHA-256 fingerprint or trusted CA instructions.

Electron isolates data by Server ID and pins certificate identity. Browser/PWA/Android use platform trust. TLS errors are not bypassed. Android accepts audio capture only for the active server origin and opens unrelated HTTPS origins externally.

## 6. Health, metrics and logs

- `GET /healthz/live` — process liveness;
- `GET /healthz/ready` — database/schema/runtime readiness;
- `GET /metrics` — bounded Prometheus metrics.

Remote metrics require `NEXORA_METRICS_TOKEN`; otherwise keep them loopback-only.

Observe aggregate call state/outcome/timeout/rate-limit/TURN health without user IDs or call IDs as labels. Logs use request IDs and recursive redaction. Support exports must remove cookies, passwords, CSRF/session tokens, TURN material, SDP/ICE, message content and private profile data.

Graceful shutdown changes readiness before stopping workers, active calls, Socket.IO, HTTP and SQLite.

## 7. Users, devices and sessions

Administrators may use supported controls to:

- disable a local account;
- issue a temporary password;
- terminate sessions;
- inspect safe login/audit information.

Users can revoke a remote device or all other sessions. Current-device remote revoke returns `STATE_CONFLICT`; current logout is separate.

Revocation should:

- remove authoritative session records;
- emit `session.revoked`;
- disconnect target Socket.IO session rooms;
- refresh `device.updated`;
- terminate calls bound to the revoked session;
- reject stale signaling/TURN attempts.

Disabling an account must invalidate all sessions, remove presence and prevent profile/search/call access.

## 8. Contacts, block and privacy

Contact request states are server-owned:

```text
pending -> accepted | rejected | cancelled | expired
```

Admin/support investigation should inspect:

- request actor/recipient/status/timestamps;
- current contact relation;
- block records;
- privacy row;
- safe Connect audit entries;
- related request IDs.

Block:

- removes contact relation;
- cancels pending requests;
- terminates active calls;
- hides presence/profile detail according to policy;
- prevents stale-socket signaling.

Unblock does not restore the contact.

Privacy controls:

- presence: everyone/contacts/shared_rooms/nobody;
- last seen: exact/approximate/hidden;
- read receipts: everyone/contacts/shared_rooms/nobody.

A disclosure incident must be verified at both query serialization and realtime emission.

## 9. Call operations

Call states are ringing, connecting, active, reconnecting and terminal outcomes. Active call state is process-local; terminal history is minimal SQLite metadata.

Server validates on every call/signaling operation:

- authenticated active session;
- target existence and availability;
- contact/block policy;
- exact participant and claimed device session;
- current call state;
- signal shape, sequence, expiry and byte bounds;
- account/device/target/call rate windows.

Call history and diagnostics must not contain media, SDP, ICE candidates, static TURN secret or generated credentials.

For call failures inspect request ID, stable code, state/deadline, bound sessions, TURN status and client permission/device state. Do not capture voice content.

## 10. Rooms and ordinary messaging

Existing room roles remain:

- `owner` — exactly one;
- `moderator`;
- `member`.

Existing server-authorized moderation, invitations, bans, join requests, read-only/slow/media restrictions, audit and system messages remain in force. Removed/banned users lose REST and realtime access.

Ordinary messages/files/images/voice remain server-readable and writable under current access policy.

Legacy Trust/MLS history remains read-only:

- retained schema 8 compatibility records preserve ciphertext/provenance;
- server does not decrypt them;
- legacy writes return `410/LEGACY_READ_ONLY`;
- a successful legacy mutation is a security/integrity defect.

## 11. Uploads and media

Local Server validates:

- authorization and room policy;
- actual size/quota;
- actual MIME signature;
- safe filename/path;
- chunk/file SHA-256 where resumable path applies;
- dangerous/executable content;
- temporary cleanup after cancel/error.

WebRTC call media is not uploaded or recorded by Connect. Voice-message upload remains the ordinary authorized upload path and is separate from direct calls.

## 12. Schema 10 migration and backup

Before upgrade/restore:

1. verify source integrity;
2. checkpoint WAL;
3. confirm free space;
4. create and verify operator backup;
5. record exact commit/version;
6. test rollback on a staging copy.

Automatic schema 9 → 10 migration creates a verified pre-schema backup and one SQLite transaction, then checks target integrity. It adds privacy, call-history, idempotency and audit tables/indexes.

Future schema fails before mutation. Restoring schema 9 through the supported 3.6.0 path upgrades it to schema 10. Do not run an older binary against schema 10 or edit schema metadata manually.

## 13. Backup and restore

`POST /api/v3/admin/backups/verify` is server-admin-only and non-restoring. Backup IDs are constrained to the managed backup directory.

Restore requires staged database and file store, integrity/schema validation, atomic swap and rollback copies. Verify representative accounts, rooms, messages, uploads, privacy rows and call history after restart.

## 14. Security and rate-limit incidents

Stable Connect codes include:

- `AUTH_REQUIRED`;
- `CSRF_INVALID`;
- `FORBIDDEN`;
- `RESOURCE_NOT_FOUND`;
- `STATE_CONFLICT`;
- `VALIDATION_FAILED`;
- `RATE_LIMITED`;
- `POLICY_RESTRICTED`;
- `CONTACT_BLOCKED`;
- `CALL_STATE_CONFLICT`;
- `CALL_TARGET_UNAVAILABLE`;
- `TURN_UNAVAILABLE`.

Do not raise or disable limits merely to clear a test. For abuse incidents, preserve bounded account/device/target counters and sanitized audit, revoke compromised sessions and add regression coverage.

## 15. Signed release and updater

Nexora 3.6.0 is signed-stable-only. Publication requires:

- independent review with zero unresolved high/critical findings;
- production TURN acceptance;
- signed Windows Client/Server with expected Authenticode subject/thumbprint/timestamp;
- signed Android APK with expected certificate SHA-256;
- complete Client/Server blockmaps and updater metadata;
- installed Windows 10/11, Android and PWA acceptance;
- Windows↔Android/PWA cross-platform call matrix;
- source/PWA/SPDX/signature/checksum assets;
- post-publication re-download verification.

Current candidate evidence deliberately blocks the release workflow until these are factual and approved.

## 16. Incident response

1. record UTC time, exact version/commit, request ID and stable code;
2. contain exposure: revoke session/account, block relationship, disable TURN or stop traffic as appropriate;
3. preserve verified database/runtime evidence before destructive action;
4. redact secrets/content/private data;
5. use private GitHub Security Advisory for security reports;
6. identify root cause and add a failing regression first;
7. restore/redeploy through supported procedures;
8. record closure and release impact.

A third-party signaling join, privacy disclosure, leaked TURN credential or microphone remaining active after terminal call is a release-blocking incident.
