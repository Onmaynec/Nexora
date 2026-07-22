# Nexora Branch Status Index

Этот файл фиксирует назначение и актуальность веток репозитория. Он не заменяет GitHub branch protection, Pull Request status или release tags.

## Authoritative branches

| Branch | Status | Documentation policy |
|---|---|---|
| `main` | Stable Nexora 3.1.2 | Единственный источник актуальной production-документации для stable release |
| `agent/nexora-3.2.0-trust-core` | Draft Trust Core foundation, PR #11 | Branch-local experimental docs; не заявляет release-ready E2EE |
| `agent/nexora-3.2.0-trust-core-mls` | Draft Trust Core/MLS integration, PR #12 | Branch-local experimental docs; production use запрещён |

## Merged or superseded development branches

| Branch | Historical purpose | Status |
|---|---|---|
| `docs/community-standards` | Community Standards and repository documentation cleanup | Merged through PR #2 |
| `agent/nexora-3.1.0-pulse-cloud-foundation` | Isolated Pulse Cloud billing/ledger foundation | Merged/superseded |
| `agent/nexora-3.1.0-local-pulse-integration` | Local Server schema 7 and signed Cloud integration | Merged/superseded |
| `agent/nexora-3.1.0-productization` | Cloud Identity, Pulse Center and productization | Superseded by final 3.1.0 branch |
| `agent/nexora-3.1.0-final` | Final 3.1.0 release materialization | Merged through PR #5 |
| `agent/nexora-3.1.1-production-hardening` | Health, metrics, redacted logs, drain and audited commands | Merged through PR #8 |
| `agent/nexora-3.1.2-bugfix` | Intermediate 3.1.2 regression fixes | Superseded by clean final branch |
| `agent/nexora-3.1.2-final` | Verified 3.1.2 final branch | Merged through PR #10 |
| `docs/sync-3.1.2` | Stable documentation synchronization | Merged through PR #13 |
| `docs/branch-status-index` | Central branch-status index and README link | Merged through PR #14 |

## Obsolete automation branches

| Branch | Purpose | Required action |
|---|---|---|
| `automation/nexora-3.1.0-tag` | Historical 3.1.0 tag automation attempt | Не merge/tag; допускается закрытие/удаление после review |
| `automation/nexora-3.1.0-finalize` | Historical 3.1.0 finalization attempt | Не merge/tag; допускается закрытие/удаление после review |

## Rules

1. Новая stable-разработка начинается от актуального `main`.
2. Historical branches не обновляются до текущего продукта путём изменения version claims: они сохраняют branch-local implementation history и получают явный `BRANCH_STATUS.md`.
3. Development branch должна отличать реализованное, проверенное и запланированное.
4. Нельзя переносить claims из experimental 3.2.0 branches в stable README/security/release notes до merge и полного release gate.
5. Release публикуется только из verified commit/tag с совпадающей SemVer metadata.
6. Branch без active purpose после merge закрывается или удаляется после сохранения необходимой audit/release provenance.

## Current product boundary

- Stable: Nexora 3.1.2, API v3, Local Server schema 7.
- Stable E2EE: отсутствует.
- Trust Core/MLS 3.2.0: experimental, draft, не предназначен для production/private communications.
