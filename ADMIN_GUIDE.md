# Nexora Administrator Guide

## 1. Scope

This guide applies to the current `main` product line:

- repository version: `3.2.0` Source/PWA prerelease;
- signed production baseline: `3.1.2`;
- application API: v3;
- Trust/MLS API: v4;
- Local Server database: SQLite schema 8.

Use `3.2.0` only for controlled prerelease testing until stable promotion gates are complete. For signed production deployment, `3.1.2` remains the confirmed baseline.

## 2. Deployment requirements

Nexora Local Server supports localhost, LAN, private VPN and public HTTPS deployment.

For public deployment:

- use a trusted HTTPS reverse proxy;
- restrict firewall exposure;
- configure exact `allowedOrigins`;
- enable monitoring and backups;
- do not expose the local server port through direct port forwarding.

A network participant is not trusted automatically. Every operation remains subject to authentication, membership, role, ban/restriction, room-policy, resource-scope and rate-limit checks.

## 3. Installation and startup

### Source

```bash
npm ci
npm start
```

### Windows package

Only a complete signed stable release is suitable for automatic production distribution. Unsigned local installers and Source/PWA prereleases are for development or controlled testing.

After startup verify:

- process status;
- full HTTPS address;
- Server ID;
- SHA-256 certificate fingerprint;
- `/healthz/live`;
- `/healthz/ready`;
- SQLite integrity;
- expected schema version;
- available storage.

The first registered local account receives server-administrator privileges.

## 4. Client connection and certificate trust

Provide users through a trusted channel:

1. full HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Windows Electron Client pins the certificate fingerprint to the Server ID. A changed certificate requires explicit confirmation.

Browser/PWA and Android use the operating-system trust store. For a Local CA, install the root `.crt` before connecting. Never instruct users to bypass TLS warnings.

## 5. Health, metrics and logs

Endpoints:

- `GET /healthz/live` — process liveness;
- `GET /healthz/ready` — database/schema/runtime readiness;
- `GET /metrics` — Prometheus text format.

Configure `NEXORA_METRICS_TOKEN` for remote metrics access. Without a token, metrics must remain loopback-only.

Operational logs include request IDs and perform recursive credential redaction. Before sharing logs, verify that they contain no cookies, passwords, tokens, API keys, signatures, private keys or user content.

Graceful shutdown sets readiness to `503` before stopping workers, HTTP, Socket.IO and SQLite.

## 6. Users and sessions

Administrators can:

- disable a local account;
- issue a temporary password;
- terminate sessions;
- inspect safe login/audit information.

Users manage profile data, password, local TOTP/recovery codes, notification preferences and active sessions.

Cloud Identity is separate from the local account. Local Server must not receive Cloud password, Cloud MFA secret, OAuth refresh token or Cloud session cookie.

## 7. Rooms and moderation

Roles:

- `owner` — exactly one room owner;
- `moderator` — delegated moderation;
- `member` — standard participant.

Supported operations include:

- moderator appointment/removal;
- atomic ownership transfer;
- member removal, ban and unban;
- join-request handling;
- invitation creation, update, expiry, usage limit and revocation;
- read-only, slow mode, announcement and pre-approval;
- file/image/voice restrictions;
- custom roles and categories;
- reports, appeals and temporary restrictions;
- room audit and system messages.

A removed or banned user must immediately lose REST and realtime access to the room.

## 8. Storage, migration and backup

Current `3.2.0` Local Server uses SQLite schema 8 with WAL and `synchronous=FULL`.

Upgrade `7 → 8` performs:

- source integrity check;
- free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- transactional/idempotent migration;
- destination integrity check;
- downgrade protection.

Rollback is restore-from-backup. In-place downgrade is not supported.

Backup requirements:

- create a verified backup before every upgrade;
- keep at least one copy outside the server computer;
- do not copy an active SQLite file manually;
- store backup passphrase separately;
- verify integrity/schema/readiness after restore.

## 9. Trust devices and secure conversations

### Device enrollment

- first device receives bootstrap verification;
- later devices require signed approval from an active verified device;
- users compare device fingerprints before approval;
- verification/revocation uses scoped one-time challenges.

### Revocation

Revocation immediately disconnects the target secure socket. The affected Client removes device identity, private MLS state, KeyPackages, decrypted cache and drafts before reenrollment.

### Operational limitations

Local Server does not receive secure-message plaintext or secure-attachment keys, but still observes membership, account/device identifiers, timing, network context, ciphertext size, attachment ID and delivery metadata.

Do not present prerelease Trust/MLS functionality as independently audited E2EE.

## 10. Files, images and voice

Legacy conversations use server-validated uploads with size, hash, MIME and quota checks.

Secure conversations use opaque encrypted attachments:

- Client encrypts with AES-256-GCM;
- Server stores generic ciphertext;
- pending data is inaccessible before message claim;
- retries are idempotent for matching scope/hash;
- reuse and substitution are rejected;
- download is decrypted and verified locally.

If any room class `files/images/voice` is disabled, the complete secure-media path fails closed.

## 11. Nexora Plus and Pulse

| Mode | Purpose | Real payments |
|---|---|---|
| `disabled` | local messaging without commercial features | no |
| `sandbox` | QA/demo Plus and Impulses | no |
| `production` | signed Pulse Cloud/provider integration | Cloud only |

### Sandbox commands

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Sandbox rules:

- unavailable when production Pulse is configured;
- checkout disabled;
- no production signatures or entitlements;
- initial test Plus activation grants 400 Impulses once;
- balance cannot become negative;
- all mutations are audited.

Production requires separate Cloud deployment, provider integration, webhooks, reconciliation, refunds/disputes, transactional email, secret management and legal/privacy/tax documentation.

## 12. Audited developer commands

The CLI and Windows Server Admin expose a fixed allowlist:

```text
help
status
health
users list
rooms list
backup create [passphrase]
storage cleanup
read-only on|off
audit tail [count]
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Arbitrary shell commands and JavaScript evaluation are not supported. Mutating commands are recorded in `integrationAudit` without secret argument values.

## 13. Updates and release channels

Electron updater accepts only a complete signed stable Windows release containing the expected installer, blockmap and `latest.yml`.

Source/PWA prerelease and unsigned assets are not updater-eligible. Missing installable signed metadata should produce the stable reason `no_installable_update`.

Before updating Local Server:

1. create a verified backup;
2. review migration and rollback notes;
3. verify release classification;
4. confirm Client compatibility;
5. validate health and integrity after restart.

## 14. Incident response

Collect:

- Client/Server/Cloud versions;
- Server ID and request ID;
- timestamps and last actions;
- network/deployment profile;
- live/ready results;
- schema and integrity status;
- sanitized logs.

Never share passwords, cookies, OAuth tokens, TOTP/recovery codes, invite codes, bot/Pulse credentials, private CA keys, Trust private state or backup passphrase.

When integrity fails, stop the server and restore the latest verified backup. Emergency read-only preserves reads during investigation but does not replace backup.

## 15. Release verification

Before a release-sensitive deployment:

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Stable Windows promotion additionally requires Authenticode verification, clean install/upgrade testing and updater validation. See [Release Policy](docs/RELEASE_POLICY.md) and [Release Checklist](docs/RELEASE_CHECKLIST.md).
