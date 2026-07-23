# Участие в разработке Nexora

Документ определяет workflow, quality gates и security expectations для Issues, Pull Requests и документации.

Участие регулируется [Code of Conduct](CODE_OF_CONDUCT.md). Уязвимости сообщаются только по [Security Policy](SECURITY.md).

## 1. Текущая база

| Параметр | Значение |
|---|---|
| Repository version | `3.3.3` |
| Distribution | Published `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |

Contribution не должно представлять prerelease functionality как signed stable, production-approved или independently audited.

## 2. Каналы взаимодействия

- воспроизводимый дефект — [Bug Report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml);
- предложение функции — [Feature Request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml);
- ошибка документации — Documentation issue;
- установка и эксплуатация — [SUPPORT.md](SUPPORT.md);
- уязвимость — private GitHub Security Advisory.

Крупные feature-, architecture-, schema-, protocol- и dependency-изменения сначала обсуждаются в Issue.

## 3. Локальная среда

Требования:

- Node.js `22.16+` и npm;
- JDK 17, Android SDK 36 и Gradle 8.13 для Android;
- Windows 10/11 для Electron packaging и installer acceptance.

```bash
git clone https://github.com/Onmaynec/Nexora.git
cd Nexora
npm ci
npm run check
npm test
npm run audit:security
```

Nexora использует `node:sqlite`. Новая native SQLite dependency или `node-gyp`-цепочка требует отдельного архитектурного обоснования.

## 4. Инженерные правила

- сохраняйте существующую архитектуру и переиспользуйте текущие services, models, components и utilities;
- исправляйте первопричину, а не только UI-симптом;
- Client отвечает за интерфейс, ввод, локальное состояние и local cryptographic operations;
- Server отвечает за authentication, authorization, business rules, storage integrity, quotas, rate limits и realtime access;
- критические проверки выполняются на Server;
- связанные записи выполняются транзакционно;
- schema change включает migration, backup, integrity checks, rollback guidance и downgrade protection;
- не добавляйте dependency без необходимости;
- не оставляйте TODO, stubs, fake data, empty handlers и unused code.

## 5. Security и privacy

Нельзя коммитить:

- `.env` и production credentials;
- SQLite databases, backups и user attachments;
- CA, Authenticode, Android, Pulse, provider или device private keys;
- session cookies, OAuth/API/bot/Pulse tokens и invite codes;
- TOTP seeds, recovery codes и MLS private state;
- реальные user/payment data в tests, screenshots или logs.

Mutating browser requests должны сохранять session, Origin и CSRF validation. Trust/MLS operations должны сохранять device scope, proof/signature checks, active-ban checks, resource ceilings, bounded rate limiting и plaintext downgrade protection.

Production Plus/Pulse entitlement не создаётся авторитетно Local Server.

## 6. Ветки и commits

Новая работа начинается от latest verified `main`:

- `feat/` — backward-compatible functionality;
- `fix/` — defect correction;
- `docs/` — documentation/community files;
- `test/` — tests-only work;
- `chore/` — maintenance без product behavior change.

Используйте короткий imperative subject, например:

```text
fix: reject stale MLS epoch
```

Не объединяйте unrelated refactoring, feature work и documentation cleanup в одном Pull Request.

Статусы historical и development branches регулирует [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md). Merged/superseded ветки не обновляются так, чтобы имитировать текущий `main`.

## 7. Обязательные проверки

Минимум:

```bash
npm run check
npm test
npm run audit:security
```

Release-sensitive gate:

```bash
npm run release:check
```

Дополнительно по затронутому контуру:

- performance — `npm run test:performance`;
- Cloud — `npm run test:cloud`;
- Local Pulse — `npm run test:pulse-local`;
- soak/integrity — `npm run test:soak`;
- Android — `gradle -p android :app:assembleDebug --no-daemon`;
- local Windows packages — `npm run dist:windows`;
- signed Windows release — `npm run release:windows`.

UI changes требуют keyboard, responsive, long-content, loading/error и reduced-motion review.

## 8. Test expectations

Добавляйте unit-, integration- и API-tests. Security-sensitive работа должна включать прямые bypass attempts.

При необходимости проверяются:

- owner/moderator/member boundaries;
- removal/ban и realtime access loss;
- invitation expiry/limit races;
- upload MIME/size/hash substitution;
- CSRF, Origin и IDOR;
- Pulse signature/replay/idempotency;
- device proof, verification/revocation и capacity limits;
- MLS epoch/replay/recovery/Welcome request;
- plaintext downgrade;
- encrypted attachment scope/hash/claim reuse;
- updater signing/no-downgrade behavior;
- developer-console placeholder normalization;
- migration, downgrade и restore.

## 9. Требования к Pull Request

PR должен содержать:

1. проблему и решение;
2. затронутые компоненты;
3. schema/API/client compatibility;
4. security/privacy impact;
5. migration/rollback plan;
6. tests added/updated;
7. фактические результаты команд;
8. manual validation;
9. documentation/changelog changes;
10. реальные оставшиеся ограничения.

Review блокируется при отсутствии воспроизведения, server-side checks, migration/testing evidence или при наличии secrets и unrelated mass refactoring.

## 10. Стандарт документации

Документация должна:

- описывать фактическое поведение конкретной версии и ветки;
- разделять implemented, automated-verified, manual-verified и planned scope;
- указывать trust boundaries и non-guarantees;
- использовать repository-relative links;
- сохранять historical release provenance;
- не использовать неподтверждённые marketing/security claims;
- обновлять guide, release notes, verification и changelog при изменении поведения.

Центральные материалы: [Documentation Portal](docs/README.md) и [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md).

## 11. Лицензирование

Отправляя contribution, автор подтверждает право предоставить изменения и соглашается на их распространение по [MIT License](LICENSE).
