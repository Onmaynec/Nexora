# Nexora 3.5.0 — Release Verification

Status: release candidate; publication blocked by external evidence and credentials.

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
| Stable Windows/Android publication path | Implemented | signed-only workflow, signer checks, SBOM, checksums and re-download verification |

## Mandatory external gates

- `v3.4.0` must exist as a verified non-prerelease stable publication with signed installers and updater metadata;
- independent review evidence must be approved with zero unresolved high/critical findings;
- Android, PWA and Windows installed acceptance evidence must be completed;
- Windows Authenticode and Android keystore credentials must be present and signer identities verified;
- a real production push-gateway endpoint and HMAC secret must be configured, followed by provider delivery acceptance;
- final CI, performance/soak, security audit, packaged smoke and asset re-download verification must pass on the exact release commit.

## Publication state

No `v3.5.0` tag or GitHub Release may be created while any item above is incomplete. Debug or otherwise unsigned artifacts are test evidence only and must be clearly marked `UNSIGNED-TEST`; the stable workflow publishes no unsigned Windows or Android fallback.
