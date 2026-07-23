const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'api-overview', group: 'api', icon: 'Braces', title: both('API overview', 'API overview'),
    description: both('Application v3, Trust v4 и generated inventory.', 'Application v3, Trust v4, and the generated inventory.'),
    body: both(
`# API overview

Nexora разделяет Application API v3 и Trust/MLS/encrypted-media API v4. Маршруты Local Server, Pulse Cloud и operational endpoints извлекаются из исходного кода при сборке портала.

## Generated inventory

API Inventory показывает:

- HTTP method и path;
- inferred authorization boundary;
- path/query/body/header fields, которые найдены в handler;
- response status и top-level JSON keys;
- стабильные error codes;
- точную source location.

## Ограничения static extraction

Извлечение консервативно. Оно не подменяет validator, middleware ordering или transaction semantics. OpenAPI 3.1 не назначает неизвестным полям вымышленные типы.

## Browser mutations

Mutation обычно требует authenticated session, exact Origin и CSRF header. Trust API дополнительно использует device scope, подписи, credential binding и route/resource limits.

## Ошибки

Клиент должен ветвиться по стабильному \`code\`, а не парсить локализованное \`message\`. Учитывайте \`Retry-After\` для \`RATE_LIMITED\`.`,
`# API overview

Nexora separates Application API v3 from Trust/MLS/encrypted-media API v4. Local Server, Pulse Cloud, and operational routes are extracted from source during the portal build.

## Generated inventory

The API Inventory shows:

- HTTP method and path;
- inferred authorization boundary;
- path, query, body, and header fields detected in the handler;
- response statuses and top-level JSON keys;
- stable error codes;
- exact source location.

## Static extraction limits

Extraction is conservative. It does not replace validators, middleware ordering, or transaction semantics. OpenAPI 3.1 does not invent types for fields whose types cannot be proven.

## Browser mutations

A mutation normally requires an authenticated session, exact Origin, and CSRF header. Trust API operations additionally use device scope, signatures, credential binding, and route/resource limits.

## Errors

Clients should branch on stable \`code\` values rather than parsing localized \`message\` text. Honor \`Retry-After\` for \`RATE_LIMITED\`.`),
    special: 'api',
  },
  {
    id: 'realtime', group: 'api', icon: 'RadioTower', title: both('Socket.IO и realtime', 'Socket.IO and realtime'),
    description: both('Rooms, device scope, access loss и reconnect.', 'Rooms, device scope, access loss, and reconnect.'),
    body: both(
`# Socket.IO и realtime

Realtime transport не заменяет authorization. При каждом privileged event сервер должен повторно проверить session, membership, role, ban и policy.

## Scope

- user rooms — account-scoped notifications;
- conversation rooms — сообщения и состояние диалога;
- verified-device channels — Trust/MLS ciphertext и recovery;
- operational channels — только при явной административной авторизации.

## Потеря доступа

После removal, ban, session revocation или device revocation пользователь должен быть отключён от соответствующих rooms/channels. Последующие события нельзя доставлять на stale socket.

## Reconnect

Client восстанавливает состояние через authoritative sync, а не предполагает, что все пропущенные Socket.IO events можно воспроизвести локально. Durable outbox повторяет только idempotent operations.

## Inventory

Раздел Realtime Events формируется из прямых \`socket.on\`, \`socket.emit\`, \`io.to(...).emit\` и известных helper-emitter calls. Dynamic event names могут требовать ручного source review.`,
`# Socket.IO and realtime

Realtime transport does not replace authorization. Every privileged event must re-check session, membership, role, bans, and policy on the server.

## Scope

- user rooms — account-scoped notifications;
- conversation rooms — messages and conversation state;
- verified-device channels — Trust/MLS ciphertext and recovery;
- operational channels — only with explicit administrative authorization.

## Access loss

After removal, ban, session revocation, or device revocation, the user must be removed from the corresponding rooms and channels. Later events must not reach a stale socket.

## Reconnect

The client restores state through authoritative sync rather than assuming every missed Socket.IO event can be replayed locally. The durable outbox retries only idempotent operations.

## Inventory

Realtime Events is generated from direct \`socket.on\`, \`socket.emit\`, \`io.to(...).emit\`, and known emitter helpers. Dynamically constructed names may still require manual source review.`),
    special: 'realtime',
  },
  {
    id: 'openapi', group: 'api', icon: 'FileJson2', title: both('OpenAPI 3.1', 'OpenAPI 3.1'),
    description: both('Машиночитаемый inventory без вымышленных schemas.', 'Machine-readable inventory without invented schemas.'),
    body: both(
`# OpenAPI 3.1

При каждой сборке портал создаёт \`openapi.json\` из обнаруженных REST handlers.

## Назначение

- быстрый просмотр endpoint inventory;
- импорт в tooling;
- source-linked операция;
- проверка drift: full repository build не должен создавать пустой inventory.

## Граница доверия

OpenAPI является generated index, а не вручную подтверждённым полным public contract. Неизвестные типы остаются пустыми schema objects. Exact required fields, formats, limits и conditional validation определяет серверный код.

## Swagger UI

Портал предоставляет ссылку на hosted Swagger UI с URL текущего \`openapi.json\`. Для закрытого deployment не передавайте private OpenAPI URL стороннему hosted viewer — используйте локальный Swagger UI.`,
`# OpenAPI 3.1

Every portal build creates \`openapi.json\` from detected REST handlers.

## Purpose

- rapid endpoint inventory review;
- tooling imports;
- source-linked operations;
- drift detection: a full repository build must not produce an empty inventory.

## Trust boundary

OpenAPI is a generated index, not a manually certified complete public contract. Unknown types remain empty schema objects. The server source defines exact required fields, formats, limits, and conditional validation.

## Swagger UI

The portal links to hosted Swagger UI with the current \`openapi.json\` URL. For a private deployment, do not send a private OpenAPI URL to a third-party hosted viewer; run Swagger UI locally.`),
    special: 'openapi',
  },
  {
    id: 'error-codes', group: 'api', icon: 'TriangleAlert', title: both('Коды ошибок', 'Error codes'),
    description: both('Stable codes и safe diagnostics.', 'Stable codes and safe diagnostics.'),
    body: both(
`# Коды ошибок

Стабильная ошибка должна различать authentication, permission, resource absence, conflict, validation, rate limit, invitation state, ban, upload failure и temporary server error.

## Рекомендуемый envelope

\`\`\`json
{
  "ok": false,
  "requestId": "request-id",
  "code": "PERMISSION_DENIED",
  "message": "Локализованное безопасное сообщение",
  "details": {}
}
\`\`\`

## Безопасность

Response не должен раскрывать stack, SQL, filesystem paths, token, private key или raw provider payload. \`requestId\` позволяет связать безопасный ответ с redacted server log.

## Generated index

Раздел Error Codes агрегирует uppercase codes, обнаруженные в исходниках. Динамически вычисляемые codes или внешние provider codes могут не попасть в индекс.`,
`# Error codes

Stable errors should distinguish authentication, permission, missing resource, conflict, validation, rate limit, invitation state, ban, upload failure, and temporary server failure.

## Recommended envelope

\`\`\`json
{
  "ok": false,
  "requestId": "request-id",
  "code": "PERMISSION_DENIED",
  "message": "Safe localized message",
  "details": {}
}
\`\`\`

## Security

Responses must not expose stack traces, SQL, filesystem paths, tokens, private keys, or raw provider payloads. \`requestId\` binds a safe response to a redacted server log.

## Generated index

Error Codes aggregates uppercase codes detected in source. Dynamically computed codes and external provider codes may require manual review.`),
    special: 'errors',
  }
];
