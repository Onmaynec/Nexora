# Индекс веток Nexora

Документ фиксирует назначение и lifecycle сохраняемых веток. Git refs, Pull Request states, tags и branch protection в GitHub остаются authority для repository operations.

## 1. Authoritative branch

| Branch | Product state | Documentation policy |
|---|---|---|
| `main` | Nexora `3.3.3` published `UNSIGNED-TEST` prerelease; signed production baseline `3.1.2` | Единственный current source of truth |

New work starts from latest verified `main`, если approved stacked-branch plan явно не требует другого.

## 2. Active development

| Branch | Purpose | Status / merge boundary |
|---|---|---|
| `release/3.3.4-post-mls` | Verified post-MLS prerequisite for the planned 3.4.0 line | Draft PR #70; primary 3.3.4 candidate; must pass release gates before merge/tag |
| `release/3.4.0-stable-core` | Stable Core implementation | Draft PR #69; blocked until an approved 3.3.4 baseline exists |
| `release/3.3.4` | Earlier 3.3.4 implementation attempt | Draft PR #67; overlaps PR #70 and must not be merged independently without explicit reconciliation |
| `agent/repository-file-organization` | Repository structure, release-document paths and branch index cleanup | Active maintenance branch; documentation/test-infrastructure scope only |

Active branches are not product documentation and do not change the current release until merged into `main` and accepted by the required gates.

## 3. Historical / superseded provenance

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.2.0-trust-core` | Early Rust/OpenMLS Trust Core foundation | Closed PR #11; superseded by the integrated JavaScript/`ts-mls` line; release prohibited without a new RFC and security review |
| `agent/nexora-3.2.0-main-sync` | Temporary main synchronization | Closed PR #15; no release role |
| `automation/nexora-3.1.0-tag` | Historical tag automation attempt | Closed obsolete PR #6; do not merge/tag/publish |
| `automation/nexora-3.1.0-finalize` | Historical finalization attempt | Closed obsolete PR #7; do not merge/tag/publish |

These refs may be removed only after their PR and release provenance is confirmed as preserved. Historical branch documentation must not be rewritten to imitate current `main`.

## 4. Merged release branches

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
| `agent/nexora-3.2.5-ui-console-performance` | UX, Pulse persistence, MLS Welcome and Windows-build corrections | Merged through PR #25 |
| `release/3.3.3` | Goals, voice UX, Pulse effects and MLS recovery | Merged through PR #65 |

## 5. Merged website branches

| Branch | Purpose | Status |
|---|---|---|
| `agent/project-showcase-site` | Static product website and GitHub Pages workflow | Merged through PR #22 |
| `agent/fix-showcase-logo-pages` | Official logo and Pages workflow correction | Merged through PR #24 |
| `agent/nexora-advanced-docs-site` | Advanced documentation portal | Merged through PR #63 |
| `feat/website-aether-game` | Initial Aether experience | Merged through PR #54 |
| `feat/aether-sandbox-physics` | Aether physics sandbox | Merged through PR #64 |
| `fix/mobile-layout-calm-aether` | Mobile site and calm Aether defaults | Merged through PR #66 |

## 6. Merged documentation and repository-maintenance branches

| Branch | Purpose | Status |
|---|---|---|
| `docs/community-standards` | Community Standards and repository documentation | Merged through PR #2 |
| `docs/sync-3.1.2` | Stable 3.1.2 documentation synchronization | Merged through PR #13 |
| `docs/branch-status-index` | Initial central branch index | Merged through PR #14 |
| `docs/official-product-documentation-3.2.0` | Product documentation foundation | Merged through PR #17 |
| `docs/official-product-documentation-3.2.3` | Security/operations documentation for 3.2.3 | Merged through PR #23 |
| `docs/reconcile-all-branches-3.2.4` | Historical 3.2.4 documentation and branch reconciliation | Merged through PR #27 |
| `agent/release-3.3.2-consistency` | Release metadata, documentation and evidence consistency | Merged through PR #42 |
| `docs/roadmap-3.4-4.0` | Product roadmap 3.4.0–4.0.0 | Merged through PR #68 |

## 7. Branch documentation requirements

Every retained non-main branch must contain `BRANCH_STATUS.md` with:

- exact branch name and classification;
- branch-local scope/version;
- relationship to PR/release;
- current source-of-truth pointer;
- release prohibition where applicable;
- documentation preservation rule.

Current product documents are not copied into historical branches. Historical docs remain branch-local evidence.

## 8. Governance rules

1. `main` is the only current product source of truth.
2. Active development differentiates implemented, verified and planned scope.
3. Overlapping active release branches require explicit reconciliation before merge.
4. Merged/superseded branches are not updated to imitate current `main`.
5. Release claim requires matching SemVer metadata, CI evidence, tag and distribution state.
6. Prerelease security claim is not presented as stable or independently audited.
7. Branch without active purpose is deleted only after provenance review.
8. Documentation-only work does not modify runtime code, dependencies, migrations or release behavior.
9. Security patches retain regression-first and compatibility evidence.
10. Full policy: [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md).

## 9. Current product boundary

- version: `3.3.3`;
- distribution: published `UNSIGNED-TEST` prerelease;
- signed production baseline: `3.1.2`;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- Local Server database: schema 8;
- migration from 3.2.0–3.3.2: not required;
- independently audited E2EE claim: not granted.
