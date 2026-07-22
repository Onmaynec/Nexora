# Nexora 3.1.2 Release Verification

## Проверенный объект

- release branch: `agent/nexora-3.1.2-final`;
- release branch head: `ee24ca52a09bf86b0481b874a23f62fa59c7bd10`;
- merged `main` commit: `9b554f4dd48d12d146153a63d7a9326379e618c3`;
- package version: `3.1.2`;
- API: v3;
- Local Server schema: 7.

## Scope

Проверены три regression families:

1. global voice dock dismissal и полный audio-state cleanup;
2. Electron updater initialization, scheduling, single-flight и stable missing-assets diagnostics;
3. Local Server Pulse sandbox commands, Plus/Impulse grants/revokes, non-negative balance и production isolation.

Unrelated feature work и schema changes в patch release не включались.

## Выполненные проверки

### Focused regression

| Проверка | Результат |
|---|---|
| voice dock full state/source cleanup | PASS |
| dock unmount after X | PASS |
| updater lazy initialization after app ready | PASS |
| updater initial check | PASS |
| six-hour scheduler / cleanup | PASS |
| concurrent checks single-flight | PASS |
| stable `no_installable_update` reason | PASS |
| Pulse sandbox admin/ledger invariants | PASS |

Итог focused suite: `8/8`.

### Release check

`npm run release:check` завершён успешно. Материализация release branch зафиксировала `100/100` passing tests после сохранения updater install-policy invariant.

### GitHub Actions CI

Workflow run `29866193220` завершён со статусом success.

| Job | Ключевые steps | Результат |
|---|---|---|
| `verify` | `npm ci`, `npm run check`, `npm run test:unit`, `npm run audit:security` | PASS |
| `linux-tests` | `npm ci`, `npm test` | PASS |
| `android-source` | JDK/Gradle setup, `gradle -p android :app:assembleDebug --no-daemon` | PASS |

## Security verification

Подтверждены следующие invariants:

- updater не ослабляет signature/install policy;
- Source/PWA-only или incomplete release не становится installable Windows update;
- Local Pulse sandbox автоматически блокируется при production Cloud configuration;
- sandbox checkout отключён;
- production signing keys/entitlements локально не создаются;
- wallet balance не может стать отрицательным;
- Plus monthly test grant не дублируется для активного entitlement period;
- mutating commands проходят allowlist/validation и записываются в audit;
- arbitrary shell/eval отсутствуют.

## Data и compatibility

- новая database migration в 3.1.2 отсутствует;
- schema остаётся 7;
- upgrade с 3.1.0/3.1.1 не изменяет schema;
- upgrade с 3.0.0 использует уже существующий verified schema 6 → 7 path;
- API остаётся v3;
- stable Client/Server version synchronised as 3.1.2.

## Что не подтверждает этот отчёт

- наличие публично опубликованных signed Windows assets;
- SmartScreen reputation;
- production provider settlement с реальными payment methods;
- 24-hour soak;
- внешний pentest;
- E2EE или готовность experimental 3.2.0 Trust Core/MLS branches.

Эти пункты должны проверяться отдельно перед соответствующим production rollout.

## Итог

Документированный automated release gate для 3.1.2 пройден: focused regressions, release check, Windows verify/security audit, Linux full tests и Android source build завершились успешно. Release остаётся subject to signing, asset publication и deployment-specific operational gates.
