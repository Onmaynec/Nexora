# Политика выпусков Nexora 3.5.0

## 1. Semantic Versioning

Nexora использует SemVer:

- `MAJOR` — несовместимое изменение продукта, API или формата данных;
- `MINOR` — обратно совместимая функциональность;
- `PATCH` — обратно совместимое исправление, security- или operational-hardening.

Версия синхронизируется в `package.json`, lock-файле, Client handshake, Android metadata, документации, release notes, verification, machine-readable evidence и tag.

## 2. Классы выпусков

### Development

Реализация неполна или содержит незакрытые исходные дефекты. Не распространяется как продуктовый релиз.

### Release candidate

Исходный код и автоматические проверки готовы, но публикационная политика ещё не утверждена.

### Stable signed

Нормальный GitHub Release с подписанными Windows/Android-пакетами, verified signer identity, updater metadata и установленной platform acceptance.

### Stable unsigned manual-download

Нормальный, не prerelease GitHub Release без цифровой подписи Windows/Android. Допустим только после прямого решения владельца репозитория и при выполнении всех условий:

- `UNSIGNED` присутствует в именах Windows и Android assets;
- release notes явно сообщают об отсутствии publisher identity;
- `Get-AuthenticodeSignature` подтверждает `NotSigned`;
- `apksigner verify` не принимает Android APK как подписанный;
- signing-state evidence включён в assets;
- SHA-256 checksums созданы для каждого asset;
- SPDX SBOM опубликован;
- автоматические updater metadata `latest.yml` и `server.yml` не публикуются;
- релиз устанавливается вручную;
- source CI, tests, security audit, schema soak и package smoke проходят на exact commit;
- после публикации assets повторно скачиваются и проверяются.

`Stable` в этом классе означает GitHub release channel и завершённость исходной версии. Это не означает подписанную идентичность издателя.

### Security patch

Требует reproduction-first теста, исправления первопричины, regression coverage, compatibility statement и coordinated disclosure при необходимости.

### Documentation-only

Не меняет runtime, migrations, dependencies или version metadata без отдельного scope.

## 3. Классификация Nexora 3.5.0

`3.5.0` публикуется как **Stable unsigned manual-download**.

Владелец репозитория разрешил:

- официальный тег `v3.5.0`;
- обычный GitHub Release, `prerelease=false`;
- отметку Latest;
- неподписанные Windows Client/Server installers;
- неподписанный Android APK.

Не разрешено:

- выдавать assets за подписанные;
- скрывать signing state;
- публиковать updater metadata для неподписанных пакетов;
- отключать signature verification в Electron updater;
- использовать имена signed release assets без `UNSIGNED`;
- пропускать CI, checksums, package smoke или post-download verification.

## 4. Automated gates

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Release gate включает:

- metadata synchronization;
- release consistency;
- syntax и Electron builder config;
- production web build;
- unit, API, integration и realtime suites;
- performance tests;
- security invariant и production dependency audit;
- Linux full suite;
- schema 9 soak;
- Android source build;
- Project websites validation.

## 5. Packaging gates для v3.5.0

Release workflow дополнительно выполняет:

1. exact-head checkout после успешного CI на `main`;
2. source/PWA build;
3. unsigned Android release assembly;
4. `apksigner` negative verification;
5. unsigned Windows Client/Server NSIS build с `CSC_IDENTITY_AUTO_DISCOVERY=false`;
6. Authenticode `NotSigned` verification;
7. silent installed-package smoke;
8. SPDX 2.3 SBOM;
9. release evidence и SHA-256 checksums;
10. immutable annotated tag;
11. normal non-prerelease GitHub Release;
12. full re-download and checksum verification;
13. повторную проверку unsigned state;
14. проверку отсутствия updater metadata.

## 6. Security claims

Документация различает:

1. functionality in source;
2. automated test evidence;
3. installed package evidence;
4. distribution/signing state;
5. independent external review.

Для `v3.5.0` допустимы утверждения:

- source gates passed;
- packages built and smoke-tested;
- release assets checksum-verified;
- binaries explicitly unsigned.

Недопустимы утверждения:

- Authenticode-signed;
- Android signer verified;
- automatic updater eligible;
- independently audited, если такого отчёта нет;
- cryptographic publisher identity established.

## 7. Tag и artifacts

- tag: immutable `v3.5.0`;
- package version равна tag version;
- GitHub prerelease: false;
- Latest: true;
- correction после публикации выполняется новой patch-версией;
- assets не подменяются без идентичного tag commit и повторной проверки;
- canonical notes: `docs/releases/3.5.0/RELEASE_NOTES.md`.

Обязательные assets:

- `Nexora-Client-Setup-3.5.0-UNSIGNED.exe`;
- `Nexora-Server-Setup-3.5.0-UNSIGNED.exe`;
- `Nexora-Android-3.5.0-UNSIGNED.apk`;
- PWA и source archives;
- SPDX SBOM;
- Windows/Android unsigned evidence;
- release evidence;
- `SHA256SUMS.txt`.

## 8. Updater policy

Electron updater остаётся fail-closed:

- Client channel: `latest`;
- Server channel: `server`;
- downgrade и prerelease consumption отключены;
- signature/checksum mismatch отображается как `UPDATE_SIGNATURE_INVALID`;
- unsigned `v3.5.0` не публикует `latest.yml`, `server.yml` или updater blockmaps;
- обновление до 3.5.0 выполняется вручную.

Будущий signed release может снова публиковать updater metadata после signer verification.

## 9. Review и merge

До merge release-policy PR:

- exact-head CI должен быть green;
- release consistency и security audit должны учитывать unsigned policy;
- документация, workflow, changelog и current evidence должны совпадать;
- не должно быть временных debug scripts, failure logs или unresolved source defects.

Merge commit должен начинаться с `release: Nexora 3.5.0`, чтобы успешный post-merge CI запустил release workflow.

## 10. Post-publication

После публикации workflow обязан:

- подтвердить tag commit;
- скачать все assets повторно;
- проверить SHA-256;
- подтвердить `NotSigned` для Windows;
- подтвердить отсутствие валидной Android signature;
- подтвердить отсутствие `latest.yml` и `server.yml`;
- сохранить runtime `RELEASE-EVIDENCE.json` в GitHub Release.

Рабочая release-ветка закрывается после сохранения provenance.
