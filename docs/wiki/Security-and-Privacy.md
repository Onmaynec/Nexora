# Security and Privacy

## Trust boundaries

| Boundary | Authority |
|---|---|
| Client UI | Input, local state and presentation only |
| Local Server | Authentication, authorization, validation, quotas, storage and realtime access |
| Pulse Cloud | Cloud identity, billing ledger and signed entitlements only |
| GitHub Releases | Source/tag/assets evidence; unsigned assets are not production-trusted |

## Mandatory server-side checks

Before a protected operation, the server must validate:

1. authentication and session state;
2. resource existence;
3. membership and active ban state;
4. role and permission boundary;
5. room policy and content restrictions;
6. input schema, size, MIME and identifiers;
7. idempotency and conflict state;
8. rate limits and quotas.

A hidden or disabled client button is not an authorization control.

## Primary risks

- IDOR and role bypass;
- CSRF/Origin bypass for cookie-authenticated mutations;
- XSS and unsafe rendering of user content;
- invitation reuse, expiry/limit races and duplicate membership;
- upload extension/MIME spoofing and executable payloads;
- realtime delivery after removal, ban or session revocation;
- Pulse price/signature/replay/idempotency manipulation;
- updater downgrade, unsigned/tampered assets and release metadata drift;
- secrets or private user content in logs, tests, screenshots and issues.

## Sensitive material

Never commit or publish:

- `.env` files and production credentials;
- SQLite databases, backups and real attachments;
- CA, Authenticode, Android, Pulse or device private keys;
- cookies, OAuth/API/bot tokens and invite codes;
- TOTP seeds and recovery codes;
- real user or payment data.

## Current security classification

Nexora `3.3.3` is an `UNSIGNED-TEST` prerelease. Automated checks do not replace an independent security review. The repository must not claim that prerelease E2EE, application security or release signing has been independently audited when such evidence does not exist.

## Vulnerability reporting

Do not open a public issue for a vulnerability. Use the private GitHub Security Advisory process described in [`SECURITY.md`](../../SECURITY.md).

## Verification sources

- [`docs/SECURITY_MODEL.md`](../SECURITY_MODEL.md)
- [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md)
- [`docs/RELEASE_POLICY.md`](../RELEASE_POLICY.md)
- release-specific verification under [`docs/releases/`](../releases/)