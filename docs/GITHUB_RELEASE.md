# GitHub Release и автообновление

## Репозиторий

Активный public repository: [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora). Public visibility нужна встроенному Client updater без пользовательского GitHub token.

Защитите `main`, запретите force-push, включите обязательный CI и 2FA. Для production рекомендуется GitHub Environment `windows-release` с manual approval.

## Secrets

В **Settings → Secrets and variables → Actions** добавьте:

- `WINDOWS_CERTIFICATE_BASE64` — PFX/P12 в base64 или поддерживаемый `electron-builder` source;
- `WINDOWS_CERTIFICATE_PASSWORD` — пароль сертификата.

`GITHUB_TOKEN` GitHub Actions выдаёт автоматически. Не добавляйте secrets в `.env`, `update-config.json` или исходники.

## Первый релиз

Предпочтительный путь — отправить в `main` проверенный commit с префиксом `release:`. После успешного workflow `CI` релизный workflow сверяет `package.json`, создаёт аннотированный SemVer-тег и продолжает сборку в том же запуске. Тег также можно создать вручную:

```bash
git switch main
git pull --ff-only
npm ci
npm run release:check
npm run audit:security
git tag -s v2.0.0 -m "Nexora 2.0.0"
git push origin main
git push origin v2.0.0
```

Если signed Git tags пока не настроены, используйте annotated tag, но не lightweight tag.

Workflow `.github/workflows/release.yml` на Windows:

1. запускается после успешного `CI` release-коммита, прямого push тега или ручного выбора существующего тега;
2. устанавливает Node 22.16, создаёт отсутствующий аннотированный tag и проверяет его соответствие `package.json`;
3. запускает build/tests/signing gate;
4. собирает Client и через Electron Builder загружает `.exe`, blockmap и `latest.yml` только в невидимый draft Release;
5. собирает Server, добавляет его и `SHA256SUMS.txt`, затем проверяет полный список assets;
6. публикует Release только после успешной загрузки всех assets.

Ручной запуск требует уже существующий стабильный tag в поле `release_tag`; сборка произвольного состояния `main` как релиза запрещена.
Незавершённый draft можно безопасно пересобрать. Уже опубликованный Release workflow не изменяет: исправление выпускается новой patch-версией и новым тегом.

## Проверка auto-update

1. Опубликуйте подписанный `v2.0.0`.
2. Соберите/установите предыдущую тестовую версию с тем же `appId`.
3. Опубликуйте `v2.0.1` без prerelease-флага.
4. Запустите старый Client: он должен показать downloading/downloaded.
5. Закройте Client и убедитесь, что новая подписанная версия установилась.
6. Проверьте, что пользовательские trusted servers и сессия сохранились.

Release Assets должны содержать Client `.exe`, `.blockmap`, `latest.yml`, Server `.exe` и `SHA256SUMS.txt`.

Конфигурация следует официальным рекомендациям [electron-builder Auto Update](https://www.electron.build/docs/features/auto-update/) и [Publish](https://www.electron.build/publish/): Windows использует NSIS, metadata публикуется явно, а проверка подписи обновления включена через `verifyUpdateCodeSignature`.

## Override канала

Для private/internal канала можно задать HTTPS generic feed через `update-config.json`:

```json
{
  "clientFeedUrl": "https://updates.example.local/nexora/client",
  "serverFeedUrl": "https://updates.example.local/nexora/server"
}
```

Или переменные `NEXORA_CLIENT_UPDATE_URL` / `NEXORA_SERVER_UPDATE_URL`. Небезопасный HTTP feed игнорируется.

## Rollback

Не заменяйте asset уже установленного version number. Выпустите новую patch-версию с исправлением. Для Server перед update/rollback создайте backup и убедитесь, что новая schema имеет задокументированный путь совместимости.
