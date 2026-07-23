# Проверка выпуска Nexora 3.3.2

Дата: 2026-07-23

## Область выпуска

`3.3.2` — исправляющий организационный релиз. Runtime behavior, пользовательские функции, API, database schema и migrations не изменяются. Источником версии является `package.json`; остальные surfaces обязаны совпадать с ним.

## Release consistency gate

CI выполняет `scripts/check-release-consistency.cjs` и отдельную негативную регрессию. Gate проверяет:

1. `package.json` и оба version-поля `package-lock.json`;
2. Android `versionName` и вычисляемый `versionCode`;
3. Repository README и Documentation Portal;
4. `PROJECT_INDEX.md`;
5. `docs/ARCHITECTURE.md`;
6. `docs/SECURITY_MODEL.md`;
7. `android/README.md`;
8. `release-evidence/current.json`;
9. наличие release notes, verification и changelog entry текущей версии;
10. отсутствие current-ссылок на `RELEASE_VERIFICATION_3.2.4.md`.

## Documentation consistency

- security boundary наследуется из [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md);
- текущая release verification — этот документ;
- полная хронология версий поддерживается только в [CHANGELOG.md](CHANGELOG.md);
- [RELEASE_HISTORY.md](RELEASE_HISTORY.md) является указателем и не дублирует timeline;
- исторические release-specific документы не переписываются как current.

## Asset smoke contract

После публикации workflow обязан скачать release assets и проверить:

- `SHA256SUMS.txt` для всех опубликованных файлов;
- Windows Client и Server: минимальный размер и PE header `MZ`;
- Android APK: ZIP integrity и наличие `AndroidManifest.xml`;
- PWA ZIP: ZIP integrity и наличие `index.html`;
- отсутствие `latest.yml` и `.blockmap` в `UNSIGNED-TEST` prerelease;
- запись результатов в `release-evidence/v3.3.2.json` и `release-evidence/current.json`.

## Pull request cleanup

- PR #30 и #31 закрываются как конфликтующие изменения, основанные на устаревшем `main`, с незаполненными описаниями и без доказательства применимости;
- PR #11 закрывается без merge как superseded experimental Rust/OpenMLS draft. Текущий `main` использует production-integrated JavaScript/`ts-mls` Trust/MLS API v4, поэтому параллельный Rust/WASM security boundary требует отдельного RFC, migration/interoperability plan и нового development branch.

## Схема, API и безопасность

- Local Server schema: `8`, без изменений;
- Application API: `v3`, без изменений;
- Trust/MLS API: `v4`, без изменений;
- authorization, roles, bans, upload validation, Pulse ledger и entitlement boundary не изменяются;
- новые secrets, executable payload, dependencies и network permissions не добавляются;
- migration и rollback не требуются.

## Completion criteria

Релиз завершён только после успешных CI jobs, публикации `v3.3.2`, smoke-проверки Client/Server/Android/PWA и появления immutable evidence `release-evidence/v3.3.2.json`.
