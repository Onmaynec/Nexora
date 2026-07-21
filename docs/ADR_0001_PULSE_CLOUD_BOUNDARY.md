# ADR 0001: Separate Pulse Cloud billing boundary

- Status: Accepted for the 3.1.0 development branch
- Date: 2026-07-21

## Context

Nexora 3.0.0 contains a Local Server Pulse sandbox and a signed external contract, but it does not contain an authoritative production payment/ledger service. Financial state cannot share authority with the self-hosted message server or Client.

## Decision

Create an additive `cloud/` service. Local Server remains authoritative for local identity, rooms, membership and bans. Pulse Cloud is authoritative for products, prices, checkout, subscriptions, wallet ledger, payments, receipts, refunds, disputes and production entitlements.

The first provider adapter is Stripe. Provider redirects are never payment confirmation. Only a verified, idempotently processed webhook may settle an order or issue value.

Financial writes use a double-entry ledger. A materialized wallet balance is permitted only when changed in the same database transaction as the ledger entries. Negative wallet balances are rejected; chargeback shortfalls restrict the account and record debt.

Cloud signs entitlements and Local Server-facing responses with Ed25519. The private key never leaves Cloud.

## Consequences

- Local messaging remains available during Cloud outages.
- Cloud cannot inspect messages or files.
- A server-scoped credential and explicit `serverId` are required for every Local Server call.
- Production deployment must add secret management, TLS termination, backups, monitoring and worker orchestration.
- Schema 7 Local Server migration and compatibility routes remain a separate, regression-tested change.
