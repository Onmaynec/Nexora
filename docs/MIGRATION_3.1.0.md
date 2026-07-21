# Nexora 3.1.0 — SQLite schema 6 → 7

## Назначение

Schema 7 добавляет локальное хранилище контрактов Pulse Cloud. Сообщения, комнаты, файлы, роли и существующие таблицы schema 6 не переносятся в параллельную базу и не меняют формат.

Миграция запускается до открытия сетевого порта в `server/create-server-v31.cjs`. Обычный remote login не начинается, пока migration и post-migration `PRAGMA integrity_check` не завершены.

## Добавленные таблицы

| Таблица | Назначение |
|---|---|
| `cloud_account_links` | связь Local User с Cloud Account без локального хранения email |
| `pulse_link_sessions` | одноразовые link session, nonce, expiry и replay protection |
| `pulse_sync_state` | cursor, cached overview и последний безопасный error code |
| `pulse_event_inbox` | идемпотентная обработка Cloud events |
| `pulse_event_outbox` | локальные billing/realtime events до подтверждённой доставки |
| `billing_entitlement_cache` | проверенные Ed25519 entitlement payloads |
| `billing_key_registry` | pinned public keys и состояние rotation/revocation |
| `billing_checkout_cache` | безопасный локальный статус checkout без подтверждения оплаты по redirect |
| `billing_transaction_cache` | ограниченный read cache финансовой истории пользователя |
| `room_product_state` | применённое состояние room entitlement |

## Порядок миграции

1. Завершить очередь текущих SQLite операций.
2. Выполнить `PRAGMA integrity_check`.
3. Проверить свободное место. Минимум — 64 MiB или удвоенный текущий размер БД плюс резерв.
4. Выполнить `PRAGMA wal_checkpoint(FULL)`.
5. Создать SQLite backup `nexora.sqlite.pre-schema-7-<timestamp>.bak`.
6. Проверить integrity backup.
7. Открыть `BEGIN IMMEDIATE`.
8. Создать новые таблицы и индексы через `CREATE ... IF NOT EXISTS`.
9. Перенести существующие `billingLinks`, `billingEntitlements`, `pulseLedger` и room entitlement state.
10. Обновить `meta.schema_version` и `state_meta.schemaVersion` до `7`.
11. Выполнить commit.
12. Повторно выполнить `PRAGMA integrity_check`.

При исключении SQL transaction откатывается. Backup не удаляется. Server startup завершается стабильным кодом ошибки и не открывает сетевой порт.

## Защита от downgrade

Базовый store 3.0.0 исторически записывает константу schema 6 при каждом `persistState`. Adapter schema 7 оборачивает `persistState`, `stats` и restore flow:

- после каждой транзакции повторно фиксируется schema 7;
- `store.state.meta.schemaVersion` остаётся `7`;
- `store.stats().schemaVersion` сообщает `7`;
- восстановленная schema 6 автоматически проходит тот же безопасный upgrade;
- БД с версией выше 7 отклоняется кодом `DATABASE_SCHEMA_NEWER`.

## Идемпотентность

Повторный запуск:

- не создаёт второй backup, когда `schema_version=7`;
- использует `CREATE TABLE IF NOT EXISTS`;
- переносит legacy rows через `ON CONFLICT`/`INSERT OR IGNORE`;
- не дублирует link, entitlement, transaction или room product state.

## Проверка

```bash
npm run test:pulse-local
```

Критические regression scenarios:

- schema 6 → 7 с legacy Pulse state;
- повторный запуск;
- невозможность downgrade после обычного `store.persistState`;
- сохранение link, entitlement и transaction cache;
- SQLite integrity до и после migration.
