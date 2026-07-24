# Nexora release documentation

Release-specific documents are grouped by semantic version. The repository root contains only project-level entry points and community files.

The canonical chronological history remains [`CHANGELOG.md`](../../CHANGELOG.md). Machine-readable publication evidence remains under [`release-evidence/`](../../release-evidence/).

## Release index

| Version | Notes | Verification | Security review | Evidence |
|---|---|---|---|---|
| `3.3.3` | [Release notes](3.3.3/RELEASE_NOTES.md) | [Verification](3.3.3/RELEASE_VERIFICATION.md) | — | [`current.json`](../../release-evidence/current.json) |
| `3.3.2` | [Release notes](3.3.2/RELEASE_NOTES.md) | [Verification](3.3.2/RELEASE_VERIFICATION.md) | — | [`v3.3.2.json`](../../release-evidence/v3.3.2.json) |
| `3.3.1` | [Release notes](3.3.1/RELEASE_NOTES.md) | [Verification](3.3.1/RELEASE_VERIFICATION.md) | — | [`v3.3.1.json`](../../release-evidence/v3.3.1.json) |
| `3.3.0` | [Release notes](3.3.0/RELEASE_NOTES.md) | [Verification](3.3.0/RELEASE_VERIFICATION.md) | [Security review](3.3.0/SECURITY_REVIEW.md) | [`v3.3.0.json`](../../release-evidence/v3.3.0.json) |
| `3.2.5` | [Release notes](3.2.5/RELEASE_NOTES.md) | [Verification](3.2.5/RELEASE_VERIFICATION.md) | [Security review](3.2.5/SECURITY_REVIEW.md) | — |
| `3.2.4` | [Release notes](3.2.4/RELEASE_NOTES.md) | [Verification](3.2.4/RELEASE_VERIFICATION.md) | [Security review](3.2.4/SECURITY_REVIEW.md) | — |
| `3.2.3` | [Release notes](3.2.3/RELEASE_NOTES.md) | [Verification](3.2.3/RELEASE_VERIFICATION.md) | [Security review](3.2.3/SECURITY_REVIEW.md) | — |
| `3.2.2` | [Release notes](3.2.2/RELEASE_NOTES.md) | [Verification](3.2.2/RELEASE_VERIFICATION.md) | — | — |
| `3.2.1` | [Release notes](3.2.1/RELEASE_NOTES.md) | [Verification](3.2.1/RELEASE_VERIFICATION.md) | — | — |
| `3.2.0` | [Release notes](3.2.0/RELEASE_NOTES.md) | [Verification](3.2.0/RELEASE_VERIFICATION.md) | — | — |
| `3.1.2` | [Release notes](3.1.2/RELEASE_NOTES.md) | [Verification](3.1.2/RELEASE_VERIFICATION.md) | — | — |
| `3.1.0` | [Release notes](3.1.0/RELEASE_NOTES.md) | — | — | — |
| `3.0.0` | [Release notes](3.0.0/RELEASE_NOTES.md) | [Verification](3.0.0/RELEASE_VERIFICATION.md) | — | — |
| `2.0.0` | [Release notes](2.0.0/RELEASE_NOTES.md) | [Verification](2.0.0/RELEASE_VERIFICATION.md) | — | — |
| `1.0.2` | [Release notes](1.0.2/RELEASE_NOTES.md) | — | — | — |
| `1.0.1` | [Release notes](1.0.1/RELEASE_NOTES.md) | — | — | — |
| `0.3.0` | [Release notes](0.3.0/RELEASE_NOTES.md) | — | — | — |
| `0.1.1` | [Release notes](0.1.1/RELEASE_NOTES.md) | — | — | — |

## Repository rules

1. New release documents belong in `docs/releases/<version>/`.
2. Use the fixed names `RELEASE_NOTES.md`, `RELEASE_VERIFICATION.md` and `SECURITY_REVIEW.md` inside the version directory.
3. Version-specific release documents, compatibility pointers and `RELEASE_HISTORY.md` are forbidden in the repository root.
4. `CHANGELOG.md` is the only chronological release timeline.
5. `release-evidence/` stores machine-readable publication evidence and checksums.
6. Historical branch documentation remains branch-local and is not rewritten to imitate current `main`.

## Adding a release

Create `docs/releases/<version>/`, add the applicable fixed-name documents, update `CHANGELOG.md`, and run `npm run release:check` before publication.
