# Nexora Project Portfolio

> Канонический индекс планирования. GitHub Issues содержат проверяемый scope; `docs/ROADMAP.md` определяет последовательность релизов; `main` остаётся единственным current product source of truth.

## Активная программа

| Release | Working name | Issue | Current state | Dependency |
|---|---|---:|---|---|
| `3.3.4` | Post-MLS Baseline | [#74](https://github.com/Onmaynec/Nexora/issues/74) | In progress | — |
| `3.4.0` | Stable Core | [#75](https://github.com/Onmaynec/Nexora/issues/75) | Blocked | 3.3.4 published |
| `3.5.0` | Mobile Continuity | [#76](https://github.com/Onmaynec/Nexora/issues/76) | Planned | 3.4.0 |
| `3.6.0` | Connect | [#77](https://github.com/Onmaynec/Nexora/issues/77) | Planned | 3.5.0 |
| `3.7.0` | Communities | [#78](https://github.com/Onmaynec/Nexora/issues/78) | Planned | 3.6.0 |
| `3.8.0` | Workspaces | [#79](https://github.com/Onmaynec/Nexora/issues/79) | Planned | 3.7.0 |
| `3.9.0` | Ecosystem | [#80](https://github.com/Onmaynec/Nexora/issues/80) | Planned | 3.8.0 |
| `3.10.0` | Cloud Services | [#81](https://github.com/Onmaynec/Nexora/issues/81) | Planned | 3.9.0 |
| `3.11.0` | Organizations | [#82](https://github.com/Onmaynec/Nexora/issues/82) | Planned | 3.10.0 |
| `4.0.0` | Nexora Platform | [#83](https://github.com/Onmaynec/Nexora/issues/83) | Planned | 3.11.x |

Центральный portfolio issue: [#84](https://github.com/Onmaynec/Nexora/issues/84).

## GitHub Project model

### Fields

| Field | Allowed values |
|---|---|
| Status | Backlog · Ready · In progress · In review · Blocked · Done |
| Release | 3.3.4 · 3.4.0 · 3.5.0 · 3.6.0 · 3.7.0 · 3.8.0 · 3.9.0 · 3.10.0 · 3.11.0 · 4.0.0 |
| Priority | P0 · P1 · P2 |
| Area | Client · Server · Android · PWA · Cloud · Security · Docs · Release |
| Type | Epic · Feature · Bug · Security · Migration · Documentation |
| Evidence | Not started · Automated · Manual · External review · Published |

### Views

1. **Release Board** — group by Status, filter open items.
2. **Roadmap Timeline** — group by Release and dependency order.
3. **P0 Gates** — Priority=P0 or Type=Security/Migration.
4. **Platform Matrix** — group by Area.
5. **Docs & Evidence** — Type=Documentation or Area=Release.

## Work item policy

Every implementation issue must include:

- user/problem outcome;
- server-side authorization and validation boundary;
- schema/API/realtime compatibility;
- migration and rollback behavior where applicable;
- observable acceptance criteria;
- automated and manual evidence;
- explicit out-of-scope section;
- linked PR and release documentation.

## Completion gate

```text
source review -> threat model -> regression-first tests -> migration/backup
-> server authorization and validation -> API/realtime contracts
-> client/offline/error states -> security/performance/soak
-> Windows/PWA/Android acceptance -> docs/evidence
-> PR/CI/merge -> immutable tag -> GitHub Release -> asset re-download smoke
```

A later release must not begin until the previous release is merged, verified, tagged and published.