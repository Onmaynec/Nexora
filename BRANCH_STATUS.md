# Branch Status — `agent/nexora-3.2.1-performance-gate-stabilization`

| Field | Value |
|---|---|
| Classification | Merged test/release-gate provenance |
| Branch-local target | Nexora `3.2.1` Windows performance-gate stabilization |
| Related Pull Request | PR `#18` |
| Production code impact | None; benchmark boundary only |
| Current source of truth | `main`, Nexora `3.2.4` |

This branch added an unmeasured warm-up and queue flush before the unchanged strict 120-message performance measurement, separating first-use runner/JIT/SQLite preparation from steady-state throughput.

The previous status incorrectly identified this branch as `main`/3.2.0. This branch is historical test methodology provenance and not a release source.

Do not tag, publish or continue development from this branch. Current test and release guidance is maintained on `main`.
