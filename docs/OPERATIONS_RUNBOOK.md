# Nexora 3.4.0 Operations Runbook

## 1. Область

Runbook относится к Nexora `3.4.0` Stable Core release candidate:

- Local Server schema 8;
- Application API v3;
- ordinary server-readable messaging as writable core;
- Trust/MLS runtime retired;
- legacy secure history read-only;
- stable publication blocked by external evidence.

Цель — repeatable startup, monitoring, maintenance, backup, restore, upgrade и incident procedures.

## 2. Preflight

Проверьте:

- Node.js `22.16+`;
- writable data directory;
- free space для SQLite/WAL/attachments/backups;
- HTTPS certificate, SAN, Server ID и fingerprint;
- exact `allowedOrigins`;
- firewall/interface;
- no production secrets in repository/logs;
- verified backup и known restore procedure;
- Pulse mode;
- exact release classification и Client compatibility.

## 3. Startup

```bash
npm ci
npm start
```

Verify:

```text
GET /healthz/live
GET /healthz/ready
```

Confirm:

- schema 8;
- integrity check success;
- no unexpected migration;
- storage available;
- Socket.IO/realtime ready;
- maintenance scheduler active;
- expected Pulse status.

## 4. Normal monitoring

Observe:

- process liveness/readiness;
- HTTP/Socket.IO error rate;
- `RATE_LIMITED` volume и `Retry-After`;
- SQLite storage/WAL/integrity;
- backup age/success;
- session/device inventory и revoke events;
- pending/orphan upload state;
- Pulse workers/provider reconciliation;
- certificate expiry;
- release/update failures.

Remote metrics require Bearer token; otherwise endpoint remains loopback-only.

## 5. Scheduled maintenance

Startup/hourly maintenance removes or reconciles:

- expired sessions;
- login history older than retention window;
- stale rate-limit buckets;
- expired invitations/requests where policy requires;
- orphan temporary uploads;
- expired staged backup/restore data;
- stale Pulse worker leases/events.

Retired Trust/MLS runtime jobs must not restart. Legacy records remain immutable compatibility data.

## 6. Users, devices и access incidents

For compromised account/device:

1. identify exact user/device/session and request IDs;
2. revoke target session/device server-side;
3. verify `session.revoked` and Socket.IO disconnect;
4. verify `device.updated` inventory refresh;
5. rotate password/TOTP recovery material when applicable;
6. review audit/login history;
7. preserve sanitized incident evidence.

Current-device remote revoke must return `STATE_CONFLICT`; use logout/credential reset instead.

## 7. Rooms и moderation incidents

For role/ban/invite issues:

- verify room existence and exactly one owner;
- inspect membership, role, active ban/restriction and audit entries;
- confirm removed/banned user lost REST and realtime access;
- revoke compromised invites;
- check expiry/usage limit/concurrent last-use behavior;
- verify system messages and administrative log.

Never rely on hidden UI controls as authorization evidence.

## 8. Upload/media incidents

For rejected/corrupt upload:

- record stable code/request ID;
- verify room media policy and membership;
- compare declared vs actual MIME signature;
- verify expected chunk/file SHA-256 and size/quota;
- confirm dangerous/executable content rejection;
- confirm temporary data cleanup;
- do not disable server validation to unblock a client.

For microphone denial/unsupported format, confirm Client shows actionable terminal state without crash.

## 9. Legacy history operations

Legacy secure history is read-only:

- viewer may show ciphertext metadata or retained local decrypted cache;
- export must report `serverDecrypted: false`;
- Server must not decrypt/convert/rewrite legacy ciphertext;
- legacy HTTP writes return `410/LEGACY_READ_ONLY`;
- MLS Socket.IO writes return terminal `LEGACY_READ_ONLY` ack.

A successful legacy mutation or plaintext conversion is a security incident.

## 10. Backup verification

Before upgrade/restore:

1. run integrity and WAL checkpoint;
2. confirm free disk space;
3. create verified backup;
4. use allowlisted backup ID;
5. execute non-restoring verification;
6. record exact version/commit and result.

Backup verification must not replace live DB/files. Invalid/future/corrupt backup fails without mutation and staged data is removed.

## 11. Restore

Restore procedure:

1. stop or drain writes through supported control plane;
2. stage DB and file store;
3. verify staged integrity/version;
4. replace atomically;
5. rollback both DB and files on any failure;
6. restart and verify readiness/integrity;
7. validate representative accounts/rooms/messages/uploads.

Do not mix restored DB with current unrelated attachment store.

## 12. Upgrade `3.3.4 → 3.4.0`

Stable upgrade requires:

- published verified `v3.3.4` installers/checksums;
- verified backup/restore drill;
- complete Authenticode policy;
- signed `3.4.0` Client/Server artifacts and metadata;
- installed upgrade smoke on Windows 10 and Windows 11;
- product version/signature verification after upgrade;
- final CI and independent review evidence.

Without these, run only source/dev acceptance; do not claim stable production rollout.

## 13. Release failure

If release workflow fails:

- do not create/replace official tag manually;
- preserve exact run/job/log/artifact IDs;
- distinguish source test failure from external signing/review blocker;
- fix root cause on branch and rerun full gates;
- never publish partial updater metadata;
- verify no unsigned asset is exposed through stable channels.

## 14. Incident record

Record:

- UTC time;
- exact version/commit/tag;
- deployment profile;
- affected user/room/device;
- request ID and stable code;
- sanitized logs;
- containment;
- root cause;
- regression test;
- recovery/closure evidence.
