# Nexora Plus / Pulse

Этот документ описывает границу Nexora Pulse в версии 3.0.0. Звонки исключены из каталога, базовое общение остаётся бесплатным.

## Продуктовая модель

Nexora Plus даёт 400 импульсов за расчётный месяц, премиальные темы/акценты, avatar frames, дополнительные sounds/reactions, увеличенный offline cache и скрываемый badge.

Импульсы — целочисленные внутренние единицы: они не переводятся между пользователями, не обмениваются на деньги и используются для коллективных room goals. Каталог показывает backup 20 ГБ, analytics, flexible retention, invite branding и reaction pack. Локальный Server применяет только явно поддержанные capabilities; остальные позиции закрыты capability gate до подключения соответствующего Cloud-адаптера.

## Режимы

| Режим | Назначение | Денежные операции |
|---|---|---|
| `disabled` | обычный локальный Server | нет |
| `sandbox` | QA/demo, локальная тестовая активация | нет |
| `production` | интеграция с Pulse Cloud/provider | только через Cloud |
| `misconfigured` | production без обязательных secrets | заблокированы |

## Переменные Server

```text
NEXORA_PULSE_MODE=production
NEXORA_PULSE_CLOUD_URL=https://billing.example.com
NEXORA_PULSE_API_KEY=<server-scoped secret>
NEXORA_PULSE_PUBLIC_KEY=<Ed25519 public key PEM>
```

URL обязан использовать HTTPS. API key не попадает в Client. Приватный signing key находится только в Cloud.

## Signed envelope

Pulse Cloud возвращает JSON:

```json
{
  "payload": "base64url(JSON)",
  "signature": "base64url(Ed25519 signature)"
}
```

Server проверяет signature, `expiresAt`, `serverId` и `userId`, затем обновляет локальный cache. Просроченный, изменённый или чужой envelope отвергается.

## Cloud contract

Ожидаемые операции:

- `GET /v1/servers/{serverId}/users/{userId}/overview`;
- `POST /v1/checkout/sessions`;
- `POST /v1/goals/{goalId}/contributions` с `Idempotency-Key`.

Cloud должен быть authority для customer mapping, subscription, monthly grants, ledger, refunds/revocation и webhook reconciliation. Никогда не доверяйте сумме/entitlement из Client.

Schema 6 содержит локальные audit/cache сущности `paymentEvents` и `pulseLedger`, но они не превращают Server в платёжный источник истины. Production webhook и ledger поступают только из отдельного Pulse Cloud после проверки подписи и idempotency.

## Room goals

Только owner создаёт цель из фиксированного каталога. Вклад:

1. проверяет integer range и idempotency key;
2. повторно проверяет membership/ban внутри локальной транзакции;
3. принимает не больше остатка до target и возвращает `acceptedPulse`/`refusedPulse`;
4. в production проводится Cloud;
5. записывается в локальный audit cache;
6. при достижении target создаётся ограниченный по времени room-scoped entitlement.

Повтор с тем же key не списывает баланс повторно. В Sandbox отмена или expiry атомарно возвращают тестовые импульсы; в Production возврат обязан выполнять Cloud ledger.

## Что необходимо до реальных платежей

- аккаунт и API платёжного провайдера;
- Cloud deployment, database/ledger и secret management;
- webhook signature verification и idempotent processing;
- checkout success/cancel pages;
- refund, dispute, cancellation и entitlement revocation;
- налоги/чеки, оферта, privacy/retention и support process;
- отдельные интеграционные/security тесты.

До выполнения списка используйте `disabled` или `sandbox`. Local sandbox state не является покупкой.
