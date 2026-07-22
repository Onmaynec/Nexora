# Руководство администратора Nexora

## 1. Область

Документ относится к текущей линии:

- repository version: `3.2.3`;
- distribution: Source/PWA prerelease;
- signed production baseline: `3.1.2`;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- Local Server database: SQLite schema 8.

`3.2.3` предназначена для контролируемого prerelease testing. Для signed production deployment подтверждённой baseline остаётся `3.1.2`.

## 2. Deployment requirements

Local Server поддерживает localhost, LAN, private VPN и public HTTPS.

Для public deployment:

- используйте trusted HTTPS reverse proxy;
- ограничьте firewall exposure;
- задайте точный `allowedOrigins`;
- включите monitoring и backups;
- не публикуйте Local Server прямым port forwarding;
- храните production credentials вне repository;
- используйте protected OS account и disk encryption.

Доступ к сети не является доверием. Каждая операция проверяет authentication, membership, role, active ban/restriction, room policy, input scope, rate limit и resource ceiling.

## 3. Installation и startup

### Source

```bash
npm ci
npm start
```

### Windows package

Только complete signed stable release пригоден для automatic production distribution. Unsigned installers и Source/PWA prereleases предназначены для development/controlled testing.

После запуска проверьте:

- process status;
- full HTTPS address;
- Server ID;
- SHA-256 certificate fingerprint;
- `/healthz/live`;
- `/healthz/ready`;
- SQLite integrity;
- schema 8;
- storage capacity;
- отсутствие unexpected maintenance errors.

Первый зарегистрированный local account получает server-administrator privileges.

## 4. Client connection и certificate trust

Передайте пользователю по доверенному каналу:

1. полный HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Windows Electron Client закрепляет fingerprint за Server ID. Изменённый certificate требует explicit confirmation.

Browser/PWA и Android используют OS trust store. Для Local CA установите root `.crt` до подключения. Не рекомендуйте обходить TLS warnings.

## 5. Health, metrics и logs

Endpoints:

- `GET /healthz/live` — process liveness;
- `GET /healthz/ready` — database/schema/runtime readiness;
- `GET /metrics` — Prometheus text format.

Для remote metrics задайте `NEXORA_METRICS_TOKEN`. Без token endpoint должен оставаться loopback-only.

Operational logs используют request IDs и recursive redaction. Перед передачей logs убедитесь, что отсутствуют cookies, passwords, tokens, API keys, signatures, private keys, user content и backup passphrase.

Graceful shutdown сначала переводит readiness в `503`, затем останавливает workers, HTTP/Socket.IO и SQLite.

## 6. Users, sessions и retention

Администратор может:

- disable local account;
- выдать temporary password;
- terminate sessions;
- просматривать безопасную login/audit информацию.

Пользователь управляет profile, password, local TOTP/recovery codes, notifications и active sessions.

Maintenance `3.2.3`:

- удаляет expired sessions при startup и каждый час;
- удаляет login history старше 90 дней;
- очищает stale persisted rate-limit buckets;
- не скрывает неожиданные repository/database errors.

Cloud Identity отделена от local account. Local Server не должен получать Cloud password, Cloud MFA secret, OAuth refresh token или Cloud session cookie.

## 7. Rooms и moderation

Роли:

- `owner` — ровно один владелец;
- `moderator` — делегированная moderation;
- `member` — стандартный участник.

Поддерживаются:

- moderator appointment/removal;
- atomic ownership transfer;
- member removal, ban и unban;
- join requests;
- invitation create/update/expiry/limit/revoke;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- custom roles и categories;
- reports, appeals и temporary restrictions;
- room audit и system messages.

Active ban имеет приоритет над stale membership. Removed/banned user должен немедленно потерять REST и realtime access.

## 8. Database, migration и backup

Local Server `3.2.3` использует SQLite schema 8, WAL и `synchronous=FULL`.

### Upgrade с 3.1.x

Migration `7 → 8` включает:

- source integrity check;
- free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- transactional/idempotent migration;
- destination integrity check;
- downgrade protection.

### Upgrade с 3.2.0–3.2.2

Database migration не требуется. До update всё равно создайте verified backup и после restart проверьте integrity/readiness.

### Backup rules

- создавайте backup перед каждым upgrade;
- храните минимум одну копию вне server computer;
- не копируйте активный SQLite вручную как единственный backup;
- храните passphrase отдельно;
- проверяйте integrity/schema/readiness после restore.

Rollback schema 8 выполняется restore-from-backup. In-place downgrade не поддерживается.

## 9. Trust devices

### Enrollment

- first device получает bootstrap verification;
- later devices требуют signed approval active verified device;
- fingerprint сверяется по доверенному каналу;
- verify/revoke используют operation-scoped one-time challenges;
- MLS BasicCredential должен соответствовать authenticated `{ userId, deviceId }`;
- identity и MLS signature keys должны различаться.

### Device limit

- максимум 16 active Trust devices на user;
- duplicate registration тех же данных idempotent;
- revocation освобождает capacity;
- при превышении Client получает стабильную validation/conflict error без частичного создания device.

### Revocation

Revocation немедленно disconnects target secure socket. Client удаляет device identity, private MLS state, KeyPackages, decrypted cache и drafts до reenrollment.

## 10. KeyPackage administration

Limits `3.2.3`:

| Ресурс | Лимит |
|---|---|
| Upload batch | 25 |
| Unclaimed KeyPackages на device | 32 |
| Unclaimed KeyPackages на user | 256 |

Limits применяются атомарно в SQLite. Overflowing batch не должен частично сохраняться. Expired packages удаляются maintenance process.

Не увеличивайте limits без security/load review.

## 11. Secure conversations и recovery

Local Server не получает secure-message plaintext или secure-attachment keys. Он видит membership, account/device identifiers, timing, network context, ciphertext size, attachment ID и delivery metadata.

Missed-commit recovery на Client проверяет:

- group/conversation scope;
- exact contiguous epochs;
- SHA-256 commit payloads;
- duplicate commit hashes;
- intermediate/final public-state hashes.

Recovery mismatch должен приводить к explicit failure, а не к silent persist или plaintext fallback.

## 12. Files, images и voice

Legacy conversations используют server-validated uploads: size, SHA-256, actual MIME и quota.

Secure conversations используют opaque encrypted attachments:

- Client encrypts AES-256-GCM;
- Server принимает только bounded ciphertext;
- expected size соответствует plaintext size + GCM tag;
- ciphertext SHA-256 проверяется;
- quota считается по actual stored ciphertext bytes;
- pending data недоступен до message claim;
- matching retry idempotent;
- reuse/scope/hash substitution отклоняется;
- download decrypts/verifies локально.

При запрете любого `files/images/voice` весь secure-media path блокируется fail-closed.

## 13. Route rate limiting

Trust directory, enrollment, KeyPackage, recovery и E2EE upload routes используют bounded sliding-window limiter.

При превышении:

- HTTP status: `429`;
- stable code: `RATE_LIMITED`;
- header: `Retry-After`.

Limiter дополняет, но не заменяет authentication, authorization, resource ceilings и quota.

## 14. Nexora Plus и Pulse

| Mode | Назначение | Real payments |
|---|---|---|
| `disabled` | local messaging без commercial capabilities | нет |
| `sandbox` | QA/demo Plus и Impulses | нет |
| `production` | signed Pulse Cloud/provider integration | только Cloud |

Sandbox commands:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Sandbox:

- недоступен при production Pulse configuration;
- не выполняет checkout;
- не создаёт production signatures/entitlements;
- выдаёт 400 Impulses один раз для новой test Plus activation;
- не допускает negative balance;
- журналирует mutations.

Production требует отдельный Cloud deployment, provider integration, verified webhooks, reconciliation, refunds/disputes, transactional email, secret management и legal/privacy/tax documentation.

## 15. Audited developer commands

```text
help
status
health
users list
rooms list
backup create [passphrase]
storage cleanup
read-only on|off
audit tail [count]
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Arbitrary shell и JavaScript evaluation не поддерживаются. Mutating commands фиксируются в `integrationAudit` без secret argument values.

## 16. Updates и release channels

Electron updater принимает только complete signed stable Windows release с installer, blockmap и `latest.yml`.

Source/PWA prerelease и unsigned assets не updater-eligible. Отсутствие complete signed metadata должно возвращать `no_installable_update`.

Перед update:

1. создайте verified backup;
2. проверьте release classification;
3. изучите migration/rollback notes;
4. подтвердите Client compatibility;
5. выполните graceful shutdown;
6. после restart проверьте live/ready/integrity;
7. проверьте login/bootstrap, Trust enrollment и encrypted media.

## 17. Incident response

Соберите:

- Client/Server/Cloud versions;
- commit/tag или asset ID;
- Server ID и request IDs;
- timestamps и последние действия;
- deployment profile;
- live/ready/metrics state;
- schema/integrity status;
- sanitized logs;
- affected user/device/conversation/group/epoch IDs без private content.

Не передавайте passwords, cookies, OAuth tokens, TOTP/recovery codes, invite codes, bot/Pulse credentials, private CA keys, Trust private state или backup passphrase.

При integrity failure остановите mutations и восстановите latest verified backup. Emergency read-only не заменяет backup.

## 18. Release verification

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Stable Windows promotion дополнительно требует Authenticode verification, packaged runtime E2E, clean install/upgrade и updater validation.

Связанные документы: [Deployment Guide](docs/DEPLOYMENT.md), [Operations Runbook](docs/OPERATIONS_RUNBOOK.md), [Release Policy](docs/RELEASE_POLICY.md).
