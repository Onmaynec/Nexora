# Nexora 3.2.1 — Login and Server Shutdown Bugfix

Nexora 3.2.1 is a focused patch release for two regressions introduced in the 3.2.0 Trust/MLS integration. It contains no database migration, API breaking change, protocol change, or unrelated feature work.

## Fixed: infinite loading after login

After a successful login, the Client could remain indefinitely on **«Собираем ваши чаты»**.

### Root cause

The initial `/api/bootstrap` request was started only from the Socket.IO effect after a Trust device was available. Trust device initialization itself required `bootstrap.server.id`. This created a circular dependency:

1. bootstrap waited for Trust device initialization;
2. Trust device initialization waited for bootstrap;
3. the workspace was never rendered.

### Correction

The authenticated Client now requests `/api/bootstrap` immediately after a valid user session is established and before Trust enrollment. Trust initialization and device-scoped Socket.IO connection continue only after the bootstrap response supplies the authoritative Server ID.

## Fixed: JavaScript exception when closing Nexora Server

Closing the Windows Server application could display an Electron main-process exception:

```text
PulseRepositoryError: SQLite store закрыт.
```

### Root cause

The shutdown sequence closed SQLite and then built another status snapshot. Pulse and Trust status providers attempted to query repository state through database handles that had already been closed. Electron Server shutdown was also not serialized, so overlapping stop/quit paths could inspect the same instance during teardown.

### Correction

- Electron Server shutdown is single-flight and detaches the active instance before closing it;
- final UI status uses the stopped fallback state rather than a closing instance;
- expected `PULSE_LOCAL_STORE_UNAVAILABLE` during a post-close status snapshot is represented as zero loaded Pulse keys;
- Trust status reads the current `store.db` handle and returns a closed-state snapshot when the database is unavailable;
- unexpected repository/database failures are still propagated and are not hidden;
- `before-quit` records a shutdown failure instead of producing an unhandled rejection dialog.

## Regression coverage

The patch adds tests that verify:

- the 3.2.0 implementation reproduces both failures before the fix;
- authenticated Client bootstrap is independent of Trust device creation;
- Pulse status remains readable after the local repository closes;
- unexpected Pulse repository errors are still raised;
- complete schema 8 server status remains readable after `close()`;
- existing production build, unit/API/integration, performance, security, soak and Android source gates remain intact.

## Compatibility

- version: `3.2.1`;
- Local Server database schema: `8` (unchanged);
- application API: v3 (unchanged);
- Trust/MLS/encrypted-media API: v4 (unchanged);
- Client handshake: `3.2.1`;
- existing 3.2.0 schema 8 data is used directly without manual migration.

## Distribution policy

When Authenticode credentials are unavailable, the release workflow publishes a Source/PWA prerelease with source ZIP, PWA ZIP, SPDX SBOM and SHA-256 checksums. Unsigned `.exe`, `.blockmap` and `latest.yml` updater assets remain intentionally blocked.
