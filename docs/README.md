# Документация Nexora

Официальная точка входа в product, architecture, security, operations, testing и release documentation.

## Current status

| Параметр | Значение |
|---|---|
| Current repository version | `3.5.0` |
| Classification | Published Mobile Continuity — unsigned distribution |
| Publication | `v3.5.0` published as a normal GitHub Release; manual installation; unsigned Windows/Android artifacts |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Legacy Trust/MLS runtime | removed; compatibility history is read-only |
| Local Server database | SQLite schema 9 |
| Migration | additive schema 8 → 9 migration is transactional/idempotent; backups and future-schema rejection remain mandatory |

`3.5.0` adds Mobile Continuity on top of the Stable Core baseline: replay/outbox ordering, profile-isolated caches, safe PWA updates, Android lifecycle/deep links, device-scoped push and resumable media. Version `v3.5.0` is published. Desktop updater metadata is intentionally absent: these unsigned artifacts are not accepted by the signed updater. Consult [3.5.0 release notes](releases/3.5.0/RELEASE_NOTES.md) and verify `SHA256SUMS.txt` before installation.

## Quick navigation

| Задача | Документ |
|---|---|
| Понять продукт | [Product Overview](PRODUCT_OVERVIEW.md) |
| Изучить модули и API | [Project Index](../PROJECT_INDEX.md) |
| Понять архитектуру | [Architecture](ARCHITECTURE.md) |
| Проверить security boundary | [Security Model](SECURITY_MODEL.md) |
| Запустить development environment | [Repository README](../README.md#development) |
| Развернуть Local Server | [Deployment Guide](DEPLOYMENT.md) |
| Администрировать | [Administrator Guide](../ADMIN_GUIDE.md) |
| Выполнять maintenance/backup/incidents | [Operations Runbook](OPERATIONS_RUNBOOK.md) |
| Провести acceptance | [Tester Guide](../TESTER_GUIDE.md) |
| Выпустить версию | [Release Policy](RELEASE_POLICY.md), [GitHub Release](GITHUB_RELEASE.md), [Checklist](RELEASE_CHECKLIST.md) |
| Получить поддержку | [Support Policy](../SUPPORT.md) |

## Mobile Continuity documents

| Документ | Scope | Status |
|---|---|---|
| [Release Notes 3.5.0](../RELEASE_NOTES_3.5.0.md) | user-visible changes, compatibility and limitations | Published unsigned release |
| [Release Verification 3.5.0](../RELEASE_VERIFICATION_3.5.0.md) | code, tests, CI, unsigned-state and publication evidence | Published release evidence |
| [Security Review 3.4.0](../SECURITY_REVIEW_3.4.0.md) | reviewed scope, findings and external review gate | External review pending |
| [Architecture](ARCHITECTURE.md) | server-readable core, legacy boundary, devices, updater and storage | Architecture reference; see 3.5.0 notes for changes |
| [Security Model](SECURITY_MODEL.md) | threats, controls and residual risks | Security reference; see release evidence for verification |
| [Operations Runbook](OPERATIONS_RUNBOOK.md) | rollout, backup/restore, corrupt DB, updater and emergency stop | Operator reference |
| [Project Index](../PROJECT_INDEX.md) | entrypoints, modules, API and tests | Current 3.5.0 source |

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

## Distribution and next release

`v3.5.0` is the published latest release on GitHub. Windows installers and the Android APK are explicitly unsigned; installation is manual. Their checksums and unsigned-state evidence are shipped alongside the binaries. This is not a signed-production claim.

The ongoing `3.6.0 Connect` implementation is tracked in [Issue #77](https://github.com/Onmaynec/Nexora/issues/77) and [draft PR #110](https://github.com/Onmaynec/Nexora/pull/110). Its source, security, platform acceptance, signing and publication blockers belong to the 3.6.0 verification record; they do not retroactively make `v3.5.0` unpublished.

## Documentation status vocabulary

- **Current** — matches the referenced branch/commit.
- **Release candidate** — implementation is under validation and is not published.
- **Stable baseline** — last confirmed signed production line.
- **Release-specific** — immutable evidence for one version.
- **Historical** — architecture/migration/provenance record; not a current guarantee.
- **Blocked** — publication is explicitly prohibited until listed prerequisites are satisfied.
