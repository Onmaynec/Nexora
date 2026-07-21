# Nexora Android 3.0.0

Android-клиент — защищённая WebView-оболочка общего адаптивного Nexora UI. Он хранит список HTTPS-серверов, принимает QR/deep link вида `nexora://connect?url=...`, поддерживает файлы и голосовые сообщения и открывает внешние ссылки вне приложения.

Сборка требует JDK 17, Android SDK 36 и Gradle 8.13:

```text
cd android
gradle :app:assembleRelease
```

Локальный Nexora Server использует собственный CA. Установите `nexora-local-ca.crt` владельца сервера в доверенные пользовательские сертификаты Android до подключения. Клиент никогда не обходит TLS-ошибки: `onReceivedSslError` всегда отменяет соединение. HTTP, mixed content, файловый доступ WebView и сторонние cookies отключены.
