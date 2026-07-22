# Статус ветки `agent/nexora-3.2.5-ui-console-performance`

## Классификация

| Параметр | Значение |
|---|---|
| Версия-кандидат | Nexora `3.2.5` |
| Базовая версия | Nexora `3.2.4` |
| Pull Request | PR `#25` |
| Состояние | Проверенный release candidate, ожидает финальный current-head CI и merge |
| Код кандидата | `805a231190883c406abf1c016a6241ca8bdd2a25` |
| Подтверждающий CI | GitHub Actions run `29953309887` |
| Текущий источник истины продукта | `main`, Nexora `3.2.4`, до merge PR `#25` |
| Последняя подтверждённая signed baseline | Nexora `3.1.2` |
| Независимый аудит E2EE | Не выполнен |

## Реализовано в 3.2.5

- системный Windows-диалог обновления заменён на доступное окно внутри Nexora Client;
- `plus grant`, `plus revoke` и `impulses grant|revoke` используют канонический `userId` и корректно сохраняются в SQLite;
- старые sandbox-снимки с `localUserId` нормализуются без ручного редактирования базы;
- изображения автоматически расшифровываются локально и отображаются inline;
- голосовые используют компактный waveform-плеер с play/pause, перемоткой, длительностью и скоростью;
- обычные файлы сохраняют явное локальное открытие и скачивание;
- MLS group-creation race и временное отсутствие подходящего KeyPackage переходят в безопасный Welcome request/wait;
- отправка сообщений и медиа больше не запускает полный bootstrap refresh;
- realtime обновляет сообщение и превью чата локально;
- строки сообщений мемоизированы, а автопрокрутка не сбрасывает позицию пользователя;
- интерактивная сеть ограничена областью истории сообщений;
- элементы управления, disabled-состояния и scrollbars Nexora Server приведены к общей теме;
- локальная `npm run release:windows` отделена от обязательной подписи; production-публикация остаётся signed-only.

## Автоматические доказательства

Run `29953309887` подтвердил на кодовом кандидате `805a231...`:

- Windows `npm run check`;
- Windows `npm run test:unit`;
- Windows `npm run test:performance`;
- Windows `npm run audit:security`;
- dedicated `npm run release:check`;
- real-SQLite regression suite 3.2.5;
- локальную сборку и наличие установщиков Client/Server через `npm run release:windows`;
- Linux `npm test`;
- schema 8 soak;
- Android `assembleDebug`.

Подробный отчёт: [RELEASE_VERIFICATION_3.2.5.md](RELEASE_VERIFICATION_3.2.5.md).

## Совместимость

- Local Server schema: `8`, без новой миграции;
- Application API: v3, без breaking changes;
- Trust/MLS/encrypted-media API: v4, совместимое исправление;
- обновление поддерживается с Nexora `3.2.0–3.2.4`;
- схема 7 → 8 по-прежнему требуется только для данных линии 3.1.x.

## Граница безопасности

Local Server не получает plaintext защищённых сообщений, private MLS state, ключи secure-вложений, исходные имена, фактический MIME, подписи, длительность голосового или waveform. Сервер продолжает видеть служебные метаданные: идентификаторы аккаунтов и устройств, membership, conversation scope, время, сетевой контекст, размер ciphertext и события доставки.

Fast path используется только для уже сохранённого локального MLS state и не отключает серверные проверки доступа, epoch, commit и Welcome. Plaintext fallback не добавлен.

## Ограничения выпуска

До merge PR `#25` версия `3.2.5` не является текущей версией `main`. Локально собранные Windows-установщики не считаются подписанным production-релизом. Для stable Windows-публикации всё ещё необходимы Authenticode secrets, проверка установленного auto-update path и отдельное решение о выпуске. Независимый криптографический аудит не заявляется.
