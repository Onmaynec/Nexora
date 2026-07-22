# Nexora Security Policy

## Supported versions

| Version | Distribution status | Security status |
|---|---|---|
| `3.2.0` | Source/PWA prerelease | Security fixes accepted; stable signed production approval not granted |
| `3.1.x` | Signed production baseline | Supported |
| `3.0.x` | Historical | Unsupported; upgrade to a supported line |
| `2.x` and earlier | Historical | Unsupported |

Security fixes are reproduced, covered by regression tests and verified in the applicable release line. Public release and disclosure follow the severity, exploitability and deployment impact of the issue.

## Reporting a vulnerability

Do not publish an exploit, session cookie, OAuth token, TOTP/recovery code, CA private key, Pulse credential/signing key, invite code, MLS private state, device identity private key or user data in a public Issue, Discussion or Pull Request.

Use a private GitHub Security Advisory:

1. open **Security → Advisories** in `Onmaynec/Nexora`;
2. select **New draft security advisory**;
3. identify the affected version, platform and component;
4. describe impact, minimum reproduction steps and a safe proof of concept;
5. attach only sanitized logs and test data.

Direct form: <https://github.com/Onmaynec/Nexora/security/advisories/new>.

## Response targets

- acknowledgement: within 3 business days;
- initial assessment or request for details: within 7 business days;
- remediation and coordinated disclosure: agreed according to severity and complexity.

These are targets, not contractual SLA commitments. Disclosure may be delayed when early publication would create immediate risk.

## Security scope

Priority reports include:

- authentication, authorization, role, ban or room-policy bypass;
- IDOR and unauthorized access to rooms, messages, profiles, files or Cloud records;
- RCE, Electron boundary bypass or unsafe WebView navigation;
- TLS, Server ID, fingerprint or updater-metadata substitution;
- CSRF, Origin bypass, session fixation and token/cookie exposure;
- unsafe upload processing, MIME spoofing, path traversal or SSRF;
- SQLite corruption, migration/backup/restore failure or audit tampering;
- Pulse signature bypass, replay, double settlement or entitlement substitution;
- Cloud Identity, MFA or OAuth 2.1 PKCE bypass;
- metrics exposure, credential leakage in logs or developer-command escape;
- bot/webhook scope bypass or secret disclosure.

## Trust Core and MLS scope — 3.2.0

Priority Trust/MLS reports include:

- plaintext downgrade after MLS activation through REST, Socket.IO, outbox, edit, forward, draft, scheduled, poll, bot or upload paths;
- Local Server access to secure-message plaintext, private MLS state or secure-attachment key;
- `(userId, deviceId)` credential or signing-key substitution;
- device registration without proof of possession;
- device verification/revocation without a valid one-time challenge;
- KeyPackage/Welcome reuse, scope substitution or race;
- stale/skipped/duplicate epoch, commit substitution or ciphertext replay;
- secure delivery to revoked, unverified, removed or mismatched devices;
- incomplete local key/state wipe after revocation;
- cross-profile/rollback disclosure from encrypted IndexedDB state;
- authenticated-data mismatch across conversation, client or device scope;
- opaque attachment hash/size/scope substitution or claim reuse;
- dependency or ciphersuite substitution without migration and review.

A Trust/MLS report should include Server ID, conversation/group record ID, epoch, device roles and a sanitized sequence of protocol events. Do not attach private keys, complete MLS state or real message content.

## Implemented security boundary — 3.2.0

The verified prerelease path establishes:

- Ed25519 device identity with proof-of-possession registration;
- signed verification and revocation using scoped one-time challenges;
- active/verified device requirements for Trust/MLS operations;
- fixed profile `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`;
- one-time KeyPackage and scoped Welcome delivery;
- monotonic group epochs, commit continuity and replay rejection;
- device-scoped Socket.IO authentication and secure delivery;
- immediate targeted disconnect after Trust revocation;
- ciphertext-only message persistence and durable outbox;
- server-side rejection of legacy plaintext paths after MLS activation;
- encrypted IndexedDB storage for private MLS state, KeyPackages, decrypted cache and drafts;
- AES-256-GCM encrypted files, images and voice;
- opaque attachment storage with exact-size/SHA-256 checks, pending expiry and one-time atomic claim;
- fail-closed encrypted-media policy when room media classes are restricted.

Local Server does not receive secure-message plaintext, private MLS state, secure-attachment key, original filename, actual MIME, caption, voice duration or waveform.

## Trusted computing base

The secure-message boundary does not eliminate client compromise. Plaintext is available to the authorized Client while composing, displaying or playing content. The trusted computing base includes:

- browser/Electron renderer;
- installed application binary;
- runtime dependencies;
- operating-system account and local device security;
- local encrypted-state key material.

XSS, malicious dependencies, malware or a compromised signed client may access plaintext during use.

## Metadata limitations

Nexora `3.2.0` does not claim metadata or traffic-analysis confidentiality. Local Server can observe or infer:

- account and device identifiers;
- room/conversation membership;
- sender/uploader identity;
- group/epoch and delivery order;
- attachment ID and ciphertext size;
- timestamps, network/session context and IP address;
- ciphertext/replay hashes and operational errors;
- traffic patterns.

## Documented non-guarantees

The following are not claimed:

- retroactive encryption of 3.1.x history or files;
- compatibility of a 3.1.x client with an active secure 3.2.0 conversation;
- seamless recovery after complete loss of private device state;
- traffic-analysis resistance;
- independent cryptographic or application-security certification;
- signed stable Windows release status for `3.2.0`;
- suitability of the prerelease for high-risk communications.

A report that actual behavior violates these documented boundaries in an unsafe way remains a valid security issue. For example, a secure attachment silently falling back to plaintext is in scope.

## Safe research

Research is permitted on installations and data you control. Do not:

- degrade another operator's service;
- access or modify third-party data;
- use social engineering;
- publish secrets or personal data;
- continue exploitation beyond the minimum evidence required.

The project does not promise a monetary bounty.

## Operational boundaries

- Public Local Server deployment requires HTTPS reverse proxy, firewall, monitoring and explicit `allowedOrigins`.
- Unsigned local Windows builds are for development/testing and are not stable releases.
- Production Plus/Pulse requires a separate Pulse Cloud and cannot be activated authoritatively by a local flag or command.
- Local Pulse sandbox performs no real payment and creates no production entitlement or production signature.
- Automated checks do not replace independent review, pentesting, supply-chain review or operational monitoring.

When uncertain, report privately. Maintainers will classify the issue and coordinate the next step.
