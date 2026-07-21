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

Первичный GitHub CI для объединённого дерева 3.0.0 будет зафиксирован здесь перед созданием неизменяемого тега `v3.0.0`.

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
