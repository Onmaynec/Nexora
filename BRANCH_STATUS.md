# Branch Status — `agent/nexora-3.2.5-ui-console-performance`

| Field | Value |
|---|---|
| Classification | Active draft patch development |
| Target version | Nexora `3.2.5` |
| Base product line | Nexora `3.2.4` |
| Related Pull Request | Draft PR `#25` |
| Current product source of truth | `main`, Nexora `3.2.4` |
| Release approval | Not granted |

## Intended patch scope

The draft branch is intended to address reported 3.2.4 regressions in:

- in-app release notes UX;
- Plus/Impulse SQLite persistence;
- image preview and voice waveform UX;
- MLS Welcome race and unnecessary full synchronization;
- optimistic send/bootstrap refresh behavior;
- message-row rendering and scroll stability;
- message-history visual network placement;
- Nexora Server console UI;
- local unsigned Windows packaging workflow;
- Russian 3.2.5 release documentation.

## Evidence state

This branch is under active development. The intended scope in PR #25 is not a current product guarantee. Regression-first and final CI evidence, compatibility statements and release verification must be completed before the branch can leave draft state.

Do not tag, publish, deploy as stable, or describe this branch as verified 3.2.5 until the Pull Request records a green final candidate and is merged.

Branch-local documentation applies only to this draft. Current supported product, security and operations guidance remains on `main` in `docs/README.md`.
