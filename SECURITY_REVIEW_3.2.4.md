# Nexora 3.2.4 — Security Review

## Scope

This review covers the patch-release changes for Client updates, the local Server developer console, MLS Welcome recovery, post-update notes, the NSIS installer and Windows Client test mode.

## Update channel

- The packaged Client defaults to the GitHub Releases provider for `Onmaynec/Nexora`.
- A custom generic feed is accepted only through an explicit environment/config override and only when its URL uses HTTPS.
- `allowDowngrade` and prerelease updates remain disabled.
- The Windows builder keeps `verifyUpdateCodeSignature: true`.
- Unsigned `.exe`, `.blockmap` and `latest.yml` assets remain blocked by the existing Authenticode release gate; the Client does not silently downgrade to an unsigned installer.
- Update errors are normalized for the UI without exposing stack traces or internal paths.

## Server developer console

- The console still executes only commands registered in `DeveloperCommandService`; it does not expose a shell, filesystem access or arbitrary JavaScript execution.
- IPC failures are returned as stable `{ code, message }` values instead of Electron wrapper text.
- Help placeholders such as `<user>` and `[days]` are normalized as data. They are not evaluated and never reach a shell.
- Mutating commands continue to write an administrative audit record without storing command argument values.

## MLS Welcome recovery

- The recovery endpoint requires an authenticated session, CSRF validation, conversation access and a verified active Trust device.
- Room bans are checked before a request is accepted.
- Requests use the bounded Trust recovery rate limiter and return stable `RATE_LIMITED` responses.
- The request contains identifiers and timing metadata only; it does not send private keys, exporter secrets or plaintext message content through the Server.
- Notifications are delivered only to verified active devices that already belong to the MLS group.
- An active group member still creates and signs the RFC 9420 commit and Welcome. The Server only records and routes opaque protocol artifacts.
- If no active group device is online, sending remains blocked instead of bypassing MLS or falling back to plaintext.

## Post-update notes and test mode

- Release-note links are fixed to the official `Onmaynec/Nexora` release tag and are opened through Electron `shell.openExternal`.
- The “Не показывать снова” state is stored under Electron `userData` and contains version/display state only.
- Test mode is opt-in through `--test-mode`, the installer shortcut or `NEXORA_CLIENT_TEST_MODE=1`.
- The PowerShell window tails the existing local Client log; it does not enable DevTools, Node integration in the renderer, a remote debugging port or an administrative IPC surface.
- Renderer console messages are flattened, length-limited and written through the existing Client log path.

## Compatibility

- Local Server schema remains `8`.
- Application API v3 and Trust/MLS API v4 remain compatible.
- No database migration is required for 3.2.4.
