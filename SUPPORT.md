# Nexora Support Policy

Nexora is an open-source project maintained through the public repository. Support is provided on a best-effort basis and does not include a guaranteed response or resolution SLA.

## Supported product lines

| Version | Support status |
|---|---|
| `3.2.0` Source/PWA prerelease | Controlled testing, defect reports and security fixes accepted |
| `3.1.x` signed production baseline | Supported |
| `3.0.x` and earlier | Unsupported except migration/security context |

When reporting an issue, identify the exact Client, Server and Cloud versions. Do not describe `3.2.0` as a signed stable or independently audited release.

## Product defects

Use the [Bug report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml) for a reproducible problem in:

- Windows Client or Server;
- Browser/PWA;
- Android;
- Local Server API/Socket.IO;
- Trust/MLS or encrypted media;
- Pulse Cloud/Cloud Identity;
- installer or updater;
- documentation.

Before submitting:

- reproduce on a supported version;
- verify Client/Server compatibility;
- search existing Issues;
- provide minimum steps and expected/actual result;
- include platform, deployment type, time and request ID;
- attach only sanitized logs/screenshots.

## Product proposals

Use the [Feature request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml).

Describe:

- user problem;
- target users and scenario;
- expected outcome;
- Server, Client, storage and realtime impact;
- security/privacy implications;
- compatibility and migration implications;
- acceptance criteria.

A preferred visual design alone is not sufficient when the request changes authorization, data or business rules.

## Documentation

Use the Documentation issue template for:

- stale version or release status;
- incorrect installation/migration instruction;
- broken link;
- contradiction between documents;
- unsupported product or security claim.

Small unambiguous corrections may be submitted directly as a Pull Request.

## Installation and operations

Review first:

- [README](README.md);
- [Documentation Portal](docs/README.md);
- [Deployment Guide](docs/DEPLOYMENT.md);
- [Administrator Guide](ADMIN_GUIDE.md);
- [Tester Guide](TESTER_GUIDE.md);
- [Release Policy](docs/RELEASE_POLICY.md);
- [Security Policy](SECURITY.md).

For installation questions provide:

- platform and OS;
- Nexora version;
- source/package/PWA channel;
- Local Server schema;
- deployment profile;
- sanitized HTTPS address format;
- exact error code/message;
- live/ready status where available.

Maintainers do not guarantee individual configuration of third-party reverse proxies, firewalls, DNS, payment providers, mail providers or identity infrastructure.

## Security vulnerabilities

Do not create a public Issue. Follow [SECURITY.md](SECURITY.md) and use a private GitHub Security Advisory.

Examples requiring private reporting:

- authorization or IDOR bypass;
- plaintext downgrade in a secure conversation;
- Trust device or MLS replay/scope bypass;
- private-key, token or user-data disclosure;
- updater signature bypass;
- payment/ledger duplication or entitlement forgery.

## Information that must not be published

Do not include:

- passwords or backup passphrases;
- cookies, OAuth/API/bot/Pulse tokens;
- TOTP seeds or recovery codes;
- invite codes;
- CA, signing or device private keys;
- complete MLS private state;
- production databases or user attachments;
- real payment/customer data;
- unredacted private IP/network inventory;
- personal data not required for reproduction.

## Channel boundaries

- Pull Requests are for repository changes, not general support questions.
- Security Advisories are for vulnerabilities, not ordinary UI defects.
- Public Issues are not a secure file-transfer channel.
- Discussions do not replace a reproducible bug report.
- A prerelease limitation documented in release verification is not automatically a defect, but unsafe behavior outside that boundary may be one.

## Response expectations

Maintainers may request additional reproduction evidence, close unsupported-version reports, redirect a request to another template or defer proposals outside the current roadmap.

Security response targets are documented separately in [SECURITY.md](SECURITY.md).
