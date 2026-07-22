# Nexora Branch Index

This file records the purpose and lifecycle status of repository branches. GitHub Pull Request state, branch protection and release tags remain authoritative for repository operations.

## Authoritative branch

| Branch | Product state | Documentation policy |
|---|---|---|
| `main` | Nexora `3.2.0` Source/PWA prerelease; signed production baseline `3.1.2` | Current product, architecture, security and release documentation |

All new product work starts from the latest verified `main` unless an approved stacked-branch plan states otherwise.

## Active development

| Branch | Purpose | Status |
|---|---|---|
| `agent/nexora-3.2.0-trust-core` | Early Trust Core/OpenMLS foundation | Historical draft PR #11; superseded by merged PR #12 and must not be released |

The foundation branch is retained only for development provenance. New Trust/MLS work must use the implementation already merged into `main`.

## Merged and superseded branches

| Branch | Historical purpose | Status |
|---|---|---|
| `docs/community-standards` | Community Standards and repository documentation | Merged through PR #2 |
| `agent/nexora-3.1.0-pulse-cloud-foundation` | Pulse Cloud billing and ledger foundation | Merged/superseded |
| `agent/nexora-3.1.0-local-pulse-integration` | Schema 7 and signed Local/Cloud integration | Merged/superseded |
| `agent/nexora-3.1.0-productization` | Cloud Identity, Pulse Center and productization | Superseded by final 3.1.0 release branch |
| `agent/nexora-3.1.0-final` | Final 3.1.0 release materialization | Merged through PR #5 |
| `agent/nexora-3.1.1-production-hardening` | Health, metrics, redaction, drain and audited commands | Merged through PR #8 |
| `agent/nexora-3.1.2-bugfix` | Intermediate 3.1.2 fixes | Superseded by final branch |
| `agent/nexora-3.1.2-final` | Verified 3.1.2 patch | Merged through PR #10 |
| `docs/sync-3.1.2` | Stable documentation synchronization | Merged through PR #13 |
| `docs/branch-status-index` | Central branch-status index | Merged through PR #14 |
| `agent/nexora-3.2.0-trust-core-mls` | Trust Core, MLS and encrypted media release candidate | Merged through PR #12 |
| `agent/nexora-3.2.0-main-sync` | Temporary synchronization helper | Closed; no release role |

## Obsolete automation branches

| Branch | Historical purpose | Required handling |
|---|---|---|
| `automation/nexora-3.1.0-tag` | 3.1.0 tag automation attempt | Do not merge or publish; close/delete after provenance review |
| `automation/nexora-3.1.0-finalize` | 3.1.0 finalization attempt | Do not merge or publish; close/delete after provenance review |

## Branch governance

1. `main` is the only current product source of truth.
2. A development branch must distinguish implemented, verified and planned scope.
3. Merged or superseded branches are not updated to imitate the current product version.
4. Release claims require matching SemVer metadata, verification evidence and distribution status.
5. Experimental or prerelease security claims must not be presented as stable or independently audited.
6. A branch without an active purpose is closed or deleted after required audit/release provenance is preserved.
7. Documentation-only work uses a `docs/` branch and must not modify runtime code, dependencies or workflows.

## Current product boundary

- current repository version: Nexora `3.2.0`;
- distribution classification: Source/PWA prerelease;
- signed production baseline: Nexora `3.1.2`;
- application API: v3;
- Trust/MLS API: v4;
- Local Server database: schema 8;
- independently audited E2EE claim: not granted.
