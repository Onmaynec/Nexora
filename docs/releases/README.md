# Nexora release documentation

Release documentation is grouped by version under this directory. The canonical chronological history remains [`CHANGELOG.md`](../../CHANGELOG.md); immutable publication evidence remains under [`release-evidence/`](../../release-evidence/).

## Current release

| Version | Notes | Verification | Evidence |
|---|---|---|---|
| `3.3.3` | [Release notes](3.3.3/RELEASE_NOTES.md) | [Release verification](3.3.3/RELEASE_VERIFICATION.md) | [`release-evidence/current.json`](../../release-evidence/current.json) |

## Repository rules

1. New release-specific Markdown files belong in `docs/releases/<version>/`.
2. Current product documentation must link to the versioned release directory instead of adding release files to the repository root.
3. `CHANGELOG.md` is the only chronological release timeline.
4. `release-evidence/` stores machine-readable publication evidence and checksums.
5. Historical branch documentation remains branch-local and is not rewritten to imitate current `main`.

## Historical material

Older root-level release documents are preserved temporarily to avoid breaking historical links. They should be migrated version-by-version only when their internal relative links and release references are updated in the same change.
