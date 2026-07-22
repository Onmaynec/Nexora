# Branch Status — `agent/nexora-3.2.0-trust-core-mls`

## Classification

- Target version: `3.2.0` development.
- Base stable release: `3.1.2`.
- Pull Request: `#12`.
- Status: draft / experimental / not releasable.
- Production use: prohibited until the remaining blockers and external review are complete.

## Implemented and verified

- Local Server schema 8 migration with backup, integrity and downgrade checks;
- Ed25519 device identity, verification and revocation;
- one-time KeyPackage and conversation-scoped Welcome delivery;
- monotonic MLS epochs, signed commits and replay protection;
- ciphertext-only secure transport, persistence and durable outbox;
- encrypted IndexedDB state, KeyPackages, decrypted cache and drafts;
- Secure Message Pane with no plaintext fallback;
- Trusted Devices settings UI with fingerprint, verify, revoke and self-wipe;
- server-side guards for legacy send/forward/edit/draft/scheduled/poll/bot/upload paths;
- missed-commit recovery and explicit lost-state failure;
- schema, Trust Core, recovery, plaintext-guard and Alice/Bob interoperability tests;
- Windows production build, Linux full tests and Android source build on the current implementation line.

## Remaining release blockers

- encrypted attachments/images/voice and authenticated metadata format;
- metadata minimization and traffic-analysis review;
- broader multi-device concurrency, revoke/re-add and corrupted-state matrix;
- browser/Electron/Android runtime E2E beyond build verification;
- load, soak and long-offline recovery tests;
- final `3.2.0` version metadata, changelog, release notes and operator/tester verification documents;
- signing-machine release checks;
- independent cryptographic and application-security review.

## Documentation rule

Branch-local documents describe verified branch behavior and explicitly mark unsupported claims. Stable 3.1.2 documentation remains authoritative for production until a verified 3.2.0 release is merged.

## Safety

Do not use this branch for real private conversations or describe it as audited E2EE. Attachments are intentionally disabled in the secure pane until encrypted-media support exists. Test only with disposable accounts, devices, rooms and data.
