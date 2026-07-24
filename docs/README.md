# Документация Nexora

Официальная точка входа в product, architecture, security, operations, testing и release documentation.

## Current status

| Параметр | Значение |
|---|---|
| Current repository version | `3.3.4` |
| Branch | `release/3.3.4-post-mls` |
| Pull request | `#70` |
| Classification | Post-MLS Baseline release candidate |
| Publication | Pending final CI, merge, official `v3.3.4` release and asset re-download smoke |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Legacy Trust/MLS API | retired; writes return `410/LEGACY_READ_ONLY` |
| Local Server database | SQLite schema 8 compatibility layer |
| Independent review | Deferred to Nexora 3.4.0 stable gates |

Nexora 3.3.4 removes executable Trust/MLS runtime and restores ordinary server-readable messaging as the only writable messaging core. Legacy ciphertext, IDs, epochs, timestamps and audit provenance remain immutable and exportable without server-side decryption.

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

## Post-MLS Baseline documents

| Документ | Scope | Status |
|---|---|---|
| [Release Notes 3.3.4](releases/3.3.4/RELEASE_NOTES.md) | user-visible changes, compatibility and limitations | Release candidate |
| [Release Verification 3.3.4](releases/3.3.4/RELEASE_VERIFICATION.md) | code, tests, CI, signing class and publication evidence | In progress |
| [Security Review 3.3.4](../SECURITY_REVIEW_3.3.4.md) | internal reviewed scope, findings and closures | Internal review complete; independent review deferred to 3.4.0 |
| [Architecture](ARCHITECTURE.md) | server-readable core, legacy boundary, devices, updater and storage | Current through 3.3.4 RC |
| [Security Model](SECURITY_MODEL.md) | threats, controls and residual risks | Current through 3.3.4 RC |
| [Operations Runbook](OPERATIONS_RUNBOOK.md) | rollout, backup/restore, corrupt DB, updater and emergency stop | Current through 3.3.4 RC |
| [Project Index](../PROJECT_INDEX.md) | entrypoints, modules, API and tests | Current through 3.3.4 RC |

## Contract summary

### Writable authority

Local Server is authoritative for ordinary messages, memberships, roles, bans, policies, uploads, sessions, audit and realtime visibility. Browser guards are UX only; server-side checks remain mandatory.

### Legacy secure history

- Trust Core, MLS background work, route handlers, Socket.IO transport and encrypted-upload write runtime are removed;
- schema 8 tables preserve IDs, timestamps, epochs, ciphertext and provenance;
- legacy viewer/export never server-decrypts ciphertext;
- previously decrypted IndexedDB records may be read locally without writes;
- all legacy mutations return `410/LEGACY_READ_ONLY`.

### Sessions and devices

The device inventory is built from active sessions. Revoking a device removes its sessions, emits `session.revoked`, disconnects its Socket.IO room and refreshes `device.updated`. The current device cannot be revoked through the remote-device endpoint.

### Backup and migration

Before schema mutation, the server checks source integrity, WAL checkpoint, free space and verified backup. Restore uses staged DB/files with rollback. Verification can be executed without restore through the admin API.

### Release classification

Client and Server use separate updater metadata channels. When complete Authenticode policy is configured, signed assets verify signer subject, thumbprint and timestamp. When signing policy is absent, the same official `v3.3.4` tag is published only as an explicit `UNSIGNED-TEST` prerelease; updater metadata and blockmaps are forbidden.

## Verification

- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:check`;
- `npm run test:soak`;
- Android `assembleDebug`;
- focused Nexora 3.3 regressions;
- introductory and advanced website validation.

## 3.3.4 completion blockers

A merge, official tag or GitHub Release is prohibited while any of the following remains:

- final PR CI is not green;
- PR #70 is not reviewed and merged;
- post-merge CI is incomplete;
- annotated `v3.3.4` and GitHub Release are absent;
- published checksums or asset re-download verification are incomplete.

Authenticode credentials are optional for this prerequisite: absence forces `UNSIGNED-TEST` classification and disables updater metadata. Independent review and signed 3.3.4→3.4.0 acceptance remain Nexora 3.4.0 gates.

## Documentation status vocabulary

- **Current** — matches the referenced branch/commit.
- **Release candidate** — implementation is under validation and is not published.
- **Stable baseline** — last confirmed signed production line.
- **Release-specific** — evidence for one version; canonical files live under `docs/releases/<version>/`.
- **Historical** — architecture/migration/provenance record; not a current guarantee.
- **Blocked** — publication is explicitly prohibited until listed prerequisites are satisfied.
