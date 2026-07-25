# Nexora 3.6.0 — Release verification

> Status: BLOCKED / implementation candidate. This record must remain factual. Pending external checks are not treated as passed.

## Source and migration gates

- [ ] Exact release commit is identified and immutable.
- [ ] `npm ci` succeeds on clean runners.
- [ ] Release metadata consistency passes.
- [ ] Syntax, production web build and Electron builder configuration pass.
- [ ] Unit, API, integration, realtime and direct-bypass tests pass.
- [ ] Performance and bounded soak tests pass.
- [ ] Security invariant and production dependency audits pass with no high/critical findings.
- [ ] Schema 9 → 10 backup, transaction, integrity, restore and newer-schema rejection are verified.

## Connect security gates

- [ ] Block/privacy bypass is impossible through both legacy and `/api/v3` REST paths.
- [ ] Unauthorized users and unrelated sessions cannot observe or join call signaling.
- [ ] Signaling payload and spam limits are enforced and replay conflicts fail closed.
- [ ] Session revoke, account disable, block and server shutdown terminate calls.
- [ ] TURN credentials are short-lived, call/session-scoped and absent from logs/diagnostics.
- [ ] Read-receipt and presence privacy apply at query and realtime emission time.
- [ ] Microphone and peer connection are released after every terminal path.

## Platform acceptance

- [ ] Signed Windows Client/Server installed on Windows 10.
- [ ] Signed Windows Client/Server installed on Windows 11.
- [ ] Signed Android artifact installed on supported physical devices.
- [ ] Installed PWA acceptance completed in supported browsers.
- [ ] Windows ↔ Android call matrix passed.
- [ ] Windows ↔ PWA call matrix passed.
- [ ] Android ↔ PWA call matrix passed.
- [ ] TURN-only, network handover, permission denial/recovery and device removal passed.

## Publication gates

- [ ] Independent security review evidence is complete with no unresolved high/critical findings.
- [ ] Authenticode and Android signatures are verified against approved identities.
- [ ] SPDX SBOM and SHA256SUMS are generated and verified.
- [ ] Immutable annotated tag `v3.6.0` points to the verified release commit.
- [ ] GitHub Release assets are re-downloaded and pass checksum, signature, container and smoke verification.
- [ ] Post-merge and post-publication CI run IDs and final digests are recorded in release evidence.

## Current conclusion

Stable publication is not authorized. The current branch may be reviewed and tested as an implementation candidate only.
