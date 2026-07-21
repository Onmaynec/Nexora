# Боты и интеграции Nexora 3.0.0

Владелец комнаты управляет ботами и webhook через вкладку «Интеграции» либо REST API. Token/secret показывается один раз; храните его в secret manager.

## Bot token

Scopes:

- `messages:write` — отправлять сообщения только в комнате бота;
- `messages:read` и `members:read` зарезервированы для контролируемых read API;
- `webhooks:manage` зарезервирован для управления доставкой.

Проверка токена:

```http
GET /api/v3/bot/me
Authorization: Bearer nxa_...
```

Отправка:

```http
POST /api/v3/bot/messages
Authorization: Bearer nxa_...
Content-Type: application/json

{"conversationId":"...","text":"Сборка завершена","clientId":"build_20260721_001","silent":true}
```

Token ограничен собственной комнатой, сроком и 60 запросами в минуту. `clientId` делает повторную отправку идемпотентной. Server хранит только SHA-256 token hash; отзыв действует сразу.

## Outgoing webhook

Разрешены только публичные HTTPS URL на порту 443. Server блокирует localhost, LAN/Radmin, link-local, CGNAT, multicast и reserved ranges, закрепляет проверенный DNS address на соединение и сохраняет TLS SNI/hostname verification.

Headers:

```text
X-Nexora-Event: message.created
X-Nexora-Signature-256: sha256=<hex HMAC-SHA256>
```

Подпись считается по точным байтам JSON body. Получатель обязан выполнить constant-time compare, отклонить неизвестный event ID и хранить обработанные ID для идемпотентности. Таймаут доставки — 5 секунд; результат записывается в integration audit.

## Отзыв

- `DELETE /api/bots/:botId/tokens/:id` — отозвать один token;
- `DELETE /api/rooms/:roomId/bots/:id` — отключить bot account и все его tokens;
- `DELETE /api/rooms/:roomId/webhooks/:id` — отключить webhook.

Nexora не запускает произвольный код интеграции внутри Server.
