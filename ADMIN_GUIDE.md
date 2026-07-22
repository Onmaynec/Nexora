# Руководство администратора Nexora 3.1.2

## 1. Назначение и границы

Nexora Local Server предназначен для Windows 10/11 и работает через localhost, LAN, Radmin VPN либо публичный HTTPS-домен. Для internet deployment используйте reverse proxy, действительный сертификат, ограниченный firewall, явные allowed origins, мониторинг и регулярные backup. Не публикуйте локальный порт простым port forwarding.

Участник сети не считается автоматически доверенным: Server проверяет session, membership, role, ban/restriction, room settings и resource scope для каждой операции.

Stable 3.1.2 не использует E2EE. Оператор компьютера Local Server имеет технический доступ к рабочей SQLite и вложениям.

## 2. Развёртывание

1. При необходимости установите Radmin VPN и подключите серверный ПК к нужной сети.
2. Установите подписанный `Nexora-Server-Setup-3.1.2.exe` либо выполните `npm ci && npm start` из проверенного source-релиза.
3. Разрешите входящий TCP 3443 только для необходимого private/Radmin-интерфейса. TCP 3080 нужен только для локального redirect на HTTPS.
4. Запустите Server и проверьте:
   - статус процесса;
   - полный HTTPS-адрес;
   - уникальный Server ID;
   - SHA-256 certificate fingerprint;
   - SQLite integrity и schema 7;
   - readiness без drain/read-only errors.
5. Зарегистрируйте первый локальный аккаунт — он станет администратором Server.

Рабочие данные находятся в `userData\server-data`. Точный путь открывает кнопка «Открыть данные».

## 3. Health, metrics и диагностика

Local Server публикует:

- `GET /healthz/live` — процесс работает;
- `GET /healthz/ready` — SQLite/schema/runtime готовы, процесс не находится в drain mode;
- `GET /metrics` — Prometheus text format.

Настройте `NEXORA_METRICS_TOKEN` для remote scraping. При отсутствии token `/metrics` должен оставаться доступным только с loopback source.

Operational logs содержат request ID и не должны включать authorization headers, cookies, passwords, tokens, API keys, secrets или signatures. Перед отправкой диагностических файлов всё равно выполняйте ручную проверку и redaction.

При shutdown Server сначала меняет readiness на `503`, затем завершает workers, HTTP/Socket.IO и закрывает SQLite. Не завершайте процесс принудительно без необходимости.

## 4. Client, браузер и сертификаты

Передавайте пользователю полный адрес вида `https://26.x.x.x:3443`, Server ID и SHA-256 fingerprint по доверенному каналу.

Nexora Client показывает карточку нового сертификата. Пользователь сверяет fingerprint и нажимает «Доверять и подключиться». Client закрепляет PEM SHA-256 за Server ID; системная установка CA для `.exe` не требуется. Изменившийся сертификат всегда требует повторного подтверждения.

Для Edge/Chrome/PWA и Android при локальном CA экспортируйте `.crt` и установите его в доверенные сертификаты ОС, затем снова сравните fingerprint. Не предлагайте обходить предупреждение браузера или Android.

Если после подключения Radmin VPN адрес изменился, полностью перезапустите Server: certificate должен содержать текущий IP в SAN.

## 5. Пользователи и сессии

В разделе «Пользователи» администратор может отключить local account или выдать временный пароль. Сброс завершает активные sessions, а следующий вход требует обязательной смены пароля.

Пользователь самостоятельно управляет display name, bio/status, avatar, password, local TOTP/recovery codes, notifications/quiet hours и active sessions. Блокировка запрещает direct messages и новые requests; контакт можно удалить без удаления истории.

Настройте password policy, число неверных попыток и lock duration. Журнал входа хранит IP, результат и безопасную причину отказа.

Cloud Identity — отдельная учётная запись Pulse Cloud. Local Server не должен получать Cloud password, MFA secret, OAuth refresh token или Cloud session cookie.

## 6. Комнаты и модерация

Владелец назначает/снимает moderators и передаёт ownership. Владелец, moderator и server admin в пределах полномочий могут:

- удалить или забанить участника;
- просматривать room ban list;
- включить read-only/slow mode;
- отключить files или voice messages;
- переименовать room;
- рассматривать join requests;
- обновить/отозвать invite, задать expiry и usage limit;
- выпускать несколько invitations, создавать custom roles/categories;
- разбирать reports/appeals и назначать temporary restrictions;
- включить pre-approval и announcement mode;
- просматривать room audit.

Вступление, выход, изменение роли и transfer ownership создают system messages. Перед передачей владения убедитесь, что новый owner уже является участником. После удаления или бана пользователь должен потерять REST- и realtime-доступ к комнате.

## 7. Хранилище и резервные копии

Server использует SQLite schema 7, WAL и `synchronous=FULL`. При upgrade с 3.0.0 перед schema 6 → 7 выполняются integrity/free-space checks и создаётся проверенный pre-migration backup. Миграция завершается до открытия network traffic. Downgrade к schema 6 блокируется.

В «Хранилище» задайте общую quota и retention файлов. До upload Client запрашивает доступную ёмкость. Retention `0` означает бессрочное хранение.

Для ручной защищённой копии задайте passphrase не короче 10 символов. SQLite и attachments шифруются AES-256-GCM; ключ выводится через scrypt. Passphrase нигде не сохраняется и не восстанавливается.

При restore Server сначала создаёт `pre-restore` copy, атомарно заменяет данные и повторно проверяет integrity/schema. Храните хотя бы одну проверенную копию вне server computer. Не копируйте запущенный `nexora.sqlite` вручную.

## 8. Nexora Plus / Pulse

### Режимы

| Режим | Назначение | Реальные платежи |
|---|---|---|
| `disabled` | обычный Local Server без commercial capabilities | нет |
| `sandbox` | локальная QA/demo-модель Plus/Impulses | нет |
| `production` | подписанная интеграция с отдельным Pulse Cloud | только через Cloud/provider |

Production требует HTTPS Cloud URL, scoped service credential и pinned Ed25519 public keys. Local Server проверяет signed envelopes, key ID, expiry и server/user/room/product scope до обновления verified cache.

### Local sandbox 3.1.2

Sandbox управляется через Windows Server Admin или CLI:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Правила sandbox:

- доступен только когда production Pulse Cloud не настроен;
- checkout и реальные provider operations отключены;
- новый test Plus entitlement выдаёт 400 Impulses один раз;
- balance не может стать отрицательным;
- grant/revoke operations выполняются Server, записываются в audit/ledger и не создают production signatures.

### Production

Для production нужны Cloud deployment, provider credentials, webhook verification, reconciliation, refund/dispute/cancel flow, transactional email, legal/privacy/tax documents и secret management. Полный контракт: [docs/PULSE.md](docs/PULSE.md).

## 9. Audited developer commands

CLI и Windows Server Admin используют общий allowlist:

```text
help
status
health
users list
rooms list
backup create [passphrase]
storage cleanup
read-only on|off
audit tail [count]
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Произвольные shell-команды и JavaScript не выполняются. Изменяющие команды записываются в `integrationAudit`; secret argument values не должны попадать в журнал.

## 10. Обновления

Electron Client 3.1.2 запускает updater после `app.whenReady()`, выполняет initial check, затем проверяет канал каждые шесть часов. Checks используют single-flight и корректно освобождают timers/listeners при выходе.

Только stable Release с подписанным Client installer, blockmap и `latest.yml` участвует в auto-update. Source/PWA prerelease и unsigned assets updater игнорирует. Отсутствие installable metadata должно отображаться стабильной причиной `no_installable_update`, а не opaque exception.

Server обновляется только по решению администратора. До update создайте backup. API v3 принимает основной диапазон Client major 2–3; несовместимая версия получает HTTP 426.

## 11. Боты и webhooks

Создавайте bot account только в нужной комнате и выдавайте минимальные scopes. Token показывается один раз и хранится Server только как hash; при утечке немедленно отзовите его.

Webhook принимает только публичный HTTPS endpoint, блокирует private/link-local destinations после DNS/IP validation и подписывает payload HMAC. Получатель обязан проверять `X-Nexora-Signature-256`, event ID и idempotency.

## 12. Авария и восстановление

При сбое сохраните:

- очищенные `nexora-server.log` и при необходимости `nexora-client.log`;
- версии Client/Server и Windows build;
- Server ID, request ID, время и последние действия;
- состояние сети и точный stable error code;
- результаты `/healthz/live`, `/healthz/ready` и integrity check.

Не отправляйте passwords, cookies, TOTP/recovery codes, OAuth tokens, bot/Pulse keys, invite codes, private CA key или backup passphrase.

После отключения питания запустите Server и проверьте integrity/schema/readiness. Если integrity не проходит, остановите Server и восстановите последнюю подтверждённую backup.

Emergency read-only сохраняет чтение и блокирует mutations, но не заменяет backup.

## 13. Выпуск Windows-релиза

На чистой Windows 10 и 11:

```bat
npm ci
npm run release:check
npm run audit:security
set NEXORA_SOAK_MINUTES=60
npm run test:soak
npm run release:windows
```

Проверьте Authenticode обоих `.exe`, clean install/uninstall, upgrade с 3.0.0/3.1.0/3.1.1, сохранность schema 7 и auto-update Client с предыдущего stable release. Без signing secrets разрешён только Source/PWA prerelease. Подробный список: [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).
