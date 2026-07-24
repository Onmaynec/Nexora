# Nexora Operations Runbook

## Область

Runbook относится к Nexora `3.3.4` Post-MLS release candidate:

- Local Server schema 8;
- Application API v3;
- ordinary server-readable messaging writable;
- Trust/MLS runtime retired;
- legacy secure history read-only;
- signed when policy exists, otherwise explicit `UNSIGNED-TEST` prerelease;
- signed production baseline `3.1.2`.

Цель — repeatable startup, monitoring, maintenance, backup, restore, upgrade и incident procedures.

## Preflight

Проверьте Node.js `22.16+`, writable data directory, free space for SQLite/WAL/uploads/backups, HTTPS certificate/SAN/Server ID/fingerprint, exact `allowedOrigins`, firewall/interface, absence of secrets in repository/logs, verified backup, restore procedure, Pulse mode and Client compatibility.

## Startup

1. Запустите Local Server под отдельным OS account.
2. Проверьте liveness/readiness.
3. Проверьте schema version и database integrity.
4. Проверьте writable/read-only maintenance state.
5. Проверьте protected metrics access.
6. Выполните authenticated Client bootstrap и Socket.IO connection.
7. Убедитесь, что ordinary message send/upload работает и legacy writes отклоняются.

Не переводите traffic на instance с failed readiness.

## Monitoring

Наблюдайте:

- process uptime/restarts;
- readiness and controlled read-only state;
- SQLite/WAL size and integrity;
- disk free space and upload/backups growth;
- auth failures, rate limits and active sessions;
- request IDs and sanitized error codes;
- Socket.IO connections/disconnects;
- backup verification/restore results;
- Pulse sync/provider errors;
- updater/signing state.

Не записывайте tokens, cookies, passwords, TOTP, invite codes, private keys or message content в operational logs.

## Sessions и access incidents

При compromised/lost device используйте targeted session revoke. Подтвердите:

- sessions removed from Server state;
- `session.revoked` delivered;
- Socket.IO session room disconnected;
- Client transitions to logged-out state;
- `device.updated` refreshes other clients;
- revoked device cannot reuse stale REST or realtime access.

При room ban/removal проверяйте direct API bypass и отсутствие последующей room payload delivery.

## Legacy secure-history operations

Legacy data is immutable compatibility state.

- не запускайте KeyPackage/Welcome/commit/recovery jobs;
- не создавайте encrypted-upload reservations;
- не конвертируйте ciphertext в plaintext;
- экспортируйте ciphertext/provenance с `serverDecrypted: false`;
- при отсутствии local decrypted cache сообщайте limitation, не пытайтесь server-decrypt;
- любой legacy mutation должен завершаться `LEGACY_READ_ONLY`.

## Backup verification

Перед maintenance/upgrade:

1. create backup;
2. verify allowlisted backup without restore;
3. record backup ID, integrity result and request ID;
4. confirm encrypted temporary material cleanup;
5. confirm free-space threshold;
6. retain rollback procedure.

Verification failure блокирует migration/restore/release acceptance.

## Restore

Restore выполняется staged:

1. stop/drain writes;
2. verify selected backup;
3. stage database and files;
4. replace as one controlled operation;
5. run destination integrity check;
6. rollback both DB and uploads on any failure;
7. restart and validate readiness/auth/messages/uploads.

Mixed restored/current state запрещён.

## Upgrade 3.3.3 → 3.3.4

- create and verify backup;
- preserve Client profile when local legacy cache is needed;
- install matching Client/Server release line;
- verify package/tag/checksums;
- confirm schema remains 8;
- confirm ordinary chat opens without MLS bootstrap;
- confirm legacy viewer read-only and direct writes fail;
- verify device/session inventory and revoke;
- verify update channel classification.

## Emergency read-only

Используйте controlled read-only state при integrity uncertainty, disk pressure, incomplete restore, critical authorization defect or unsafe dependency/provider state. Read-only mode не заменяет ban/session/permission checks.

## Incident response

1. record exact version/SHA/time/request IDs;
2. limit exposure and preserve sanitized evidence;
3. create verified backup where safe;
4. reproduce with disposable data;
5. add failing regression test;
6. fix root cause;
7. run full affected gates;
8. update release/security documentation;
9. publish only through a new immutable version/tag.

## Release evidence

Required gates:

```bash
npm ci
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Also require focused regressions, both website pipelines, installed package smoke and post-publication checksum verification.

См. [Deployment Guide](DEPLOYMENT.md), [Security Model](SECURITY_MODEL.md) и [Release Verification 3.3.4](releases/3.3.4/RELEASE_VERIFICATION.md).
