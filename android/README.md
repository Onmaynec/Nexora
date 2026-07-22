# Nexora for Android

## Статус

| Параметр | Значение |
|---|---|
| Current version | `3.2.3` |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | schema 8, server-side |

Android application — controlled WebView shell общего adaptive Nexora Client. Source compatibility проверяется CI. Stable promotion `3.2.3` требует physical-device runtime matrix и signed APK/AAB validation.

## Возможности

- сохранённые HTTPS servers и server picker;
- deep link `nexora://connect?url=...`;
- local authentication, profiles, rooms, messages, search и notifications;
- files, images и voice recording/playback;
- offline application shell и authorized local cache;
- Trust device enrollment, verification и revocation;
- MLS secure messaging и encrypted media в compatible 3.2.x conversations;
- strict missed-commit recovery validation;
- external links вне WebView.

Shell не хранит Local Server database, Cloud password, payment-card data, Pulse signing keys или Local CA private key.

## Build requirements

- JDK 17;
- Android SDK 36;
- Gradle 8.13.

```text
cd android
gradle :app:assembleDebug --no-daemon
gradle :app:assembleRelease --no-daemon
```

Release APK/AAB подписывается Android release key вне repository. Не коммитьте keystore, passwords или private signing configuration.

## TLS и navigation policy

Для Local Server с private CA установите operator-provided root certificate в Android trust store и отдельно сверьте Server ID/SHA-256 fingerprint.

Security policy:

- `onReceivedSslError` всегда отменяет connection;
- HTTP и mixed content запрещены;
- WebView file/content access ограничен;
- third-party cookies отключены;
- in-app navigation ограничена selected Server origin;
- external origins открываются system browser;
- deep link принимает только valid HTTPS URL;
- certificate change требует explicit confirmation.

## Authentication и Trust bootstrap

После login Android renderer:

1. получает `/api/bootstrap`;
2. определяет authoritative Server ID/user scope;
3. конфигурирует Trust store до чтения encrypted drafts;
4. выполняет enrollment active device;
5. подключает device-scoped Socket.IO.

Cold login не должен зависать или завершаться `TRUST_NOT_CONFIGURED`. Safe pre-configuration draft read возвращает empty state, но реальные WebCrypto/IndexedDB/registration errors остаются visible.

## Trust и secure data

В secure conversations:

- private device identity и MLS state остаются Client-side;
- private state, KeyPackages, decrypted cache и drafts encrypted locally;
- identity proof и MLS signature keys distinct;
- BasicCredential bound к local `{ userId, deviceId }`;
- messages encrypted до durable outbox;
- files/images/voice encrypted до upload;
- attachment keys/original metadata находятся внутри MLS content;
- Local Server получает opaque ciphertext и service metadata;
- missed commits проверяются по scope, epoch sequence, payload hashes и public-state hashes до persist.

Android renderer входит в trusted computing base. Malware, XSS, dependency compromise или malicious application binary могут получить plaintext во время authorized use.

## Resource limits

Server-side controls применяются ко всем Android clients:

- максимум 16 active Trust devices/user;
- 25 KeyPackages/request;
- 32 unclaimed KeyPackages/device;
- 256 unclaimed KeyPackages/user;
- route-specific rate limits;
- HTTP `429`, stable `RATE_LIMITED` и `Retry-After`.

UI должен отображать понятное состояние limit/rate-limit без бесконечного automatic retry.

## Acceptance checks

### Build и installation

- CI `assembleDebug` — PASS;
- release build в controlled signing environment;
- clean install/upgrade сохраняют configured servers и authorized state;
- version metadata — `3.2.3`.

### Connection

- manual HTTPS URL;
- `nexora://connect` для HTTPS;
- rejection HTTP/invalid host/untrusted or changed certificate;
- external navigation открывается вне app.

### Core product

- login/bootstrap;
- profiles, rooms, messages, search и notifications;
- legacy files/voice;
- offline/reconnect;
- Cloud Identity/Pulse UI без Cloud secrets в WebView storage.

### Trust/MLS 3.2.3

- first/later device enrollment;
- fingerprint verify/revoke;
- BasicCredential/key-role rejection cases;
- 16-device ceiling;
- KeyPackage ceilings;
- visible `RATE_LIMITED` state;
- secure message после restart/reconnect;
- strict valid/invalid recovery scenarios;
- immediate disconnect/local wipe после revocation;
- encrypted media preview/playback/download;
- no plaintext fallback.

### Runtime lifecycle

- background/foreground;
- process death и relaunch;
- network loss/recovery;
- microphone/file permission denial;
- storage pressure;
- logout и local Trust scope cleanup;
- rate-limit retry after declared window.

## Stable-promotion requirements

- physical-device matrix;
- long-offline/recovery scenarios;
- permission denial/revocation flows;
- background/process-death stability;
- signed APK/AAB verification;
- update path;
- independent Android-relevant security review.

## Ограничения

Nexora `3.2.3` не заявляет traffic-analysis resistance или independent cryptographic certification. Existing 3.1.x history не шифруется retroactively; 3.1.x Client не участвует в active secure 3.2.x conversation.

См. [Documentation Portal](../docs/README.md), [Security Model](../docs/SECURITY_MODEL.md), [Security Policy](../SECURITY.md), [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md).
