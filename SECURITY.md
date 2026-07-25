# Политика безопасности Nexora

> **Nexora 3.5.0:** актуальная версия публикуется как обычный GitHub Release с явно неподписанными Windows- и Android-артефактами. Автоматические обновления для этой публикации отключены; перед ручной установкой требуется сверка SHA-256.

## Supported versions

| Version | Channel | Security status |
|---|---|---|
| `3.5.0` | Stable unsigned distribution | Supported for security fixes. Windows and Android binaries have no publisher signature; asset names, evidence and release notes expose this state explicitly. |
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

## Scope for 3.5.0 review

- authentication, sessions, device revoke and realtime disconnect;
- Origin/CSRF and direct API bypass;
- room roles, higher-privilege protection and active bans;
- ordinary and resumable upload type/size/hash/path controls;
- push-token encryption, gateway TLS/HMAC/DNS pinning and private-target rejection;
- replay/outbox ordering, idempotency and profile isolation;
- retired Trust/MLS HTTP/Socket.IO writes and plaintext leakage;
- local read-only legacy cache adapter/export;
- migration, backup verify, restore rollback and future schema;
- Electron IPC/profile/certificate pinning;
- PWA cache/update boundary;
- Android TLS, WebView, permissions and lifecycle;
- unsigned release transparency, checksum verification and updater-metadata exclusion;
- Pulse authority boundary and secret redaction.

## Disclosure and release policy

High/critical findings block source promotion until corrected. The owner-authorized unsigned `v3.5.0` publication relaxes only binary publisher-signature requirements; it does not relax source security tests, checksum generation, immutable tagging, package smoke or post-publication re-download verification.

Unsigned release assets must:

- contain `UNSIGNED` in Windows and Android filenames;
- include signing-state evidence;
- include SHA-256 checksums;
- exclude `latest.yml` and `server.yml`;
- avoid claims of Authenticode or Android signer identity.

## Out of scope claims

Nexora does not claim protection against a compromised operating-system administrator, malicious local operator, stolen build environment or insecure reverse proxy configuration. A self-hosted deployment remains responsible for OS patching, firewall, TLS, backup custody, secrets and monitoring. SHA-256 verifies downloaded bytes but does not prove publisher identity.
| `3.6.0` | Connect implementation candidate — signed stable publication blocked pending required evidence |
