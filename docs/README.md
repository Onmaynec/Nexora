# Документация Nexora

Официальная точка входа в product, architecture, security, operations, testing и release documentation.

## 1. Current status

| Параметр | Значение |
|---|---|
| Current repository version | `3.3.3` |
| Distribution | Published `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |
| Local Server migration from 3.2.0–3.3.2 | не требуется |
| Independent E2EE/security audit | не завершён |

Nexora 3.3.3 — исправляющий выпуск для Electron и Web/PWA: исправлены коллективные цели, UX голосовых, применение Pulse effects, идемпотентность списаний и fail-closed MLS recovery. Security boundary, schema 8, API v3 и Trust/MLS API v4 сохранены.

## 2. Быстрый выбор

| Задача | Документ |
|---|---|
| Понять продукт | [Product Overview](PRODUCT_OVERVIEW.md) |
| Посмотреть план развития | [Roadmap](ROADMAP.md) |
| Запустить development environment | [Repository README](../README.md#быстрый-старт-для-разработки) |
| Развернуть Local Server | [Deployment Guide](DEPLOYMENT.md) |
| Администрировать | [Administrator Guide](../ADMIN_GUIDE.md) |
| Выполнять maintenance/backup/incidents | [Operations Runbook](OPERATIONS_RUNBOOK.md) |
| Провести acceptance | [Tester Guide](../TESTER_GUIDE.md) |
| Проверить security boundary | [Security Model](SECURITY_MODEL.md) |
| Выпустить версию | [Release Policy](RELEASE_POLICY.md) и [Checklist](RELEASE_CHECKLIST.md) |
| Найти release-specific материалы | [Release Documentation](releases/README.md) |
| Понять статус ветки | [Branch Index](../BRANCHES.md) и [Branch Documentation Policy](BRANCH_DOCUMENTATION_POLICY.md) |
| Получить поддержку | [Support Policy](../SUPPORT.md) |

## 3. Product и architecture

| Документ | Scope | Status |
|---|---|---|
| [Product Overview](PRODUCT_OVERVIEW.md) | purpose, platforms, capabilities, boundaries | Current through 3.3.3 |
| [Architecture](ARCHITECTURE.md) | components, data flow, storage, updater, Trust/MLS | Current through 3.3.3 |
| [Project Index](../PROJECT_INDEX.md) | entrypoints, modules, API, tests | Current through 3.3.3 |
| [Security Model](SECURITY_MODEL.md) | threat model, controls, metadata, residual risk | Current through 3.3.3 |
| [Pulse Cloud Boundary ADR](ADR_0001_PULSE_CLOUD_BOUNDARY.md) | Local Server / Cloud authority separation | Current decision |

## 4. Security

| Документ | Назначение | Status |
|---|---|---|
| [Security Policy](../SECURITY.md) | supported versions and private disclosure | Current through 3.3.3 |
| [Security Verification Summary](../SECURITY_AUDIT.md) | automated verification and residual risk | Current through 3.3.3 |
| [Security Review 3.3.0](../releases/3.3.0/SECURITY_REVIEW.md) | security foundation inherited and extended by 3.3.3 fixes | Historical release-specific |
| [Release Verification 3.3.3](releases/3.3.3/RELEASE_VERIFICATION.md) | test, security invariant and publication contract | Release-specific current |
| [Security Review 3.2.3](../releases/3.2.3/SECURITY_REVIEW.md) | resource governance hardening | Historical release-specific |
| [Trust Core 3.2.0](TRUST_CORE_3.2.0.md) | original Trust/MLS foundation | Historical foundation |
| [Schema 8 Migration](MIGRATION_3.2.0.md) | schema 7 → 8 and rollback | Current schema history |

## 5. Deployment и operations

| Документ | Назначение |
|---|---|
| [Deployment Guide](DEPLOYMENT.md) | topology, TLS, database, release channels |
| [Administrator Guide](../ADMIN_GUIDE.md) | users, rooms, Trust, Pulse, updates |
| [Operations Runbook](OPERATIONS_RUNBOOK.md) | startup, monitoring, backup, restore, incidents |
| [GitHub Release Guide](GITHUB_RELEASE.md) | tags, signing, assets, updater |
| [Release Checklist](RELEASE_CHECKLIST.md) | automated/manual gates |

## 6. Testing

- [Acceptance Test Guide](../TESTER_GUIDE.md);
- [Release Verification 3.3.3](releases/3.3.3/RELEASE_VERIFICATION.md);
- [Security Verification Summary](../SECURITY_AUDIT.md);
- `npm run release:check`;
- `npm run test:soak`;
- Android `assembleDebug`.

## 7. Pulse и Cloud Identity

| Документ | Назначение |
|---|---|
| [Pulse Product Boundary](PULSE.md) | product modes and authority |
| [Pulse Cloud](PULSE_CLOUD.md) | Cloud service, billing, ledger, provider |
| [Cloud Identity](CLOUD_IDENTITY.md) | email, MFA, OAuth PKCE |
| [Local Pulse Integration](LOCAL_PULSE_INTEGRATION.md) | signed Local/Cloud contract and cache |

## 8. Releases

| Документ | Назначение |
|---|---|
| [Release Notes 3.3.3](releases/3.3.3/RELEASE_NOTES.md) | current patch scope and user impact |
| [Release Verification 3.3.3](releases/3.3.3/RELEASE_VERIFICATION.md) | authoritative gate and security invariants |
| [Release Documentation Index](releases/README.md) | versioned release material and storage rules |
| [Changelog](../CHANGELOG.md) | canonical chronological release history |
| [Release Policy](RELEASE_POLICY.md) | SemVer/classifications/gates |
| [GitHub Release Guide](GITHUB_RELEASE.md) | tags/assets/updater |
| [Current Release Status](../BRANCH_STATUS.md) | current classification and limitations |

## 9. Platforms и integrations

- [Android](../android/README.md);
- [Automations](AUTOMATIONS.md);
- [Project website](../website/README.md).

## 10. Branch documentation

`main` — единственный current product source of truth.

Каждая сохраняемая non-main branch должна иметь `BRANCH_STATUS.md` и одну из classifications:

- Active development;
- Merged provenance;
- Superseded;
- Obsolete automation.

Historical branch documentation describes that branch only. It is not updated to claim current 3.3.3 behavior. Complete rules: [Branch Documentation Policy](BRANCH_DOCUMENTATION_POLICY.md). Central lifecycle index: [BRANCHES.md](../BRANCHES.md).

## 11. Document status vocabulary

- **Current** — matches current `main`.
- **Release-specific** — fixed evidence for one release; not rewritten.
- **Stable baseline** — last confirmed signed production line.
- **Prerelease** — implementation/automated gates complete, full signing/manual/external review incomplete.
- **Historical foundation** — architecture/migration/provenance record.
- **Superseded** — replaced by later branch/release.
- **Draft** — incomplete development, not product guarantee.

## 12. Documentation standard

1. State version, branch and classification.
2. Separate implementation, automated evidence, manual evidence and planned work.
3. Scope security claims precisely.
4. Preserve release/branch provenance.
5. Use relative links.
6. Never include secrets, private keys, databases, backups or real user data.
7. Update guides, policy, notes, verification and changelog when behavior changes.
8. Release-specific documents belong in `docs/releases/<version>/`.
9. Documentation-only work must not modify runtime code, dependencies, migrations or release behavior.
