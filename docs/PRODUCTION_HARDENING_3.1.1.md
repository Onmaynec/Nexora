# Nexora 3.1.1 — Production Hardening

## Runtime health

Local Server и Pulse Cloud публикуют:

- `GET /healthz/live` — процесс работает;
- `GET /healthz/ready` — процесс готов принимать трафик и не находится в drain mode;
- `GET /metrics` — метрики в Prometheus text format.

`/metrics` доступен по `Authorization: Bearer <token>`, если настроен `NEXORA_METRICS_TOKEN` или `CLOUD_METRICS_TOKEN`. Без токена endpoint принимает только loopback-соединения.

Readiness Local Server включает SQLite integrity, schema version и emergency read-only. Readiness Pulse Cloud включает ledger invariant, Cloud Identity и состояние workers.

## Безопасные логи

Operational runtime назначает request ID, считает HTTP-запросы и журналирует медленные или ошибочные запросы. Credentials, cookies, passwords, tokens, API keys и signatures удаляются рекурсивным redaction до записи.

## Graceful shutdown

Перед закрытием процесс переводится в drain state: readiness становится `503`, workers останавливаются, HTTP и Socket.IO соединения закрываются, затем закрывается SQLite.

## Developer command service

CLI и Windows Server Admin используют один фиксированный registry:

- `help`;
- `status`;
- `health`;
- `users list`;
- `rooms list`;
- `backup create [passphrase]`;
- `storage cleanup`;
- `read-only on|off`;
- `audit tail [count]`.

Произвольные shell-команды и JavaScript не выполняются. Изменяющие команды записываются в `integrationAudit`; секретные значения аргументов не журналируются.
