# Документация Nexora

Официальная точка входа в product, architecture, security, operations, testing и release documentation.

## Current status

| Параметр | Значение |
|---|---|
| Current repository version | `3.4.0` |
| Classification | Stable Core release candidate |
| Publication | Blocked — verified `v3.3.4`, Authenticode/Windows acceptance and independent review are mandatory |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Legacy Trust/MLS runtime | removed; compatibility history is read-only |
| Local Server database | SQLite schema 8 |
| Migration | schema 8 is retained; migration is transactional/idempotent and future schemas are rejected |

`3.4.0` retires executable Trust/MLS paths and restores ordinary server-readable messaging as the sole writable core. Legacy ciphertext is preserved without server-side decryption or plaintext conversion. This branch is not a published release until every blocker in `RELEASE_VERIFICATION_3.4.0.md` is closed.

## Quick navigation

| Задача | Документ |
|---|---|
| Понять продукт | [Product Overview](PRODUCT_OVERVIEW.md) |
| Изучить модули и API | [Project Index](../PROJECT_INDEX.md) |
| Понять архитектуру | [Architecture](ARCHITECTURE.md) |
| Проверить security boundary | [Security Model](SECURITY_MODEL.md) |
| Запустить development environment | [Repository README](../README.md#быстрый-старт-для-разработки) |
| Развернуть Local Server | [Deployment Guide](DEPLOYMENT.md) |
| Администрировать | [Administrator Guide](../ADMIN_GUIDE.md) |
| Выполнять maintenance/backup/incidents | [Operations Runbook](OPERATIONS_RUNBOOK.md) |
| Провести acceptance | [Tester Guide](../TESTER_GUIDE.md) |
| Выпустить версию | [Release Policy](RELEASE_POLICY.md), [GitHub Release](GITHUB_RELEASE.md), [Checklist](RELEASE_CHECKLIST.md) |
| Получить поддержку | [Support Policy](../SUPPORT.md) |

## Stable Core documents

| Документ | Scope | Status |
|---|---|---|
| [Release Notes 3.4.0](../RELEASE_NOTES_3.4.0.md) | user-visible changes, compatibility and limitations | Release candidate |
| [Release Verification 3.4.0](../RELEASE_VERIFICATION_3.4.0.md) | code, tests, CI, signing and publication evidence | In progress |
| [Security Review 3.4.0](../SECURITY_REVIEW_3.4.0.md) | reviewed scope, findings and external review gate | External review pending |
| [Architecture](ARCHITECTURE.md) | server-readable core, legacy boundary, devices, updater and storage | Current through 3.4.0 RC |
| [Security Model](SECURITY_MODEL.md) | threats, controls and residual risks | Current through 3.4.0 RC |
| [Operations Runbook](OPERATIONS_RUNBOOK.md) | rollout, backup/restore, corrupt DB, updater and emergency stop | Current through 3.4.0 RC |
| [Project Index](../PROJECT_INDEX.md) | entrypoints, modules, API and tests | Current through 3.4.0 RC |

## Stable Core contract summary

### Writable authority

Local Server is authoritative for ordinary messages, memberships, roles, bans, policies, uploads, sessions, audit and realtime visibility. Browser guards are UX only; server-side checks remain mandatory.

### Legacy secure history

- Trust Core, MLS background work, route handlers, Socket.IO transport and encrypted-upload write runtime are removed;
- schema 8 tables preserve IDs, timestamps, ciphertext and provenance;
- legacy viewer/export never server-decrypts ciphertext;
- previously decrypted IndexedDB records may be read locally without writes;
- all legacy mutations return `410/LEGACY_READ_ONLY`.

### Sessions and devices

The device inventory is built from active sessions. Revoking a device removes its sessions, emits `session.revoked`, disconnects its Socket.IO room and refreshes `device.updated`. The current device cannot be revoked through the remote-device endpoint.

### Backup and migration

Before schema mutation, the server checks source integrity, WAL checkpoint, free space and verified backup. Restore uses staged DB/files with rollback. Verification can be executed without restore through the admin API.

### Signed updater

Client and Server use separate signed metadata channels. Stable assets require Authenticode signer identity, timestamp, checksums, no-downgrade behavior and a complete asset set. Unsigned test builds use a distinct prerelease tag and never publish updater metadata.

## Verification

- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:check`;
- `npm run test:soak`;
- Android `assembleDebug`;
- signed Windows n-1→n installed smoke when external credentials and environments are available.

## Release blockers

A merge, official tag or stable GitHub Release is prohibited while any of the following remains:

- published verified stable `v3.3.4` is absent;
- Authenticode credentials/expected signer identity are unavailable;
- Windows 10/11 installed acceptance is incomplete;
- independent review has not closed all high/critical findings;
- CI, migration, restore, security or release evidence is incomplete.

## Documentation status vocabulary

- **Current** — matches the referenced branch/commit.
- **Release candidate** — implementation is under validation and is not published.
- **Stable baseline** — last confirmed signed production line.
- **Release-specific** — immutable evidence for one version.
- **Historical** — architecture/migration/provenance record; not a current guarantee.
- **Blocked** — publication is explicitly prohibited until listed prerequisites are satisfied.
