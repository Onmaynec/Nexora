# Nexora Android 3.1.2

Android-клиент — защищённая WebView-оболочка общего адаптивного Nexora UI. Он хранит список HTTPS-серверов, принимает QR/deep link вида `nexora://connect?url=...`, поддерживает файлы и голосовые сообщения и открывает внешние links вне приложения.

Android shell использует Local Server API v3. SQLite schema и Pulse Cloud остаются server-side; приложение не хранит Local Server database, Cloud password, payment-card data или signing keys.

## Сборка

Требуются JDK 17, Android SDK 36 и Gradle 8.13:

```text
cd android
gradle :app:assembleDebug --no-daemon
gradle :app:assembleRelease --no-daemon
```

Release APK/AAB должен подписываться Android release key вне репозитория. Не коммитьте keystore, passwords или generated private configuration.

## TLS и навигация

Local Server может использовать собственный CA. Установите `nexora-local-ca.crt` владельца сервера в доверенные пользовательские certificates Android до подключения и отдельно сверяйте Server ID/SHA-256 fingerprint.

Security policy:

- `onReceivedSslError` всегда отменяет connection;
- HTTP и mixed content запрещены;
- WebView file/content access ограничен;
- third-party cookies отключены;
- navigation разрешена только для origin выбранного Server;
- external links открываются системным browser;
- deep link принимает только валидный HTTPS URL.

## Проверка 3.1.2

- clean install и upgrade с предыдущего 3.1.x;
- подключение по вручную введённому URL и `nexora://connect`;
- отказ для HTTP, invalid host, changed/untrusted certificate;
- login, rooms, messages, uploads и voice recording/playback;
- Cloud Identity/Pulse UI через Local Server без передачи Cloud secrets в WebView storage;
- offline application shell/cache behavior;
- `gradle :app:assembleDebug --no-daemon` в GitHub CI.

Stable 3.1.2 не предоставляет E2EE. Экспериментальные Trust Core/MLS branches 3.2.0 не являются свойством текущего Android release.
