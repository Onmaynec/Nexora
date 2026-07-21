# Nexora 3.1.2 — Bug Fix

## Voice dock

`stopVoice()` теперь очищает идентификатор, URL, имя, время, длительность и скорость, удаляет `src` из HTMLAudioElement и вызывает `load()`. Dock размонтируется сразу после нажатия X.

## Auto update

Client updater запускается после `app.whenReady()`, выполняет initial check, затем проверяет канал каждые шесть часов. Запросы single-flight. Для реальной установки по-прежнему требуется подписанный NSIS release с `latest.yml`; неподписанные assets не принимаются.

## Local Pulse sandbox

Команды Windows Server Admin и CLI:

- `pulse sandbox on|off`;
- `pulse user <user>`;
- `plus grant <user> [days]`;
- `plus revoke <user>`;
- `impulses grant <user> <amount> [reason]`;
- `impulses revoke <user> <amount> [reason]`.

Sandbox предназначен только для разработки и демонстрации, отключает checkout и автоматически недоступен при production Pulse Cloud.
