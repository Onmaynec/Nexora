# Руководство по развёртыванию Nexora

## Область

Документ относится к Nexora `3.3.4` Post-MLS release candidate:

- signed when policy exists, otherwise explicit `UNSIGNED-TEST` prerelease;
- signed production baseline `3.1.2`;
- Application API v3;
- ordinary server-readable messaging writable;
- Trust/MLS runtime retired;
- legacy secure history read-only;
- SQLite schema 8.

## Deployment profiles

| Profile | Purpose | Requirements |
|---|---|---|
| Local development | development/tests | localhost, Node.js 22.16+, npm |
| Private LAN/VPN | private installation | HTTPS, firewall, fingerprint verification |
| Public HTTPS | internet access | reverse proxy, public certificate, exact `allowedOrigins`, monitoring, backups |
| Controlled 3.3.4 prerelease | post-MLS/session/backup/release validation | disposable data, matching clients, documented unsigned limitations |
| Pulse production | commercial Cloud integration | separate Cloud/provider/mail/key/legal controls |

Direct port forwarding Local Server без reverse proxy, monitoring и firewall не является supported production topology.

## Requirements

- Node.js `22.16+` и npm;
- writable application data directory;
- space for SQLite, WAL, attachments and backups;
- valid HTTPS certificate/SAN;
- exact allowed origins;
- protected OS account and disk;
- external secret storage;
- verified backup and restore drill;
- Client and Server from one release line.

## Source deployment

```bash
npm ci
npm run build:web
node server/cli.cjs
```

Use environment/configuration values documented by the repository. Never commit passwords, API keys, CA private keys, Authenticode certificates, Android keystores or backup passphrases.

## Network and TLS

- bind only required interfaces;
- restrict Local Server port with firewall;
- public access terminates trusted TLS at supported reverse proxy;
- configure exact Origin allowlist;
- verify Server ID and certificate fingerprint out of band;
- reject HTTP/mixed content and SAN mismatch;
- certificate change requires explicit approval;
- Android/browser must not bypass TLS errors.

Private VPN/Radmin address does not bypass authentication, roles, bans, CSRF or room policies.

## Database and storage

Local Server uses SQLite schema 8 and managed upload/backup directories.

Before deployment/upgrade:

1. run integrity check and WAL checkpoint;
2. ensure free space;
3. create verified backup;
4. retain rollback path;
5. do not edit schema manually;
6. do not restore database without matching file store;
7. reject future schema version before mutation.

## Post-MLS behavior

Ordinary messages/files/voice are stored and authorized by Local Server. Trust/MLS enrollment, KeyPackage, Welcome, commit, recovery and encrypted-upload write services are absent.

Legacy secure history remains available only through read-only compatibility endpoints/viewer/export. Server does not decrypt ciphertext; export records `serverDecrypted: false`. Direct legacy mutation returns `LEGACY_READ_ONLY`.

## Session/device behavior

Clients send stable server-scoped device metadata. Server owns session validity. Targeted revoke removes sessions and disconnects realtime immediately. Current device remote revoke returns `STATE_CONFLICT`.

## Reverse proxy

Proxy must preserve HTTPS scheme, WebSocket upgrades, request body limits, required headers and timeout behavior. Do not cache API/Socket.IO responses. Restrict metrics/admin endpoints separately. Preserve request IDs or generate safe replacements.

## Backup and restore

- backups stored outside live data path where possible;
- verify selected backup before use;
- encrypted backup material is cleaned after verification;
- staged restore rolls back DB and files together;
- post-restore readiness, login, messages and uploads are tested;
- backup filenames/IDs are allowlisted, never arbitrary paths.

## Release and updater

Signed distribution requires complete Authenticode policy and verified Client/Server metadata. Without signing policy, `v3.3.4` is an explicit `UNSIGNED-TEST` prerelease and must not publish `latest.yml`, `server.yml` or blockmaps.

Do not point production updater to unsigned prerelease assets.

## Acceptance

- health/readiness/metrics policy;
- registration/login/TOTP/session inventory;
- roles/bans/invites and direct API bypass;
- ordinary messaging/uploads/voice/realtime;
- legacy read-only viewer and terminal mutations;
- backup verification and restore rollback;
- restart/offline/long-lived sessions;
- website/PWA/Android transport policy;
- release classification and checksums.

См. [Operations Runbook](OPERATIONS_RUNBOOK.md), [Administrator Guide](../ADMIN_GUIDE.md), [Security Model](SECURITY_MODEL.md) и [Release Verification 3.3.4](releases/3.3.4/RELEASE_VERIFICATION.md).
