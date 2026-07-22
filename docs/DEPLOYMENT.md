# Nexora Deployment Guide

## 1. Назначение

Этот документ описывает поддерживаемые варианты развёртывания Nexora Local Server и требования к подключению Windows, PWA и Android clients.

## 2. Поддерживаемые профили

| Профиль | Назначение | Минимальные требования |
|---|---|---|
| Local development | разработка и автоматические тесты | localhost, Node.js 22.16+, npm |
| Private LAN/VPN | частная установка | HTTPS, private firewall, подтверждение fingerprint |
| Public HTTPS | интернет-доступ | reverse proxy, публичный certificate, firewall, `allowedOrigins`, monitoring, backups |
| Controlled 3.2.0 prerelease | Trust/MLS testing | disposable data, compatible 3.2.0 clients, documented limitations |

Прямой port forwarding Local Server без reverse proxy, monitoring и firewall не считается поддерживаемой production-топологией.

## 3. Local Server

### 3.1 Source start

```bash
npm ci
npm start
```

Для разработки Client и Server:

```bash
npm run dev
```

### 3.2 Проверка перед запуском

Проверьте:

- Node.js `22.16+`;
- доступность рабочей директории;
- достаточное место для database, files и migration backup;
- действующий HTTPS certificate;
- корректный Server ID;
- SQLite integrity и ожидаемую schema version;
- readiness без drain/read-only failure;
- отсутствие production secrets в repository или logs.

### 3.3 Network exposure

- ограничьте inbound access необходимым network interface;
- не открывайте Local Server всему интернету напрямую;
- для public deployment завершайте TLS на доверенном reverse proxy;
- задавайте точный allowlist origins;
- сохраняйте request IDs и безопасные operational logs;
- используйте отдельный monitoring token для remote Prometheus scraping.

## 4. Client connection and certificate trust

Передайте пользователю по доверенному каналу:

1. полный HTTPS URL;
2. Server ID;
3. SHA-256 certificate fingerprint.

Windows Electron Client создаёт отдельную persistent session для каждого Server ID и закрепляет certificate fingerprint. Изменение certificate требует нового подтверждения.

Browser/PWA и Android используют системное certificate trust store. Для Local CA установите корневой `.crt` в доверенное хранилище операционной системы. Не обходите TLS warnings.

## 5. Database and migration

Текущая Local Server database — SQLite schema 8.

Upgrade `7 → 8` выполняется до network listen и включает:

- source integrity check;
- free-space calculation;
- WAL checkpoint;
- verified pre-migration backup;
- transactional schema creation;
- destination integrity check;
- downgrade protection.

Rollback выполняется восстановлением verified backup. In-place downgrade к schema 7 не поддерживается. Подробности: [MIGRATION_3.2.0.md](MIGRATION_3.2.0.md).

## 6. Backups and restore

- создавайте backup перед каждым upgrade;
- храните минимум одну проверенную копию вне server computer;
- не копируйте активный SQLite-файл вручную;
- проверяйте passphrase backup отдельно от самой копии;
- после restore повторно проверяйте integrity, schema и readiness;
- emergency read-only не заменяет backup.

## 7. Health and monitoring

Local Server и Pulse Cloud публикуют:

- `GET /healthz/live` — процесс запущен;
- `GET /healthz/ready` — service готов к traffic;
- `GET /metrics` — Prometheus text format.

Remote `/metrics` должен использовать Bearer token. Без token endpoint остаётся loopback-only.

При graceful shutdown readiness сначала переходит в `503`, затем останавливаются workers, HTTP/Socket.IO и SQLite.

## 8. Pulse deployment

### Disabled

Используйте для обычного self-hosted messaging без коммерческих функций.

### Sandbox

Используйте только для QA/demo:

- реальных платежей нет;
- checkout отключён;
- production signatures не создаются;
- balance не может стать отрицательным;
- режим блокируется при production Pulse configuration.

### Production

Требуются:

- отдельный Pulse Cloud deployment;
- HTTPS Cloud origin;
- scoped Local Server credential;
- pinned Ed25519 public keys;
- payment provider credentials;
- verified webhooks и idempotency;
- transactional email;
- reconciliation/refund/dispute/cancel flows;
- secret management;
- privacy, legal и tax documents.

Local Server не должен получать card data, Cloud password/MFA secret, signing private key или OAuth refresh token.

## 9. Release channels

| Канал | Назначение | Update policy |
|---|---|---|
| Stable signed Windows | production baseline | Client updater может использовать signed `.exe`, blockmap и `latest.yml` |
| Source/PWA prerelease | controlled testing | unsigned Windows updater assets не публикуются |
| Local unsigned build | development only | не является stable release |

Текущая `3.2.0` классифицирована как Source/PWA prerelease. Последняя signed production baseline — `3.1.2`.

## 10. Incident checklist

При сбое сохраните:

- версии Client, Server и Cloud;
- Server ID и request ID;
- время и последние действия;
- результаты live/ready checks;
- schema и integrity status;
- очищенные Client/Server logs;
- network/deployment profile.

Не отправляйте passwords, cookies, OAuth tokens, TOTP/recovery codes, invite codes, bot/Pulse credentials, private CA keys, Trust private state или backup passphrase.
