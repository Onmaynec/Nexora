# Руководство по приёмочному тестированию Nexora

## 1. Область проверки

Документ относится к:

- текущей версии `3.2.3` Source/PWA prerelease;
- signed production baseline `3.1.2`;
- Windows Client/Server, Browser/PWA и Android;
- Application API v3;
- Trust/MLS/encrypted-media API v4;
- SQLite schema 8.

`3.2.3` предназначена для контролируемого тестирования с disposable accounts и test data. Она не является подписанным stable Windows release и не заявляется как independently audited E2EE.

## 2. Карточка тестовой среды

До начала зафиксируйте:

- Client, Server и Cloud versions;
- commit/tag или release asset ID;
- release channel;
- OS, browser и device model;
- deployment profile: localhost, LAN, private VPN или public HTTPS;
- Local Server schema;
- Server ID и sanitized certificate fingerprint;
- Pulse mode;
- дату, tester и test-data scope.

## 3. Connection и TLS

1. Получите full HTTPS URL, Server ID и SHA-256 fingerprint по доверенному каналу.
2. Подключитесь через Windows Client, PWA и Android.
3. Проверьте explicit confirmation нового certificate.
4. Проверьте повторное подтверждение при изменённом fingerprint.
5. Убедитесь, что Browser/PWA и Android отклоняют untrusted certificate.
6. Убедитесь, что HTTP и mixed content отклоняются.

Ожидаемые отказы:

- incomplete или malformed URL;
- certificate SAN mismatch;
- incompatible Client;
- external Android origin внутри WebView;
- автоматический обход TLS warning.

## 4. Authentication bootstrap и lifecycle regressions

### 3.2.1 bootstrap-before-Trust

- выполните cold login без существующей Trust identity;
- убедитесь, что `/api/bootstrap` загружается до device enrollment и Socket.IO authentication;
- экран не должен зависать на «Собираем ваши чаты»;
- Server ID для Trust scope должен поступить из authoritative bootstrap;
- temporary Cloud/Pulse outage не должен блокировать local bootstrap и messaging.

### 3.2.2 Trust configuration ordering

- выполните cold login с encrypted draft state;
- убедитесь, что parent layout configuration выполняется до child passive draft effects;
- pre-configuration draft read должен вернуть empty draft, а не `TRUST_NOT_CONFIGURED`;
- реальные WebCrypto, IndexedDB, registration и verification failures должны оставаться видимыми;
- draft write до configuration должен сохранять rejected-Promise error contract.

### Server shutdown

- выполните stop, quit и overlapping stop/quit;
- убедитесь, что shutdown single-flight;
- readiness становится `503` до закрытия dependencies;
- Pulse/Trust status после SQLite close возвращает stopped-state snapshot;
- unexpected database/repository errors не скрываются;
- Electron main-process exception отсутствует.

## 5. Core messaging

Проверьте:

- direct messages, Saved Messages и rooms;
- text, reply, thread, reaction, mention и poll;
- edit, delete, forward, pin и bookmark;
- silent и scheduled send;
- drafts, archive, mute, filters и search;
- read state, notifications и unread divider;
- offline cache, restart, durable outbox и delta sync без duplicates.

UI acceptance:

- zero badges скрыты;
- reaction picker остаётся interactive;
- menus/docks не выходят за viewport и panel boundaries;
- long names, filenames и 99+ counters не ломают layout;
- keyboard navigation и narrow-window layout остаются usable;
- `prefers-reduced-motion` соблюдается.

## 6. Profiles, contacts и sessions

- откройте одну profile card из message, header, chat list, contacts, search и room members;
- `relationship: null` не должен вызывать blank screen;
- измените display name, bio/status и avatar;
- смените password и завершите отдельную session;
- удалите contact без удаления history;
- проверьте block/unblock;
- включите local TOTP;
- используйте recovery code один раз;
- дождитесь expiry test session и проверьте startup/hourly cleanup.

## 7. Rooms и moderation

Создайте public/private rooms и проверьте:

- direct join, join request и invitation join;
- `owner`, `moderator`, `member` permission boundaries;
- moderator appointment/removal;
- atomic ownership transfer;
- removal, ban и unban;
- read-only и slow mode;
- file/image/voice restrictions;
- multiple invitations, expiry, usage limit и revocation;
- custom roles/categories;
- reports, appeals, temporary restrictions и pre-approval;
- audit entries и system messages.

### Active-ban fail-closed regression 3.2.3

Создайте test fixture с stale membership и одновременным active ban. Проверьте:

- REST conversation access отклонён;
- Socket.IO room events не доставляются;
- media/recovery routes недоступны;
- membership record не имеет приоритета над ban;
- стабильная ошибка не раскрывает внутренние database details.

## 8. Legacy files и voice

- загрузите несколько files;
- отмените и повторите upload;
- прервите resumable upload и продолжите;
- проверьте size, SHA-256 и actual MIME;
- fake image extension отклоняется или обрабатывается как binary;
- откройте image, PDF/text preview и media archive;
- запишите, приостановите, продолжите, preview и отправьте voice;
- проверьте waveform, playback speeds и listened state;
- закройте global voice dock и подтвердите полный audio-state reset.

## 9. Trust device enrollment и limits

### Enrollment

- создайте first device и подтвердите bootstrap verification;
- зарегистрируйте second device;
- сравните fingerprints по доверенному каналу;
- подтвердите device с active verified device;
- unverified device не выполняет secure operations;
- BasicCredential другого user/device scope отклоняется;
- повторное использование одного Ed25519 key для identity и MLS signature отклоняется.

### Device ceiling 3.2.3

- зарегистрируйте до 16 active devices;
- 17-й active device должен быть отклонён атомарно;
- duplicate registration существующего device остаётся idempotent;
- после revocation одного device появляется одна свободная capacity;
- concurrent final-capacity registrations не должны создавать более 16 active records.

### Revocation

- отзовите device;
- подтвердите immediate targeted Socket.IO disconnect;
- другие devices остаются connected;
- revoked Client удаляет identity, private MLS state, KeyPackages, cache и drafts;
- revoked device не получает KeyPackage, Welcome, commit или ciphertext;
- reenrollment запускает новый device lifecycle.

## 10. KeyPackage governance 3.2.3

Проверьте:

- upload 25 KeyPackages — success;
- upload 26 KeyPackages — rejection без partial persist;
- максимум 32 unclaimed packages на device;
- максимум 256 unclaimed packages на user;
- overflowing batch полностью rollback;
- expired package rows очищаются maintenance process;
- claim остаётся one-time и scope-bound;
- повторный claim/reuse отклоняется;
- concurrent upload/claim не обходит ceilings.

## 11. Route rate limiting 3.2.3

Для Trust directory, enrollment, KeyPackage, recovery и E2EE upload routes:

- выполните requests до допустимого threshold;
- превысьте threshold;
- подтвердите HTTP `429`;
- подтвердите stable code `RATE_LIMITED`;
- подтвердите корректный `Retry-After`;
- после окна request снова выполняется;
- разные operation buckets не смешиваются ошибочно;
- bucket storage остаётся bounded;
- stale persisted buckets удаляются startup/hourly maintenance;
- rate limiter не позволяет обойти authentication/authorization.

## 12. MLS secure messaging

- создайте secure conversation verified devices;
- проверьте one-time KeyPackage claim;
- Welcome bound к user/device/conversation;
- отправьте messages в обе стороны;
- перезапустите Client и восстановите missed commits;
- replayed ciphertext отклоняется;
- stale/skipped/duplicate epoch отклоняется;
- unrecoverable private-state loss возвращает explicit failure;
- local decrypted cache/search работает в документированной boundary;
- server serialization не содержит plaintext message text.

### Plaintext downgrade

После MLS activation выполните direct attempts:

- send;
- forward;
- edit;
- server draft;
- scheduled message;
- poll;
- bot message;
- multipart upload;
- resumable upload;
- legacy или mismatched-device Socket.IO session.

Каждый plaintext path должен завершаться fail-closed без silent fallback.

## 13. Strict missed-commit recovery 3.2.3

Положительный сценарий:

- exact group/conversation scope;
- contiguous epoch sequence;
- valid SHA-256 payload hashes;
- matching intermediate/final public-state hashes;
- persistence только после complete validation.

Отрицательные сценарии:

- wrong group ID;
- wrong conversation scope;
- start/end epoch mismatch;
- skipped или reordered epoch;
- duplicate commit hash;
- altered commit payload;
- invalid intermediate state hash;
- invalid final state hash;
- replay уже применённого commit.

Во всех случаях invalid state не сохраняется.

## 14. Secure files, images и voice

- загрузите encrypted file/image/voice;
- проверьте progress и cancel;
- oversized raw ciphertext отклоняется до полного parsing;
- `ciphertextSize == plaintextSize + GCM tag` проверяется;
- SHA-256 ciphertext проверяется;
- quota списывается по actual stored ciphertext bytes;
- pending object недоступен до MLS claim;
- matching ID/scope/hash retry idempotent;
- changed hash/size/scope/descriptor отклоняется;
- attachment reuse отклоняется;
- cancel/expiry очищает pending data;
- Client проверяет ciphertext, GCM tag и plaintext hash до preview/download;
- ordinary outbox/cache не хранит attachment key, filename или MIME plaintext;
- запрет любого `files/images/voice` блокирует complete opaque path.

## 15. Trust audit metadata

Для каждого Trust action:

- разрешённые primitive fields сохраняются;
- arbitrary nested object отклоняется или исключается;
- secret-like nested values не попадают в audit;
- private keys, signatures, tokens и message content не сохраняются;
- audit entry сохраняет initiator, action, target, scope и timestamp;
- schema остаётся stable и readable.

## 16. Maintenance и retention

Проверьте startup и hourly run:

- expired sessions удалены;
- login history старше 90 дней удалена;
- fresh login history сохранена;
- stale persisted rate-limit buckets удалены;
- active buckets не удалены преждевременно;
- expired Trust/KeyPackage state очищен;
- maintenance failure виден в diagnostics и не скрыт empty catch;
- после cleanup SQLite integrity остаётся `ok`.

## 17. Cloud Identity и Pulse

### Cloud Identity

- registration и email verification;
- Cloud MFA;
- OAuth 2.1 Authorization Code + PKCE S256;
- exact redirect URI;
- one-time signed Local Account link;
- replayed link/nonce rejection;
- unlink с current-password reauthentication;
- local messaging во время Cloud outage.

### Local sandbox

```text
pulse sandbox on
plus grant <user>
pulse user <user>
impulses grant <user> 50 qa
impulses revoke <user> 10 qa
plus revoke <user>
```

Проверьте:

- 400 Impulses выдаются один раз для новой activation;
- repeated active grant не дублирует credit;
- balance не отрицательный;
- checkout отключён;
- mutations отражаются в audit/ledger;
- production Pulse config отключает sandbox authority.

### Provider sandbox

- checkout и verified webhook;
- receipt и billing portal;
- cancel-at-period-end;
- entitlement revoke propagation;
- duplicate provider event/idempotency no-op;
- payload/scope substitution rejection;
- Cloud outage fallback к unexpired verified cache.

## 18. Operational runtime

- live/ready endpoints работают;
- readiness `503` во время drain;
- metrics Bearer-protected или loopback-only;
- logs содержат request ID и не содержат credentials;
- allowlisted developer commands работают;
- shell/eval/unknown commands отклоняются;
- emergency read-only разрешает reads и блокирует mutations;
- graceful shutdown не повреждает SQLite;
- backup/restore выполняет integrity/schema checks.

## 19. Migration и upgrade

### 3.1.x → 3.2.3

- source schema 7 integrity;
- free-space check;
- verified pre-migration backup;
- schema 8 migration;
- destination integrity;
- data readability;
- downgrade protection;
- restore-from-backup rollback drill.

### 3.2.0–3.2.2 → 3.2.3

- database migration отсутствует;
- schema остаётся 8;
- login/bootstrap regressions исправлены;
- Trust/resource/recovery limits активны после restart;
- existing secure conversations остаются compatible.

## 20. Platform matrix

### Windows

- clean Client/Server install;
- update from previous signed baseline;
- certificate/session persistence;
- updater initial check и six-hour schedule;
- single-flight update requests;
- `no_installable_update` для prerelease без signed assets;
- packaged Trust/MLS runtime E2E для stable promotion.

### PWA

- install/update application shell;
- offline shell и authorized local cache;
- Service Worker не кэширует API/Socket.IO;
- Trust state и encrypted drafts переживают restart;
- logout/revoke очищает нужный local scope.

### Android

- JDK 17 / SDK 36 / Gradle 8.13 source build;
- HTTPS-only deep link;
- TLS error cancellation;
- external navigation;
- microphone/file permissions;
- Trust/MLS/encrypted-media runtime;
- physical-device matrix для stable promotion.

## 21. Automated gates

```bash
npm ci
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Авторитетное evidence: [RELEASE_VERIFICATION_3.2.3.md](RELEASE_VERIFICATION_3.2.3.md).

## 22. Defect report

Укажите:

- versions и release channel;
- platform/OS;
- deployment profile;
- exact reproduction;
- expected/actual result;
- HTTP status, stable code и `Retry-After`, если применимо;
- timestamp/request ID;
- sanitized screenshot/log;
- regression version;
- schema, role/policy, Trust device, group/epoch или Pulse mode без secrets.

Не публикуйте passwords, cookies, OAuth tokens, TOTP/recovery codes, invite codes, bot/Pulse credentials, private CA/device keys, complete MLS state, message plaintext, user data или backup passphrase.
