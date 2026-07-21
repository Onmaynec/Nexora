# Nexora 3.0.0 — единая экосистема

Nexora 3.0.0 объединяет запланированные этапы 2.0.1–2.7.0 и 3.0.0 в один релиз. Это major upgrade Client/Server protocol до API v3 и SQLite schema 6.

## Главное

- Windows Client/Server, устанавливаемая PWA и Android HTTPS-клиент;
- offline IndexedDB cache, durable outbox, server drafts и delta/resync по event sequence;
- silent/scheduled messages, polls, mentions, notifications, threads и edit history;
- communities: custom roles/categories, multiple invites, reports, appeals, restrictions и pre-approval;
- resumable file upload с SHA-256/MIME validation;
- TOTP/recovery codes, per-server Electron isolation и runtime metrics/read-only;
- scoped bot tokens и signed outgoing webhooks;
- Plus/Pulse sandbox и production Cloud contract.

## Исправления

- клик по аватару больше не приводит к пустому экрану, если API вернул `relationship: null`;
- чистый Linux runner сам собирает web client перед тестами;
- отсутствие Windows signing secrets больше не отменяет весь Release: исходники, PWA, SPDX SBOM и checksums публикуются как prerelease.

## Обновление данных

Server автоматически создаёт pre-migration backup и повышает базу до schema 6. Перед production upgrade всё равно сделайте отдельную проверенную резервную копию. API v3 сохраняет базовую совместимость с Client major 2–3; новые v3-возможности требуют Client 3.0.0.

## Артефакты и подпись

Source/PWA prerelease содержит:

- `Nexora-3.0.0-source.zip`;
- `Nexora-PWA-3.0.0.zip`;
- `Nexora-3.0.0.spdx.json`;
- `SHA256SUMS.txt`.

Стабильный Windows Latest дополнительно публикуется только при настроенных Authenticode secrets и содержит подписанные Client/Server `.exe`, Client `.blockmap` и `latest.yml`. Updater сохраняет `verifyUpdateCodeSignature: true` и не получает неподписанные бинарные файлы.

## Не входит в 3.0.0

Голосовые/видеозвонки, демонстрация экрана, E2EE, криптовалюты и NFT не входят в продукт. Реальные платежи не активируются локальным флагом: для Pulse production нужны отдельный Cloud, провайдер, webhook/refund/dispute и юридический контур.
