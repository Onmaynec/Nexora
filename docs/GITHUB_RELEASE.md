# GitHub Release и автообновление Nexora 3.1.2

## Репозиторий и защита

Активный public repository: [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora). Public visibility нужна встроенному Client updater без пользовательского GitHub token.

Для production:

- защитите `main` и release tags;
- запретите force-push;
- включите обязательный Windows/Linux/Android CI;
- включите 2FA;
- используйте GitHub Environment `windows-release` с manual approval;
- не разрешайте workflow изменять уже опубликованный stable release.

## Secrets

В **Settings → Secrets and variables → Actions** добавьте:

- `WINDOWS_CERTIFICATE_BASE64` — PFX/P12 в base64 или поддерживаемый `electron-builder` source;
- `WINDOWS_CERTIFICATE_PASSWORD` — password certificate.

`GITHUB_TOKEN` GitHub Actions выдаёт автоматически. Не добавляйте secrets в `.env`, `update-config.json`, logs или source files.

Pulse Cloud/provider secrets не относятся к Windows release signing и должны храниться в отдельной deployment environment.

## Подготовка версии

Перед релизом убедитесь, что версия синхронизирована в package/lockfile, Android metadata, UI/release docs и expected tag. Для 3.1.2 tag должен быть `v3.1.2`.

```bash
git switch main
git pull --ff-only
npm ci
npm run release:check
npm run audit:security
```

Релизный commit использует prefix `release:`. После успешного CI workflow сверяет version metadata, создаёт или проверяет annotated SemVer tag и продолжает release build.

Ручной tag:

```bash
git tag -s v3.1.2 -m "Nexora 3.1.2"
git push origin main
git push origin v3.1.2
```

Если signed Git tags пока не настроены, используйте annotated tag, но не lightweight tag.

## Release workflow

`.github/workflows/release.yml`:

1. запускается после успешного CI release-commit, push tag или ручного выбора существующего tag;
2. устанавливает pinned Node version и проверяет соответствие tag/package metadata;
3. выполняет build/tests и проверяет наличие Authenticode secrets;
4. всегда создаёт source ZIP, PWA ZIP, SPDX SBOM и `SHA256SUMS.txt`;
5. при наличии signing secrets собирает Client в draft, добавляет Server и проверяет `.exe`, blockmap и `latest.yml`;
6. публикует stable Latest только после проверки полного набора signed updater assets;
7. без signing secrets публикует только Source/PWA prerelease и намеренно исключает `.exe`, blockmap и `latest.yml`.

Ручной запуск требует существующий stable tag в поле `release_tag`; сборка произвольного состояния `main` как релиза запрещена.

Незавершённый draft или Source/PWA prerelease можно безопасно заменить повторным workflow run. Уже опубликованный stable release не изменяется: исправление выпускается новым patch number и новым tag.

## Политика auto-update 3.1.2

Electron Client updater:

- инициализируется после `app.whenReady()`;
- выполняет initial check;
- повторяет automatic check каждые шесть часов;
- объединяет concurrent requests через single-flight;
- очищает listeners/timers при shutdown;
- устанавливает update только при выполнении signature/install policy;
- возвращает stable reason `no_installable_update`, если signed metadata/installable assets отсутствуют.

Updater не должен принимать unsigned `.exe`, missing/foreign `latest.yml`, invalid signature или incomplete asset set.

## Проверка auto-update

1. Установите предыдущий stable Client с тем же `appId`.
2. Опубликуйте следующий signed stable patch release.
3. Запустите старый Client и подтвердите initial update check.
4. Проверьте downloading/downloaded states и отсутствие duplicate concurrent checks.
5. Закройте Client и убедитесь, что новая signed version установилась.
6. Проверьте сохранность trusted servers, isolated sessions и user settings.
7. Повторите с Source/PWA-only prerelease: Client должен вернуть `no_installable_update`, а не скачать unsigned artifact.
8. Повторите с missing/corrupt metadata в изолированной test feed: UI должен показать stable diagnostic reason без stack trace.

Stable Release Assets должны содержать:

- signed Client `.exe`;
- Client `.blockmap`;
- `latest.yml`;
- signed Server `.exe`;
- source ZIP;
- PWA ZIP;
- SPDX SBOM;
- `SHA256SUMS.txt`.

## Override канала

Для private/internal test channel можно задать HTTPS generic feed через `update-config.json`:

```json
{
  "clientFeedUrl": "https://updates.example.local/nexora/client",
  "serverFeedUrl": "https://updates.example.local/nexora/server"
}
```

Или используйте `NEXORA_CLIENT_UPDATE_URL` / `NEXORA_SERVER_UPDATE_URL`. HTTP feed игнорируется. Internal feed не отменяет signature verification и install policy.

## Rollback

Не заменяйте asset уже установленного version number. Выпустите новую patch-version с исправлением.

Для Server перед update/rollback:

1. создайте verified backup;
2. зафиксируйте current schema;
3. проверьте documented migration/rollback path;
4. не запускайте binary, не поддерживающий schema 7;
5. после rollback выполните integrity/readiness checks.

Schema 7 intentionally blocks silent downgrade к 3.0.0/schema 6.
