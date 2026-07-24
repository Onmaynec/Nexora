# Nexora 3.2.4 — Release Verification

## Classification

- Version: `3.2.4`.
- Base release: `3.2.3`.
- Pull Request: `#21`.
- Merge commit: `ebfda9e401d352f6686f8d3bb337190ac9e6967f`.
- Release tag: `v3.2.4`.
- Date: `2026-07-22`.
- Distribution classification: Source/PWA prerelease until signed Windows assets and installed-runtime acceptance are available.

## Reported regressions

The patch was driven by the provided Windows screenshots and repository inspection:

1. Client automatic update checks did not produce a usable update lifecycle.
2. The Client “Проверить обновления” action did not expose progress, a terminal result or an actionable error.
3. Server console commands copied from `help`, such as `plus grant <netrox> [1]`, treated the documentation wrappers as literal identifier data and exposed Electron IPC wrapper errors.
4. A verified device without local MLS group state could remain indefinitely in `MLS_WELCOME_PENDING`, blocking the common secure path used by text, encrypted media and voice messages.
5. No post-update release summary, branded installer experience or opt-in Windows log console existed.

## Confirmed root causes

- The Client update service was created after the renderer window, allowing update IPC to be queried before service initialization.
- Client update configuration had no dependable default GitHub Releases provider and manual checks depended on updater events without a returned-result fallback.
- The Settings update card did not guard concurrent checks or present checking, download, terminal and retry states.
- Developer-command help used `<...>` and `[...]` notation, while execution passed copied wrappers directly to user lookup; thrown command errors crossed IPC as generic remote-method failures.
- MLS recovery supported claiming an already-created Welcome but had no authenticated request path that notified an active verified group member to create one for a pending device.

## Implemented corrections

### Updates

- Packaged Client defaults to the GitHub Releases provider for `Onmaynec/Nexora`.
- Custom generic update feeds are accepted only through explicit configuration and HTTPS.
- Automatic checks run after startup and then on a bounded schedule.
- Manual checks are single-flight and derive a terminal state from `checkForUpdates()` when Electron Updater emits no terminal event.
- The UI exposes checking, progress, current, available, downloaded, error and retry states with duplicate-action prevention.
- Downgrades and prerelease channels remain disabled; signed-update verification remains enabled in the Windows builder.

### Server console

- IPC returns stable `{ code, message }` command failures instead of Electron wrapper text.
- Help explicitly distinguishes placeholder notation from literal values.
- `<user>`, `[days]` and equivalent copied wrappers are normalized as inert data across Plus, Pulse and Impulse commands.
- The audited command registry remains the only execution surface; no shell, eval or arbitrary filesystem command was added.

### MLS Welcome recovery

- Added `POST /api/v4/trust/conversations/:conversationId/welcome/request` under the existing session, Origin/CSRF, conversation-access, ban, verified-device and bounded-rate-limit controls.
- The Server emits only a scoped `mls.welcome_requested` notification to verified active devices already in the MLS group.
- An active Client creates the RFC 9420 commit and Welcome; the Server continues to store and route opaque protocol data only.
- The pending Client requests recovery and retries the one-time Welcome claim for a bounded period.
- If no active member can create a Welcome, the Client remains fail-closed rather than sending plaintext.

### Windows experience

- Added a per-version post-update summary with “Подробнее”, “Закрыть” and “Не показывать снова”; the details action opens the exact official GitHub release tag.
- Added opt-in `--test-mode` and installer shortcut support, opening a PowerShell console that tails the local Client log.
- Renderer console records are flattened and length-limited before persistence.
- Client and Server NSIS configurations use Nexora icons, a branded sidebar and Russian installer language.

## Regression coverage

- `test/update-service.test.cjs` — GitHub provider, returned-result fallback, scheduling, semantic version comparison and stable errors.
- `test/client-update-ui.test.cjs` — progress/terminal/retry UI and duplicate-check prevention.
- `test/developer-commands.test.cjs` — copied placeholder normalization, command registry and audit behavior.
- `test/mls-welcome-recovery.test.cjs` — verified pending-device request and redundant-request suppression.
- `test/release-experience.test.cjs` — first-launch summary, dismissal, official details link and test-mode switches.
- Existing Trust Core, Socket.IO, recovery, plaintext-downgrade, encrypted-attachment, schema, performance and security suites remain enabled.

## Automated evidence

### Full implementation gate

CI run `#334`, run ID `29942843275`, passed the core 3.2.4 implementation through:

- Windows `npm run check`;
- Windows `npm run test:unit`;
- Windows `npm run test:performance`;
- Windows `npm run audit:security`;
- Linux `npm test`;
- dedicated `npm run release:check`;
- schema 8 soak;
- Android `gradle -p android :app:assembleDebug --no-daemon`.

### Final Client update UI gate

Workflow run ID `29943138162` passed `npm run check`, `npm run test:unit` and `npm run audit:security` after the observable/retryable update-card correction.

### Main synchronization and documentation gate

Workflow run ID `29943715320` merged the then-current `main`, applied the 3.2.4 documentation synchronization, then passed `npm run check`, `npm run test:unit` and `npm run audit:security` before committing the synchronized source.

### Merge-head multi-platform gate

CI run `#343`, run ID `29943869863`, completed successfully before merge:

- Windows `npm run check` — passed;
- Windows `npm run test:unit` — passed;
- Windows `npm run test:performance` — passed on rerun without a code change after one timing-sensitive runner failure;
- Windows `npm run audit:security` — passed;
- Linux `npm test` — passed;
- `npm run release:check` — passed;
- schema 8 soak — passed;
- Android `assembleDebug` — passed.

PR #21 was merged by squash into `main` as `ebfda9e401d352f6686f8d3bb337190ac9e6967f`, and immutable tag `v3.2.4` points to version `3.2.4` source.

## Security review

The release-specific analysis is recorded in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Key preserved boundaries:

- no unsigned-update fallback or downgrade;
- no shell/eval console execution;
- no private MLS key or plaintext transfer through Welcome recovery;
- verified device/group scope and bounded request rate;
- fail-closed behavior when recovery cannot complete;
- no DevTools, Node integration or remote-debugging enablement in test mode.

## Compatibility

- Local Server schema: `8` — unchanged.
- Application API: v3 — unchanged.
- Trust/MLS/encrypted-media API: v4 — backward-compatible route extension.
- No database migration is required from `3.2.0–3.2.3`.
- Existing schema 7 → 8 migration remains required for 3.1.x data.

## Distribution boundary

Without both Authenticode secrets, the release workflow publishes Source/PWA, SPDX SBOM and SHA-256 checksums as a prerelease. Unsigned `.exe`, `.blockmap` and `latest.yml` updater assets remain blocked. Consequently, packaged Windows auto-update can be accepted as end-to-end verified only after signed release assets are produced and installed-client runtime testing passes.

## Remaining manual acceptance

- installed Windows Client update from an older signed build to 3.2.4;
- Client and Server NSIS visual/runtime acceptance on supported Windows versions;
- test-mode shortcut and PowerShell log tail on a clean Windows account;
- two-device MLS Welcome recovery for text, image/file and voice payloads on the packaged Client;
- no-active-member timeout behavior and simultaneous multi-member Welcome race;
- physical Android and installed PWA smoke testing.
