# Nexora Plus / Pulse 3.1.2

Этот документ описывает stable trust boundary Nexora Plus/Pulse. Базовое общение, доступ к собственным данным и локальные room functions не должны зависеть от paid entitlement.

## Компоненты

| Компонент | Authority |
|---|---|
| Local Server | local users, rooms, messages, files, roles, membership, bans и room policy |
| Pulse Cloud | Cloud Identity, provider/customer mapping, subscription state, receipts, double-entry Impulse ledger и production entitlements |
| Payment provider | card/payment processing и authoritative provider events |
| Client | UI и user input; никогда не является источником цены, balance или entitlement |

Pulse Cloud не хранит local messages, room history, attachments, Local Server password/session или local CA private key. Local Server не хранит card data, Cloud password, MFA secret, Cloud session, OAuth refresh token или Cloud signing private key.

## Продуктовая модель

Nexora Plus может предоставлять 400 Impulses за подтверждённый subscription period, premium themes/accents, avatar frames, extra sounds/reactions, увеличенный offline cache и скрываемый badge.

Impulses — целочисленные внутренние units:

- не переводятся напрямую между users;
- не обмениваются на деньги;
- не могут давать отрицательный balance;
- используются только в server-defined catalog, включая room goals;
- production balance изменяется только Cloud ledger transaction.

Каталог и фактически применяемые capabilities должны быть разделены. Local Server активирует только реализованные capabilities; неизвестные products закрываются capability gate.

## Режимы Local Server

| Режим | Назначение | Checkout | Production signatures |
|---|---|---|---|
| `disabled` | обычный Local Server | нет | нет |
| `sandbox` | QA/demo без денег | заблокирован | нет |
| `production` | отдельный Pulse Cloud/provider | Cloud only | Cloud only |
| `misconfigured` | неполная production configuration | заблокирован | не принимаются |

## Local sandbox 3.1.2

Sandbox включается только через audited Server command registry:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Инварианты:

- sandbox автоматически недоступен, если настроен production Pulse Cloud;
- checkout/provider operations отключены;
- новый test Plus entitlement создаёт разовый grant 400 Impulses;
- повторная activation существующего периода не создаёт второй grant;
- revoke/grant выполняются транзакционно и журналируются;
- balance не может стать отрицательным;
- sandbox не создаёт Cloud Identity, production receipt или Ed25519 production entitlement.

Sandbox предназначен только для разработки, демонстрации и regression testing. Его state не является покупкой и не должен переноситься в production ledger.

## Production configuration

Пример Local Server variables:

```text
NEXORA_PULSE_MODE=production
NEXORA_PULSE_CLOUD_URL=https://pulse.example.com
NEXORA_PULSE_API_KEY=<server-scoped credential>
NEXORA_PULSE_PUBLIC_KEY=<pinned Ed25519 public key or key registry>
```

URL обязан использовать HTTPS. Service credential не попадает в Client. Cloud signing private key хранится только в Cloud secret manager.

Production также требует Cloud variables для database, email delivery, OAuth clients, provider credentials/webhook secret, signing keys, metrics token и deployment origin. Используйте `.env.pulse.example` как reference, но не коммитьте реальные values.

## Cloud Identity

3.1.x поддерживает:

- Cloud Account registration и email verification;
- scrypt password storage;
- TOTP MFA с AES-256-GCM protected secret;
- одноразовые recovery codes;
- secure Cloud sessions;
- OAuth 2.1 Authorization Code flow с PKCE S256 и exact redirect URI;
- opaque hashed email/session/code/access/refresh tokens;
- atomic authorization-code consumption и refresh-token rotation.

Local Account связывается с Cloud Account через одноразовую signed attestation, привязанную к Server ID, Local User ID, link ID, nonce и expiry. Unlink требует local current-password reauthentication.

Подробнее: [CLOUD_IDENTITY.md](CLOUD_IDENTITY.md).

## Signed Local Server ↔ Cloud contract

Local Server request включает scoped service credential, request ID, timestamp, nonce и idempotency metadata. Cloud response использует Ed25519 signed envelope и authoritative scope.

Local Server проверяет:

1. HTTPS Cloud URL;
2. известный pinned key ID;
3. envelope signature;
4. nested entitlement signature, если он присутствует;
5. `serverId`, `localUserId`/`cloudAccountId`, `roomId` и `productId` scope;
6. `issuedAt`, activation time и `expiresAt`;
7. replay/payload substitution;
8. idempotency scope conflict.

Unknown/replaced key, expired envelope, mismatched scope или changed payload отвергаются до изменения local verified cache.

## Billing и ledger

Pulse Cloud является authority для:

- server-side product/price catalog;
- provider-hosted checkout;
- unique provider-event state machine;
- double-entry Impulse ledger;
- materialized wallet balance в той же transaction;
- subscription grants, purchases, receipts, refunds и chargeback compensation;
- debt/restriction state при shortfall;
- signed entitlements и event delta sync.

Client никогда не передаёт authoritative price. Success redirect не подтверждает payment: settlement происходит только после verified provider event. Failed provider event может retry только с тем же provider/type/payload hash. Idempotency key привязывается к account/server/user/product/currency scope.

## Room goals

Только owner создаёт commercial goal из fixed catalog. Local Server до Cloud request повторно проверяет session, CSRF, membership, ban, room ownership, room state и idempotency.

Contribution:

1. принимает только integer amount в разрешённом диапазоне;
2. не превышает remaining target;
3. возвращает authoritative accepted/refused amount;
4. в production фиксируется Cloud ledger transaction;
5. публикует scoped event только после verified response;
6. при достижении target создаёт time-bounded room entitlement.

Повтор с тем же idempotency key и тем же scope не списывает balance повторно. Scope/payload mismatch возвращает conflict. Cancel/expiry/refund выполняются Cloud ledger transaction; Local Server хранит только verified cache/audit.

## Event sync и offline behavior

Pulse Cloud публикует signed event delta. Local Server хранит cursor/inbox и применяет events idempotently. Entitlement revoke должен вступать в силу без restart.

Cloud outage:

- не блокирует local messaging;
- не разрешает новые production monetary writes;
- UI может показывать только последний неистёкший verified cache;
- stale/expired entitlement не продлевается локально;
- failed delivery/reconciliation workers повторяют операции bounded retry/lease-safe способом.

## Operational endpoints

Pulse Cloud предоставляет:

- `/healthz/live`;
- `/healthz/ready`;
- `/metrics` с `CLOUD_METRICS_TOKEN` либо loopback-only policy.

Readiness включает Cloud Identity, ledger invariant и workers. Operational logs используют request IDs и recursive credential redaction. Graceful shutdown переводит readiness в `503` до остановки workers/HTTP/storage.

## Что необходимо до реальных платежей

- изолированный Pulse Cloud deployment и production database;
- secret manager и key-rotation procedure;
- provider account, prices и verified webhooks;
- transactional email delivery;
- reconciliation, refund, dispute, cancellation и entitlement-revocation runbooks;
- OAuth client allowlist и exact redirect URIs;
- metrics/alerts, backup/restore и incident response;
- налоги/чеки, оферта, privacy/retention и support process;
- provider sandbox E2E, security review и независимый audit.

До выполнения production checklist используйте `disabled` или изолированный `sandbox`.

Связанные документы: [PULSE_CLOUD.md](PULSE_CLOUD.md), [LOCAL_PULSE_INTEGRATION.md](LOCAL_PULSE_INTEGRATION.md), [ADR_0001_PULSE_CLOUD_BOUNDARY.md](ADR_0001_PULSE_CLOUD_BOUNDARY.md), [RELEASE_3.1.0.md](RELEASE_3.1.0.md).
