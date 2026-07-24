# Руководство администратора Nexora

## Область

| Параметр | Значение |
|---|---|
| Repository version | `3.3.4` release candidate |
| Distribution | signed when policy exists; otherwise explicit `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS runtime | retired; legacy secure history read-only |
| Local Server database | SQLite schema 8 |

Nexora 3.3.4 — обязательный post-MLS baseline для последующей линии 3.4.0. Он не является signed stable release до фактического подтверждения подписи, installed acceptance и release evidence.

## Deployment requirements

Local Server поддерживает localhost, private LAN/VPN и public HTTPS. Для public deployment обязательны trusted HTTPS reverse proxy, restricted firewall exposure, exact `allowedOrigins`, monitoring, backups, protected OS account и disk encryption. Не размещайте production secrets в repository или logs.

Network access не является trust. Каждая операция проверяет session, Origin/CSRF, resource existence, membership, role, active ban/restriction, room policy, input scope, rate limit и resource ceiling.

## Startup и readiness

Перед запуском:

1. проверьте Node.js `22.16+` и writable data directory;
2. проверьте свободное место для SQLite/WAL/uploads/backups;
3. проверьте TLS SAN, Server ID и fingerprint;
4. настройте exact origins и интерфейс прослушивания;
5. создайте и проверьте backup;
6. запустите readiness/health checks;
7. убедитесь, что Client и Server используют одну release line.

Не публикуйте Local Server напрямую через port forwarding без reverse proxy, firewall и monitoring.

## Аккаунты, роли и комнаты

Роли комнаты: `owner`, `moderator`, `member`. В комнате всегда ровно один owner.

- только owner передаёт владение и назначает/снимает moderators;
- moderator не воздействует на owner и не назначает других moderators без отдельного разрешения;
- removal/ban немедленно отзывают REST и realtime access;
- blocked user не может повторно вступить, писать или загружать через прямой API;
- read-only, slow mode и media restrictions проверяются Server при каждом действии;
- invite expiry/use limit и join выполняются атомарно;
- administrative mutations создают audit record и system message.

Опасные действия подтверждаются в UI, но безопасность обеспечивается Server checks.

## Sessions и devices

`GET /api/v3/devices` показывает server-owned inventory активных sessions: device ID/name, platform, Client version, created/last-seen/expiry.

- targeted revoke удаляет sessions выбранного device;
- Server отправляет `session.revoked` и отключает session Socket.IO room;
- `device.updated` обновляет inventory;
- текущий device нельзя отозвать remote endpoint — возвращается `STATE_CONFLICT`;
- после revoke Client должен перейти в terminal logged-out state без reconnect loop.

## Обычные сообщения и uploads

Ordinary server-readable messaging — единственный writable messaging path.

Server проверяет auth, membership, ban, room policy, actual MIME, byte size, safe filename, quota и rate limits. Temporary upload data удаляется после failed/cancelled operations. Corrupt images и unsupported voice formats завершаются safe errors.

## Legacy secure history

Trust Core, MLS transport/recovery и encrypted-upload write runtime удалены.

- schema 8 legacy IDs, epochs, timestamps, ciphertext и provenance сохраняются;
- legacy viewer/export только read-only;
- Server export фиксирует `serverDecrypted: false`;
- readable plaintext возможен только из ранее существовавшего local Client cache;
- `/api/v4/trust*`, `/api/v4/e2ee*` и MLS Socket.IO mutations возвращают `LEGACY_READ_ONLY`;
- нельзя включать legacy writes обратно configuration switch или ручным редактированием БД.

## Backup, restore и migration

Перед schema-sensitive операцией:

1. source integrity check;
2. WAL checkpoint;
3. free-space preflight;
4. verified backup;
5. staged/transactional mutation;
6. destination integrity check;
7. rollback/restore readiness.

`POST /api/v3/admin/backups/verify` проверяет allowlisted backup без замены live DB/files. Restore failure не должен оставлять mixed database/uploads state. Future schema version блокируется до mutation.

## Errors и observability

Errors содержат stable `code`, safe `message`, `requestId` и безопасные `details`. Не раскрываются stack, SQL, tokens, cookies, passwords или certificate material.

Основные классы: `AUTH_REQUIRED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, `STATE_CONFLICT`, `RATE_LIMITED`, `LEGACY_READ_ONLY`, `BACKUP_INTEGRITY_FAILED`, `UPDATE_SIGNATURE_INVALID`, `TEMPORARY_UNAVAILABLE`.

Используйте request ID для корреляции, не копируйте sensitive payload в public issue.

## Release и updater

Client channel — `latest`, Server channel — `server`. Downgrade запрещён. Partial signing policy отклоняется.

Без Authenticode policy `v3.3.4` публикуется только как явный `UNSIGNED-TEST` prerelease без `latest.yml`, `server.yml` и blockmaps. Такой release не потребляется production updater.

## Incident response

При incident:

1. зафиксируйте version/commit/time/request IDs;
2. ограничьте доступ или переведите Server в controlled read-only mode;
3. сохраните sanitized evidence;
4. создайте verified backup;
5. исправьте root cause и добавьте regression test;
6. проверьте restore/recovery;
7. обновите security/release documentation.

См. [Operations Runbook](docs/OPERATIONS_RUNBOOK.md), [Security Model](docs/SECURITY_MODEL.md) и [Release Verification 3.3.4](docs/releases/3.3.4/RELEASE_VERIFICATION.md).
