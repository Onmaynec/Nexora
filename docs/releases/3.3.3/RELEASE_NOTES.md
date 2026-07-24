# Nexora 3.3.3 — Release Notes

Nexora 3.3.3 is a patch release for Electron and Web/PWA based on 3.3.2.

## Fixed

- The room goal action now opens an accessible form with required title, description, target Impulses and deadline.
- Owners and moderators can create goals; one active goal per room is enforced, contributions remain atomic, cancellation refunds are preserved, and goal lifecycle actions are audited and surfaced as system events.
- Secure voice messages now provide microphone-level recording bars, persistent waveform metadata, animated playback progress, play/pause, pointer and keyboard seeking, finite duration handling and 1×/1.5×/2× playback.
- Pulse catalog purchases now apply server-defined profile, message, reaction and room effects and expire back to safe defaults.
- Purchase, contribution and goal requests send a stable Idempotency-Key in the header and compatibility body; duplicate requests reuse the original result without a second debit.
- Conversations force an MLS epoch check when opened and can recover missing or inconsistent local state through a fresh device-scoped Welcome.

## Security

- Pulse effects are resolved only from the server-owned catalog allowlist.
- Goal authorization, limits and input validation are enforced by the Local Server.
- MLS recovery removes only the authenticated current device membership, requires another active verified peer and never falls back to plaintext.
- Message sending remains blocked until MLS synchronization succeeds.

## Distribution

Windows Client and Server builds are published as `UNSIGNED-TEST` artifacts because code-signing secrets are not configured. PWA is included. Updater metadata is intentionally absent for unsigned installers.
