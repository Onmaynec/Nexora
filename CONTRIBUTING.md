# Участие в разработке Nexora

Документ определяет workflow, quality gates и security expectations для Issues, Pull Requests и документации.

Участие регулируется [Code of Conduct](CODE_OF_CONDUCT.md). Уязвимости сообщаются только по [Security Policy](SECURITY.md).

## 1. Текущая база

| Параметр | Значение |
|---|---|
| Repository version | `3.4.0` |
| Classification | Stable Core release candidate |
| Publication | Заблокирована до verified `v3.3.4`, Authenticode/Windows acceptance и independent security review |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS runtime | retired; write paths return `410/LEGACY_READ_ONLY` |
| Legacy secure history | read-only compatibility layer; server-side decryption отсутствует |
| Local Server database | SQLite schema 8 |

Contribution не должно представлять release-candidate functionality как published stable, production-approved или independently audited.

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
- Client отвечает за интерфейс, ввод, локальное состояние, offline cache и безопасное отображение legacy history;
- Server отвечает за authentication, authorization, business rules, ordinary messaging, storage integrity, quotas, rate limits и realtime access;
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
- TOTP seeds, recovery codes и сохранённые legacy cryptographic secrets;
- реальные user/payment data в tests, screenshots или logs.

Mutating browser requests должны сохранять session, exact Origin и CSRF validation. Все серверные операции должны проверять resource existence, membership, role/permission, active ban, room restrictions, input limits и rate limiting.

Retired Trust/MLS/E2EE write paths должны оставаться terminal read-only и возвращать `410/LEGACY_READ_ONLY`; запрещено добавлять plaintext conversion или новый writable encrypted transport под совместимым именем.

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
fix: reject stale session after device revoke
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
- local Windows test packages — `npm run dist:windows`;
- signed Windows release candidate — `npm run release:windows:signed`.

Release evidence принимается только для exact reviewed commit. Результаты другой revision не считаются release evidence.

## 8. Pull Request checklist

Перед переводом PR в ready:

- scope и acceptance criteria определены;
- server-side authorization и validation покрыты tests;
- migrations и rollback добавлены при изменении schema;
- stable error codes и user-facing messages проверены;
- unit, API, integration, realtime и targeted regression tests проходят;
- `npm run check`, `npm test`, `npm run audit:security` проходят;
- documentation, changelog и release evidence обновлены, если поведение или contract изменились;
- temporary scripts, diagnostic workflows и generated failure logs удалены.

Для `3.4.0` merge/tag/release дополнительно требуются опубликованный verified `v3.3.4`, полный Authenticode policy, Windows 10/11 installed `3.3.4 → 3.4.0` acceptance и independent security review без unresolved high/critical findings.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
