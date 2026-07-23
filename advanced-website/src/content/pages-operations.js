const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'cli', group: 'operations', icon: 'TerminalSquare', title: both('CLI и команды сервера', 'CLI and server commands'),
    description: both('Безопасная эксплуатация без shell/eval.', 'Safe operations without shell or eval.'),
    body: both(
`# CLI и команды сервера

Server CLI запускается через \`npm start\`; Cloud CLI — через \`npm run start:cloud\`. Production command registry должен содержать allowlisted typed commands без shell interpolation или \`eval\`.

## Принципы

- authentication/authorization для remote admin surface;
- command schema и bounded arguments;
- confirmation для destructive operations;
- audit initiator, command, target, result и request ID;
- redaction secrets и personal data;
- serial execution для backup/restore/shutdown;
- стабильный exit code и structured output.

## Опасные операции

Restore, rotate keys, revoke sessions, delete data, rebuild indexes и reset sandbox требуют явного confirmation token или локального privileged context. Команда не должна обходить те же business rules, что REST API.`,
`# CLI and server commands

The server CLI starts through \`npm start\`; the Cloud CLI uses \`npm run start:cloud\`. A production command registry contains allowlisted typed commands without shell interpolation or \`eval\`.

## Principles

- authentication and authorization for remote admin surfaces;
- command schemas with bounded arguments;
- confirmation for destructive operations;
- audit initiator, command, target, result, and request ID;
- secret and personal-data redaction;
- serialized backup, restore, and shutdown;
- stable exit codes and structured output.

## Dangerous operations

Restore, key rotation, session revocation, data deletion, index rebuild, and sandbox reset require an explicit confirmation token or local privileged context. A command never bypasses the business rules enforced by REST APIs.`),
  },
  {
    id: 'backup-restore', group: 'operations', icon: 'HardDriveDownload', title: both('Backup и restore', 'Backup and restore'),
    description: both('Консистентность SQLite, uploads и rollback.', 'SQLite, uploads, and rollback consistency.'),
    body: both(
`# Backup и restore

## Backup set

Backup должен связывать SQLite snapshot, uploads/media manifest, config без секретов, schema version и checksums. Копирование только базы без связанных файлов может создать логически неполное состояние.

## Backup flow

1. Сериализовать maintenance operation.
2. Создать согласованный SQLite backup API snapshot.
3. Зафиксировать upload manifest и hashes.
4. Записать metadata/schema/version.
5. Проверить читаемость и checksum.
6. Применить retention только после успешной новой копии.

## Restore flow

Restore выполняется offline/maintenance: проверить compatibility и checksums, развернуть во временный active directory, выполнить integrity/startup validation, затем атомарно переключить active state. При ошибке исходное состояние остаётся доступным.

## Проверка

Периодически выполняйте test restore на отдельном экземпляре. Backup, который никогда не восстанавливался, не считается проверенным.`,
`# Backup and restore

## Backup set

A backup binds the SQLite snapshot, upload/media manifest, non-secret configuration, schema version, and checksums. Copying only the database can create a logically incomplete state.

## Backup flow

1. Serialize the maintenance operation.
2. Create a consistent SQLite backup-API snapshot.
3. Record the upload manifest and hashes.
4. Write metadata, schema, and version.
5. Verify readability and checksums.
6. Apply retention only after the new backup succeeds.

## Restore flow

Restore runs offline or in maintenance mode: verify compatibility and checksums, expand into a temporary active directory, run integrity/startup validation, then atomically switch active state. The original remains available on failure.

## Verification

Perform periodic test restores on a separate instance. A backup that has never been restored is not a verified backup.`),
  },
  {
    id: 'observability', group: 'operations', icon: 'Activity', title: both('Наблюдаемость', 'Observability'),
    description: both('Health, metrics, logs и диагностика.', 'Health, metrics, logs, and diagnostics.'),
    body: both(
`# Наблюдаемость

## Health

- liveness: process/event loop жив;
- readiness: database, migrations, storage и required services готовы;
- startup: initialization ещё выполняется;
- drain: новые mutations отклоняются контролируемо.

## Metrics

Счётчики request outcome, latency, active sockets, queue/outbox depth, uploads, DB busy time, replay, rate limits и cleanup. Metrics endpoint защищается token/network policy и не содержит user IDs, message content или secrets.

## Logs

Structured logs включают timestamp, level, component, request ID и stable code. Recursive redaction удаляет cookies, authorization headers, tokens, keys, passwords и private payload. Stack доступен только в защищённой server-side диагностике.

## Alerts

Alert должен описывать пользовательский impact: readiness failure, sustained 5xx, storage pressure, failed backups, migration failure, event-loop blocking или entitlement signature failures.`,
`# Observability

## Health

- liveness: the process and event loop are alive;
- readiness: database, migrations, storage, and required services are ready;
- startup: initialization is still running;
- drain: new mutations are rejected in a controlled way.

## Metrics

Track request outcomes, latency, active sockets, queue/outbox depth, uploads, DB busy time, replay, rate limits, and cleanup. Protect the metrics endpoint with token/network policy and exclude user IDs, message content, and secrets.

## Logs

Structured logs include timestamp, level, component, request ID, and stable code. Recursive redaction removes cookies, authorization headers, tokens, keys, passwords, and private payloads. Stacks belong only in protected server-side diagnostics.

## Alerts

Alerts should express user impact: readiness failure, sustained 5xx, storage pressure, failed backups, migration failure, event-loop blocking, or entitlement-signature failures.`),
  },
  {
    id: 'troubleshooting', group: 'operations', icon: 'Wrench', title: both('Troubleshooting', 'Troubleshooting'),
    description: both('Систематическая диагностика без потери данных.', 'Systematic diagnostics without data loss.'),
    body: both(
`# Troubleshooting

## Клиент не подключается

1. Проверить exact server URL и HTTPS certificate.
2. Проверить readiness сервера.
3. Проверить clock skew, cookie/session и CSRF origin.
4. Проверить WebSocket upgrade у reverse proxy.
5. Сопоставить request ID клиента и server log.

## Чат не открывается

Проверить bootstrap/conversation response, membership/ban, schema migration, corrupted local cache и reducer exception. Не лечить проблему принудительным full reload, пока не найдена первопричина.

## Upload не проходит

Сопоставить room media policy, фактический MIME, размер, storage quota/free space, temporary cleanup и idempotency state. Повторять только retryable operation.

## Server startup crash

Проверить packaged runtime manifest, shared modules, environment validation, migrations и data directory permissions. Не публиковать installer без smoke-start test его реального payload.`,
`# Troubleshooting

## Client cannot connect

1. Verify the exact server URL and HTTPS certificate.
2. Check server readiness.
3. Check clock skew, cookie/session state, and CSRF origin.
4. Verify WebSocket upgrades at the reverse proxy.
5. Correlate the client request ID with server logs.

## Conversation does not open

Inspect bootstrap/conversation responses, membership/bans, schema migration, corrupted local cache, and reducer exceptions. Do not hide the root cause with forced full reloads.

## Upload fails

Compare room media policy, actual MIME, size, storage quota/free space, temporary cleanup, and idempotency state. Retry only operations classified as retryable.

## Server startup crash

Verify the packaged runtime manifest, shared modules, environment validation, migrations, and data-directory permissions. Never publish an installer without a smoke-start test of its real payload.`),
  }
];
