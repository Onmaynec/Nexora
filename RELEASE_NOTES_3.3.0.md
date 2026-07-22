# Nexora 3.3.0

Дата выпуска: 2026-07-23

Nexora `3.3.0` — крупное продуктовое обновление линии 3.x. Оно исправляет блокирующий MLS recovery для личных диалогов и комнат, превращает Импульсы в расходуемую серверную экономику, обновляет голосовые сообщения и подтверждения опасных действий, перерабатывает сайт проекта и публикует полный набор проверяемых артефактов даже при отсутствии сертификатов подписи.

## Главное

### Защищённые чаты снова открываются

Причиной ошибки была комбинация нескольких факторов:

- `Welcome claim` использовал общий recovery bucket для всех диалогов одного устройства;
- Client выполнял повторные запросы без conversation-scoped coalescing;
- короткий polling-интервал и повторная инициализация быстро исчерпывали лимит;
- `429 RATE_LIMITED` блокировал MLS bootstrap и загрузку истории.

В `3.3.0`:

- серверный лимит `Welcome claim` изолирован по `user + device + conversation`;
- Client объединяет параллельные recovery-запросы;
- применяются минимальные интервалы для claim/request и `Retry-After`;
- повторный запрос не создаёт новый recovery storm;
- plaintext fallback не добавлен.

### Импульсы получили реальное назначение

Добавлен серверный каталог:

| Возможность | Стоимость | Область |
|---|---:|---|
| Неоновая рамка аватара | 120 ◈ | пользователь |
| Акцент профиля Aurora | 180 ◈ | пользователь |
| Стиль сообщений Prism | 220 ◈ | пользователь |
| Набор реакций Nova | 140 ◈ | пользователь |
| Расширенные реакции комнаты | 400 ◈ | комната, 30 дней |
| Тема комнаты Midnight | 650 ◈ | комната, 30 дней |
| Баннер комнаты Aurora | 500 ◈ | комната, 30 дней |

Покупка выполняется сервером атомарно:

1. проверяются авторизация, Cloud/Sandbox link, scope, членство и роль;
2. проверяется `Idempotency-Key`;
3. проверяется баланс и отсутствие уже активного права;
4. создаются равные debit/credit записи ledger;
5. создаётся entitlement;
6. обновление отправляется через realtime.

Импульсы нельзя вывести, обменять на деньги или передать напрямую. Общение, файлы, комнаты, Trust Core и базовая безопасность не требуют Plus или Импульсов.

### Pulse Sandbox стал самостоятельным тестовым контуром

Sandbox больше не обращается к отключённому Pulse Cloud за:

- квитанциями;
- каталогом;
- целями комнат;
- вкладами и возвратами;
- локальными entitlements.

Это устраняет наблюдавшиеся `409` для receipts и `503` для room goals. Цели, вклады, достижение цели и отмена с возвратом работают локально, атомарно и идемпотентно.

### Голосовые сообщения

- waveform рассчитывается по RMS и peak амплитуде;
- значения нормализуются по диапазону конкретной записи;
- столбцы имеют различимую высоту даже у тихих записей;
- воспроизведённая часть меняет цвет;
- во время playback применяется мягкая анимация;
- сохранены seek, play/pause, длительность и скорость `1× / 1.5× / 2×`;
- для записи запрашиваются echo cancellation, noise suppression и auto gain control, если они поддерживаются платформой.

### Интерфейс Client

- инертная иконка замка удалена из secure composer;
- удаление обычного и защищённого сообщения подтверждается внутри Nexora;
- модальное окно поддерживает клавиатуру, Escape, focus restoration и busy state;
- исправлены `Cloud Account: undefined` и выход `LOCAL TEST MODE` за границы;
- добавлен адаптивный каталог Импульсов;
- состояния недостаточного баланса, активного права и недоступной room-покупки отображаются явно.

### Сайт проекта

Сайт полностью приведён к линии `3.3.0`:

- новая display-типографика на системных шрифтах без внешних runtime-зависимостей;
- исправлены пересечения кириллических заголовков;
- RU/EN и GitHub controls имеют отдельный hit area и delegated fallback;
- главный экран, repository evidence, Pulse и финальный CTA содержат реальные продуктовые данные;
- download cards читают assets выбранного GitHub Release;
- signed и `UNSIGNED TEST BUILD` визуально различаются;
- добавлены responsive и reduced-motion boundaries.

## Распространение и подпись

Если Authenticode secrets настроены, release workflow публикует:

- подписанный Windows Client;
- Client blockmap и `latest.yml` для updater;
- подписанный Windows Server;
- Android test APK;
- PWA ZIP, Source ZIP, SPDX SBOM и SHA-256 checksums.

Если Authenticode secrets отсутствуют, workflow всё равно публикует напрямую скачиваемые:

- `Nexora-Client-Setup-3.3.0-UNSIGNED-TEST.exe`;
- `Nexora-Server-Setup-3.3.0-UNSIGNED-TEST.exe`;
- `Nexora-Android-3.3.0-UNSIGNED-TEST.apk`;
- PWA ZIP, Source ZIP, SPDX SBOM и `SHA256SUMS.txt`.

Unsigned prerelease намеренно не содержит `latest.yml` и `.blockmap`. Production updater не может установить такие файлы.

## Совместимость

- Local Server schema: `8`;
- Application API: `v3`, совместимое расширение;
- Trust/MLS API: `v4`, совместимое исправление recovery;
- Cloud schema: добавлена идемпотентная таблица `impulse_purchases`;
- обновление поддерживается с Nexora `3.2.0–3.2.5`;
- новая ручная миграция локальной базы не требуется.

## Безопасность

- все списания и room-scoped права проверяются на сервере;
- room catalog purchase доступна только владельцу;
- членство и бан проверяются сервером для целей и вкладов;
- отрицательный баланс запрещён;
- повторный idempotency key не создаёт повторное списание;
- Stripe webhook сохраняет raw body для проверки подписи;
- Sandbox не создаёт production-signed entitlement;
- unsigned Windows builds не попадают в updater channel.

## Проверка

Авторитетные результаты находятся в `RELEASE_VERIFICATION_3.3.0.md` и GitHub Actions Pull Request/Release runs. Release публикуется только после прохождения build, unit/API/integration, performance, security, schema soak, Android, website и Windows artifact gates.

## Известные ограничения

- `UNSIGNED-TEST` сборки предназначены для тестирования и могут показывать предупреждение Windows SmartScreen;
- Android APK без release keystore является test build;
- независимо выполненный криптографический или application-security аудит не заявляется;
- Local Server видит служебные метаданные: account/device identifiers, membership, timing, IP/network context, ciphertext size и delivery events;
- voice/video calls и screen sharing не входят в `3.3.0`.
