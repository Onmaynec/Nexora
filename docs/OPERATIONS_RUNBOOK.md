# Nexora Operations Runbook

## 1. Область применения

Runbook относится к Nexora `3.2.3`:

- Local Server schema 8;
- Application API v3;
- Trust/MLS/encrypted-media API v4;
- Source/PWA prerelease distribution;
- signed production baseline `3.1.2`.

Цель документа — дать оператору повторяемые процедуры startup, monitoring, maintenance, backup, restore, upgrade и incident response.

## 2. Preflight перед запуском

Проверьте:

- поддерживаемую версию Node.js `22.16+`;
- доступность рабочей директории и прав записи;
- свободное место для SQLite, WAL, attachments и backup;
- HTTPS certificate, SAN, Server ID и fingerprint;
- точный `allowedOrigins`;
- firewall и network interface;
- отсутствие production secrets в repository и logs;
- действующий backup и известную процедуру restore;
- корректную Pulse mode configuration.

## 3. Запуск

Source deployment:

```bash
npm ci
npm start
```

После запуска проверьте:

```text
GET /healthz/live
GET /healthz/ready
```

Ready state должен подтверждать:

- доступность SQLite;
- поддерживаемую schema 8;
- завершённую migration/maintenance initialization;
- отсутствие drain state;
- готовность operational dependencies.

## 4. Monitoring

### Endpoints

- `GET /healthz/live` — process liveness;
- `GET /healthz/ready` — readiness для traffic;
- `GET /metrics` — Prometheus metrics.

Remote metrics требуют Bearer token. Без token endpoint должен оставаться loopback-only.

### Минимальные alert conditions

- readiness `503` вне планового shutdown;
- повторные SQLite integrity/database errors;
- storage quota exhaustion;
- backup failure;
- необычный рост `RATE_LIMITED`;
- repeated authentication lockouts;
- Pulse worker/reconciliation failure;
- Trust recovery/hash mismatch;
- рост rejected attachment claims или replay attempts;
- graceful shutdown timeout.

## 5. Логи и диагностика

Operational logs должны содержать request ID и не должны содержать:

- passwords;
- cookies и session tokens;
- OAuth/API/bot/Pulse credentials;
- TOTP secrets или recovery codes;
- signing/private keys;
- invite codes;
- MLS private state;
- secure-message plaintext;
- backup passphrase.

Перед передачей logs выполните ручную redaction и минимизацию данных.

## 6. Scheduled maintenance

При startup и каждый час Local Server удаляет:

- expired sessions;
- login history старше 90 дней;
- stale persistent rate-limit buckets;
- expired Trust resources, включая неактуальный KeyPackage state;
- orphan/pending data в рамках существующей retention policy.

Maintenance не заменяет quota, monitoring и backup. Ошибка maintenance должна быть видна оператору и не должна скрываться пустым catch.

## 7. Resource governance

### Trust devices

- максимум 16 active devices на user;
- duplicate registration с теми же данными остаётся idempotent;
- revocation освобождает capacity.

### KeyPackages

- максимум 25 в одном request;
- максимум 32 unclaimed на device;
- максимум 256 unclaimed на user;
- превышение должно откатывать весь overflowing batch.

### Routes

Trust, recovery и E2EE upload routes имеют bounded sliding-window limits. При превышении Client получает:

- HTTP `429`;
- stable code `RATE_LIMITED`;
- `Retry-After`.

Не увеличивайте limits без load/security review.

## 8. Backup

Перед upgrade, migration, restore test или значимым изменением:

1. переведите service в контролируемое состояние;
2. выполните WAL checkpoint;
3. создайте application-level verified backup;
4. сохраните backup вне server computer;
5. проверьте возможность чтения/verification;
6. сохраните passphrase отдельно;
7. зафиксируйте version, schema, timestamp и checksum.

Не копируйте активный `nexora.sqlite` вручную как единственную резервную копию.

## 9. Restore

1. Остановите входящий traffic.
2. Зафиксируйте текущую версию, schema и причину restore.
3. Создайте `pre-restore` copy текущих данных, если они доступны.
4. Проверьте backup metadata и passphrase.
5. Выполните application-level restore.
6. Проверьте SQLite integrity и schema.
7. Запустите Local Server.
8. Проверьте live/ready, login, rooms, messages, files и realtime.
9. Для Trust/MLS проверьте device directory и отсутствие неожиданных recovery gaps.

Schema 8 не откатывается in-place к schema 7. Rollback выполняется восстановлением совместимого verified backup и соответствующего binary.

## 10. Upgrade 3.2.x → 3.2.3

Database migration не требуется: schema остаётся 8.

Процедура:

1. создайте verified backup;
2. остановите Server graceful shutdown;
3. обновите source/package;
4. подтвердите version metadata `3.2.3`;
5. запустите Server;
6. проверьте live/ready и SQLite integrity;
7. проверьте login/bootstrap и закрытие Server без main-process exception;
8. проверьте Trust device enrollment/revocation;
9. проверьте route rate-limit contract и отсутствие ложного lockout;
10. проверьте recovery и encrypted attachment flow.

## 11. Graceful shutdown

Нормальный shutdown:

1. переводит readiness в `503`;
2. блокирует новый traffic;
3. останавливает workers;
4. завершает HTTP/Socket.IO;
5. flushes serialized database queue;
6. закрывает SQLite;
7. формирует stopped-state status без обращения к закрытому repository.

Параллельные stop/quit paths должны сериализоваться. Forced process termination используйте только при зависании и после сохранения diagnostics.

## 12. Emergency read-only

Emergency read-only применяется для расследования или защиты данных:

- reads остаются доступны, где это безопасно;
- mutations отклоняются стабильной ошибкой;
- режим фиксируется в audit;
- после устранения причины режим отключается явно.

Read-only не исправляет corruption и не заменяет backup/restore.

## 13. Incident response

### Сбор evidence

Сохраните:

- Client/Server/Cloud versions;
- commit/tag или asset identifier;
- Server ID;
- request IDs;
- timestamps и sequence действий;
- deployment profile;
- live/ready/metrics snapshot;
- schema и integrity result;
- storage/quota state;
- sanitized logs;
- affected room/device/epoch identifiers без private content.

### При database error

1. включите read-only или остановите Server;
2. не запускайте repair scripts без verified copy;
3. сохраните logs и database copy согласно privacy policy;
4. выполните integrity check;
5. восстановите последний verified backup при подтверждённой corruption;
6. повторно проверьте schema/readiness.

### При Trust/MLS incident

1. остановите рискованную операцию;
2. зафиксируйте user/device/conversation/group/epoch scope;
3. отзовите compromised device;
4. подтвердите targeted Socket.IO disconnect;
5. проверьте local Trust wipe;
6. сохраните только sanitized protocol sequence;
7. не собирайте private keys, full MLS state или message plaintext без отдельной законной необходимости.

### При подозрении на credential leak

- немедленно rotate/revoke credential;
- завершите affected sessions;
- проверьте audit и request IDs;
- смените signing/service keys по runbook соответствующего компонента;
- не публикуйте leaked value в Issue.

## 14. Pulse incident

Cloud outage не должна блокировать local messaging.

Во время outage:

- запретите новые monetary writes;
- используйте только unexpired verified cache для отображения;
- не продлевайте entitlement локально;
- контролируйте worker retry/lease state;
- после восстановления выполните reconciliation и event delta sync.

## 15. Release verification для оператора

Перед production-sensitive rollout:

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Для stable Windows release дополнительно требуются:

- packaged runtime E2E;
- Authenticode verification;
- complete signed updater asset set;
- n-1 → n update test;
- manual approval;
- отсутствие unresolved high/critical findings.

## 16. Escalation

Обычные ошибки оформляются через Bug Report. Уязвимости, plaintext downgrade, private-key exposure, authorization bypass и entitlement forgery сообщаются приватно по [Security Policy](../SECURITY.md).
