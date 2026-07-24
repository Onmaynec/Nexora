# Индекс веток Nexora 3.4.0

Документ фиксирует назначение и lifecycle сохраняемых веток. Git refs, Pull Request states, tags и branch protection в GitHub остаются authority для repository operations.

## 1. Authoritative branch

| Branch | Product state | Documentation policy |
|---|---|---|
| `main` | Nexora `3.3.4` post-MLS source baseline; official publication evidence проверяется отдельно | Единственный merged current source of truth |

New work starts from latest verified `main`, если approved release plan явно не требует отдельной release branch.

## 2. Active release candidate

| Branch | Purpose | Status |
|---|---|---|
| `release/3.4.0-stable-core-v2` | Nexora `3.4.0` Stable Core release candidate | Draft PR #96; merge/tag/release blocked by external evidence |

Эта ветка создана от merge-коммита post-MLS baseline `6202bbdf8ff636711d9874452958df5dd40d9656`. Она не наследует mixed-scope history старого PR #69.

## 3. Superseded release work

| Branch / PR | Purpose | Status |
|---|---|---|
| `release/3.4.0-stable-core` / PR #69 | ранняя смешанная реализация 3.4.0 до отдельного prerequisite baseline | PR closed; не использовать для merge/tag/release |
| `release/3.3.4-post-mls` / PR #70 | post-MLS prerequisite source baseline | merged into `main` as `6202bbdf8ff636711d9874452958df5dd40d9656` |

## 4. Historical merged release branches

Исторические ветки 3.1.x–3.3.x сохраняются только как provenance. Они не являются current documentation и не должны обновляться так, чтобы имитировать `main` или `3.4.0`.

Примеры завершённых линий:

- `agent/nexora-3.1.0-final`;
- `agent/nexora-3.1.1-production-hardening`;
- `agent/nexora-3.1.2-final`;
- `agent/nexora-3.2.0-trust-core-mls`;
- `agent/nexora-3.2.1-login-shutdown-fix`;
- `agent/nexora-3.2.3-security-hardening`;
- `agent/nexora-3.2.4-updater-mls-recovery`;
- historical website/documentation branches merged through their PRs.

Trust/MLS branches описывают историческую реализацию. Executable Trust/MLS runtime в current Stable Core retired; их наличие в historical branch не означает current support.

## 5. Website и documentation branches

Merged website/documentation branches сохраняют provenance. Current website/documentation source берётся только из `main` и активного PR #96.

Documentation-only PR:

- не меняет product version;
- не создаёт release/tag;
- не изменяет runtime/dependencies/migrations без отдельного scope;
- проходит existing CI и website validation.

## 6. Obsolete automation branches

Automation/helper branches без активного PR или release role должны быть закрыты/удалены после сохранения необходимого provenance. Их нельзя использовать для tag, release или updater metadata.

## 7. Branch documentation requirements

Каждая retained non-main branch должна иметь `BRANCH_STATUS.md` с:

- exact branch name;
- classification;
- branch-local version/scope;
- relationship to PR/release;
- current source-of-truth pointer;
- merge/tag/release prohibition, если применимо;
- deletion/closure rule.

## 8. Governance rules

1. `main` — единственный merged current source of truth.
2. Active development различает implemented, verified и planned scope.
3. Merged/superseded branches не обновляются, чтобы имитировать current product.
4. Release claim требует matching SemVer, green CI, evidence, immutable tag и distribution state.
5. `Stable`, `signed`, `production-ready` и `independently reviewed` не заявляются без фактических evidence.
6. Branch без активной цели закрывается/удаляется после provenance review.
7. Security/reliability fixes используют regression-first подход.
8. Temporary patch/diagnostic workflows удаляются до merge.

## 9. Current product boundary

- target version: `3.4.0` release candidate;
- writable messaging: ordinary server-readable messaging;
- Trust/MLS runtime: retired;
- legacy secure history: read-only, no server-side decryption;
- Application API: v3;
- Local Server database: schema 8;
- stable publication: blocked by verified `v3.3.4`, Authenticode, Windows 10/11 acceptance, independent review и final green gates.
