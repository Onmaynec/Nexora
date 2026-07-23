# Nexora Operations Runbook

## 1. Область

Runbook относится к Nexora `3.3.3`:

- Local Server schema 8;
- Application API v3;
- Trust/MLS/encrypted-media API v4;
- published `UNSIGNED-TEST` prerelease;
- signed production baseline `3.1.2`.

Цель — repeatable startup, monitoring, maintenance, backup, restore, upgrade и incident procedures.

## 2. Preflight

Проверьте:

- Node.js `22.16+`;
- writable data directory;
- free space for SQLite/WAL/attachments/backups;
- HTTPS certificate, SAN, Server ID и fingerprint;
- exact `allowedOrigins`;
- firewall/interface;
- no production secrets in repository/logs;
- verified backup и known restore procedure;
- Pulse mode;
- release classification и Client compatibility.

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
- `PRAGMA integrity_check = ok` through supported tooling;
- no unexpected migration;
- storage available;
- Socket.IO/realtime ready;
- maintenance scheduler active;
- expected Pulse status.

## 4. Normal monitoring

Observe:

- process liveness/readiness;
- HTTP/Socket.IO error rate;
- `RATE_LIMITED` volume;
- SQLite storage/WAL/integrity;
- backup age/success;
- session and login-history cleanup;
- Trust device count and KeyPackage inventory;
- pending Welcome/commit/recovery state;
- pending/orphan attachment state;
- Pulse workers/provider reconciliation;
- certificate expiry;
- release/update failures.

Remote metrics require Bearer token; otherwise endpoint remains loopback-only.

## 5. Scheduled maintenance

Startup and hourly maintenance remove:

- expired sessions;
- login history older than 90 days;
- stale persisted rate-limit buckets;
- expired Trust challenges;
- expired/unclaimed KeyPackages according to TTL;
- expired pending encrypted attachments;
- orphaned storage according to retention policy.

Maintenance failure must be observable. Do not suppress unexpected SQLite errors.

## 6. Resource governance

Limits:

| Resource | Limit |
|---|---|
| Active Trust devices | 16/user |
| KeyPackages upload | 25/request |
| Unclaimed KeyPackages | 32/device |
| Unclaimed KeyPackages | 256/user |

Route throttling returns HTTP `429`, code `RATE_LIMITED` и `Retry-After`.

Operator response:

1. identify scope/request ID;
2. stop client retry storm;
3. wait `Retry-After`;
4. inspect abuse/automation;
5. do not raise limit without capacity/security review.

## 7. Backup

Before release-sensitive change:

1. enter planned maintenance/read-only if required;
2. confirm integrity;
3. checkpoint WAL through supported backup path;
4. create encrypted verified backup;
5. verify backup metadata/readability;
6. copy at least one instance off-host;
7. record version/schema/time/operator;
8. protect passphrase separately.

Never manually copy active SQLite database as a backup procedure.

## 8. Restore

1. stop traffic/process;
2. preserve failed-state evidence;
3. select verified backup;
4. restore via supported path;
5. start isolated/controlled;
6. verify integrity/schema;
7. verify users/rooms/messages/files/audit;
8. verify Trust/Pulse state appropriate to backup version;
9. verify live/ready;
10. reopen traffic.

Schema 8 rollback is restore-based. Do not run schema 7 binary against schema 8 database.

## 9. Upgrade to 3.3.2

### From 3.1.x/schema 7 to 3.3.2

- verified backup required;
- migration performs integrity/free-space/WAL/transactional checks;
- confirm schema 8 and old data readability;
- old history is not retroactively encrypted;
- downgrade blocked.

### From 3.2.0–3.3.1

- no database migration;
- schema remains 8;
- API v3/v4 compatible;
- verify updater, Server console и Welcome recovery behavior;
- retain existing Trust/media/Pulse state.

## 10. Graceful shutdown

Expected order:

1. set readiness `503`;
2. stop new work;
3. drain workers;
4. close Socket.IO/HTTP;
5. flush storage queue;
6. close SQLite;
7. publish stopped snapshot without reopening closed store.

Concurrent stop/quit is serialized. Unexpected shutdown error is recorded, not hidden.

## 11. Emergency read-only

Use for investigation when reads must remain available and writes must stop.

Confirm:

- mutations rejected with stable error;
- reads remain authorized;
- no background monetary/moderation/storage write bypass;
- incident/audit record created.

Read-only does not replace backup/restore.

## 12. Database incident

Indicators:

- integrity failure;
- schema mismatch/downgrade block;
- repeated SQLite I/O error;
- missing/invalid backup;
- failed mutation queue/flush.

Procedure:

1. stop writes;
2. preserve sanitized logs/request IDs;
3. stop service if integrity uncertain;
4. do not run manual schema edits;
5. select latest verified backup;
6. restore in controlled environment;
7. verify integrity and application invariants;
8. document root cause and data window.

## 13. Trust/MLS incident

Collect without private keys/content:

- version/commit;
- Server ID;
- user/device IDs as sanitized identifiers;
- conversation/group ID;
- epoch;
- verification/revocation state;
- KeyPackage inventory;
- stable error/request ID;
- event sequence/timing.

Possible responses:

- revoke compromised device;
- confirm targeted disconnect;
- require new enrollment;
- preserve audit;
- block sending on unrecoverable state;
- do not downgrade to plaintext.

## 14. MLS Welcome recovery incident

Symptoms: verified device remains `MLS_WELCOME_PENDING`.

Check:

1. Client/Server both 3.3.0+-compatible;
2. pending device active/verified;
3. conversation access and no active ban;
4. at least one active verified group device online;
5. no `RATE_LIMITED` before retry;
6. scoped `mls.welcome_requested` reaches eligible device;
7. active device creates commit/Welcome;
8. pending device retries one-time claim.

If no active member is available, preserve fail-closed state. Do not enable legacy send.

## 15. Encrypted attachment incident

Check:

- ciphertext actual size;
- expected `plaintextSize + GCM tag` relationship;
- SHA-256;
- conversation/uploader/attachment scope;
- pending/claimed/cancelled/expired state;
- room media policy;
- quota by actual stored bytes;
- no attachment reuse.

Server must not decrypt payload to inspect plaintext.

## 16. Updater incident

Record:

- installed Client version;
- packaged/unpackaged state;
- provider/feed URL class without secret;
- updater state/error code;
- release tag/assets;
- Authenticode/signature result;
- availability of installer/blockmap/`latest.yml`.

Verify:

- official GitHub Releases provider or explicit HTTPS feed;
- no downgrade/prerelease;
- code-signature verification;
- complete signed asset set;
- no duplicate concurrent checks;
- UI terminal state and retry.

Unpackaged development mode not performing automatic update is expected.

## 17. Windows test mode incident

`--test-mode` should only tail local Client log.

Check:

- started intentionally;
- PowerShell process exits with Client;
- no DevTools/remote debugging/Node integration;
- log has no secrets/user content before sharing;
- renderer records length-limited/flattened.

## 18. Server console incident

- capture command name, stable code/message и request context;
- do not paste secrets;
- verify command exists in allowlist;
- copied `<...>`/`[...]` placeholders may be normalized;
- confirm no shell/eval path;
- confirm mutation audit without argument values.

## 19. Pulse outage

Expected:

- local messaging remains available;
- cached entitlements are used only if previously verified and valid;
- no new unauthorized monetary success;
- workers retry boundedly;
- provider events remain idempotent;
- sandbox never becomes production authority.

## 20. Credential leak

1. revoke/rotate affected credential;
2. terminate relevant sessions;
3. disable compromised integration/device;
4. inspect audit/request IDs;
5. remove public material where possible;
6. assess data/operation scope;
7. use private Security Advisory;
8. issue patch/new release if code or artifact affected.

Never commit replacement secret.

## 21. Release verification

Before deployment:

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Stable Windows requires signed installers, installed runtime/update acceptance и complete asset set.

## 22. Incident report template

- severity and impact;
- detection time;
- affected versions/platforms;
- deployment profile;
- stable codes/request IDs;
- sanitized timeline;
- containment;
- data/security impact;
- root cause;
- correction/tests;
- migration/rollback;
- remaining risk.
