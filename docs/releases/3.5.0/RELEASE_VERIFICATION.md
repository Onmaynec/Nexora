# Nexora 3.5.0 — Release Verification

Status: release candidate; publication blocked.

## Internal gates

| Gate | Status | Evidence |
|---|---|---|
| Schema 8 → 9 migration, backup and integrity | Implemented | automated migration and API integration tests |
| Replay/outbox ordering and idempotency | Implemented | regression tests and reconnect contract |
| PWA shell cache/update lifecycle | Implemented | source/build checks; installed browser matrix pending |
| Android source build | Implemented | CI debug assembly; signed device acceptance pending |
| Push token privacy | Implemented | AES-256-GCM storage and no-plaintext tests |
| Resumable media offset/hash/policy | Implemented | API tests; restart/device fault matrix pending |
| Multi-profile isolation | Implemented | scoped cache/outbox contracts; extended acceptance pending |

## Mandatory external gates

- v3.4.0 must exist as a verified published release;
- independent review evidence must be approved;
- Android, PWA and Windows acceptance evidence must be completed;
- signing credentials and signatures must be verified;
- production push adapter prerequisites must be configured and tested;
- final CI, performance/soak, security audit, packaged smoke and asset re-download verification must pass.

## Publication state

No v3.5.0 tag or GitHub Release may be created while any item above is incomplete. Unsigned artifacts are test evidence only and must be marked UNSIGNED-TEST.
