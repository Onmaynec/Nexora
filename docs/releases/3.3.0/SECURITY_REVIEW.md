# Security Review — Nexora 3.3.0

Дата: 2026-07-23
Область: изменения Trust/MLS recovery, Pulse catalog/ledger/goals, Client confirmation UX, voice media, release distribution и website.

## Итоговая классификация

Nexora `3.3.0` сохраняет существующие authority-границы:

- Client отвечает за plaintext, private MLS state, локальные ключи, расшифровку media и UI;
- Local Server отвечает за авторизацию, membership, room roles, bans, rate limits, порядок доставки, opaque storage, Pulse Sandbox и локальный audit;
- Pulse Cloud отвечает за Cloud Identity, платежи, double-entry ledger и production-signed entitlements;
- GitHub Release workflow отвечает за классификацию и публикацию артефактов.

Новая функциональность не добавляет plaintext fallback и не делает Plus/Импульсы условием доступа к базовым сообщениям или Trust Core.

## Trust/MLS recovery

### Найденная первопричина

`Welcome claim` ранее использовал bucket вида:

```text
welcome:{userId}:{deviceId}
```

Он был общим для всех диалогов устройства. Client одновременно выполнял initial claim, Welcome request и polling с повторной инициализацией. В результате нормальная работа одного устройства могла исчерпать `recovery`-лимит и заблокировать MLS bootstrap как старых, так и новых личных диалогов и комнат.

### Исправление

- bucket расширен до `welcome:{userId}:{deviceId}:{conversationId}`;
- commits bucket изолирован по `groupId`;
- Client объединяет параллельные claim/request для одного пути;
- применяются минимальные интервалы и серверный `Retry-After`;
- rate-limited recovery возвращается как deferred state только для узко определённых Welcome endpoints;
- прочие ошибки не скрываются.

### Остаточный риск

Разделение buckets не отменяет общий риск DoS с большого количества разрешённых conversation IDs. Доступ к endpoint по-прежнему требует действующую session, CSRF для POST, membership и Trust device ID; сервер ограничивает количество buckets и проверяет conversation access.

## Pulse catalog и ledger

### Серверные проверки

Перед списанием выполняются:

1. действующая Local/Cloud identity;
2. валидный `Idempotency-Key`;
3. наличие продукта в серверном catalog;
4. проверка scope;
5. проверка room existence, membership, ban и owner role для room purchase;
6. проверка активного entitlement;
7. проверка достаточного баланса;
8. атомарная запись ledger и entitlement.

### Ledger invariants

- сумма debit равна сумме credit;
- wallet не может стать отрицательным;
- idempotency key уникален;
- `impulse_purchases` связывает purchase, ledger transaction и entitlement;
- повтор с тем же ключом и другим scope/product возвращает `IDEMPOTENCY_CONFLICT`;
- entitlement создаётся только после успешного ledger posting.

### Sandbox boundary

Sandbox:

- отключён при production Pulse mode;
- не создаёт Cloud-signed entitlement;
- явно маркирует данные `source=local_sandbox`;
- хранит операции в локальном ledger/audit;
- не вызывает денежный checkout;
- не возвращает фиктивные receipts.

### Room goals

- create/cancel доступны владельцу комнаты;
- contribution требует membership и отсутствие ban;
- вклад ограничен остатком цели и балансом;
- достижение цели атомарно создаёт room entitlement;
- отмена активной цели возвращает каждый принятый вклад ровно один раз;
- повторный cancel/contribution защищён idempotency key.

## Client UX и опасные действия

Системный `window.confirm` для удаления обычных и защищённых сообщений заменён на in-app dialog:

- `role=dialog`, `aria-modal=true`;
- отдельные title/description IDs;
- focus transfer и restoration;
- Escape/backdrop cancel;
- busy state блокирует повторное подтверждение;
- destructive action выполняется только после явного confirm.

Модальное окно не заменяет серверную проверку `canDelete`/authorization.

## Voice media

Изменения waveform не влияют на server trust boundary:

- duration и waveform остаются внутри MLS media descriptor;
- исходный audio blob шифруется до upload;
- Local Server получает opaque ciphertext и размер;
- waveform вычисляется локально;
- decode failure возвращает пустой waveform, а не обходит проверку вложения.

## Cloud webhook integrity

Новый Cloud catalog использует JSON body, однако Stripe webhook должен получать исходные bytes. Middleware `create-cloud-server-v11` явно пропускает `/v1/provider/webhooks/stripe` мимо общего JSON parser, после чего base application применяет `express.raw`. Это сохраняет проверку provider signature.

## Release distribution

### Signed path

При наличии Authenticode secrets:

- выполняется signing gate;
- публикуются Client `.exe`, `.blockmap`, `latest.yml` и Server `.exe`;
- updater metadata доступна только для этого пути.

### Unsigned test path

При отсутствии secrets:

- файлы переименовываются с суффиксом `UNSIGNED-TEST`;
- Release помечается prerelease;
- `latest.yml` и `.blockmap` не публикуются;
- workflow проверяет отсутствие updater metadata;
- сайт показывает signature label до скачивания.

Это позволяет скачать установщики напрямую, не снижая signed-only policy production updater.

## Website

- внешние runtime scripts/styles отсутствуют;
- RU/EN переключение не использует небезопасный HTML, кроме контролируемых строк словаря с `<br>/<em>`;
- GitHub API данные записываются через `textContent`/`replaceChildren`;
- release asset URLs берутся из GitHub API;
- ссылки открываются с `rel=noreferrer`;
- responsive overflow не скрывает controls;
- pointer events явно разрешены для language/GitHub actions.

## Проверенные категории угроз

| Категория | Результат |
|---|---|
| IDOR catalog purchase | scope/room owner проверяются Local Server и Cloud payload |
| Повторное списание | idempotency + unique DB constraints |
| Отрицательный баланс | транзакционный wallet guard |
| Подмена product price | цена берётся из shared server catalog |
| Подмена room scope | owner/member/ban checks, signed entitlement scope |
| Sandbox → production escalation | production conflict и отсутствие Cloud signature |
| MLS recovery flood | coalescing, backoff, scoped limiter, bucket cap |
| CSRF | существующий Local Server CSRF middleware применяется к POST |
| XSS в website GitHub data | данные выводятся как text content |
| Unsigned updater downgrade | updater metadata отсутствует в unsigned path |
| Webhook body mutation | Stripe route пропускается до raw parser |
| Secret leakage | release workflow использует GitHub Secrets и не печатает значения |

## Не заявляется

- независимый криптографический аудит;
- защита от traffic analysis;
- анонимность service metadata;
- доверие к unsigned test binaries как к production release;
- Android release signing без отдельного keystore;
- защита скомпрометированного endpoint после локальной расшифровки.

## Решение

Изменения могут быть включены в `3.3.0` после прохождения полного CI/release gate и проверки опубликованных assets. До этого документ описывает security design release candidate, а не подтверждение независимого аудита.
