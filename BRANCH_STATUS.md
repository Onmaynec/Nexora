# Статус выпуска Nexora 3.2.5

## Классификация

| Параметр | Значение |
|---|---|
| Repository branch | `main` |
| Version | `3.2.5` |
| Base version | `3.2.4` |
| Source Pull Request | PR `#25` |
| Merge commit | `df671ce63e71c5736f13d2fa3d7db36466efc780` |
| Release tag | `v3.2.5` |
| Distribution | Source/PWA prerelease |
| Stable signed baseline | `3.1.2` |
| Signed stable 3.2.5 approval | не предоставлен |
| Independent E2EE audit | не выполнен |

Nexora `3.2.5` является текущей prerelease-линией в `main`. Версия предназначена для контролируемого Source/PWA-тестирования. Она не является подтверждённым подписанным Windows stable release и не должна описываться как independently audited E2EE.

## Реализовано

- системный Windows-диалог изменений заменён на доступное окно внутри Nexora Client;
- `plus grant`, `plus revoke` и `impulses grant|revoke` используют канонический `userId` и корректно сохраняются в SQLite;
- старые sandbox-снимки с `localUserId` нормализуются без ручного изменения базы;
- изображения автоматически расшифровываются локально и отображаются inline;
- голосовые используют waveform-плеер с play/pause, перемоткой, длительностью и скоростью;
- обычные файлы сохраняют явное локальное открытие и скачивание;
- MLS group-creation race и временное отсутствие подходящего KeyPackage переходят в безопасный Welcome request/wait;
- отправка сообщений и медиа больше не запускает полный bootstrap refresh;
- realtime обновляет сообщение и превью чата локально;
- строки сообщений мемоизированы, а автопрокрутка сохраняет позицию пользователя;
- интерактивная сеть ограничена областью истории сообщений;
- controls, disabled-состояния и scrollbars Nexora Server приведены к общей теме;
- локальная `npm run release:windows` отделена от обязательной подписи, а production-публикация остаётся signed-only.

## Автоматические доказательства

Кодовый кандидат `805a231190883c406abf1c016a6241ca8bdd2a25` прошёл расширенный Windows workflow run `29953309887`:

- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:check`;
- real-SQLite regression suite 3.2.5;
- `npm run release:windows` и проверку наличия Client/Server installers;
- Linux `npm test`;
- schema 8 soak;
- Android `assembleDebug`.

Финальный head PR с документацией прошёл current-head CI run `29953988948`: `verify`, `release-gate`, `schema8-soak`, `linux-tests` и `android-source` завершились успешно.

Подробный отчёт: [RELEASE_VERIFICATION_3.2.5.md](RELEASE_VERIFICATION_3.2.5.md).

## Совместимость

- Local Server schema: `8`, без новой миграции;
- Application API: v3, без breaking changes;
- Trust/MLS/encrypted-media API: v4, совместимое исправление;
- обновление поддерживается с Nexora `3.2.0–3.2.4`;
- схема 7 → 8 по-прежнему требуется только для данных линии 3.1.x.

## Граница безопасности

Local Server не получает plaintext защищённых сообщений, private MLS state, ключи secure-вложений, исходные имена, фактический MIME, подписи, длительность голосового или waveform. Сервер продолжает видеть служебные метаданные: идентификаторы аккаунтов и устройств, membership, conversation scope, время, сетевой контекст, размер ciphertext и события доставки.

MLS fast path используется только для уже сохранённого локального state и не отключает серверные проверки доступа, epoch, commit и Welcome. Plaintext fallback не добавлен.

## Ограничения выпуска

- локально собранные Windows installers не являются подписанным production-релизом;
- для stable Windows-публикации необходимы Authenticode secrets и installed auto-update E2E;
- physical Android runtime matrix не заменяется source build;
- независимый криптографический и application-security аудит не выполнен;
- metadata/traffic-analysis resistance не заявляется.
