# Руководство по развёртыванию Nexora 3.4.0

## 1. Область

Документ относится к Nexora `3.4.0` Stable Core release candidate:

- Application API v3;
- SQLite schema 8;
- ordinary server-readable messaging as writable core;
- Trust/MLS runtime retired;
- legacy secure history read-only;
- official stable publication blocked until release evidence is complete.

## 2. Deployment profiles

| Profile | Purpose | Requirements |
|---|---|---|
| Local development | development/tests | localhost, Node.js 22.16+, npm |
| Private LAN/VPN | private installation | HTTPS, firewall, fingerprint verification |
| Public HTTPS | internet access | reverse proxy, public certificate, exact `allowedOrigins`, monitoring, backups |
| Controlled 3.4.0 RC | Stable Core source/runtime acceptance | disposable data, exact commit, documented blockers |
| Pulse production | commercial Cloud integration | separate Cloud, provider, mail, key management, legal controls |

Direct port forwarding Local Server без reverse proxy, monitoring и firewall не является supported production topology.

## 3. Requirements

- Node.js `22.16+` и npm;
- writable application data directory;
- free space для SQLite, WAL, attachments и backups;
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
- schema 8/integrity;
- Server ID/fingerprint;
- storage capacity;
- expected Pulse mode.

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

Current Local Server database — schema 8.

Before migration-sensitive operation:

- source integrity;
- WAL checkpoint;
- free-space calculation;
- verified backup;
- future-schema guard;
- rollback plan.

Migration remains idempotent and compatibility-preserving. Existing legacy Trust/MLS records are retained as immutable read-only ciphertext/provenance and are not converted into plaintext.

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

## 9. Ordinary messaging и uploads

Writable data path:

- ordinary messages;
- files/images/voice;
- drafts/scheduled messages/polls;
- server-side search and moderation.

Server enforces membership, role/permission, active ban, room restrictions, size/quota, actual MIME, safe filename, hashes и rate limits.

Legacy Trust/MLS write paths must return `410/LEGACY_READ_ONLY` and never reserve/store new encrypted upload/message state.

## 10. Sessions и devices

Inventory is derived from active sessions. Remote revoke:

- invalidates target sessions;
- emits `session.revoked`;
- disconnects target Socket.IO sessions;
- emits `device.updated`;
- rejects current-device remote revoke with `STATE_CONFLICT`.

## 11. Windows packages

Local unsigned test packages:

```bash
npm run dist:windows
```

They are not official release assets and must not publish updater metadata.

Signed candidate:

```bash
npm run release:windows:signed
```

Requires protected Authenticode secrets plus expected signer subject/thumbprint.

## 12. Stable upgrade `3.3.4 → 3.4.0`

Official rollout requires:

- published verified `v3.3.4` Client/Server installers и checksums;
- signed `3.4.0` installers, blockmaps, `latest.yml` и `server.yml`;
- Authenticode subject/thumbprint/timestamp verification;
- Windows 10 clean install/repair/uninstall and installed upgrade;
- Windows 11 clean install/repair/uninstall and installed upgrade;
- product version verification after upgrade;
- independent security review;
- full automated gates;
- immutable tag/assets and post-publication redownload verification.

## 13. Android и PWA

Android:

```bash
gradle -p android :app:assembleDebug --no-daemon
```

Production Android release requires controlled signing and physical-device acceptance.

PWA service worker caches only application shell/static resources. API and Socket.IO requests are explicitly excluded from cache handling.

## 14. Final verification

Before declaring deployment successful:

- liveness/readiness/integrity green;
- representative login/bootstrap/messages/uploads pass;
- room authorization/ban/revoke behavior pass;
- backup verification and restore drill recorded;
- no secrets or private data in logs/artifacts;
- exact version/commit/tag and release classification recorded.
