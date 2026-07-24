# Индекс веток Nexora

Документ фиксирует назначение и lifecycle сохраняемых веток. Git refs, Pull Request states, tags и branch protection в GitHub остаются authority для repository operations.

## Authoritative branch

| Branch | Product state | Documentation policy |
|---|---|---|
| `main` | Base for Nexora `3.3.4` Post-MLS release candidate; signed production baseline `3.1.2` | Единственный current source of truth после merge/release acceptance |

New work starts from latest verified `main`, если approved stacked-branch plan явно не требует другого.

## Active development

| Branch | Purpose | Status / merge boundary |
|---|---|---|
| `release/3.3.4-post-mls` | Verified post-MLS prerequisite for 3.4.0 | PR #70; merge/tag only after all automated gates and review |
| `release/3.4.0-stable-core` | Earlier mixed-scope Stable Core implementation | PR #69; superseded after verified 3.3.4 baseline; must not be merged directly |
| `release/3.3.4` | Earlier overlapping implementation attempt | Superseded; no independent release role |

Development branches are not product releases and do not change current support status until merged and accepted.

## 3.3.4 boundary

The release branch contains:

- ordinary server-readable messaging as the only writable messaging path;
- retired Trust/MLS runtime and removed `ts-mls`;
- schema 8 legacy ciphertext/read-only viewer/export;
- session-derived device inventory and targeted revoke;
- non-restoring backup verification and rollback/fault coverage;
- stable errors/request IDs;
- signed-or-explicit-unsigned release workflow.

## Historical / superseded provenance

Historical Trust/MLS branches and obsolete automation branches preserve audit provenance only. They must not be merged, tagged or rewritten to imitate current runtime. A future cryptographic messaging implementation requires a new RFC, migration plan, independent review and explicit release scope.

## Branch completion

A release branch closes only after:

1. final CI and focused suites pass on reviewed head;
2. PR is merged;
3. post-merge CI passes;
4. immutable tag and GitHub Release are created;
5. assets/checksums/evidence pass re-download smoke;
6. successor branches start from the verified baseline;
7. obsolete overlapping PRs are closed as superseded.

See [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md), [Release Policy](docs/RELEASE_POLICY.md) and [Release Verification 3.3.4](docs/releases/3.3.4/RELEASE_VERIFICATION.md).
