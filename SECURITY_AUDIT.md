# Nexora Security Verification Summary

**Document date:** 22 July 2026  
**Current repository version:** `3.2.0`  
**Distribution classification:** Source/PWA prerelease  
**Signed production baseline:** `3.1.2`

## 1. Scope

This document summarizes automated security and architecture verification for the current repository state. It does not constitute an independent penetration test, cryptographic certification, supply-chain audit or production approval.

The authoritative release evidence for `3.2.0` is [RELEASE_VERIFICATION_3.2.0.md](RELEASE_VERIFICATION_3.2.0.md).

## 2. Threat model

Nexora does not trust a participant solely because they have LAN/VPN access. Local Server validates authentication, Origin/CSRF, membership, role, ban/restriction, room policy, resource scope and rate limits.

Trust boundaries:

- Client controls user interaction, device private keys, MLS private state and local decryption;
- Local Server controls local identity, room authorization, delivery order, public Trust state, ciphertext storage and operations;
- Pulse Cloud controls Cloud Identity, billing, ledger and production entitlements;
- payment provider controls payment-card processing and provider events;
- operating system, browser/Electron runtime and installed Client are part of the trusted computing base.

## 3. Automated gate evidence

Implementation CI run `#250` (`29921551883`) passed on commit `9af91d129273d702cea2bf736354d25bac05d1e3`.

Verified stages:

| Gate | Result |
|---|---|
| Windows production check | PASS |
| Windows unit/API/integration suite | PASS |
| Windows isolated performance smoke | PASS |
| Windows security audit | PASS |
| Linux full `npm test` | PASS |
| Dedicated `npm run release:check` | PASS |
| Schema 8 soak | PASS |
| Android `assembleDebug` | PASS |

## 4. Application security results

| Area | Result |
|---|---|
| Secure HttpOnly/SameSite session, Origin and CSRF | PASS |
| Persistent login rate limit and temporary lock | PASS |
| Local TOTP and one-time recovery codes | PASS |
| Password/token timing-safe verification | PASS |
| Certificate pinning, Server ID and Electron session isolation | PASS |
| Electron context isolation/sandbox/Node integration boundary | PASS |
| Android cleartext/mixed-content/TLS-error policy | PASS |
| SQLite WAL/FULL, integrity and transactional mutation | PASS |
| Schema 7 → 8 verified migration and downgrade protection | PASS |
| Legacy upload size/hash/MIME validation | PASS |
| Bot token hashing, scopes, expiry and room authorization | PASS |
| Webhook HTTPS, destination validation, SSRF controls and HMAC | PASS |
| Operational metrics protection and credential redaction | PASS |
| Audited developer command allowlist without shell/eval | PASS |
| Windows updater signature/install policy | PASS |
| Unsigned release asset exclusion | PASS |

## 5. Trust and MLS results

| Area | Result |
|---|---|
| One-time expiring Trust challenges | PASS |
| Ed25519 proof-of-possession device registration | PASS |
| Signed device verification/revocation | PASS |
| Active/verified device enforcement | PASS |
| Non-extractable Client identity key | PASS |
| Encrypted local Trust/MLS/cache/draft state | PASS |
| Fixed MLS ciphersuite | PASS |
| One-time KeyPackage and scoped Welcome | PASS |
| Monotonic epoch and commit continuity | PASS |
| Replay rejection | PASS |
| Device-scoped Socket.IO authentication and delivery | PASS |
| Immediate targeted revoke disconnect | PASS |
| Client Trust/MLS state wipe after revocation | PASS |
| Ciphertext-only serialization, persistence and outbox | PASS |
| Direct legacy plaintext downgrade guards | PASS |
| Alice/Bob interoperability coverage | PASS |
| Missed-commit recovery and explicit lost-state failure | PASS |

Fixed profile: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

## 6. Encrypted media results

| Area | Result |
|---|---|
| AES-256-GCM Client encryption | PASS |
| AAD binding to conversation/attachment/media kind | PASS |
| Plaintext and ciphertext SHA-256 verification | PASS |
| Exact GCM ciphertext-size validation | PASS |
| Opaque server metadata | PASS |
| Pending download denial before message claim | PASS |
| Pending expiry and cancel cleanup | PASS |
| One-time atomic attachment claim | PASS |
| Retry idempotency for matching scope/hash | PASS |
| Scope/hash/size substitution rejection | PASS |
| Attachment reuse rejection | PASS |
| Local verified decrypt/preview/playback/download | PASS |
| Outbox/cache descriptor isolation | PASS |
| Fail-closed room media restrictions | PASS |

Attachment key, IV, original filename, actual MIME, caption, voice duration and waveform are carried inside MLS content and are not stored as Local Server plaintext metadata.

## 7. Pulse and Cloud Identity results

| Area | Result |
|---|---|
| Cloud password scrypt storage | PASS |
| Cloud TOTP AES-256-GCM protection | PASS |
| Hashed email/session/OAuth tokens | PASS |
| OAuth 2.1 Authorization Code + PKCE S256 | PASS |
| Exact redirect URI validation | PASS |
| Atomic code consumption and refresh rotation | PASS |
| One-time signed Local Account linking | PASS |
| HTTPS and scoped service authentication | PASS |
| Ed25519 envelope/entitlement signature and scope | PASS |
| Provider event replay/payload substitution controls | PASS |
| Checkout idempotency scope binding | PASS |
| Double-entry ledger and non-negative wallet invariant | PASS |
| Local sandbox production-authority isolation | PASS |

## 8. Server-visible metadata

The secure-message implementation does not provide metadata confidentiality. Local Server can observe or infer:

- account and device identifiers;
- room/conversation membership;
- sender/uploader identity;
- group/epoch and delivery order;
- attachment ID and ciphertext size;
- timestamps and IP/network/session context;
- ciphertext/replay hashes;
- operational errors and traffic patterns.

Nexora `3.2.0` does not claim traffic-analysis resistance.

## 9. Trusted computing base and residual risks

Residual risks include:

- XSS, malware, dependency compromise or malicious Client binary can access plaintext during authorized use;
- complete loss of private device state may be unrecoverable;
- existing 3.1.x content is not retroactively encrypted;
- public deployment depends on external reverse proxy, firewall, DDoS controls and monitoring;
- Local CA and local data require protected OS accounts, disk encryption and secure backups;
- production Pulse depends on external provider, Cloud deployment, key rotation, reconciliation and legal controls;
- Windows stable release depends on external Authenticode credentials and signing environment;
- Android stable release depends on signed APK/AAB and physical-device validation;
- automated verification does not replace independent cryptographic/application-security review.

## 10. Stable-promotion blockers

Before `3.2.0` stable signed production promotion:

1. complete packaged Windows Electron Client/Server runtime E2E;
2. complete installed PWA and physical Android runtime matrix;
3. extend simultaneous-commit, revoke/re-add and corrupted-state scenarios;
4. complete longer load/soak and long-offline evidence;
5. complete metadata minimization and traffic-analysis review;
6. verify Authenticode signing machine and updater artifacts;
7. complete independent cryptographic and application-security review;
8. resolve all high/critical findings.

## 11. Reproduction

```bash
npm ci
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Run these commands on the exact release commit/tag. A result from another commit is not release evidence.
