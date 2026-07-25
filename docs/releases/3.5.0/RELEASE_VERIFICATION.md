# Nexora 3.5.0 — Release Verification

Status: release candidate; source promotion may proceed, while artifact publication remains blocked by external evidence and credentials.

## Internal gates

| Gate | Status | Evidence |
|---|---|---|
| Schema 8 → 9 migration, backup and integrity | Implemented | automated migration and API integration tests |
| Replay/outbox ordering and idempotency | Implemented | regression tests and reconnect contract |
| PWA shell cache/update lifecycle | Implemented | source/build checks; installed browser matrix pending |
| Android source and signing policy | Implemented | CI debug assembly plus fail-closed release signing and `apksigner` identity checks; signed device acceptance pending |
| Push token privacy | Implemented | AES-256-GCM storage, no-plaintext API/diagnostics and round-trip tests |
| Production push transport | Implemented | HTTPS-only endpoint, DNS pinning, private-target rejection, HMAC authentication, bounded response, durable retry and token revocation tests |
| Resumable media offset/hash/policy | Implemented | API tests; restart/device fault matrix pending |
| Multi-profile isolation | Implemented | scoped cache/outbox contracts; extended acceptance pending |
| Stable Windows/Android publication path | Implemented | signed-only 3.5.0 workflow, signer checks, SBOM, checksums and re-download verification |

## Approved 3.4.0 baseline exception

The repository owner approved using the verified Nexora 3.4.0 source baseline without requiring an Authenticode-signed 3.4.0 publication. The 3.4.0 source was promoted to `main` through PR #98.

This exception applies only to the predecessor baseline. It does not classify unsigned 3.4.0 installers as signed, does not remove their `UNSIGNED-TEST` status, and does not weaken signing or identity verification for final 3.5.0 Windows and Android artifacts.

## Mandatory external gates for artifact publication

- independent review evidence must be approved with zero unresolved high/critical findings;
- Android, PWA and Windows installed acceptance evidence must be completed;
- Windows Authenticode and Android keystore credentials must be present and signer identities verified for 3.5.0;
- a real production push-gateway endpoint and HMAC secret must be configured, followed by provider delivery acceptance;
- final CI, performance/soak, security audit, packaged smoke and asset re-download verification must pass on the exact release commit.

## Publication state

Source merge and release-artifact publication are separate decisions. The 3.5.0 source may be merged after exact-head CI passes. No stable `v3.5.0` GitHub Release may be published while the remaining artifact gates above are incomplete. Debug or otherwise unsigned artifacts are test evidence only and must be clearly marked `UNSIGNED-TEST`; the stable workflow publishes no unsigned Windows or Android fallback.
