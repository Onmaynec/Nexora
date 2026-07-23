# Руководство по развёртыванию Nexora

## 1. Область

Документ относится к Nexora `3.3.1`:

- published `UNSIGNED-TEST` prerelease;
- signed production baseline `3.1.2`;
- Application API v3;
- Trust/MLS/encrypted-media API v4;
- SQLite schema 8.

## 2. Deployment profiles

| Profile | Purpose | Requirements |
|---|---|---|
| Local development | development/tests | localhost, Node.js 22.16+, npm |
| Private LAN/VPN | private installation | HTTPS, firewall, fingerprint verification |
| Public HTTPS | internet access | reverse proxy, public certificate, exact `allowedOrigins`, monitoring, backups |
| Controlled 3.3.1 prerelease | Trust/MLS/updater validation | disposable data, compatible clients, documented limitations |
| Pulse production | commercial Cloud integration | separate Cloud, provider, mail, key management, legal controls |

Direct port forwarding Local Server без reverse proxy, monitoring и firewall не является supported production topology.

## 3. Requirements

- Node.js `22.16+` и npm;
- writable application data directory;
- space for SQLite, WAL, attachments и backups;
- valid HTTPS certificate/SAN;
- stable Server ID;
- exact `allowedOrigins`;
- firewall rules;
- monitoring/alerting;
- verified restore procedure;
- production secrets outside repository/logs.

## 4. Source start

```bash
npm ci
npm start
```

Development Client/Server:

```bash
npm run dev
```

After start:

- `GET /healthz/live`;
- `GET /healthz/ready`;
- schema 8/integrity;
- Server ID/fingerprint;
- storage capacity;
- expected Pulse mode.

## 5. Network exposure

- bind only required interface;
- terminate public TLS at trusted reverse proxy;
- expose only intended HTTPS origin;
- use exact origin allowlist;
- rate-limit at application and edge;
- retain request IDs and sanitized logs;
- use token-protected remote metrics;
- do not bypass TLS warnings.

## 6. Client connection

Provide through trusted channel:

1. full HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Electron pins fingerprint to Server ID. Browser/PWA/Android use OS trust store. Private CA root must be installed deliberately.

## 7. Database и migration

Current Local Server database — schema 8.

### 3.1.x / schema 7 → 3.2.4

- source integrity;
- free-space calculation;
- WAL checkpoint;
- verified backup;
- transactional/idempotent migration;
- destination integrity;
- downgrade protection.

### 3.2.0–3.2.3 → 3.2.4

No database migration. Schema/API compatibility preserved.

Rollback schema 8 uses verified backup. In-place downgrade not supported.

## 8. Backup и restore

- backup before every release-sensitive upgrade;
- minimum one off-host verified copy;
- no manual copy of active SQLite file;
- protect passphrase separately;
- document retention;
- test restore periodically;
- after restore verify integrity, schema, readiness, auth, messaging и storage.

Emergency read-only is not a backup.

## 9. Health и monitoring

Endpoints:

- `/healthz/live`;
- `/healthz/ready`;
- `/metrics`.

Without `NEXORA_METRICS_TOKEN`, remote metrics must not be exposed. Graceful drain changes readiness to `503` before service shutdown.

Monitor:

- process and readiness;
- SQLite integrity/storage/WAL;
- backup age/result;
- request/error/rate-limit volume;
- session cleanup;
- Trust device/KeyPackage counts;
- pending Welcome/recovery and attachment state;
- Pulse workers/provider reconciliation;
- certificate expiry;
- release/update incidents.

## 10. Trust/MLS prerequisites

Secure conversation requires:

- compatible 3.2.x clients;
- active verified devices;
- available one-time KeyPackages;
- valid group/epoch state;
- device-scoped realtime;
- no blocked room media class for secure media.

Resource limits:

- 16 active devices/user;
- 25 KeyPackages/request;
- 32/device;
- 256/user.

Treat `429 RATE_LIMITED` according to `Retry-After`; do not create retry storms.

## 11. Welcome recovery 3.2.4

Recovery depends on at least one active verified group device online. Server only emits a scoped request; active Client creates Welcome.

Operator must not weaken policy when recovery cannot complete. Correct response is explicit pending/failure, not legacy plaintext fallback.

## 12. Windows deployment и updates

### Local unsigned package

Development/testing only. Not updater-eligible.

### Source/PWA prerelease

Allowed artifacts:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- checksums.

No unsigned `.exe`, `.blockmap` or `latest.yml`.

### Stable signed Windows

Requires:

- signed Client/Server installers;
- valid blockmap/`latest.yml`;
- immutable tag/version metadata;
- installed n-1 → n update test;
- clean install/uninstall/upgrade acceptance;
- package/runtime security acceptance.

Packaged Client defaults to official GitHub Releases provider. Custom feed requires explicit HTTPS configuration and does not bypass signature policy.

## 13. Windows test mode

`--test-mode`, installer test shortcut or `NEXORA_CLIENT_TEST_MODE=1` opens PowerShell tail of local Client log.

Use only for controlled diagnostics. It does not enable DevTools, Node integration or remote debugging. Sanitize logs before sharing.

## 14. Pulse deployment

### Disabled

Local messaging without commercial features.

### Sandbox

QA/demo only:

- no payment;
- checkout disabled;
- no production signature/entitlement;
- non-negative balance;
- disabled when production Pulse configured.

### Production

Requires separate Pulse Cloud, HTTPS, scoped service credential, pinned Ed25519 keys, provider webhooks/idempotency, email, reconciliation/refund/dispute flows, secret management и privacy/legal/tax documents.

Local Server must not receive card data, Cloud password/MFA secret, signing private key или OAuth refresh token.

## 15. Incident checklist

Record:

- versions/channel/tag/commit;
- Server ID/request ID;
- timestamps;
- deployment/network profile;
- live/ready;
- schema/integrity/storage;
- backup status;
- Trust/device/KeyPackage/group/epoch state;
- updater state;
- sanitized logs.

Never send secrets, cookies, tokens, recovery codes, invite codes, private keys, production databases, full MLS state или backup passphrase.

Detailed procedures: [Operations Runbook](OPERATIONS_RUNBOOK.md).
