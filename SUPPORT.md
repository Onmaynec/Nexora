# Политика поддержки Nexora

> **Post-MLS Baseline 3.3.4 RC:** ordinary messaging is writable; legacy Trust/MLS history is read-only. Stable publication remains blocked by CI, merge, release publication and asset smoke.

Nexora is an open-source project supported through the public repository on a best-effort basis; this is not a contractual SLA.

## Supported lines

| Version | Status |
|---|---|
| `3.3.4` / PR #69 | Release candidate; defect/security reports are accepted, production claims are not |
| `3.3.3` | Published `UNSIGNED-TEST` prerelease; regression/security reports are accepted |
| `3.1.x` | Last confirmed signed production baseline |
| `3.0.x` and older | Unsupported except migration/security context |

Always include exact Client/Server/Pulse versions, branch/commit/tag and release channel.

## Product defects

Use the repository bug report template for reproducible problems in:

- Windows Client/Server, browser/PWA or Android;
- Local Server API, Socket.IO, rooms, moderation, ordinary messaging or uploads;
- device/session lifecycle and certificate/profile isolation;
- legacy history viewer/export or unexpected non-`LEGACY_READ_ONLY` behavior;
- updater/signing/no-downgrade state;
- migration, backup verification, restore or maintenance;
- Pulse Cloud/Cloud Identity;
- documentation/release evidence.

Include:

- minimum reproduction and expected/actual result;
- affected role, room/account state and direct API path where relevant;
- HTTP status, stable code, request ID and `Retry-After` where applicable;
- platform, OS/browser/device model;
- schema/readiness and exact event time;
- sanitized screenshot/log excerpt.

Do not attach secrets, production DB/backups or private user content.

## 3.3.4-specific triage

State whether the problem reproduces on published 3.3.3 or only PR #69.

For legacy history, report:

- whether schema 8 group/ciphertext exists;
- whether local decrypted IndexedDB content existed before upgrade;
- whether the viewer reports `exportable`, `unavailable` or terminal error;
- any request ID from the read-only API.

Do not request restoration of Trust/MLS write paths as a defect; their removal is intentional scope. A legacy mutation that succeeds instead of returning `410/LEGACY_READ_ONLY` is a security/integrity defect.

## Product proposals

Use the feature request template and describe the user problem, target workflow, Client/Server/storage/realtime impact, security/privacy impact, compatibility/migration and acceptance criteria.

## Documentation and operations

Consult:

- [README](README.md)
- [Documentation Portal](docs/README.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Administrator Guide](ADMIN_GUIDE.md)
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md)
- [Release Policy](docs/RELEASE_POLICY.md)
- [Security Policy](SECURITY.md)

Maintainers do not guarantee custom reverse-proxy, firewall, DNS, payment, mail or enterprise-identity configuration.

## Security vulnerabilities

Do not open a public issue for:

- authentication, CSRF, IDOR or role bypass;
- active-ban/session-revoke bypass;
- legacy write-path resurrection or plaintext leakage;
- upload path/type/resource abuse;
- token/private-key/user-data disclosure;
- updater signature/checksum/no-downgrade bypass;
- Server console command escape;
- payment/ledger duplication or entitlement forgery.

Use the private reporting channel described in [SECURITY.md](SECURITY.md).

## Prohibited data

Never publish passwords, backup passphrases, cookies/tokens, TOTP seeds/recovery codes, invite codes, CA/signing/device keys, legacy private MLS state, production databases/backups/attachments, payment/customer data or unredacted network inventory.

## Channel boundaries

- Pull Requests are for repository changes, not general support.
- Security Advisories are for vulnerabilities.
- Public Issues are not a secure file-transfer channel.
- A limitation in historical/superseded code is not automatically a current defect, but unsafe behavior crossing the current declared boundary may be security-relevant.
