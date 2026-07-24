# Руководство администратора Nexora 3.4.0

## 1. Область

| Параметр | Значение |
|---|---|
| Repository version | `3.4.0` |
| Classification | Stable Core release candidate |
| Publication | Заблокирована до verified `v3.3.4`, Authenticode/Windows acceptance и independent review |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS runtime | retired; mutations return `410/LEGACY_READ_ONLY` |
| Legacy secure history | read-only; Server не расшифровывает ciphertext |
| Local Server database | SQLite schema 8 |

Документ описывает администрирование release-candidate source. Он не подтверждает опубликованный stable `v3.4.0`.

## 2. Deployment requirements

Local Server поддерживает localhost, private LAN/VPN и public HTTPS за reverse proxy.

Для public deployment обязательны:

- trusted HTTPS reverse proxy;
- exact `allowedOrigins`;
- минимально необходимая firewall exposure;
- monitoring, alerting и verified backups;
- отдельный защищённый OS account и disk encryption;
- production secrets вне repository, artifacts и logs;
- запрет прямого port forwarding Local Server без reverse proxy и monitoring.

Network reachability не является trust boundary. Каждая операция проверяет session, exact Origin/CSRF, resource existence, membership, role/permission, active ban, room policy, input scope, quota и rate limit.

## 3. Installation и startup

```bash
npm ci
npm start
```

После запуска проверьте:

- process state;
- полный HTTPS URL;
- Server ID и SHA-256 certificate fingerprint;
- `GET /healthz/live`;
- `GET /healthz/ready`;
- SQLite schema 8 и integrity;
- free disk space;
- configured Pulse mode.

Первый локальный account получает `server_admin`.

## 4. Client trust

Передайте пользователю через trusted channel:

1. полный HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Electron Client закрепляет fingerprint за Server ID. Browser/PWA/Android используют OS trust store. TLS warning не обходится; смена сертификата требует явного repin/approval.

## 5. Health, metrics и logs

- `GET /healthz/live` — process liveness;
- `GET /healthz/ready` — database/schema/runtime readiness;
- `GET /metrics` — Prometheus format.

Remote metrics требует `NEXORA_METRICS_TOKEN`; без token endpoint должен оставаться loopback-only.

Operational logs используют request IDs и recursive credential redaction. Перед передачей удалите cookies, passwords, tokens, private keys, message content и personal data.

Graceful shutdown переводит readiness в `503` до остановки workers, HTTP, Socket.IO и SQLite.

## 6. Users, devices и sessions

Администратор может:

- disable local account;
- issue temporary password;
- terminate sessions;
- inspect safe login/audit information.

Пользователь видит server-owned inventory устройств и может:

- отозвать конкретное удалённое устройство;
- отозвать все другие sessions;
- получить `STATE_CONFLICT` при попытке remote-revoke текущего устройства;
- завершить текущую session обычным logout.

Revocation немедленно создаёт `session.revoked`, отключает соответствующие Socket.IO connections и обновляет `device.updated`.

## 7. Rooms и moderation

Roles:

- `owner` — ровно один;
- `moderator` — делегированная moderation;
- `member` — обычный участник.

Поддерживаются:

- назначение и снятие moderator;
- atomic ownership transfer;
- removal, ban и unban;
- join requests;
- invites с expiry, usage limit и revocation;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- reports, appeals и temporary restrictions;
- administrative audit log и system messages.

Removed/banned user немедленно теряет REST и realtime access. Active ban имеет приоритет над stale membership.

## 8. Ordinary messaging и legacy history

Writable messaging path — ordinary server-readable messages, files, images и voice.

Legacy Trust/MLS records:

- сохраняются в schema 8 ради IDs, timestamps, epochs, ciphertext и audit provenance;
- открываются только в `LegacySecureHistoryPane`;
- не имеют composer, upload, voice, edit или delete controls;
- экспортируются без server-side decryption (`serverDecrypted: false`);
- любые legacy write requests завершаются `410/LEGACY_READ_ONLY`.

Успешная legacy mutation считается security/integrity defect.

## 9. Uploads и media

Server проверяет:

- authorization и room restrictions;
- size/quota;
- safe filename;
- actual MIME signature, а не только extension/header;
- chunk/file SHA-256;
- dangerous/executable content;
- cleanup temporary data после cancel/error.

Повреждённые images и unsupported/denied microphone flows должны завершаться стабильной ошибкой без падения Client.

## 10. Database, migration и backup

Current database — SQLite schema 8 с WAL и `synchronous=FULL`.

Перед upgrade/restore:

1. проверьте source integrity;
2. выполните WAL checkpoint;
3. подтвердите free disk space;
4. создайте verified backup;
5. зафиксируйте exact commit/version;
6. проверьте rollback procedure.

`POST /api/v3/admin/backups/verify` выполняет non-restoring verification и доступен только `server_admin`. Backup ID должен принадлежать allowlisted backup directory.

Future schema блокируется до mutation. Replacement failure должен откатывать DB и file store; temporary staged data удаляется после success/error.

## 11. Release и updater

Для `3.4.0` официальный stable workflow требует:

- опубликованный verified `v3.3.4` с Client/Server installers и checksums;
- полный Authenticode policy: certificate, password, expected subject и thumbprint;
- signed Client/Server installers, blockmaps и channel metadata;
- установленный `3.3.4 → 3.4.0` smoke на Windows 10 и Windows 11;
- independent security review без unresolved high/critical findings;
- full CI, security, soak, Android и website gates;
- immutable tag, checksums и post-publication redownload verification.

Unsigned local packages не являются официальным release и не публикуют updater metadata.

## 12. Incident response

При инциденте:

1. сохраните request ID, UTC time, affected account/room и stable error code;
2. ограничьте exposure и отзовите affected sessions/tokens;
3. создайте verified backup до destructive actions;
4. не публикуйте secrets, DB, backups или private messages;
5. security issues передавайте через private GitHub Security Advisory;
6. после исправления добавьте regression test, root-cause record и closure evidence.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
