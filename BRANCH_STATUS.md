# Branch Status — `agent/nexora-3.2.2-trust-bootstrap-race`

| Field | Value |
|---|---|
| Classification | Merged patch provenance |
| Branch-local target | Nexora `3.2.2` Trust bootstrap renderer-race fix |
| Related Pull Request | PR `#19` |
| Base release | `3.2.1` |
| Current source of truth | `main`, Nexora `3.2.4` |

This branch corrected the `TRUST_NOT_CONFIGURED` cold-login race by configuring Trust scope before child passive effects and making pre-configuration encrypted-draft reads safe without hiding real Trust failures.

The previous status incorrectly described `main`/3.2.0. This branch is historical patch evidence and does not contain 3.2.3 security hardening or 3.2.4 updater/Welcome recovery behavior.

Do not tag, publish or continue development from this branch. Use current `main` documentation for supported behavior.
