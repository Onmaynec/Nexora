# Nexora 3.2.1 — Release Verification

## Classification

- Version: `3.2.1`.
- Base release: `3.2.0`.
- Bugfix Pull Request: `#16`.
- Release-gate stabilization Pull Request: `#18`.
- Verified bugfix implementation/documentation commit: `a1d406296083504d1dc9d14e021a3c233a5fd41c`.
- Verified stabilized release-gate commit: `48d7ac009dcb2d2f06c36093ccb0caa3c287cdc3`.
- GitHub Actions: CI run `#274`, run ID `29928695869`.
- Date: `2026-07-22`.
- Result: automated patch-release gate passed.

This report verifies the source/build/test behavior of the specified commits. Packaged Windows runtime validation and Authenticode signing remain separate release-workflow gates.

## Reported defects

### Client remained on «Собираем ваши чаты»

The authenticated Client had no independent bootstrap trigger. The first `refresh()` call was inside the device-scoped Socket.IO effect, while that effect required a Trust device. Trust enrollment required `bootstrap.server.id`, creating a bootstrap ↔ Trust circular dependency.

### Nexora Server displayed an exception while closing

The shutdown path closed SQLite and then requested another decorated status snapshot. `PulseCloudClient.status()` called `repository.keyRegistry()` after repository close, and `TrustCore.status()` retained a direct database handle. The resulting `PULSE_LOCAL_STORE_UNAVAILABLE` rejection reached Electron's main process during quit.

## Implemented corrections

- authenticated Client requests `/api/bootstrap` before Trust enrollment;
- Trust initialization remains bound to the authoritative Server ID returned by bootstrap;
- Electron Server stop is single-flight through the `stopping` Promise;
- the active Electron Server instance is detached before `close()` begins;
- start waits for an in-progress stop operation;
- `before-quit` handles and records shutdown rejection instead of leaving it unhandled;
- Pulse status treats only the expected closed-repository lifecycle code as an unavailable key registry;
- unexpected Pulse repository errors are still thrown;
- Trust status uses the current `store.db` reference and returns a valid closed-state snapshot when SQLite is unavailable;
- version metadata is synchronized as `3.2.1` for package, lockfile, Android and Client handshake.

## Regression tests

`test/regression-3.2.1.test.cjs` verifies:

1. Pulse status is readable after local SQLite repository close;
2. unexpected repository/database failures are not hidden;
3. authenticated Client bootstrap does not wait for Trust device creation;
4. Electron Server detaches and serializes its instance before SQLite close;
5. complete schema 8 server status remains readable after `instance.close()`;
6. Pulse and Trust stopped-state counters remain stable after close.

The initial tests-only commit reproduced both defects: CI run `#255` (`29925221728`) failed before the production correction was applied.

## Release-gate stabilization

The first merged `main` candidate correctly did not publish a tag because CI run `29927717990` failed only in the strict Windows performance smoke. Linux `npm test`, `release:check`, schema 8 soak and Android all passed. The measured 120-message burst took `22,753 ms` against the unchanged `20,000 ms` budget.

The test process was isolated, but it still included first-use Socket.IO state, JavaScript/JIT initialization and SQLite statement preparation in the steady-state timing window. The benchmark methodology was corrected without increasing the budget:

1. connect the same 20 clients;
2. send one unmeasured warm-up message from every client;
3. require all 20 acknowledgements;
4. drain the serialized SQLite queue with `store.flush()`;
5. verify all warm-up messages are durable;
6. start the timer;
7. send the same concurrent 120-message measured burst;
8. flush before final count/integrity validation;
9. require the measured burst to remain below `20,000 ms`.

The test handshake now also presents Client version `3.2.1`. Production Client/Server behavior, schema, API and release metadata were not changed by this stabilization.

## Automated gate results

### Windows verify

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run check` | PASS |
| `npm run test:unit` | PASS |
| strict warmed `npm run test:performance` | PASS |
| `npm run audit:security` | PASS |

`npm run check` includes syntax checks, Electron Builder configuration validation and the production Vite build.

### Linux full suite

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm test` | PASS |

The suite includes the production web build, complete Node test set and isolated schema 8 performance smoke.

### Dedicated release gate

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run release:check` | PASS |

The release gate verifies synchronized `3.2.1` metadata and reruns production build, unit/API/integration tests, performance test and security audit.

### Schema 8 soak

| Step | Result |
|---|---|
| `npm run test:soak` | PASS |

The database schema remains version 8. The soak test repeats state mutations, backups and SQLite integrity checks.

### Android source build

| Step | Result |
|---|---|
| Java 17 / Gradle 8.13 setup | PASS |
| `gradle -p android :app:assembleDebug --no-daemon` | PASS |

## Version, schema and API compatibility

- `package.json`: `3.2.1`;
- `package-lock.json`: `3.2.1`;
- Client handshake: `3.2.1`;
- Android `versionName`: `3.2.1`;
- Android `versionCode`: `30201`;
- Local Server schema: `8` (unchanged);
- application API: v3 (unchanged);
- Trust/MLS/encrypted-media API: v4 (unchanged);
- no database migration is required from 3.2.0.

## Security review of the fix

- no authorization, role, membership or cryptographic validation was weakened;
- the Client still uses the server-provided ID before Trust enrollment;
- only the explicit lifecycle error `PULSE_LOCAL_STORE_UNAVAILABLE` is converted into a stopped-state value;
- corruption and other unexpected database errors continue to fail visibly;
- shutdown does not reopen SQLite or access data after the repository is closed;
- temporary patching workflows/scripts were removed before the verified candidate head;
- no secret, token, private key or plaintext message data was added to logs.

## Distribution boundary

The repository release workflow publishes signed Windows installers only when the required Authenticode credentials are configured. Otherwise it publishes a Source/PWA prerelease containing source ZIP, PWA ZIP, SPDX SBOM and SHA-256 checksums, while withholding unsigned `.exe`, `.blockmap` and `latest.yml` updater assets.

## Decision

Automated verification for stabilized commit `48d7ac009dcb2d2f06c36093ccb0caa3c287cdc3` is **PASS**. The two reported regressions are covered by tests, the strict 20-second performance budget remains enforced after an explicit warm-up/flush boundary, and Nexora `3.2.1` is eligible for final merge and GitHub release subject to the documentation-only CI remaining green.
