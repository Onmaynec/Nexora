# Индекс веток Nexora

Документ фиксирует назначение и lifecycle веток. Фактические Pull Request states, branch protection и release tags в GitHub остаются authority для repository operations.

## Authoritative branch

| Branch | Product state | Documentation policy |
|---|---|---|
| `main` | Nexora `3.2.4` Source/PWA prerelease; signed production baseline `3.1.2` | Единственный current source of truth для продукта, architecture, security и release documentation |

Новая работа начинается от latest verified `main`, если approved stacked-branch plan явно не требует другого.

## Active historical draft

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.2.0-trust-core` | Early Rust/OpenMLS Trust Core foundation | Draft PR #11; superseded current implementation, release запрещён |

Эта ветка сохраняется только как development provenance. Она не является текущим product source и не должна merge/tag/publish.

## Merged release branches

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.1.0-pulse-cloud-foundation` | Pulse Cloud billing/ledger foundation | Merged/superseded |
| `agent/nexora-3.1.0-local-pulse-integration` | Schema 7 и signed Local/Cloud integration | Merged through PR #3 |
| `agent/nexora-3.1.0-productization` | Cloud Identity и Pulse Center development | Superseded by final branch |
| `agent/nexora-3.1.0-final` | Final 3.1.0 materialization | Merged through PR #5 |
| `agent/nexora-3.1.1-production-hardening` | Health, metrics, redaction, drain и audited commands | Merged through PR #8 |
| `agent/nexora-3.1.2-bugfix` | Intermediate 3.1.2 regression fixes | Superseded by final branch |
| `agent/nexora-3.1.2-final` | Verified 3.1.2 patch | Merged through PR #10 |
| `agent/nexora-3.2.0-trust-core-mls` | Trust Core, MLS и encrypted media | Merged through PR #12 |
| `agent/nexora-3.2.1-login-shutdown-fix` | Login bootstrap и Server shutdown corrections | Merged through PR #16 |
| `agent/nexora-3.2.1-performance-gate-stabilization` | Warmed strict Windows performance boundary | Merged through PR #18 |
| `agent/nexora-3.2.2-trust-bootstrap-race` | Trust layout/draft lifecycle correction | Merged through PR #19 |
| `agent/nexora-3.2.3-security-hardening` | Trust resource limits, route controls, strict recovery и cleanup | Merged through PR #20 |
| `agent/nexora-3.2.4-updater-mls-recovery` | Updater, Server console, automatic MLS Welcome, post-update UX и diagnostics | Merged through PR #21 |

## Merged documentation branches

| Branch | Purpose | Status |
|---|---|---|
| `docs/community-standards` | Community Standards и repository documentation | Merged through PR #2 |
| `docs/sync-3.1.2` | Stable 3.1.2 documentation synchronization | Merged through PR #13 |
| `docs/branch-status-index` | Central branch-status index | Merged through PR #14 |
| `docs/official-product-documentation-3.2.0` | Official product documentation foundation | Merged through PR #17 |
| `docs/official-product-documentation-3.2.3` | Current product/security/operations documentation | Merged through PR #23 |

## Closed synchronization helper

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.2.0-main-sync` | Temporary main synchronization | Closed; no release role |

## Obsolete automation branches

| Branch | Historical purpose | Required handling |
|---|---|---|
| `automation/nexora-3.1.0-tag` | Historical tag automation attempt | Do not merge/publish; close/delete after provenance review |
| `automation/nexora-3.1.0-finalize` | Historical finalization attempt | Do not merge/publish; close/delete after provenance review |

## Governance rules

1. `main` — единственный current product source of truth.
2. Development branch различает implemented, verified и planned scope.
3. Merged/superseded branches не обновляются так, чтобы имитировать текущую версию.
4. Release claims требуют совпадающих SemVer metadata, CI evidence и distribution state.
5. Prerelease security claims не представляются как stable или independently audited.
6. Branch без active purpose закрывается/удаляется после сохранения необходимого provenance.
7. Documentation-only branch не меняет runtime code, dependencies, migrations или workflows.
8. Security patch branch хранит regression-first evidence и explicit compatibility statement.

## Current product boundary

- current repository version: `3.2.4`;
- distribution: Source/PWA prerelease;
- signed production baseline: `3.1.2`;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- Local Server database: schema 8;
- migration from 3.2.0–3.2.3: not required;
- independently audited E2EE claim: not granted.
