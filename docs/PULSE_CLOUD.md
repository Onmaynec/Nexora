# Nexora Pulse Cloud 3.1.0 — foundation

## Status

This module is the production billing trust boundary introduced for the Nexora 3.1.0 development branch. It is intentionally isolated from the Local Server database and message/files domain. The implementation is not a declaration that the entire 3.1.0 specification is complete.

Implemented in this change:

- Stripe Checkout adapter using server-side product/price records;
- raw-body Stripe webhook verification with HMAC, timestamp tolerance and payload limit;
- provider-event idempotency;
- Cloud Account to Local Account links;
- immutable double-entry Impulse ledger;
- materialized wallet balance updated in the same SQLite transaction;
- Plus billing-period grants, unique per subscription and period;
- Impulse pack purchase settlement and receipts;
- room goals, partial final contribution, transactional target enforcement and refunds;
- chargeback/refund compensation without negative wallet balances;
- Ed25519 signed entitlements and signed Local Server responses;
- request IDs, stable error envelopes, service/admin credentials and rate limiting;
- OpenAPI draft and unit tests for financial invariants.

Not implemented by this foundation PR:

- end-user Cloud Identity UI, email verification, MFA and OAuth 2.1/PKCE flow;
- PostgreSQL/Redis deployment profile and background worker queue;
- provider customer portal/cancellation/refund operator UI;
- Local Server schema 7 migration and `/api/v3/pulse/*` compatibility adapter;
- Pulse Center, design system, motion system and onboarding changes;
- production secret manager/KMS integration, key rotation workflow and deployment manifests;
- full integration, E2E, visual, load and 24-hour soak gates.

## Trust boundaries

### Pulse Cloud

Stores account links, products, prices, subscriptions, orders, payments, receipts, wallet ledger, room goals and entitlements. It never stores local passwords, messages, files or card data.

### Local Server

Authenticates local users, verifies room membership/owner permissions and room bans before calling Cloud. The Cloud credential is server-scoped and must never be exposed to Client.

### Payment provider

The checkout success redirect is informational only. An order is settled only from a verified Stripe webhook. Duplicate provider events and duplicate business requests are no-ops.

## Running locally

Node.js 22.16 or newer is required.

```bash
cp .env.pulse.example .env.pulse
# Load the variables through the deployment environment or a secret manager.
npm run start:cloud
```

The service binds to `127.0.0.1:4545` by default. Terminate TLS at a trusted reverse proxy and set `CLOUD_PUBLIC_URL` to the public HTTPS origin. Do not expose the plain HTTP listener directly to the internet.

## Required environment

See `.env.pulse.example`. Production must inject secret values through the deployment platform. Private keys, API keys, webhook secrets and databases must never be committed.

## Ledger model

Every balance-changing operation creates one `ledger_transactions` row and at least two `ledger_entries`. Total debit must equal total credit. The wallet balance is updated only while inserting ledger entries inside the same `BEGIN IMMEDIATE` transaction. A failed invariant rolls back the entire operation.

Supported operation types in this foundation:

- `plus_monthly_grant`;
- `impulse_pack_purchase`;
- `goal_contribution`;
- `goal_full_refund`;
- `payment_refund`;
- `chargeback`;
- `promotional_grant`.

## Webhook processing

1. Read raw body with a 1 MB limit.
2. Verify `Stripe-Signature` HMAC and timestamp.
3. Insert unique provider event ID.
4. Validate order/account/subscription metadata and amount/currency.
5. Post ledger transaction and update materialized balance atomically.
6. Issue entitlement or receipt.
7. Write outbox event.
8. Mark provider event processed.

Returning from Checkout does not execute steps 3–8.

## Entitlements

Entitlements use Ed25519. The private key exists only in Pulse Cloud. Local Server retrieves public keys from `/v1/public-keys`, pins the expected key IDs, and validates signature, `serverId`, `roomId`, product, `notBefore`, expiry and revocation status.

## Verification

```bash
node --test test/pulse-cloud.test.cjs
```

The suite covers ledger balancing/idempotency, monthly grant uniqueness, partial contributions, duplicate contribution protection, refunds, chargeback debt handling, entitlement scope/expiry and Stripe webhook verification.
