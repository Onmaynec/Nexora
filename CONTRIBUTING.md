# Участие в разработке Nexora

Документ определяет workflow, quality requirements и security expectations для Issues, Pull Requests и documentation.

Участие регулируется [Code of Conduct](CODE_OF_CONDUCT.md). Уязвимости сообщаются по [Security Policy](SECURITY.md).

## 1. Current baseline

- repository version: `3.2.3`;
- distribution: Source/PWA prerelease;
- signed production baseline: `3.1.2`;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- Local Server database: SQLite schema 8.

Contribution не должно представлять prerelease functionality как stable, signed или independently audited.

## 2. Перед Pull Request

Используйте соответствующий канал:

- reproducible defect — [Bug Report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml);
- product proposal — [Feature Request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml);
- documentation defect — Documentation issue;
- installation/operations — [SUPPORT.md](SUPPORT.md);
- vulnerability — private GitHub Security Advisory.

Крупные features, architecture/schema/API changes и новые dependencies сначала обсуждаются в Issue.

## 3. Local environment

Requirements:

- Node.js `22.16+`;
- npm;
- JDK 17, Android SDK 36 и Gradle 8.13 для Android;
- Windows 10/11 для complete Electron packaging validation.

```bash
git clone https://github.com/Onmaynec/Nexora.git
cd Nexora
npm ci
npm run check
npm test
npm run audit:security
```

Nexora использует `node:sqlite`. Не добавляйте native SQLite package или `node-gyp` requirement без approved architecture decision.

## 4. Engineering principles

- сохраняйте existing architecture и переиспользуйте services/models/components/utilities;
- исправляйте root cause, а не симптом;
- Client отвечает за UI и local interaction state;
- Server отвечает за authorization, validation, business rules, integrity, limits и realtime access;
- hidden UI action не является security control;
- используйте transactions для связанных и race-sensitive mutations;
- schema changes сопровождайте migration, backup verification и rollback plan;
- сохраняйте API compatibility внутри major line либо документируйте migration;
- используйте stable error codes и не раскрывайте internal stack/SQL/secrets;
- не добавляйте dependencies без необходимости;
- не оставляйте TODO, stubs, fake data, empty handlers или unused code.

## 5. Security и privacy requirements

Не коммитьте:

- `.env` и production credentials;
- SQLite databases, backups или user attachments;
- CA/private/signing keys, PFX/P12;
- cookies, OAuth/API/bot/Pulse tokens или invite codes;
- Trust identity keys или MLS private state;
- secure-message plaintext;
- real user/payment data в tests, screenshots или logs.

Mutating browser requests должны сохранять session, Origin и CSRF checks. Trust operations сохраняют credential/device scope, challenge/signature validation, route/resource limits, replay protection и plaintext downgrade guards.

Production Plus/Pulse entitlement не выпускается authoritative Local Server.

## 6. Branches и commits

Создавайте focused branch от current `main`:

- `feat/` — functionality;
- `fix/` — defect correction;
- `docs/` — documentation/community;
- `test/` — tests;
- `chore/` — maintenance.

Пример imperative commit subject:

```text
fix: reject duplicate recovery commit hash
```

Не объединяйте unrelated refactoring, feature и documentation cleanup в одном PR.

## 7. Required tests

Minimum gate:

```bash
npm run check
npm test
npm run audit:security
```

Release-sensitive gate:

```bash
npm run release:check
```

Affected-surface checks:

- performance — `npm run test:performance`;
- Cloud — `npm run test:cloud`;
- Local Pulse — `npm run test:pulse-local`;
- integrity/retention — `npm run test:soak`;
- Android — `gradle -p android :app:assembleDebug --no-daemon`;
- local Windows packages — `npm run dist:windows`;
- signed Windows release — `npm run release:windows`.

UI changes требуют keyboard, responsive, long-content и reduced-motion review.

## 8. Regression-first security changes

Подтверждённый security gap исправляется в порядке:

1. проверить finding по current source;
2. добавить failing regression;
3. сохранить evidence failure;
4. исправить root cause;
5. добавить bypass/negative cases;
6. выполнить полный release gate;
7. обновить Security Review/Verification и boundary docs.

Не добавляйте ineffective control только для формального закрытия рекомендации. Already-mitigated и technically invalid findings должны быть обоснованно документированы.

## 9. Test expectations

Unit, integration и API tests обязательны для affected behavior. Security changes включают direct bypass attempts.

Примеры:

- owner/moderator/member boundaries;
- active ban при stale membership;
- removal/ban realtime access loss;
- invitation expiry/limit race;
- MIME/size/hash/quota substitution;
- CSRF, Origin и IDOR;
- Pulse signature/replay/idempotency;
- BasicCredential user/device mismatch;
- identity/MLS key-role reuse;
- 16-device ceiling и concurrent capacity;
- KeyPackage 25/32/256 ceilings;
- `RATE_LIMITED`/`Retry-After` contract;
- Trust audit nested metadata;
- MLS epoch/replay/recovery envelope/hash/state validation;
- plaintext downgrade after MLS activation;
- encrypted attachment scope/hash/claim reuse;
- session/rate-state retention cleanup;
- migration/downgrade/restore.

## 10. Pull Request requirements

PR должен содержать:

1. problem и root cause;
2. chosen solution;
3. affected components;
4. schema/API/Client compatibility;
5. security/privacy impact;
6. rate/resource-limit impact;
7. migration/rollback plan;
8. tests added/updated;
9. actual command results;
10. manual validation;
11. documentation/changelog updates;
12. remaining limitations.

Review блокируется, если PR не воспроизводим, содержит secrets, обходит Server controls, не имеет migration/testing evidence или включает unrelated mass refactor.

## 11. Documentation standard

Documentation должна:

- описывать actual current behavior;
- указывать version и release classification;
- разделять implemented, automated-verified, manual-verified и planned scope;
- фиксировать security limitations и trust boundaries;
- сохранять release provenance;
- использовать relative links;
- избегать unsupported marketing claims;
- обновлять guide, changelog, release notes и verification при изменении поведения.

Documentation Portal: [docs/README.md](docs/README.md).

## 12. Licensing

Отправляя contribution, вы подтверждаете право предоставить его и соглашаетесь с распространением по [MIT License](LICENSE).
