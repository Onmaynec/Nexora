# Руководство тестера Nexora 3.1.2

## Подключение

1. При необходимости установите Radmin VPN и подключитесь к сети владельца Nexora.
2. Установите подписанный Nexora Client 3.1.2, PWA или Android-клиент.
3. Скопируйте из окна Server полный адрес вида `https://26.x.x.x:3443`.
4. Сверьте SHA-256 fingerprint и Server ID с владельцем по доверенному каналу.
5. Нажмите «Доверять и подключиться» и зарегистрируйтесь.

Для `.exe` установка `.crt` не требуется. Для Edge/Chrome/PWA и Android при локальном CA корневой `.crt` обязателен. Никогда не обходите certificate warning.

## Если Client не подключается

- `ERR_CERT_AUTHORITY_INVALID (-202)` — удалите сохранённую запись сервера, снова вставьте полный адрес и подтвердите актуальный fingerprint; убедитесь, что используется Client 3.1.2.
- «Введите полный IPv4-адрес» — `https://26.` недостаточно, нужны четыре octets и port.
- «Сертификат не содержит адрес» — владелец должен запустить VPN и перезапустить Server, чтобы текущий address попал в SAN.
- «Нет маршрута/сервер недоступен» — оба устройства должны быть online в одной сети; проверьте private firewall TCP 3443.
- «Несовместимая версия» — API v3 принимает основной диапазон Client major 2–3; обновите более старый Client.

## Приёмочный тест 3.1.2

### Профили и контакты

- Нажмите avatar в message, header, chat list, contacts, search и room members — должна открываться одна profile card.
- Повторите для профиля без contact/common rooms: blank screen и error boundary недопустимы.
- Проверьте display name, @username, bio/status, common rooms и действия «Написать/Добавить/Блокировать».
- Загрузите avatar, измените password, просмотрите и завершите отдельную session.
- Удалите contact без блокировки; history должна сохраниться.

### Чаты

- При отсутствии unread рядом с «Сообщения» не должно быть `0`.
- Отправьте text, reply, reaction, poll, mention, silent и scheduled message; отредактируйте, удалите, закрепите, сохраните и перешлите сообщение.
- Наведите мышь на message, откройте reaction picker и переведите cursor на emoji: picker не должен исчезнуть.
- Откройте details drawer и повторите actions у левого/правого края: menus не должны выходить за chat или прятаться под drawer.
- Проверьте Saved Messages, multi-select/copy, drafts, archive/pin/mute и filters.
- Отключите Server, прочитайте cache, поставьте text в outbox, перезапустите Client, запустите Server и проверьте delta sync без дублей.

### Поиск и непрочитанные

- Выполните global search и search внутри chat.
- Нажмите reply/search result — feed должна перейти к original message и подсветить его.
- Проверьте divider «Новые сообщения» и кнопку «К последнему».

### Комнаты и модерация

- Создайте public/private rooms; войдите напрямую, по request и по invite.
- Назначьте moderator, передайте ownership, удалите и забаньте user.
- Проверьте read-only, slow mode, запрет files/voice и room audit.
- Выпустите два invitations, отзовите одно, задайте expiry/usage limit.
- Проверьте custom role/category, report, appeal, temporary restriction и pre-approval.
- После remove/ban убедитесь, что пользователь не получает новые room events и прямой API request отклоняется.

### Файлы и голосовые

- Перетащите несколько files; отмените один upload и повторите failed upload.
- Прервите upload файла больше 2 МБ и убедитесь, что chunk upload продолжается; fake image extension должен быть отклонён или обработан как binary.
- Откройте image, PDF/text preview, media tab и общий file archive.
- Запишите voice: pause → resume → preview → send.
- Проверьте waveform, 1×/1.5×/2×, listened state и продолжение playback после смены chat.
- Откройте global voice dock и нажмите X: dock должен немедленно исчезнуть, playback остановиться, а повторное открытие другого voice не должно использовать прежние name/URL/time/speed.

### Local accounts и Cloud Identity

- Включите local TOTP, сохраните recovery codes, войдите с TOTP и один раз — recovery code; reuse должен быть отклонён.
- Создайте Cloud Account, подтвердите email и включите Cloud MFA.
- Проверьте OAuth 2.1 Authorization Code flow с PKCE S256 и exact redirect URI.
- Свяжите Local Account с Cloud Account через одноразовый link flow; повторное использование link/nonce должно быть отклонено.
- Разорвите link после current-password reauthentication и убедитесь, что local messaging продолжает работать.

### Nexora Plus / Pulse

#### Disabled

- UI объясняет, что Pulse не настроен; базовые chats и собственные данные остаются доступны.

#### Local sandbox 3.1.2

На тестовом Server выполните:

```text
pulse sandbox on
plus grant <user>
pulse user <user>
impulses grant <user> 50 qa
impulses revoke <user> 10 qa
plus revoke <user>
```

Проверьте:

- новая test Plus activation выдаёт 400 Impulses только один раз;
- повторный grant активного entitlement не создаёт второй monthly grant;
- balance не становится отрицательным;
- checkout недоступен;
- operations отражаются в audit/ledger;
- после включения production Pulse local sandbox commands блокируются.

#### Production test environment

- Используйте только отдельный Pulse Cloud/provider sandbox.
- Проверьте checkout, verified webhook, receipt, billing portal, cancel-at-period-end и entitlement revoke propagation.
- Повтор provider event или idempotency key с тем же payload не должен дублировать settlement; scope/payload substitution должен отклоняться.
- Cloud outage не должен блокировать local messaging; UI может показывать только последний verified cache.

### Operational health

- `GET /healthz/live` возвращает success для Local Server и Pulse Cloud.
- `GET /healthz/ready` отражает SQLite/schema/ledger/worker state и становится `503` в drain mode.
- `/metrics` с configured token требует Bearer authentication; без token доступ разрешён только loopback.
- Проверьте, что operational logs содержат request ID, но не credentials/cookies/passwords/tokens/API keys/signatures.
- Выполните allowlisted developer commands `status`, `health`, `users list`, `rooms list`, `audit tail`.
- Попытка shell/eval или неизвестной команды должна быть отклонена.
- Включите emergency read-only: reads работают, mutations блокируются; затем выключите режим.

### Auto-update 3.1.2

- После `app.whenReady()` Client выполняет initial update check.
- Параллельные manual/automatic checks не создают несколько simultaneous requests.
- Следующая automatic check запланирована через шесть часов; при quit timers/listeners очищаются.
- Signed stable release с `latest.yml`/blockmap принимается согласно policy.
- При отсутствии installable signed metadata UI получает стабильную причину `no_installable_update`, а не raw stack/provider error.

### Боты и webhooks

- Создайте bot token только с `messages:write`, отправьте message и убедитесь, что read/foreign room недоступны.
- Проверьте token expiry/revocation и отсутствие plaintext token в storage/logs.
- Проверьте HMAC webhook на public HTTPS endpoint; localhost/private/link-local target должен быть отклонён.

### Responsive, PWA и Android

- Проверьте 1920×1080, 1366×768 и narrow window.
- Раскройте каждый dock/menu: он не должен выходить за panel boundaries.
- Проверьте long names, filenames, bio и 99+ unread.
- Установите PWA, перезапустите без сети и убедитесь, что доступен cached history, но API responses не выдаются Service Worker.
- Откройте Android deep link `nexora://connect?url=<HTTPS URL>`; HTTP URL должен быть отклонён.
- При untrusted/changed certificate Android обязан cancel loading.
- External origin должен открываться во внешнем browser.

## Голосовое не записывается

Проверьте HTTPS, certificate trust, microphone permission и отсутствие другого приложения, занявшего device. В комнате voice messages может отключить moderator. Максимум — 5 минут и 25 МБ.

## Отчёт об ошибке

Укажите версии Client/Server/Cloud, platform/OS, exact steps, expected/actual result, time, request ID, network/deployment type и приложите очищенный screenshot/log.

Не отправляйте password, session cookie, OAuth token, TOTP/recovery code, bot/Pulse key, signing key, invite code, private CA key, user data или backup passphrase.
