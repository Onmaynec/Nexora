# Nexora 3.2.5 — Release Verification

## Классификация

- версия: `3.2.5`;
- базовая версия: `3.2.4`;
- тип: patch release;
- Pull Request: `#25`;
- кодовый кандидат: `805a231190883c406abf1c016a6241ca8bdd2a25`;
- Local Server schema: `8`, без новой миграции;
- Application API: v3;
- Trust/MLS API: v4.

## Первопричины исправленных регрессий

1. Pulse Sandbox создавал `billingLinks` с полем `localUserId`, тогда как SQLite persistence contract таблицы `billing_links` записывал `item.userId`. В параметр SQLite передавался `undefined`.
2. После каждого MLS message event сервер дополнительно отправлял `data:refresh`, а Client выполнял полный `/api/bootstrap`, перестраивая workspace и вызывая рывки истории.
3. Secure media UI требовал ручного действия «Расшифровать локально» даже для изображений и голосовых, что регрессировало относительно UX линии 2.0.0.
4. При гонке создания MLS-группы или временном отсутствии подходящего KeyPackage recoverable Welcome errors могли преждевременно завершать инициализацию.
5. Глобальный ParticleField рендерился за всеми разделами приложения вместо области истории сообщений.

## Regression-first покрытие

`test/release-3.2.5-regressions.test.cjs` проверяет:

- `plus grant netrox 30` и `impulses grant netrox 100` на настоящем `node:sqlite` store;
- renderer-driven release announcement и per-version dismissal;
- interactive network только внутри истории чата;
- автоматическое inline-представление image/voice;
- memoization message rows и сохранение scroll position;
- отсутствие полного bootstrap refresh после message delivery;
- безопасный Welcome request/wait при MLS group-creation race;
- разделение local Windows build и signed production build;
- тематические disabled controls и scrollbars Nexora Server.

## Подтверждённый GitHub Actions run

**Run:** `29953309887`  
**Workflow:** `CI`  
**Кодовый кандидат:** `805a231190883c406abf1c016a6241ca8bdd2a25`

| Job | Результат | Основные проверки |
|---|---|---|
| `verify` | success | `npm run check`, `test:unit`, `test:performance`, `audit:security` |
| `release-gate` | success | полный `npm run release:check` |
| `schema8-soak` | success | schema 8 soak suite |
| `linux-tests` | success | `npm test` |
| `android-source` | success | Gradle `:app:assembleDebug` |
| `finalize-3-2-5` | success | regression suite, check, unit, performance, security audit, `release:windows`, проверка наличия Client/Server installers |

Windows runner подтвердил создание:

- `release/client/Nexora-Client-Setup-3.2.5.exe`;
- `release/server/Nexora-Server-Setup-3.2.5.exe`.

Артефакты этого local build намеренно не публиковались и были удалены после проверки. Официальный release workflow сохраняет `release:signing-check` и не публикует updater assets без Authenticode secrets.

## Совместимость

- schema 8 остаётся без изменений;
- API v3 и Trust/MLS API v4 не получают breaking changes;
- ручное редактирование базы не требуется;
- старые sandbox rows с `localUserId` нормализуются в канонический `userId`;
- обновление поддерживается с 3.2.0–3.2.4.

## Остаточные ограничения

- проверенный local Windows build не заменяет installed E2E подписанного auto-update;
- physical Android runtime matrix в этом run не выполнялась, подтверждена source build;
- независимый криптографический и application-security аудит не выполнен;
- устройство, уже входящее в MLS tree, но потерявшее локальный private state, требует безопасной повторной регистрации вместо восстановления identity с сервера;
- metadata/traffic-analysis resistance не заявляется.

## Решение по кандидату

Кодовый кандидат `805a231...` прошёл заявленные автоматические проверки и локальную Windows-сборку. Документационные commits после кандидата не меняют runtime-код и должны пройти штатный current-head CI перед переводом PR `#25` из draft в ready-for-review.
