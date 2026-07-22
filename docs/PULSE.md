# Nexora Plus and Pulse

## 1. Purpose and boundary

Nexora Pulse is an optional commercial and Cloud Identity subsystem. Basic messaging, access to a user's own data and local room functionality must not depend on a paid entitlement.

| Component | Authority |
|---|---|
| Local Server | local accounts, rooms, messages, files, roles, membership, bans and room policy |
| Pulse Cloud | Cloud Identity, subscriptions, receipts, Impulse ledger and production entitlements |
| Payment provider | card/payment processing and authoritative provider events |
| Client | user interface and input; never authoritative for price, balance or entitlement |

Pulse Cloud does not store local message content, room history, Local Server files, local password/session, Trust private keys or Local CA private key.

Local Server does not store payment-card data, Cloud password, Cloud MFA secret, Cloud session, OAuth refresh token or Cloud signing private key.

## 2. Product model

Nexora Plus may provide:

- 400 Impulses for a verified subscription period;
- premium themes and accents;
- avatar frames;
- additional sounds and reactions;
- increased offline cache;
- optional Plus badge visibility;
- eligible room-goal capabilities.

Impulses are integer internal units:

- they are not transferred directly between users;
- they are not exchanged for money;
- balance cannot become negative;
- use is limited to a server-defined catalog;
- production balance changes only through a Pulse Cloud ledger transaction.

Catalog entries and implemented capabilities are separate. Local Server applies only known supported capabilities; unknown products remain blocked by a capability gate.

## 3. Local Server modes

| Mode | Purpose | Checkout | Production authority |
|---|---|---|---|
| `disabled` | normal Local Server without commercial capabilities | unavailable | none |
| `sandbox` | local QA/demo Plus and Impulses | disabled | none |
| `production` | separate Pulse Cloud/provider integration | Cloud only | Cloud only |
| `misconfigured` | incomplete production configuration | blocked | rejected |

## 4. Local sandbox

The sandbox is controlled through the audited Server command registry:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Invariants:

- automatically unavailable when production Pulse Cloud is configured;
- no checkout or provider operation;
- no Cloud Identity, production receipt or production entitlement;
- no production Ed25519 signature;
- one 400-Impulse grant for a newly activated test Plus period;
- repeated activation does not duplicate the grant;
- all grant/revoke operations are transactional and audited;
- balance cannot become negative.

Sandbox state is test data, not a purchase, and must not be migrated into the production ledger.

## 5. Production configuration

Example Local Server variables:

```text
NEXORA_PULSE_MODE=production
NEXORA_PULSE_CLOUD_URL=https://pulse.example.com
NEXORA_PULSE_API_KEY=<server-scoped credential>
NEXORA_PULSE_PUBLIC_KEY=<pinned Ed25519 public key or registry>
```

Requirements:

- HTTPS Cloud URL;
- scoped, rotatable service credential;
- pinned/managed Ed25519 verification keys;
- Cloud database and backup strategy;
- provider credentials and verified webhook secret;
- transactional email;
- OAuth client allowlist and exact redirect URIs;
- metrics and alerting;
- secret management and key rotation;
- reconciliation, refund, dispute, cancellation and entitlement-revocation runbooks;
- privacy, retention, offer, tax/receipt and support processes.

Service credentials never enter the Client. Cloud signing private keys remain in the Cloud secret-management boundary.

## 6. Cloud Identity

Cloud Identity supports:

- account registration and email verification;
- scrypt password storage;
- TOTP MFA with AES-256-GCM protected secret;
- one-time recovery codes;
- secure Cloud sessions;
- OAuth 2.1 Authorization Code with PKCE S256;
- exact redirect URI matching;
- opaque hashed email/session/code/access/refresh tokens;
- atomic authorization-code consumption;
- atomic refresh-token rotation.

Local Account linking uses a one-time signed attestation bound to Server ID, Local User ID, link ID, nonce and expiry. Unlink requires local current-password reauthentication.

See [Cloud Identity](CLOUD_IDENTITY.md).

## 7. Signed Local Server ↔ Pulse Cloud contract

A Local Server request includes:

- scoped service credential;
- request ID;
- timestamp;
- nonce;
- idempotency metadata;
- operation-specific scope.

Cloud responses use Ed25519 signed envelopes and authoritative scope.

Local Server validates:

1. HTTPS origin;
2. known pinned key ID;
3. envelope signature;
4. nested entitlement signature where present;
5. server, local user/cloud account, room and product scope;
6. issue, activation and expiry times;
7. replay and payload substitution;
8. idempotency scope conflicts.

Unknown/replaced keys, expired envelopes, scope mismatch and changed payload are rejected before verified cache mutation.

## 8. Billing and ledger

Pulse Cloud is authoritative for:

- product and price catalog;
- provider-hosted checkout;
- provider-event state machine;
- double-entry Impulse ledger;
- materialized wallet balance in the same transaction;
- subscription grants and purchases;
- receipts, refunds and chargeback compensation;
- debt/restriction state for unresolved shortfall;
- signed entitlements and event delta.

Client never supplies an authoritative price. A checkout success redirect is not settlement evidence. Settlement occurs only after verified provider events.

Failed provider events may retry only with the same provider, type and payload hash. Checkout idempotency keys are bound to account, server, local user, product and currency scope.

## 9. Room goals

Only a room owner creates a commercial goal from the fixed catalog.

Before a Cloud request, Local Server verifies:

- authenticated session;
- Origin and CSRF;
- room existence;
- membership and ban state;
- ownership permission;
- room state and product eligibility;
- integer amount and idempotency scope.

A contribution:

1. cannot exceed the remaining target;
2. returns authoritative accepted/refused amounts;
3. becomes a Cloud ledger transaction in production;
4. emits a scoped event only after a verified response;
5. creates a time-bounded room entitlement when the target is reached.

Retry with the same key and scope does not duplicate the debit. Scope/payload mismatch is a conflict. Cancellation, expiry and refund are Cloud ledger operations; Local Server stores verified cache and audit only.

## 10. Event synchronization and outage behavior

Pulse Cloud publishes a signed event delta. Local Server stores a cursor/inbox and applies events idempotently. Entitlement revocation takes effect without restart.

During Cloud outage:

- local messaging remains available;
- new production monetary writes are blocked;
- UI may show only unexpired verified cache;
- stale/expired entitlement is not renewed locally;
- delivery/reconciliation workers use bounded retry and lease-safe processing.

## 11. Operational endpoints

Pulse Cloud provides:

- `GET /healthz/live`;
- `GET /healthz/ready`;
- `GET /metrics` protected by `CLOUD_METRICS_TOKEN` or loopback-only policy.

Readiness includes Cloud Identity, ledger invariant and worker state. Logs use request IDs and recursive credential redaction. Graceful shutdown changes readiness to `503` before workers, HTTP and storage stop.

## 12. Security and privacy rules

- never trust Client price, balance or entitlement claims;
- never settle payment from redirect state;
- never expose service/provider/signing credentials to Client;
- never log tokens, passwords, payment payload secrets or signature material;
- never allow Local sandbox to issue production authority;
- keep local messaging independent from Pulse availability;
- keep commercial mutations server-side and idempotent;
- verify every Cloud signature, time and scope before applying data.

## 13. Production readiness

Real payments require:

- isolated Cloud deployment and production database;
- key rotation and secret-management process;
- provider sandbox and production separation;
- verified webhooks and reconciliation;
- refund/dispute/cancellation/entitlement-revocation testing;
- transactional email and worker monitoring;
- backup/restore and incident response;
- privacy, retention, legal, tax and receipt approval;
- independent security review.

Until this checklist is complete, use `disabled` or an isolated `sandbox`.

Related documents: [Pulse Cloud](PULSE_CLOUD.md), [Local Pulse Integration](LOCAL_PULSE_INTEGRATION.md), [Cloud Boundary ADR](ADR_0001_PULSE_CLOUD_BOUNDARY.md), [Release Policy](RELEASE_POLICY.md).
