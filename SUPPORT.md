# Политика поддержки Nexora 3.4.0

> **Stable Core release candidate:** ordinary messaging is writable; legacy Trust/MLS history is read-only. Official stable publication remains blocked by verified `v3.3.4`, Authenticode/Windows acceptance and independent review.

Nexora is an open-source project supported through the public repository on a best-effort basis; this is not a contractual SLA.

## Supported lines

| Version | Status |
|---|---|
| `3.4.0` / PR #96 | Active release candidate; defect/security reports accepted, production claims not granted |
| `3.3.4` / merged source baseline | Prerequisite regression reports accepted; publication state must be identified exactly |
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
- HTTP status, stable code, request ID and `Retry-After`;
- platform, OS/browser/device model;
- schema/readiness and exact UTC event time;
- sanitized screenshot/log excerpt.

Do not attach secrets, production DB/backups or private user content.

## 3.4.0-specific triage

State whether the problem reproduces on:

- PR #96 exact head;
- merged `3.3.4` source baseline;
- published signed baseline `3.1.2`;
- another exact historical revision.

For legacy history report:

- whether schema 8 group/ciphertext exists;
- whether local decrypted IndexedDB content existed before upgrade;
- whether viewer reports available/exportable/unavailable terminal state;
- request ID from read-only API;
- whether any write unexpectedly succeeded.

Restoration of writable Trust/MLS runtime is not a defect request. A legacy mutation that succeeds instead of returning `410/LEGACY_READ_ONLY` is a security/integrity defect.

## Security vulnerabilities

Do not open a public issue for:

- authentication, CSRF, IDOR or role bypass;
- active-ban/session-revoke bypass;
- legacy write-path resurrection or plaintext leakage;
- upload MIME/hash/quota bypass;
- backup traversal or live-state mutation;
- updater/signature/tag integrity bypass;
- secret/token/private-data exposure.

Use a private GitHub Security Advisory and provide minimum reproduction, affected commit/version, impact and sanitized evidence.

## Operations and documentation

Consult:

- [README](README.md)
- [Documentation Portal](docs/README.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Administrator Guide](ADMIN_GUIDE.md)
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md)
- [Release Policy](docs/RELEASE_POLICY.md)
- [Security Policy](SECURITY.md)

Maintainers do not guarantee custom reverse-proxy, firewall, DNS, payment, mail or enterprise-identity configuration.

## Release support boundary

Official `v3.4.0` support begins only after:

- published verified `v3.3.4` prerequisite;
- complete Authenticode signing evidence;
- Windows 10/11 installed `3.3.4 → 3.4.0` acceptance;
- independent review with zero unresolved high/critical findings;
- final green release gates;
- immutable release/tag/assets and redownload verification.

Before then, support is limited to source release-candidate testing and defect triage.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
