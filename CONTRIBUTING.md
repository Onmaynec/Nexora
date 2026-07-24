# Участие в разработке Nexora

Документ определяет workflow, quality gates и security expectations для Issues, Pull Requests и документации.

Участие регулируется [Code of Conduct](CODE_OF_CONDUCT.md). Уязвимости сообщаются только через private channel из [Security Policy](SECURITY.md).

## Текущая база

| Параметр | Значение |
|---|---|
| Repository version | `3.3.4` release candidate |
| Distribution | signed when policy exists; otherwise explicit `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS runtime | retired; legacy secure history is read-only |
| Local Server database | SQLite schema 8 |

Contribution не должно представлять release-candidate functionality как signed stable, production-approved или independently audited.

## Каналы взаимодействия

- воспроизводимый дефект — Bug Report;
- предложение функции — Feature Request;
- ошибка документации — Documentation issue;
- установка и эксплуатация — [SUPPORT.md](SUPPORT.md);
- уязвимость — private GitHub Security Advisory.

Крупные feature-, architecture-, schema-, protocol- и dependency-изменения сначала обсуждаются в Issue.

## Локальная среда

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

## Инженерные правила

- сохраняйте существующую архитектуру и переиспользуйте текущие services, models, components и utilities;
- исправляйте первопричину, а не только UI-симптом;
- Client отвечает за UI, ввод, локальное состояние, offline cache и чтение ранее сохранённого local legacy cache;
- Server отвечает за authentication, authorization, business rules, storage integrity, quotas, rate limits и realtime access;
- критические проверки выполняются на Server;
- связанные записи выполняются транзакционно;
- schema change включает migration, verified backup, integrity checks, rollback guidance и downgrade protection;
- не добавляйте dependency без необходимости;
- не оставляйте TODO, stubs, fake data, empty handlers и unused code.

## Post-MLS boundary

- ordinary server-readable messaging — единственный writable messaging path;
- удалённые Trust/MLS, recovery и encrypted-upload write paths не восстанавливаются без отдельного RFC;
- schema 8 legacy ciphertext и provenance сохраняются;
- legacy viewer/export остаётся immutable;
- legacy HTTP и Socket.IO mutations должны завершаться `LEGACY_READ_ONLY`;
- Server не расшифровывает и не преобразует legacy ciphertext;
- ordinary chat не должен зависеть от local MLS state.

## Security и privacy

Нельзя коммитить:

- `.env` и production credentials;
- SQLite databases, backups и user attachments;
- CA, Authenticode, Android, Pulse или device private keys;
- session cookies, OAuth/API/bot/Pulse tokens и invite codes;
- TOTP seeds и recovery codes;
- реальные user/payment data в tests, screenshots или logs.

Mutating browser requests должны сохранять session, exact Origin и CSRF validation. Direct API calls проверяются так же строго, как UI actions. Production Plus/Pulse entitlement не создаётся авторитетно Local Server.

## Ветки и commits

Новая работа начинается от latest verified `main`:

- `feat/` — backward-compatible functionality;
- `fix/` — defect correction;
- `docs/` — documentation/community files;
- `test/` — tests-only work;
- `chore/` — maintenance без product behavior change.

Используйте короткий imperative subject, например:

```text
fix: reject legacy write mutation
```

Не объединяйте unrelated refactoring, feature work и documentation cleanup в одном Pull Request.

## Обязательные проверки

```bash
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
```

По затронутому контуру дополнительно запускаются Cloud/Pulse suites, schema soak, Android build, website contracts и Windows package acceptance.

## Test expectations

Security-sensitive работа включает прямые bypass attempts. Проверяйте:

- owner/moderator/member boundaries;
- removal/ban/session revoke и realtime access loss;
- invitation expiry/limit races;
- upload MIME/size/hash substitution;
- CSRF, Origin и IDOR;
- Pulse signature/replay/idempotency;
- session-derived device inventory и targeted revoke;
- legacy REST/Socket.IO mutations fail closed;
- no legacy ciphertext-to-plaintext conversion;
- updater signing/no-downgrade behavior;
- migration, backup verification, restore и rollback;
- offline/outbox bounded retry and terminal errors.

## Требования к Pull Request

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

## Стандарт документации

Документация описывает фактическое поведение конкретной версии и ветки, разделяет implemented/automated/manual/planned scope, фиксирует trust boundaries и non-guarantees, использует repository-relative links и не содержит неподтверждённых marketing/security claims.

Центральные материалы: [Documentation Portal](docs/README.md), [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md) и [Release Verification 3.3.4](docs/releases/3.3.4/RELEASE_VERIFICATION.md).

## Лицензирование

Отправляя contribution, автор подтверждает право предоставить изменения и соглашается на их распространение по [MIT License](LICENSE).
