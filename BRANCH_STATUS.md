# Статус выпуска Nexora 3.3.0

## Классификация

| Параметр | Значение |
|---|---|
| Repository branch | `agent/nexora-3.3.0-full-release` |
| Version | `3.3.0` |
| Base version | `3.2.5` |
| Source Pull Request | PR `#38` |
| Merge commit | ожидается |
| Release tag | `v3.3.0` после merge и release gates |
| Distribution | signed release при наличии Authenticode; иначе полный `UNSIGNED-TEST` prerelease |
| Stable signed baseline | `3.1.2` до успешной подписанной публикации 3.3.0 |
| Independent E2EE audit | не выполнен |

Nexora `3.3.0` является release candidate крупного обновления. Ветка не должна считаться опубликованным релизом до merge, успешного current-head CI, создания immutable tag и проверки GitHub Release assets.

## Реализовано

### Trust и сообщения

- `Welcome claim` rate limit изолирован по conversation;
- Client coalescing и `Retry-After` устраняют MLS recovery storm;
- старые и новые личные диалоги/комнаты не зависят от общего device recovery bucket;
- secure plaintext fallback не добавлен;
- удаление обычных и защищённых сообщений подтверждается внутри приложения;
- инертный lock control удалён из secure composer.

### Голосовые и media UX

- waveform рассчитывается по RMS/peak и нормализуется для конкретной записи;
- played segment меняет цвет и анимируется;
- сохранены seek, duration и playback rate;
- echo cancellation, noise suppression и auto gain запрашиваются при поддержке платформой.

### Plus, Импульсы и Pulse

- добавлен расходуемый catalog профиля, сообщений, реакций и комнат;
- списание выполняется атомарно и идемпотентно;
- отрицательный баланс и повторное списание запрещены;
- room purchase проверяет owner role;
- Sandbox самостоятельно обслуживает catalog, receipts, goals, contributions, refunds и entitlements;
- Cloud schema расширена таблицей `impulse_purchases`;
- production entitlements подписываются Ed25519, Sandbox остаётся локально маркированным.

### Website и distribution

- сайт переработан для 3.3.0 с устойчивой кириллической типографикой;
- RU/EN и GitHub controls имеют исправленный hit testing;
- download cards используют реальные GitHub Release assets;
- при отсутствии Authenticode публикуются Client/Server `.exe` и Android `.apk` с суффиксом `UNSIGNED-TEST`;
- unsigned path не публикует `latest.yml` и `.blockmap`;
- Source ZIP, PWA ZIP, SPDX SBOM и SHA-256 checksums публикуются в обоих режимах.

## Автоматические доказательства

До завершения PR authoritative evidence записывается в [RELEASE_VERIFICATION_3.3.0.md](RELEASE_VERIFICATION_3.3.0.md). Обязательные gates:

- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:check`;
- Linux `npm test`;
- schema 8 soak;
- Android `assembleDebug`;
- Nexora 3.3 focused regression suite;
- website validation;
- Windows signed или explicitly unsigned artifact build;
- release asset verification.

## Совместимость

- Local Server schema: `8`, без новой локальной миграции;
- Cloud DB: идемпотентная additive migration `cloud/schema-3.3.sql`;
- Application API: v3, совместимое расширение;
- Trust/MLS/encrypted-media API: v4, совместимое исправление recovery;
- обновление поддерживается с Nexora `3.2.0–3.2.5`.

## Граница безопасности

Local Server не получает plaintext защищённых сообщений, private MLS state, ключи secure-вложений, исходные имена, фактический MIME, подписи, длительность голосового или waveform. Сервер видит служебные метаданные: account/device identifiers, membership, conversation scope, timing, network context, ciphertext size и delivery events.

Pulse catalog не блокирует общение и не изменяет Trust permissions. Все права и списания проверяются сервером. Plaintext downgrade, client-defined price и direct room-scope bypass не добавлены.

## Реальные ограничения

- `UNSIGNED-TEST` binaries не являются production-signed release;
- Android test APK не заменяет release keystore и physical-device matrix;
- независимо выполненный cryptographic/application-security audit отсутствует;
- traffic-analysis resistance не заявляется;
- voice/video calls и screen sharing не входят в 3.3.0.
