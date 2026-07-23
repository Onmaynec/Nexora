# Индекс веток Nexora

Документ фиксирует назначение и lifecycle всех известных сохраняемых веток. Git refs, Pull Request states, tags и branch protection в GitHub остаются authority для repository operations.

## 1. Authoritative branch

| Branch | Product state | Documentation policy |
|---|---|---|
| `main` | Nexora `3.3.2` published `UNSIGNED-TEST` prerelease; signed production baseline `3.1.2` | Единственный current source of truth |

New work starts from latest verified `main`, если approved stacked-branch plan явно не требует другого.

## 2. Active development / open provenance

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.2.5-ui-console-performance` | Planned 3.2.5 UX, Pulse persistence, MLS Welcome and Windows-build corrections | Active draft PR #25; not release-approved |
| `agent/nexora-3.2.0-trust-core` | Early Rust/OpenMLS Trust Core foundation | Closed PR #11; superseded by current `ts-mls` implementation; release prohibited |

The 3.2.5 branch is historical development, not current product documentation. The early Rust/OpenMLS branch remains only as historical provenance and must not merge, tag or publish without a new RFC, rebase and security review.

## 3. Merged release branches

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.1.0-pulse-cloud-foundation` | Pulse Cloud billing/ledger foundation | Merged/superseded by 3.1.0 |
| `agent/nexora-3.1.0-local-pulse-integration` | Schema 7 and signed Local/Cloud integration | Merged through PR #3 |
| `agent/nexora-3.1.0-productization` | Cloud Identity and Pulse Center development | Superseded by final 3.1.0 branch |
| `agent/nexora-3.1.0-final` | Final 3.1.0 materialization | Merged through PR #5 |
| `agent/nexora-3.1.1-production-hardening` | Health, metrics, redaction, drain, commands | Merged through PR #8 |
| `agent/nexora-3.1.2-bugfix` | Intermediate 3.1.2 corrections | Superseded by final branch |
| `agent/nexora-3.1.2-final` | Verified 3.1.2 patch | Merged through PR #10 |
| `agent/nexora-3.2.0-trust-core-mls` | Trust Core, MLS and encrypted media | Merged through PR #12 |
| `agent/nexora-3.2.1-login-shutdown-fix` | Login bootstrap and Server shutdown | Merged through PR #16 |
| `agent/nexora-3.2.1-performance-gate-stabilization` | Warmed Windows performance boundary | Merged through PR #18 |
| `agent/nexora-3.2.2-trust-bootstrap-race` | Trust configuration lifecycle race | Merged through PR #19 |
| `agent/nexora-3.2.3-security-hardening` | Trust limits, rate controls, strict recovery, cleanup | Merged through PR #20 |
| `agent/nexora-3.2.4-updater-mls-recovery` | Updater, Server console, Welcome recovery, Windows UX | Merged through PR #21 |

## 4. Merged website branches

| Branch | Purpose | Status |
|---|---|---|
| `agent/project-showcase-site` | Static product website and GitHub Pages workflow | Merged through PR #22 |
| `agent/fix-showcase-logo-pages` | Official logo and Pages workflow correction | Merged through PR #24 |

## 5. Merged documentation branches

| Branch | Purpose | Status |
|---|---|---|
| `docs/community-standards` | Community Standards and repository documentation | Merged through PR #2 |
| `docs/sync-3.1.2` | Stable 3.1.2 documentation synchronization | Merged through PR #13 |
| `docs/branch-status-index` | Initial central branch index | Merged through PR #14 |
| `docs/official-product-documentation-3.2.0` | Product documentation foundation | Merged through PR #17 |
| `docs/official-product-documentation-3.2.3` | Security/operations documentation for 3.2.3 | Merged through PR #23 |
| `docs/reconcile-all-branches-3.2.4` | Historical 3.2.4 documentation and branch reconciliation | Merged through PR #27 |
| `agent/release-3.3.2-consistency` | Release metadata, documentation and evidence consistency | Merged through PR #42 |

## 6. Closed synchronization helper

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.2.0-main-sync` | Temporary main synchronization | Closed PR #15; no release role |

## 7. Obsolete automation branches

| Branch | Historical purpose | Required handling |
|---|---|---|
| `automation/nexora-3.1.0-tag` | Historical tag automation attempt | Closed obsolete PR #6; do not merge/tag/publish |
| `automation/nexora-3.1.0-finalize` | Historical finalization attempt | Closed obsolete PR #7; do not merge/tag/publish |

These branches should be closed/deleted after required provenance is preserved. Their branch-local documentation identifies them as obsolete.

## 8. Branch documentation state

Every branch listed above is required to contain `BRANCH_STATUS.md` with:

- exact branch name;
- classification;
- branch-local scope/version;
- relationship to PR/release;
- current source-of-truth pointer;
- release prohibition where applicable;
- documentation preservation rule.

Current product documents are not copied into historical branches. Historical docs remain branch-local evidence.

## 9. Governance rules

1. `main` is the only current product source of truth.
2. Active development differentiates implemented, verified and planned scope.
3. Merged/superseded branches are not updated to imitate current `main`.
4. Release claim requires matching SemVer metadata, CI evidence, tag and distribution state.
5. Prerelease security claim is not presented as stable or independently audited.
6. Branch without active purpose is closed/deleted after provenance review.
7. Documentation-only change does not modify runtime code, dependencies, migrations or workflows.
8. Security patch retains regression-first and compatibility evidence.
9. Every retained non-main branch has explicit `BRANCH_STATUS.md`.
10. Full policy: [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md).

## 10. Current product boundary

- version: `3.3.2`;
- distribution: published `UNSIGNED-TEST` prerelease;
- signed production baseline: `3.1.2`;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- Local Server database: schema 8;
- migration from 3.2.0–3.3.1: not required;
- independently audited E2EE claim: not granted.
