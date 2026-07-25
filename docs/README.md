# Документация Nexora

Официальная точка входа в product, architecture, security, operations, testing и release documentation.

## Current status

| Параметр | Значение |
|---|---|
| Current repository version | `3.6.0` |
| Classification | Connect implementation candidate |
| Publication | Blocked pending exact-head gates, independent review, production TURN, signing and installed cross-platform acceptance |
| Published source baseline | Nexora `3.5.0` Mobile Continuity |
| Signed production baseline | `3.1.2` |
| Application API | v3, additively extended |
| Legacy Trust/MLS runtime | removed; compatibility history remains read-only |
| Local Server database | SQLite schema 10 |
| Migration | additive schema 9 → 10 with integrity/free-space/verified backup/transaction/downgrade protection |

Nexora 3.6.0 adds contacts, request/block lifecycle, privacy-aware presence and read receipts, one-to-one WebRTC voice calls, short-lived TURN credentials, minimal call history and safe profile deep links. It is not a published stable release until every blocker in the canonical verification/evidence records is closed.

## Quick navigation

| Задача | Документ |
|---|---|
| Понять продукт и статус | [Repository README](../README.md), [Product Overview](PRODUCT_OVERVIEW.md) |
| Изучить модули и API | [Project Index](../PROJECT_INDEX.md) |
| Понять архитектуру/schema 10/call boundary | [Architecture](ARCHITECTURE.md) |
| Проверить threats and controls | [Security Model](SECURITY_MODEL.md), [Security Policy](../SECURITY.md) |
| Развернуть Local Server | [Deployment Guide](DEPLOYMENT.md) |
| Настроить TURN/rollout/rollback/incidents | [Operations Runbook](OPERATIONS_RUNBOOK.md) |
| Администрировать | [Administrator Guide](../ADMIN_GUIDE.md) |
| Провести acceptance | [Tester Guide](../TESTER_GUIDE.md) |
| Выпустить версию | [Release Policy](RELEASE_POLICY.md), [GitHub Release](GITHUB_RELEASE.md), [Checklist](RELEASE_CHECKLIST.md) |
| Получить поддержку | [Support Policy](../SUPPORT.md) |

## Canonical Connect 3.6.0 documents

| Документ | Назначение | Статус |
|---|---|---|
| [Release Notes](releases/3.6.0/RELEASE_NOTES.md) | user result, migration, compatibility, security and prerequisites | Candidate |
| [Release Verification](releases/3.6.0/RELEASE_VERIFICATION.md) | implementation, test and release evidence ledger | In progress |
| [Current release evidence](../release-evidence/current.json) | machine-readable identity, policy, blockers and asset plan | Blocking authority |
| [Architecture](ARCHITECTURE.md) | authority split, schema 10, contacts/privacy/calls/realtime | Current |
| [Security Model](SECURITY_MODEL.md) | threats, server controls and residual risks | Current candidate |
| [Operations Runbook](OPERATIONS_RUNBOOK.md) | TURN, migration, incident, rollback and release operations | Current |
| [Tester Guide](../TESTER_GUIDE.md) | negative/race/direct-API/platform acceptance matrix | Current |
| [Release Policy](RELEASE_POLICY.md) | signed-only classification and evidence gates | Current |

Root `RELEASE_NOTES_3.6.0.md` and `RELEASE_VERIFICATION_3.6.0.md` are compatibility pointers to canonical content; they must not duplicate it.

## Connect contract summary

### Contacts and requests

- states are `pending`, `accepted`, `rejected`, `cancelled`, `expired`;
- transitions are server-owned, transactional through the store and idempotent where retry-sensitive;
- search is cursor-paginated, rate-limited and privacy-filtered;
- block removes contact/cancels pending requests and prevents calls/presence detail;
- unblock never restores contact automatically.

### Presence and read receipts

- presence: `everyone`, `contacts`, `shared_rooms`, `nobody`;
- last seen: `exact`, `approximate`, `hidden`;
- read receipts are evaluated server-side for history serialization and realtime recipients;
- privacy changes replace current visibility without reconnect;
- multi-device status remains online while at least one valid socket/session exists.

### Direct voice calls

- server-owned states: ringing, connecting, active, reconnecting and terminal outcomes;
- authenticated Socket.IO signaling is participant/session-bound;
- signal shape, size, sequence, expiry, replay and rate limits are enforced;
- TURN credentials are short-lived and generated from protected server configuration;
- call history stores minimal metadata only; server does not record media, SDP or ICE candidates;
- block/session revoke/shutdown terminate access and emit a terminal state.

### Profiles and deep links

- profile fields depend on self/contact/shared-room/block scope;
- links contain current Server ID, object type and stable ID, never tokens/content;
- wrong/hidden/missing object resolves to a generic safe state;
- Electron/Android navigation stays origin-allowlisted.

## Data and migration

Schema 10 adds:

- `connect_privacy`;
- `connect_call_history` plus participant/time indexes;
- `connect_idempotency` plus expiry index;
- `connect_audit` plus actor/target indexes.

Startup migration sequence checks schema prerequisite, source integrity, free space and backup, executes one immediate transaction, then checks destination integrity. Future schema fails closed. Restore paths retain migration/downgrade enforcement.

## Security authority

Local Server is authoritative for:

1. authentication and active device/session;
2. Origin/CSRF;
3. resource existence and scope;
4. contact/block/privacy and room policy;
5. call participant/session binding;
6. state transitions and idempotency;
7. input bounds, rate limits and quotas;
8. audit and realtime recipient filtering.

Client-side hidden/disabled actions are UX only. Required behavior is tested through direct REST and Socket.IO paths.

## Verification

```bash
npm ci
npm run release:consistency
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

External acceptance additionally requires signed installed Windows/Android builds, installed PWA behavior, production TURN and the Windows↔Android/PWA call matrix.

## Release blockers

Merge-to-release, official tag and GitHub Release are prohibited while any remains:

- source/CI/review failure on exact head;
- unresolved high/critical security finding;
- production TURN not configured/verified;
- Windows 10/11 signed installed acceptance incomplete;
- Android/PWA and cross-platform call acceptance incomplete;
- protected Windows/Android signing identities unavailable;
- asset/signature/checksum/re-download evidence incomplete.

## Status vocabulary

- **Current** — matches the referenced branch/commit.
- **Implementation candidate** — code exists but required source/external/release gates remain.
- **Release candidate** — source approval complete but external/signing/publication gate remains.
- **Stable signed** — immutable normal GitHub Release with verified signed assets and updater metadata.
- **Historical** — provenance record; not a current guarantee.
- **Blocked** — publication explicitly prohibited until listed prerequisites are satisfied.
