const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'architecture-overview', group: 'architecture', icon: 'Network', title: both('Обзор архитектуры', 'Architecture overview'),
    description: both('Клиент, Local Server и Pulse Cloud.', 'Client, Local Server, and Pulse Cloud.'),
    body: both(
`# Обзор архитектуры

Nexora состоит из трёх контуров с различной ответственностью.

## Client

React/Vite application отвечает за интерфейс, локальное/offline state, outbox, device keys, MLS encryption/decryption и local secure-media preview. Windows Electron, browser/PWA и Android shell используют общий web application contract.

## Local Server

Local Server является authority для local users, sessions, rooms, roles, bans, policies, invitation lifecycle, message ordering, ciphertext persistence, uploads, audit, backup и realtime fan-out. Все privileged operations проверяются сервером.

## Pulse Cloud

Pulse Cloud является отдельным authority для Cloud Identity, MFA/OAuth, billing provider integration, Impulse ledger, receipts и production entitlements. Он не должен становиться хранилищем local room history, files или private Trust material.

## Data flow

\`\`\`mermaid
graph LR
  A[Windows / PWA / Android] --> B[React Client]
  B -->|HTTPS + Socket.IO| C[Local Server]
  B -->|MLS ciphertext| C
  C --> D[(SQLite schema 8)]
  B -. cloud identity / entitlement .-> E[Pulse Cloud]
  E --> F[Payment provider]
\`\`\`

## Design rule

При изменении функции сначала определите authority. UI может скрыть действие, но security decision, policy enforcement и data integrity остаются на server side.`,
`# Architecture overview

Nexora has three authority domains with distinct responsibilities.

## Client

The React/Vite application owns UI, local and offline state, the outbox, device keys, MLS encryption/decryption, and local secure-media previews. Windows Electron, browser/PWA, and the Android shell share the same web application contract.

## Local Server

Local Server is authoritative for local users, sessions, rooms, roles, bans, policies, invitation lifecycle, message ordering, ciphertext persistence, uploads, audit, backups, and realtime fan-out. Every privileged operation is enforced server-side.

## Pulse Cloud

Pulse Cloud is a separate authority for Cloud Identity, MFA/OAuth, billing-provider integration, the Impulse ledger, receipts, and production entitlements. It must not become storage for local room history, files, or private Trust material.

## Data flow

\`\`\`mermaid
graph LR
  A[Windows / PWA / Android] --> B[React Client]
  B -->|HTTPS + Socket.IO| C[Local Server]
  B -->|MLS ciphertext| C
  C --> D[(SQLite schema 8)]
  B -. cloud identity / entitlement .-> E[Pulse Cloud]
  E --> F[Payment provider]
\`\`\`

## Design rule

Before changing a feature, identify its authority domain. The UI may hide an action, but security decisions, policy enforcement, and data integrity remain server-side.`),
  },
  {
    id: 'server-architecture', group: 'architecture', icon: 'DatabaseZap', title: both('Архитектура сервера', 'Server architecture'),
    description: both('Composition root, storage, API, realtime и operations.', 'Composition root, storage, API, realtime, and operations.'),
    body: both(
`# Архитектура Local Server

## Composition

Production composition находится в \`server/create-server.cjs\` и подключает API v3/v4, Socket.IO, store, Trust/MLS, media и operational runtime. Вспомогательные modules должны подключаться через существующий composition root, а не создавать параллельный server stack.

## Persistence

SQLite schema 8 хранит local authority data, ciphertext и operational records. Mutations сериализуются и используют transactions для связанных изменений. Migration обязана сохранять старые комнаты и иметь downgrade protection.

## Authorization pipeline

Типовая операция проверяет authentication, resource, membership, active ban, role/permission, room policy, validation, rate/resource limits и transactional preconditions. После commit создаются audit/system events и только затем выполняется authorized realtime fan-out.

## Operational runtime

Liveness, readiness, protected metrics, request IDs, credential redaction, drain и serialized shutdown являются частью product contract. Ошибки не должны раскрывать stack, SQL, token или filesystem secrets.

## Module boundaries

- \`security.cjs\` — sessions, passwords и CSRF;
- \`model.cjs\` — access/role helpers;
- \`store.cjs\`/schema modules — persistence и migrations;
- \`trust-*\` — device/MLS/recovery;
- \`maintenance.cjs\` — backup, retention, quota и cleanup;
- \`events.cjs\` — monotonic visibility-aware event stream.`,
`# Local Server architecture

## Composition

Production composition lives in \`server/create-server.cjs\` and mounts API v3/v4, Socket.IO, storage, Trust/MLS, media, and operational runtime. New modules should attach through the existing composition root rather than creating a parallel server stack.

## Persistence

SQLite schema 8 stores local authority data, ciphertext, and operational records. Mutations are serialized and related changes use transactions. Migrations must preserve existing rooms and include downgrade protection.

## Authorization pipeline

A typical operation validates authentication, resource, membership, active bans, role/permission, room policy, input, rate/resource limits, and transactional preconditions. Audit and system events are created after commit, followed by authorized realtime fan-out.

## Operational runtime

Liveness, readiness, protected metrics, request IDs, credential redaction, drain, and serialized shutdown are part of the product contract. Errors must not expose stack traces, SQL, tokens, or filesystem secrets.

## Module boundaries

- \`security.cjs\` — sessions, passwords, and CSRF;
- \`model.cjs\` — access and role helpers;
- \`store.cjs\` and schema modules — persistence and migrations;
- \`trust-*\` — devices, MLS, and recovery;
- \`maintenance.cjs\` — backup, retention, quota, and cleanup;
- \`events.cjs\` — monotonic visibility-aware event stream.`),
  },
  {
    id: 'client-architecture', group: 'architecture', icon: 'PanelsTopLeft', title: both('Архитектура клиента', 'Client architecture'),
    description: both('React shell, offline state, outbox и Trust runtime.', 'React shell, offline state, outbox, and Trust runtime.'),
    body: both(
`# Архитектура клиента

## Application shell

\`client/src/App.jsx\` выполняет auth bootstrap до Trust configuration, управляет offline fallback и lifecycle outbox. Workspace выбирает rooms/conversations/settings и связывает UI с API/realtime state.

## Messaging surfaces

Legacy и secure conversations имеют разные message panes. Secure path не должен silently downgrade к plaintext legacy endpoint. Media preview выполняется после local validation/decryption.

## Offline-first

IndexedDB cache и durable outbox позволяют читать cached state и повторять idempotent mutations. Сервер остаётся authority: reconnect выполняет delta/bootstrap sync и разрешает conflicts по server state.

## Trust state

Device identity, MLS private state, KeyPackages, decrypted cache и drafts хранятся локально в encrypted storage. Revocation и logout должны очищать scoped private state.

## UX responsibilities

Клиент показывает loading/success/error, denied actions, room policies, upload progress, slow-mode timer, invitation/request state и explicit confirmations для destructive operations. Hidden UI не заменяет server guard.`,
`# Client architecture

## Application shell

\`client/src/App.jsx\` completes authentication bootstrap before Trust configuration, then manages offline fallback and outbox lifecycle. Workspace selects rooms, conversations, and settings while binding UI to API and realtime state.

## Messaging surfaces

Legacy and secure conversations use separate message panes. The secure path must never silently downgrade to a plaintext legacy endpoint. Media previews are produced only after local validation and decryption.

## Offline-first

IndexedDB cache and a durable outbox support cached reads and retry of idempotent mutations. The server remains authoritative: reconnect performs delta or bootstrap sync and resolves conflicts against server state.

## Trust state

Device identity, MLS private state, KeyPackages, decrypted cache, and drafts live in encrypted local storage. Revocation and logout clear the relevant private scope.

## UX responsibilities

The client displays loading, success, errors, permission denial, room policies, upload progress, slow-mode timers, invitation/request state, and explicit confirmation for destructive actions. Hidden UI never replaces a server guard.`),
  },
  {
    id: 'pulse-architecture', group: 'architecture', icon: 'Orbit', title: both('Nexora Pulse', 'Nexora Pulse'),
    description: both('Cloud Identity, ledger и entitlement boundary.', 'Cloud Identity, ledger, and entitlement boundary.'),
    body: both(
`# Nexora Pulse architecture

Pulse разделяет local messaging authority и коммерческий cloud authority.

## Cloud Identity

Email verification, MFA, OAuth 2.1 Authorization Code + PKCE и cloud sessions принадлежат Pulse Cloud. Local Account связывается с Cloud Account подписанным flow, не передавая local password.

## Commerce

Plus subscription, Impulse double-entry ledger, purchases, receipts и room goals выполняются в cloud transaction boundary. Цена и entitlement определяются сервером; client value не является authoritative.

## Local cache

Local Server может хранить verified entitlement cache и event sync state, но production entitlement принимается только от подписанного Pulse Cloud contract. Sandbox существует для QA/demo и явно отделён от production signatures/payment provider.

## Isolation

Pulse Cloud не хранит local message plaintext/ciphertext, room history, local uploads, Local CA key или Trust private keys. Любая новая integration должна пройти data-flow review на предмет authority creep.`,
`# Nexora Pulse architecture

Pulse separates local messaging authority from the commercial cloud authority.

## Cloud Identity

Email verification, MFA, OAuth 2.1 Authorization Code with PKCE, and cloud sessions belong to Pulse Cloud. Local Account linking uses a signed flow and does not disclose the local password.

## Commerce

Plus subscriptions, the Impulse double-entry ledger, purchases, receipts, and room goals execute inside the cloud transaction boundary. Prices and entitlements are server-defined; client-supplied values are never authoritative.

## Local cache

Local Server may cache verified entitlements and event-sync state, but production entitlements are accepted only through the signed Pulse Cloud contract. Sandbox mode is for QA and demos and is explicitly separated from production signatures and payment providers.

## Isolation

Pulse Cloud does not store local message plaintext or ciphertext, room history, local uploads, the Local CA private key, or Trust private keys. Every new integration requires data-flow review for authority creep.`),
  },
  {
    id: 'database-schema', group: 'architecture', icon: 'TableProperties', title: both('База данных и schema 8', 'Database and schema 8'),
    description: both('Migration, invariants, backup и downgrade protection.', 'Migrations, invariants, backups, and downgrade protection.'),
    body: both(
`# База данных и schema 8

## Storage engine

Local Server использует SQLite с WAL/FULL-style durability controls, serialized mutation queue и integrity checks. Schema 8 добавляет Trust/MLS persistence поверх предыдущих схем.

## Migration rules

- migration выполняется автоматически при startup;
- старые данные сохраняются или преобразуются deterministically;
- новые поля получают безопасные defaults;
- model/types/seeds/fixtures обновляются вместе;
- повторный запуск migration идемпотентен;
- более старый runtime не должен молча открыть более новую schema.

## Critical invariants

- room имеет ровно одного owner;
- invite usage и join атомарны;
- transfer ownership обновляет roles, audit и system message атомарно;
- pending secure attachment claim одноразовый;
- ledger posting сохраняет double-entry balance;
- Trust epoch/Welcome/KeyPackage state защищён от replay.

## Backup/restore

Backup считается готовым только после integrity verification и test restore. Restore требует maintenance/drain и проверки schema/application compatibility.`,
`# Database and schema 8

## Storage engine

Local Server uses SQLite with WAL/FULL-style durability controls, a serialized mutation queue, and integrity checks. Schema 8 adds Trust/MLS persistence on top of earlier schemas.

## Migration rules

- migrations run automatically during startup;
- existing data is preserved or transformed deterministically;
- new fields receive safe defaults;
- models, types, seeds, and fixtures change together;
- repeated migration is idempotent;
- an older runtime must not silently open a newer schema.

## Critical invariants

- every room has exactly one owner;
- invite consumption and join are atomic;
- ownership transfer updates roles, audit, and system message atomically;
- pending secure attachment claims are one-time;
- ledger postings preserve double-entry balance;
- Trust epoch, Welcome, and KeyPackage state resists replay.

## Backup and restore

A backup is valid only after integrity verification and a test restore. Restore requires maintenance or drain mode plus schema/application compatibility checks.`),
  }
];
