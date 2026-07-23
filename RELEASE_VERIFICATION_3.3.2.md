# Проверка выпуска Nexora 3.3.2

Дата: 2026-07-23

## Область выпуска

`3.3.2` — исправляющий организационный релиз. Runtime behavior, пользовательские функции, API, database schema и migrations не изменяются. Источником версии является `package.json`; остальные surfaces обязаны совпадать с ним.

## Release consistency gate

CI выполняет `scripts/check-release-consistency.cjs` и негативные регрессии. Gate проверяет:

1. `package.json` и оба version-поля `package-lock.json`;
2. Android `versionName` и вычисляемый `versionCode`;
3. Repository README, Documentation Portal, Project Index, Architecture, Security Model и Android README;
4. Security Policy/Audit, Support, Contributing, Admin Guide и Tester Guide;
5. Product Overview, Operations Runbook, Deployment, Release Policy, GitHub Release guide и Release Checklist;
6. Branch Status/Index, Bug Report template и статические website fallbacks;
7. `release-evidence/current.json`;
8. наличие release notes, verification и changelog entry текущей версии;
9. отсутствие current-ссылок на `RELEASE_VERIFICATION_3.2.4.md`;
10. отсутствие obsolete current claims 3.2.4/3.3.1 в контролируемых документах.

Негативные тесты подтверждают отказ при Android version drift, stale Security Policy и повторном появлении устаревшей current verification-ссылки. Детерминированная materialization-проверка current-документов и website завершилась успешно в CI run `30005514697`; временные scripts и diagnostic files удалены до завершения работы.

Итоговая repository-wide correction:

- PR `#51` слит в `main` commit `650f62d5ae537695061922a4ea130d97040922ca`;
- clean PR head: `183835940b9abbf75911e057387186597228133d`;
- CI run `30007264657`: Windows verify, Linux product suite, release consistency, schema 8 soak и Android source build — success;
- Project website run `30007264693` — success;
- focused Nexora 3.3 regressions run `30007264725` — success.

## Documentation consistency

- security boundary наследуется из [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md);
- current feature baselines используют обозначение `3.3.0+`, а не выдают историческую 3.2.4 за текущую версию;
- текущая release verification — этот документ;
- полная хронология версий поддерживается только в [CHANGELOG.md](CHANGELOG.md);
- [RELEASE_HISTORY.md](RELEASE_HISTORY.md) является указателем и не дублирует timeline;
- исторические release-specific документы 3.2.x/3.3.0/3.3.1 сохраняются как provenance и не переписываются как current.

## Asset smoke contract и результат

После публикации workflow скачал release assets и проверил:

- `SHA256SUMS.txt` для всех опубликованных файлов;
- Windows Client и Server: минимальный размер и PE header `MZ`;
- Android APK: ZIP integrity и наличие `AndroidManifest.xml`;
- PWA ZIP: ZIP integrity и наличие `index.html`;
- отсутствие `latest.yml` и `.blockmap` в `UNSIGNED-TEST` prerelease;
- запись результатов в `release-evidence/v3.3.2.json` и `release-evidence/current.json`.

Release evidence workflow run `30004686716` завершился успешно. Опубликованный tag `v3.3.2` неизменяемо указывает на release commit `82af775fb39515bd219078fec368cc259441c288`; post-release documentation/CI correction `650f62d5ae537695061922a4ea130d97040922ca` не перемещает и не пересоздаёт tag.

## Pull request cleanup

- PR #30 и #31 закрыты как конфликтующие изменения, основанные на устаревшем `main`, с незаполненными описаниями и без доказательства применимости;
- PR #6 и #7 закрыты как obsolete automation для исторической линии 3.1.0;
- PR #11 закрыт без merge как superseded experimental Rust/OpenMLS draft. Текущий `main` использует production-integrated JavaScript/`ts-mls` Trust/MLS API v4, поэтому параллельный Rust/WASM security boundary требует отдельного RFC, migration/interoperability plan и нового development branch;
- PR #47 закрыт без merge как superseded предыдущей repository-wide итерацией; полный проверенный scope вошёл через PR #51.

## Схема, API и безопасность

- Local Server schema: `8`, без изменений;
- Application API: `v3`, без изменений;
- Trust/MLS API: `v4`, без изменений;
- authorization, roles, bans, upload validation, Pulse ledger и entitlement boundary не изменяются;
- новые secrets, executable payload, dependencies и network permissions не добавляются;
- migration и rollback не требуются.

## Completion criteria

Релиз завершён только после успешных CI jobs, публикации immutable tag `v3.3.2`, smoke-проверки Client/Server/Android/PWA, появления immutable evidence `release-evidence/v3.3.2.json` и успешного post-release main gate на финальном состоянии репозитория.
