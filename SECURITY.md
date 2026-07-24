# Политика безопасности Nexora

> **Post-MLS Baseline 3.3.4 RC:** ordinary server-readable messaging is writable; legacy Trust/MLS history is read-only. Publication remains blocked by final CI, merge, official release creation and asset re-download smoke.

## Supported versions

| Version | Channel | Security status |
|---|---|---|
| `3.3.4` | Release candidate / PR #70 | Internal review complete for the prerequisite scope; signed-stable and independent-review claims are deferred to 3.4.0 |
| `3.3.3` | Published `UNSIGNED-TEST` prerelease | Supported for regression/security reports; not a signed stable baseline |
| `3.1.x` | Signed production baseline | Supported |
| `3.0.x` and older | Historical | Unsupported |

Security corrections require reproducible evidence, root-cause fix, regression tests, compatibility statement and verification on the affected line.

## Reporting a vulnerability

Do not publish secrets, working exploitation details or private user data in a public issue.

Provide:

- affected version/commit and platform;
- prerequisite account/role/room state;
- minimal reproduction;
- expected and actual result;
- security impact;
- relevant safe logs/request IDs;
- whether the issue affects authentication, CSRF, roles, bans, uploads, Electron, updater, Pulse, backup/export or legacy retirement.

Use the repository security advisory/private reporting channel where available. If that channel is unavailable, contact the maintainer through a private channel listed on the GitHub profile and disclose only the minimum needed to establish contact.
