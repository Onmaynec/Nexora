# Руководство администратора Nexora

## 1. Область

| Параметр | Значение |
|---|---|
| Repository version | `3.3.2` |
| Distribution | Published `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |

`3.3.2` опубликована как controlled `UNSIGNED-TEST` prerelease. Signed production deployment должен использовать подтверждённую signed release classification и полный набор updater assets.

## 2. Deployment requirements

Local Server поддерживает localhost, LAN, private VPN и public HTTPS.

Для public deployment:

- trusted HTTPS reverse proxy;
- restricted firewall exposure;
- exact `allowedOrigins`;
- monitoring и backups;
- protected OS account и disk encryption;
- production secrets вне repository/logs;
- no direct Local Server port forwarding.

Network access не является trust. Каждая операция проверяет session, Origin/CSRF, membership, role, active ban/restriction, room policy, input scope, rate limit и resource ceiling.

## 3. Installation и startup

Source:

```bash
npm ci
npm start
```

После запуска проверьте:

- process state;
- full HTTPS URL;
- Server ID;
- SHA-256 certificate fingerprint;
- `/healthz/live`;
- `/healthz/ready`;
- SQLite integrity и schema 8;
- available storage;
- configured Pulse mode.

First local account получает server-administrator privileges.

## 4. Client trust

Передайте пользователю по trusted channel:

1. HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Electron Client pins fingerprint к Server ID. Browser/PWA/Android используют OS trust store. TLS warning не обходится.

## 5. Health, metrics и logs

- `GET /healthz/live` — process liveness;
- `GET /healthz/ready` — database/schema/runtime readiness;
- `GET /metrics` — Prometheus format.

Remote metrics требует `NEXORA_METRICS_TOKEN`; без token endpoint должен оставаться loopback-only.

Operational logs используют request IDs и credential redaction. Перед передачей удалите cookies, passwords, tokens, keys, message content и personal data.

Graceful shutdown переводит readiness в `503` до остановки workers, HTTP, Socket.IO и SQLite.

## 6. Users и sessions

Администратор может:

- disable local account;
- issue temporary password;
- terminate sessions;
- inspect safe login/audit information.

Users управляют profile, password, local TOTP/recovery codes, preferences и active sessions.

Startup/hourly maintenance удаляет expired sessions, login history older than 90 days и stale rate-limit buckets.

## 7. Rooms и moderation

Roles:

- `owner` — exactly one;
- `moderator` — delegated moderation;
- `member` — standard participant.

Operations:

- moderator appointment/removal;
- atomic ownership transfer;
- removal, ban и unban;
- join requests;
- invitations с expiry, usage limit и revocation;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- custom roles/categories;
- reports, appeals и temporary restrictions;
- audit log и system messages.

Removed/banned user немедленно теряет REST и realtime access. Active ban имеет приоритет над stale membership.

## 8. Database, migration и backup

Current database — SQLite schema 8 с WAL и `synchronous=FULL`.

Upgrade 7 → 8 выполняет:

- source integrity;
- free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- transactional/idempotent migration;
- destination integrity;
- downgrade protection.

Upgrade 3.2.0–3.3.1 → 3.3.2 не требует migration.

Rollback schema 8 — restore verified backup. In-place downgrade не поддерживается.

Backup rules:

- verified backup перед upgrade;
- минимум одна off-host copy;
- не копировать active SQLite file вручную;
- хранить passphrase отдельно;
- после restore проверять integrity/schema/readiness.

## 9. Trust devices

### Enrollment

- first device bootstrap verification;
- later device signed approval active verified device;
- exact BasicCredential `{ userId, deviceId }`;
- distinct identity и MLS signature keys;
- fingerprint comparison.

### Limits

- maximum 16 active devices/user;
- 25 KeyPackages/request;
- 32 unclaimed/device;
- 256 unclaimed/user.

Limit responses используют stable code; route throttling возвращает `429 RATE_LIMITED` и `Retry-After`.

### Revocation

Target socket disconnects immediately. Client wipes identity, MLS state, KeyPackages, decrypted cache и drafts before reenrollment.

## 10. MLS Welcome recovery 3.3.0+

Verified device в `MLS_WELCOME_PENDING` может request recovery. Server:

- validates session, Origin/CSRF, conversation access, ban, verified device и rate limit;
- notifies active verified group devices only;
- routes identifiers/opaque artifacts only.

Active Client creates RFC 9420 commit/Welcome. If no active member exists, send remains blocked; plaintext fallback запрещён.

Operator should verify:

- at least one active verified group device online;
- same conversation/group scope;
- compatible 3.3.0+ Client;
- no `RATE_LIMITED` retry before `Retry-After`;
- no repeated concurrent manual recovery attempts.

## 11. Files, images и voice

Legacy path uses size/hash/MIME/quota validation.

Secure path:

- Client AES-256-GCM encryption;
- opaque Server storage;
- exact ciphertext size/SHA-256;
- pending inaccessible before message claim;
- idempotent retry, expiry/cancel;
- one-time claim/reuse rejection;
- local verified decrypt.

Any disabled room class `files/images/voice` blocks complete secure-media path fail-closed.

## 12. Nexora Plus и Pulse

Modes:

| Mode | Purpose | Real payments |
|---|---|---|
| `disabled` | messaging without commercial features | no |
| `sandbox` | QA/demo Plus/Impulses | no |
| `production` | separate Pulse Cloud/provider | Cloud only |

Sandbox commands:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Help brackets are placeholders. Both `plus grant netrox 1` and copied `plus grant <netrox> [1]` are normalized as inert data.

Sandbox cannot create production signatures, checkout or negative balance.

## 13. Audited Server console

Console executes only registered commands. It does not provide shell, eval, arbitrary filesystem access or Node execution.

Errors return stable `{ code, message }`. Mutating commands are audited without secret argument values.

## 14. Windows updater

Packaged Client:

- uses official GitHub Releases provider by default;
- starts update service before renderer IPC;
- performs startup and scheduled checks;
- prevents duplicate checks;
- displays checking/progress/current/available/downloaded/error/retry states;
- allows custom generic feed only via explicit HTTPS config;
- disallows downgrade/prerelease;
- requires signed installable asset set.

Unpackaged development mode intentionally does not perform real automatic updates.

Post-update summary opens exact official release tag. `--test-mode` tails local Client log only and does not enable DevTools or remote debugging.

## 15. Update procedure

Before update:

1. verified backup;
2. current version/schema record;
3. release classification check;
4. Client compatibility review;
5. free-space check;
6. planned maintenance/drain.

After update:

- live/ready;
- SQLite integrity/schema;
- Client login/bootstrap;
- Trust device state;
- legacy и secure messaging;
- Welcome recovery;
- backup/storage access;
- updater state on packaged Client.

## 16. Incident response

Collect:

- Client/Server/Cloud versions;
- release channel/tag/commit;
- Server ID/request ID;
- timestamps;
- network/deployment profile;
- live/ready results;
- schema/integrity;
- Trust device/KeyPackage/epoch scope;
- updater state;
- sanitized logs.

Never share secrets, cookies, OAuth tokens, TOTP/recovery codes, invite codes, CA/device/signing keys, complete MLS state, production database или backup passphrase.

Detailed procedures: [Operations Runbook](docs/OPERATIONS_RUNBOOK.md).

## 17. Verification

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Stable Windows promotion additionally requires installed signed Client/Server, updater n-1 → n, installer UX, test-mode shortcut и packaged MLS Welcome recovery acceptance.
