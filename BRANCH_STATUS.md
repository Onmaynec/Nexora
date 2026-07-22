# Branch Status — `docs/reconcile-all-branches-3.2.4`

| Field | Value |
|---|---|
| Classification | Active documentation-only branch |
| Purpose | Reconcile current 3.2.4 documentation and branch-local status records |
| Base | Latest verified `main` / Nexora `3.2.4` |
| Runtime code impact | None |
| Target | Pull Request to `main` after full CI |

This branch updates product, security, operations, testing, release and support documentation to the current 3.2.4 implementation. It also adds a formal branch-documentation policy and corrects `BRANCH_STATUS.md` across retained historical, merged, superseded and obsolete branches.

Historical branches retain their branch-local versions and release provenance; they are not rewritten to imitate current `main`.

Only Markdown and the GitHub Issue Form YAML may change on this branch. Source code, package metadata, dependencies, migrations and workflows are out of scope.

Until merged, current product behavior remains authoritative on `main`. After merge, this branch becomes merged documentation provenance and must not receive new work.
