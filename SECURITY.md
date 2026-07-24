# Политика безопасности Nexora

> **Post-MLS Baseline 3.3.4 RC:** ordinary server-readable messaging is writable; legacy Trust/MLS history is read-only. Stable publication remains blocked by CI, merge, release publication and asset smoke.

## Supported versions

| Version | Channel | Security status |
|---|---|---|
| `3.3.4` | Release candidate / PR #70 | Implementation under validation; no production claim before independent review |
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

## Scope for 3.3.4 review

- authentication, sessions, device revoke and realtime disconnect;
- Origin/CSRF and direct API bypass;
- room roles, higher-privilege protection and active bans;
- ordinary upload type/size/path controls;
- retired Trust/MLS HTTP/Socket.IO writes and plaintext leakage;
- local read-only legacy cache adapter/export;
- migration, backup verify, restore rollback and future schema;
- Electron IPC/profile/certificate pinning;
- Client/Server updater, Authenticode identity, timestamp and no-downgrade;
- Pulse authority boundary and secret redaction.

## Disclosure and release policy

High/critical findings block merge, tag and stable publication. Each finding must record severity, root cause, fix, regression evidence and closure/retest. Public summaries must not expose credentials or weaponized details before coordinated disclosure.

The `SECURITY_REVIEW_3.3.4.md` file is an internal scope/closure ledger, not an independent assessment. The independent review remains a mandatory release blocker.

## Out of scope claims

Nexora does not claim protection against a compromised operating-system administrator, malicious local operator, stolen signing environment or insecure reverse proxy configuration. A self-hosted deployment remains responsible for OS patching, firewall, TLS, backup custody, secrets and monitoring.
