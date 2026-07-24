# Operations and Support

## Operational surfaces

- Local Server startup and readiness;
- TLS/certificate configuration;
- SQLite integrity, WAL behavior and storage quotas;
- backups, restore and retention;
- media storage and temporary-file cleanup;
- request IDs, structured logs and credential redaction;
- graceful drain and serialized shutdown;
- release/update channels and signing state.

## Health model

Operators should distinguish:

| Signal | Purpose |
|---|---|
| Liveness | Process is running and not irrecoverably stuck |
| Readiness | Server can safely accept requests |
| Metrics | Bounded operational telemetry without secrets or message content |
| Request ID | Correlates client error, API response and sanitized logs |

## Backup and restore principles

- Create a consistent database and file-set snapshot.
- Verify backup integrity before reporting success.
- Do not mix a database with media from another snapshot.
- Test restore on a separate destination before emergency use.
- Protect backup material as sensitive user data.
- Preserve downgrade protection when schema changes.

## Incident handling

1. Capture version, branch/tag, platform and deployment profile.
2. Preserve sanitized request IDs and short log excerpts.
3. Determine whether the failure affects confidentiality, integrity or availability.
4. Revoke exposed sessions/credentials where applicable.
5. Stop unsafe update, migration or upload processing before retrying.
6. Use a private Security Advisory for suspected vulnerabilities.
7. Document root cause, remediation, regression tests and remaining limitations.

## Support boundaries

Public Issues are suitable for reproducible defects and feature requests. They are not suitable for credentials, private user content, vulnerability details or production databases.

## References

- [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md)
- [`ADMIN_GUIDE.md`](../../ADMIN_GUIDE.md)
- [`docs/OPERATIONS_RUNBOOK.md`](../OPERATIONS_RUNBOOK.md)
- [`docs/GITHUB_RELEASE.md`](../GITHUB_RELEASE.md)
- [`SUPPORT.md`](../../SUPPORT.md)
- [`SECURITY.md`](../../SECURITY.md)