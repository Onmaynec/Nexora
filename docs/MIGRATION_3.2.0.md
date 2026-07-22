# Nexora 3.2.0 — Schema 8 Migration and Rollback

## Status

This guide applies to the development branch `agent/nexora-3.2.0-trust-core-mls`. It describes the implemented schema 7 → 8 migration and operational rollback. It is not a stable-release instruction until 3.2.0 is verified and published.

## Scope

Schema 8 adds Trust Core and MLS delivery-state tables:

- `trust_challenges`;
- `trust_devices`;
- `trust_device_verifications`;
- `mls_key_packages`;
- `mls_groups`;
- `mls_group_members`;
- `mls_welcome_queue`;
- `mls_commit_log`;
- `mls_replay_cache`;
- `trust_audit`.

The migration is additive to schema 7. Existing users, rooms, messages, files, Pulse state and application settings are preserved.

Encrypted attachments reuse the existing normalized `files` persistence model with opaque metadata inside the file data payload. They do not require a separate destructive table migration.

## Prerequisites

Before starting:

1. stop all extra Local Server processes that use the same data directory;
2. confirm the current database is schema 7;
3. retain a separate operator backup of the full data directory;
4. ensure the filesystem can create an additional SQLite backup and WAL checkpoint;
5. do not attempt an in-place downgrade from a database already opened by a newer schema.

The migration rejects:

- schema below 7 with `DATABASE_SCHEMA_PREREQUISITE`;
- schema above 8 with `DATABASE_SCHEMA_NEWER`;
- corrupt source database with `DATABASE_CORRUPT`;
- insufficient disk space with `MIGRATION_DISK_SPACE_LOW`;
- invalid backup with `MIGRATION_BACKUP_FAILED`.

## Automatic migration sequence

The Local Server performs the following before opening network traffic:

1. flush pending store operations;
2. read the current schema version;
3. run `PRAGMA integrity_check`;
4. calculate required free space: at least 96 MiB or twice the database size plus 16 MiB;
5. run `PRAGMA wal_checkpoint(FULL)`;
6. create `nexora.sqlite.pre-schema-8-<timestamp>.bak`;
7. verify the backup when the store exposes the database-file verifier;
8. start `BEGIN IMMEDIATE`;
9. create missing schema 8 tables and indexes idempotently;
10. set `meta.schema_version=8` and state metadata schema version to 8;
11. commit;
12. run post-migration `PRAGMA integrity_check`;
13. patch normal persistence/restore paths so they cannot write schema 6 or 7 back over schema 8.

A table/index creation error rolls back the transaction and returns `MIGRATION_SCHEMA8_FAILED` with safe details.

## Verification after startup

Confirm:

- `/api/health` returns the expected application version;
- server status reports `schemaVersion: 8`;
- `PRAGMA integrity_check` is `ok`;
- existing rooms, memberships, messages and files are present;
- Trust Core status is available;
- a disposable device can register and create a challenge;
- secure-message routes reject plaintext downgrade after an MLS group becomes active;
- the pre-schema-8 backup exists and is readable.

Development verification commands:

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Relevant automated tests include:

- `test/trust-schema8.test.cjs`;
- `test/pulse-local-integration.test.cjs`;
- `test/store-queue.test.cjs`;
- `test/e2ee-runtime-guards.test.cjs`;
- `test/e2ee-attachments.test.cjs`;
- `test/e2ee-attachment-transport.test.cjs`.

## Rollback

Rollback is **restore from the verified pre-migration backup**. Do not edit `schema_version`, drop Trust tables, or copy only selected records by hand.

Procedure:

1. stop the 3.2.0 Local Server completely;
2. preserve the failed/current schema 8 database and logs for diagnosis;
3. restore the complete pre-schema-8 SQLite backup using the supported maintenance restore path;
4. restore matching upload data if the operator backup/restore operation includes files;
5. start a server version that supports the restored schema;
6. run integrity and application smoke checks before allowing users to reconnect.

Messages, device registrations, MLS groups, encrypted attachment records and other writes created after migration are not present in the old schema 7 backup. This is expected data loss for a rollback and must be communicated before the operation.

## Encrypted attachment cleanup

Pending opaque ciphertext:

- is inaccessible until atomically claimed by an MLS message;
- expires after 24 hours;
- is removed by the hourly Trust cleanup loop;
- can be deleted by its uploader before claim;
- cannot be rebound after claim.

After an abnormal shutdown, start the same schema 8 build and allow cleanup to reconcile expired pending records. Do not delete arbitrary `.e2ee` files without checking database references.

## Failure handling

Stable external error codes distinguish:

- prerequisite/newer-schema conflict;
- corruption;
- low disk space;
- backup failure;
- transactional migration failure;
- post-migration integrity failure.

Do not expose SQL, stack traces, tokens, device credentials or attachment descriptor keys in operator-facing logs or support reports.
