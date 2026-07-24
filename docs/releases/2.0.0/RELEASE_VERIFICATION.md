# Nexora 2.0.0 — отчёт верификации

Дата: 20 июля 2026 года. Статус публикации обновлён 21 июля 2026 года.

## Итог

Исходный релиз **GO**: код, миграции, production web build, автоматические проверки, security-инварианты и часовая устойчивость SQLite прошли.

Публикация исходников в GitHub — **GO**: `main` и аннотированный `v2.0.0` переданы в публичный `Onmaynec/Nexora`. Публичная подписанная Windows-дистрибуция остаётся **NO-GO** до выполнения внешних пунктов в конце документа; репозиторий не выдаёт неподписанный `.exe` за финальный установщик.

## Выполненные проверки

| Проверка | Результат |
|---|---|
| Node.js 22.16.0 — syntax/build | PASS: 30 Node-файлов, Vite production build |
| Electron Builder Client/Server schema | PASS |
| Windows release icons | PASS: ICO 6 размеров, PNG 512×512 |
| Автоматические тесты на Node.js 22.16.0 | PASS: 42/42 |
| Нагрузка комнаты | PASS: 20 клиентов, 120 сообщений |
| Crash during SQLite write | PASS, база не повреждена |
| Backup/restore и encrypted backup | PASS |
| Security audit | PASS: production high=0, critical=0 |
| UI-регрессии по тестовым скриншотам | PASS: профили, zero badge, picker, containment |
| Markdown links | PASS: 19 документов до добавления этого отчёта |
| 60-минутный soak | PASS: 717 циклов, `integrity=ok` |

Security audit отдельно проверяет CSRF/Origin, постоянные rate limits, временную блокировку входа, зашифрованные копии, certificate pinning, Electron isolation, доступ только к микрофону, Ed25519 Pulse envelopes, HTTPS-only Billing, подпись Windows update и GitHub update metadata.

## Проверенный scope 2.0.0

- SQLite schema 5, автоматические миграции, WAL/FULL, транзакции, backup/restore, quota/retention/cleanup/export;
- личные чаты, публичные/приватные комнаты, роли и модерация, реакции, ответы, редактирование, статусы доставки/прочтения;
- файлы, изображения и голосовые сообщения с upload queue, preview, waveform и скоростью воспроизведения;
- профили по клику на аватар, status/bio/avatar, Saved Messages, bookmarks, pin/mute/archive/filter, FTS5 search, drafts и offline outbox;
- Nexora Plus/Pulse sandbox и подписанный production integration contract;
- GitHub Releases updater Client и управляемый updater Server;
- исправления переполнения dock/message actions и кликабельности reaction picker.

Голосовые/видеозвонки и E2EE намеренно исключены по решению владельца продукта.

## Внешние release gates

1. Добавить `WINDOWS_CERTIFICATE_BASE64` и `WINDOWS_CERTIFICATE_PASSWORD`; signing gate намеренно завершается ошибкой без них.
2. Дождаться Windows GitHub Action и проверить Authenticode, NSIS Client/Server, `latest.yml`, blockmap и SHA-256 assets.
3. Выполнить ручную чистую установку и upgrade на Windows 10/11, включая Radmin VPN, firewall, browser CA и микрофон.
4. Для реальных платежей выбрать provider, развернуть Pulse Cloud/ledger/webhooks, пройти legal/KYC/refund/security review. До этого Plus работает только в `sandbox`, а production monetization остаётся выключенной.

Полный ручной список находится в [docs/RELEASE_CHECKLIST.md](../../RELEASE_CHECKLIST.md).
