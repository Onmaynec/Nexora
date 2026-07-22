# Branch Status — `agent/nexora-3.2.3-security-hardening`

| Field | Value |
|---|---|
| Classification | Merged security-patch provenance |
| Branch-local target | Nexora `3.2.3` Trust resource and recovery hardening |
| Related Pull Request | PR `#20` |
| Base release | `3.2.2` |
| Current source of truth | `main`, Nexora `3.2.4` |

This branch added BasicCredential binding, distinct key-role checks, Trust device and KeyPackage ceilings, bounded route limiting, strict missed-commit validation, active-ban fail-closed access and security-state cleanup.

The previous status incorrectly described `main`/3.2.0. Release-specific notes and verification remain historical 3.2.3 evidence and must not be rewritten to claim 3.2.4 behavior.

Do not tag, publish or continue product work from this branch. Current security and release documentation is maintained on `main`.
