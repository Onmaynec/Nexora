# Верификация Nexora 3.0.0

Дата: 21 июля 2026.

## Локальный результат

| Проверка | Результат |
|---|---|
| `npm run check` | PASS — 37 Node files, 2 builder configs, icons, Vite production build |
| `npm test` | PASS — 51/51 |
| profile modal regression | PASS — null-safe initial relationship, без blank screen |
| API v3 / TOTP / bots / upload / sync | PASS |
| load | PASS — 20 clients / 120 messages |
| `npm run audit:security` | PASS — 27 invariants, high 0, critical 0 |
| `RELEASE_TAG=v3.0.0 npm run release:tag-check` | PASS |
| CI/release YAML parse | PASS |
| SPDX generation | PASS — SPDX 2.3, 105 packages |
| SQLite smoke soak | PASS — 1 минута, 12 циклов, integrity `ok` |

Для ветки 2.0.0 ранее завершён отдельный 60-минутный soak (717 циклов, integrity `ok`). Из-за значительного расширения API v3 перед production deployment всё равно требуется новый 60-минутный/рекомендуемый 24-часовой soak и ручная Windows/Android device matrix.

## GitHub CI

GitHub CI №3 для объединённого дерева завершён успешно:

- run: <https://github.com/Onmaynec/Nexora/actions/runs/29838199630>;
- commit: `56e4d58c46192fb827ed9184b74f52a25574e3a4`;
- `linux-tests`: PASS — чистая установка зависимостей, production web build, 51/51 тестов;
- `verify` на Windows: PASS — syntax/builder configs/icons, production build, 51/51 тестов и security audit;
- `android-source`: PASS — Gradle 8.13, JDK 17, `:app:assembleDebug`.

Дополнительная проверка стабильности release gate:

- CI №4: <https://github.com/Onmaynec/Nexora/actions/runs/29838484121> — release корректно остановлен до тега из-за общего 30-секундного timeout подготовки load-test на загруженном Windows runner;
- исправление: 20 WebSocket-клиентов подключаются параллельно, общий инфраструктурный timeout увеличен до 90 секунд, строгий бюджет обработки 120 сообщений менее чем за 20 секунд сохранён;
- CI №5: <https://github.com/Onmaynec/Nexora/actions/runs/29838795216> — PASS на Windows, Linux и Android для исправленного дерева, commit `0ccd1ade4f2a489e2eaee266f631596c4ff66f95`.

Финальный тег создаётся только следующим `release:`-commit после этих успешных проверок, поэтому проверенное дерево и release report остаются частью самого тега.

## Release policy

- source ZIP, PWA ZIP, SPDX SBOM и SHA-256 публикуются даже без Authenticode secrets;
- неподписанные Windows `.exe`, `.blockmap` и `latest.yml` не публикуются;
- stable Latest и автообновление разрешаются только после успешной подписи обоих installers и проверки полного набора assets;
- опубликованный stable Release не перезаписывается.

## Внешние проверки, не заменяемые CI

- Authenticode/SmartScreen и upgrade на чистых Windows 10/11;
- Android release signing и physical-device matrix;
- public reverse proxy/firewall/pentest;
- Pulse Cloud/provider/webhook/refund/legal flow при включении production billing.
