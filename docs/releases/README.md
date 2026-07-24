# Nexora release documentation

Release documentation is grouped by version under this directory. The canonical chronological history remains [`CHANGELOG.md`](../../CHANGELOG.md); immutable publication evidence remains under [`release-evidence/`](../../release-evidence/).

## Current release candidate

| Version | Notes | Verification | Security review | Evidence |
|---|---|---|---|---|
| `3.3.4` | [Release notes](3.3.4/RELEASE_NOTES.md) | [Release verification](3.3.4/RELEASE_VERIFICATION.md) | [`SECURITY_REVIEW_3.3.4.md`](../../SECURITY_REVIEW_3.3.4.md) | [`release-evidence/current.json`](../../release-evidence/current.json) |

## Previous published release

| Version | Notes | Verification |
|---|---|---|
| `3.3.3` | [Release notes](3.3.3/RELEASE_NOTES.md) | [Release verification](3.3.3/RELEASE_VERIFICATION.md) |

## Repository rules

1. New release-specific notes and verification documents belong in `docs/releases/<version>/`.
2. Current product documentation links to the versioned release directory instead of duplicating release content at the repository root.
3. `CHANGELOG.md` is the only chronological release timeline.
4. `release-evidence/` stores machine-readable publication evidence and checksums.
5. Historical branch documentation remains branch-local and is not rewritten to imitate current `main`.
6. Root-level `RELEASE_NOTES_<version>.md` and `RELEASE_VERIFICATION_<version>.md` files are compatibility pointers only.

## Historical material

Older root-level release documents are preserved temporarily to avoid breaking historical links. They are migrated version-by-version only when internal relative links, release workflow inputs and consistency tests are updated in the same change.
