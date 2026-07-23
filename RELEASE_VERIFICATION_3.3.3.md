# Nexora 3.3.3 — Release Verification

## Required gates

- release metadata synchronization and consistency gate;
- syntax validation and Electron builder configuration check;
- Web/PWA production build;
- unit, API, Trust/MLS, Pulse and regression tests;
- performance tests;
- Client, Server and PWA artifact smoke checks;
- checksum verification of every published asset.

## Security invariants

- no plaintext fallback for secure conversations;
- verified-peer requirement for MLS rejoin;
- server-side owner/moderator goal authorization;
- one active goal per room;
- catalog allowlist for every purchased effect;
- idempotent wallet debits and contribution operations.

Final tag SHA, asset digests and smoke results are recorded in `release-evidence/current.json` after publication.
