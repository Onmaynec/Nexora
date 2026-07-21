# Nexora 3.1.0 — Local Server / Pulse Cloud integration

## Граница доверия

`server/create-server-v31.cjs` расширяет существующий Local Server, не переписывая REST, Socket.IO, offline store или room model 3.0.0.

Local Server хранит:

- Local User ID;
- Cloud Account ID в рамках link;
- проверенные entitlement envelopes;
- ограниченный overview/transaction/checkout cache;
- public signing keys;
- sync cursors и безопасные error codes.

Local Server не хранит:

- карточные данные;
- Stripe payment method;
- Cloud password;
- Cloud refresh token;
- entitlement private key;
- полный Cloud ledger.

## Startup

Production Local Server использует `server/create-server-v31.cjs` через CLI и Windows Server shell.

До `listen()` выполняются:

1. schema 7 migration;
2. загрузка pinned Ed25519 public keys;
3. проверка Pulse configuration;
4. монтаж `/api/v3/cloud-account/*` и `/api/v3/pulse/*`;
5. монтаж room-goal API.

Ошибка Pulse configuration переводит Pulse в `misconfigured`, но не блокирует локальные сообщения.

## Service authentication

Каждый Local Server → Cloud запрос содержит:

- `Authorization: Bearer <server-scoped credential>`;
- `X-Nexora-Server-ID`;
- `X-Nexora-Timestamp`;
- случайный `X-Nexora-Nonce`;
- `X-Request-ID`;
- `Idempotency-Key` для финансовой записи.

Cloud URL обязан использовать HTTPS и не может содержать credentials.

## Signed envelopes

Local Server принимает Cloud success response только после проверки:

- Ed25519 signature;
- pinned `keyId`;
- совпадения `keyId` payload/envelope;
- `issuedAt`/`notBefore`/`expiresAt`;
- `serverId`;
- `userId`, `roomId` и product scope, когда они применимы.

Overview дополнительно проверяет каждый вложенный entitlement envelope. В cache сохраняется только проверенный payload hash.

Public key с уже известным `keyId` нельзя заменить другим material без явного revoke. Это предотвращает key-ID substitution.

## Cloud Account link

### Start

`POST /api/v3/cloud-account/link/start`

Local Server создаёт:

- `linkId`;
- 256-bit nonce;
- Local User ID;
- Server ID;
- expiry не более 10 минут.

Предыдущая незавершённая session пользователя отменяется.

### Complete

`POST /api/v3/cloud-account/link/complete`

Подписанная attestation обязана содержать:

- `type=local_account_link`;
- тот же `serverId`;
- тот же `localUserId`;
- тот же `linkId`;
- тот же nonce;
- `cloudAccountId`;
- Cloud subject;
- действующий срок.

Session атомарно переводится в `consumed`. Повтор возвращает `LINK_ATTESTATION_REPLAYED`.

Отвязка требует подтверждения текущего локального пароля. Receipts и Cloud ledger не удаляются.

## API v3

Реализованы:

```text
POST   /api/v3/cloud-account/link/start
POST   /api/v3/cloud-account/link/complete
GET    /api/v3/cloud-account
DELETE /api/v3/cloud-account/link

GET    /api/v3/pulse/status
GET    /api/v3/pulse/overview
GET    /api/v3/pulse/wallet
GET    /api/v3/pulse/transactions
GET    /api/v3/pulse/transactions/:id

POST   /api/v3/pulse/checkout/subscription
POST   /api/v3/pulse/checkout/impulses
GET    /api/v3/pulse/checkout/:id
GET    /api/v3/pulse/subscription

GET    /api/v3/rooms/:roomId/pulse/goals
POST   /api/v3/rooms/:roomId/pulse/goals
POST   /api/v3/rooms/:roomId/pulse/goals/:goalId/contributions
POST   /api/v3/rooms/:roomId/pulse/goals/:goalId/cancel
```

Все изменяющие маршруты повторно проверяют session, CSRF, emergency read-only, membership, ban, owner permission и idempotency key.

## Offline behavior

Pulse Cloud outage:

- не блокирует bootstrap, сообщения, комнаты или файлы;
- возвращает последний проверенный overview/wallet/transaction cache с `cached=true`;
- добавляет безопасный `warning.code`;
- не создаёт локально production Plus, Импульсы или entitlement;
- не считает checkout redirect подтверждением оплаты.

Без ранее проверенного cache финансовый маршрут возвращает Cloud error, а messaging продолжает работать.

## Realtime

Local Server публикует scoped события:

- `billing.account_linked`;
- `billing.account_unlinked`;
- `billing.checkout_updated`;
- `billing.wallet_updated`;
- `billing.goal_created`;
- `billing.goal_updated`;
- `billing.goal_cancelled`.

User events отправляются в `user:<userId>`. Room goal events отправляются только в Socket.IO room соответствующей conversation после серверной проверки membership/ban.

## Environment variables Local Server

```dotenv
NEXORA_PULSE_MODE=production
NEXORA_PULSE_CLOUD_URL=https://pulse.example.com
NEXORA_PULSE_SERVER_ID=<optional fixed Cloud registration id>
NEXORA_PULSE_API_KEY=<server-scoped secret>
NEXORA_PULSE_PUBLIC_KEY_ID=<active key id>
NEXORA_PULSE_PUBLIC_KEY=<Ed25519 public PEM>
# or JSON object/array for rotation:
NEXORA_PULSE_PUBLIC_KEYS_JSON={"key-2026-01":"-----BEGIN PUBLIC KEY-----..."}
NEXORA_PULSE_TIMEOUT_MS=8000
```

Secrets не должны попадать в Git или diagnostic bundle.

## Текущие ограничения

Эта интеграция не объявляет весь релиз 3.1.0 завершённым. Отдельно остаются:

- Cloud Identity registration/email/MFA;
- реальный OAuth 2.1 + PKCE authorization endpoint;
- Cloud event delivery worker и reconnect delta cursor;
- subscription portal/cancel endpoint;
- receipts UI/API Local Server;
- entitlement revoke push worker;
- PostgreSQL/Redis production deployment;
- Pulse Center и новый client UI;
- E2E provider sandbox, load и 24-hour soak.
