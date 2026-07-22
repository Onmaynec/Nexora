# Политика выпусков Nexora

## 1. Versioning

Nexora использует Semantic Versioning:

- `MAJOR` — incompatible product, API или data-contract changes;
- `MINOR` — backward-compatible functionality;
- `PATCH` — backward-compatible fixes и security/operational hardening.

Version metadata синхронизируется в `package.json`, lockfile, Client handshake, Android metadata, release notes, verification report и tag.

## 2. Release classifications

### Development

Implementation incomplete или имеет unresolved blockers. Development build не распространяется как product release.

### Source/PWA prerelease

Проверены source, production web build и automated gates. Разрешённые artifacts:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- SHA-256 checksums.

Классификация не означает:

- signed Windows installers;
- Electron updater eligibility;
- packaged runtime E2E;
- independent security certification;
- production suitability для high-risk communications.

### Stable signed release

Требует:

- всех automated release gates;
- manual platform/runtime acceptance;
- verified migration и rollback procedure;
- valid Authenticode signatures;
- complete updater metadata;
- no unresolved release blockers;
- approved security/operational evidence;
- explicit release-owner approval.

### Security patch

Security patch должен включать:

1. проверку каждого finding по текущему source;
2. regression-first evidence для подтверждённых gaps;
3. исправление root cause;
4. positive и negative regression coverage;
5. compatibility/schema/API statement;
6. updated Security Policy/Review/Verification при изменении boundaries;
7. coordinated disclosure plan, если применимо.

Неэффективная рекомендация или уже реализованный control не заменяется косметическим изменением: решение документируется с техническим обоснованием.

## 3. Required automated gates

Перед выпуском:

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Release gate покрывает:

- source syntax;
- Electron Builder configuration;
- production web build;
- unit/API/integration tests;
- isolated performance smoke;
- security invariants и production dependency audit;
- release metadata synchronization.

Release-sensitive changes дополнительно требуют релевантные soak, migration, Cloud, Pulse, Trust/MLS, encrypted-media и platform-specific suites.

## 4. Regression-first security workflow

Для подтверждённого security gap:

1. создать тест, который падает на текущей реализации;
2. сохранить CI evidence ожидаемого failure;
3. исправить production code;
4. подтвердить positive/negative scenarios;
5. выполнить complete release gate;
6. отдельно выполнить final documentation CI;
7. записать root cause, correction и residual risk.

Nexora `3.2.3` следует этому процессу: initial security candidate CI `#290` failed against `3.2.2`, затем implementation CI `#308` и final CI `#309` passed.

## 5. Manual gates

В зависимости от classification:

- clean install/upgrade Windows 10/11;
- signed Client/Server installer verification;
- updater n-1 → n;
- installed PWA runtime/offline behavior;
- physical Android matrix;
- backup/restore и migration rollback drill;
- public HTTPS deployment smoke;
- Pulse provider sandbox/webhook/reconciliation smoke;
- Trust multi-device/recovery/revocation matrix;
- resource-limit и rate-limit operational review;
- accessibility/responsive UI review.

## 6. Security claims

Release documentation различает:

1. functionality present in source;
2. automated test evidence;
3. manual runtime evidence;
4. signing/distribution evidence;
5. independent review evidence.

Термины «secure», «encrypted», «E2EE», «audited», «production-ready» и «stable» указываются только с конкретной version, path, threat boundary и evidence.

## 7. Tag и artifact policy

- release tags immutable и соответствуют SemVer;
- package version совпадает с tag;
- published stable assets не заменяются in-place;
- correction использует новый PATCH version;
- unsigned `.exe`, blockmap и `latest.yml` не публикуются;
- Electron updater принимает только complete signed stable Windows set;
- Source/PWA prerelease явно marked prerelease;
- arbitrary untagged `main` не публикуется как release.

## 8. Database compatibility

Каждое schema change требует:

- pre-migration integrity check;
- verified backup;
- transactional/idempotent migration;
- post-migration integrity check;
- documented rollback/restore;
- downgrade protection;
- tests с supported source schemas.

Patch `3.2.0–3.2.3` сохраняет schema 8. Upgrade внутри этой линии не требует database migration.

## 9. API compatibility

- Application API v3 сохраняется для линии 3.x;
- Trust/MLS/encrypted-media API v4 сохраняется в `3.2.x`;
- breaking contract требует соответствующий major release или explicit compatibility migration;
- stable error codes и HTTP semantics являются частью operational contract;
- `RATE_LIMITED` и `Retry-After` должны сохраняться для rate-limited routes.

## 10. Current release decision

### Nexora 3.2.3

- classification: Source/PWA prerelease;
- type: security hardening patch;
- automated release gate: passed;
- schema: 8;
- Application API: v3;
- Trust/MLS/encrypted-media API: v4;
- migration с 3.2.0–3.2.2: не требуется;
- stable signed production promotion: не approved;
- independent cryptographic/application-security review: не completed.

Authoritative evidence:

- [Release Notes 3.2.3](../RELEASE_NOTES_3.2.3.md);
- [Security Review 3.2.3](../SECURITY_REVIEW_3.2.3.md);
- [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md).

### Nexora 3.1.2

- classification: signed production baseline;
- schema: 7;
- secure-message E2EE: не предоставляется.

## 11. Stable promotion blockers 3.2.3

До stable signed promotion:

1. packaged Windows runtime E2E;
2. installed PWA и physical Android matrix;
3. extended multi-device concurrency/revoke/re-add/corruption matrix;
4. longer load/soak и long-offline evidence;
5. metadata minimization/traffic-analysis review;
6. Authenticode signing-machine и complete updater verification;
7. independent cryptographic/application-security review;
8. отсутствие unresolved high/critical findings.
