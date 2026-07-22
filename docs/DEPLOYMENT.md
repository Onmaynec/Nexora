# Руководство по развёртыванию Nexora

## 1. Область

Документ описывает deployment Nexora `3.2.3`:

- Source/PWA prerelease;
- signed production baseline `3.1.2`;
- Application API v3;
- Trust/MLS/encrypted-media API v4;
- SQLite schema 8.

## 2. Поддерживаемые профили

| Профиль | Назначение | Минимальные требования |
|---|---|---|
| Local development | разработка и автоматические тесты | localhost, Node.js 22.16+, npm |
| Private LAN/VPN | частная установка | HTTPS, private firewall, fingerprint verification |
| Public HTTPS | internet access | reverse proxy, public certificate, firewall, `allowedOrigins`, monitoring, backups |
| Controlled 3.2.3 prerelease | Trust/MLS/security testing | disposable data, compatible clients, documented limitations |

Прямой port forwarding Local Server без reverse proxy, monitoring и firewall не является поддерживаемой production-топологией.

## 3. Требования

- Node.js `22.16+`;
- npm;
- writable application data directory;
- достаточное место для SQLite, WAL, attachments и backup;
- HTTPS certificate и корректный SAN;
- уникальный Server ID;
- точный allowlist origins;
- protected OS account;
- external backup location;
- JDK 17, Android SDK 36 и Gradle 8.13 для Android build.

## 4. Local Server startup

```bash
npm ci
npm start
```

Для совместной разработки Client/Server:

```bash
npm run dev
```

Перед открытием traffic проверьте:

- version `3.2.3`;
- SQLite integrity;
- schema 8;
- successful startup maintenance;
- readiness без drain/read-only error;
- storage capacity;
- отсутствие secrets в repository/logs.

## 5. Network exposure

- ограничьте inbound access нужным interface и source range;
- для public deployment завершайте TLS на trusted reverse proxy;
- задавайте exact `allowedOrigins`;
- не разрешайте cleartext HTTP для production clients;
- включите request logging с redaction;
- используйте отдельный token для remote Prometheus scraping;
- предусмотрите DDoS/rate controls на perimeter, не отключая application limits.

## 6. Certificate trust

Передайте пользователю по доверенному каналу:

1. полный HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Windows Electron Client создаёт отдельную persistent session на Server ID и закрепляет fingerprint. Изменённый certificate требует нового confirmation.

Browser/PWA и Android используют OS trust store. Для Local CA установите root `.crt`. Не обходите TLS warnings.

## 7. Database и migration

Текущая database — SQLite schema 8.

### Upgrade 3.1.x → 3.2.3

Migration `7 → 8` выполняется до network listen:

- source integrity check;
- free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- transactional/idempotent schema changes;
- destination integrity check;
- downgrade protection.

Rollback — restore совместимого verified backup. In-place downgrade к schema 7 не поддерживается.

### Upgrade 3.2.0–3.2.2 → 3.2.3

Database migration не требуется:

- schema остаётся 8;
- Application API остаётся v3;
- Trust/MLS API остаётся v4;
- existing secure conversations сохраняют protocol compatibility.

Перед patch update всё равно создайте backup и после restart проверьте integrity/readiness.

## 8. Security hardening defaults 3.2.3

Deployment должен сохранять server-side controls:

- 16 active Trust devices/user;
- 25 KeyPackages/request;
- 32 unclaimed KeyPackages/device;
- 256 unclaimed KeyPackages/user;
- bounded Trust/recovery/E2EE route limits;
- HTTP `429 RATE_LIMITED` и `Retry-After`;
- active-ban fail-closed access;
- startup/hourly security-state cleanup;
- strict Client recovery validation.

Не отключайте или не увеличивайте limits без documented security/load review.

## 9. Backups и restore

Backup requirements:

- создавайте verified backup перед каждым upgrade;
- храните минимум одну копию вне server computer;
- не используйте manual copy active SQLite как единственный backup;
- храните passphrase отдельно;
- фиксируйте version, schema, timestamp и checksum;
- регулярно выполняйте restore drill.

После restore проверьте:

- SQLite integrity;
- schema;
- live/ready;
- users/rooms/messages/files;
- Trust directory;
- realtime access;
- storage quota.

## 10. Maintenance

При startup и каждый час Local Server очищает:

- expired sessions;
- login history старше 90 дней;
- stale persisted rate-limit buckets;
- expired Trust/KeyPackage resources;
- orphan/pending resources по retention policy.

Maintenance errors должны быть observable. Не считайте cleanup заменой backup, quota или monitoring.

## 11. Health и monitoring

Endpoints:

- `GET /healthz/live`;
- `GET /healthz/ready`;
- `GET /metrics`.

Remote `/metrics` требует Bearer token. Без token endpoint остаётся loopback-only.

Рекомендуемые alerts:

- unexpected readiness `503`;
- database integrity errors;
- backup failure;
- storage/quota exhaustion;
- repeated `RATE_LIMITED` spike;
- Trust recovery hash mismatch;
- repeated replay/attachment claim rejection;
- Pulse worker/reconciliation failure;
- graceful shutdown timeout.

## 12. Pulse deployment

### Disabled

Обычный self-hosted messaging без commercial capabilities.

### Sandbox

Только QA/demo:

- реальные платежи отсутствуют;
- checkout отключён;
- production signatures не создаются;
- balance не может стать отрицательным;
- режим блокируется при production Pulse configuration.

### Production

Требуются:

- отдельный Pulse Cloud deployment;
- HTTPS Cloud origin;
- scoped Local Server credential;
- pinned Ed25519 public keys;
- provider credentials и verified webhooks;
- idempotency и reconciliation;
- transactional email;
- refund/dispute/cancel flows;
- secret management;
- monitoring и backup;
- privacy, legal и tax documentation.

Local Server не должен получать card data, Cloud password/MFA secret, signing private key или OAuth refresh token.

## 13. Release channels

| Канал | Назначение | Updater policy |
|---|---|---|
| Stable signed Windows | production baseline | signed `.exe`, blockmap и `latest.yml` допустимы |
| Source/PWA prerelease | controlled testing | Windows updater assets не публикуются |
| Local unsigned build | development only | не updater-eligible |

`3.2.3` классифицирована как Source/PWA prerelease. Последняя signed production baseline — `3.1.2`.

## 14. Graceful shutdown

Shutdown должен:

1. установить readiness `503`;
2. прекратить новый traffic;
3. остановить workers;
4. завершить HTTP/Socket.IO;
5. flush database queue;
6. закрыть SQLite;
7. вернуть stopped-state status без чтения закрытого repository.

Concurrent stop/quit сериализуются.

## 15. Incident checklist

Сохраните:

- Client/Server/Cloud versions;
- commit/tag или asset ID;
- Server ID и request IDs;
- timestamps;
- live/ready/metrics state;
- schema/integrity result;
- storage/quota state;
- sanitized logs;
- affected device/group/epoch identifiers без private content.

Не отправляйте passwords, cookies, OAuth tokens, TOTP/recovery codes, invite codes, bot/Pulse credentials, private CA/device keys, complete MLS state или backup passphrase.

Подробные процедуры: [Operations Runbook](OPERATIONS_RUNBOOK.md).
