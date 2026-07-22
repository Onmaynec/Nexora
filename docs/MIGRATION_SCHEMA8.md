# Nexora 3.2.0 — Migration to Local Server schema 8

## Scope

Schema 8 adds Trust Core and MLS delivery tables to the schema 7 Local Server database. It does not rewrite existing messages, files, rooms, Pulse data or local accounts. Existing 3.1.x message history remains legacy plaintext data; creating an MLS group does not retroactively encrypt it.

## Preconditions

The migration runs before the server starts listening and requires:

- an existing schema 7 database;
- a successful `PRAGMA integrity_check`;
- enough free space for a verified backup and migration work;
- exclusive access to the database during startup.

Databases older than schema 7 are rejected with `DATABASE_SCHEMA_PREREQUISITE`. Databases newer than schema 8 are rejected with `DATABASE_SCHEMA_NEWER`.

## Free-space rule

Required free space is the greater of:

- 96 MiB;
- twice the current database size plus 16 MiB.

When `statfs` is available and free space is below this threshold, startup stops with `MIGRATION_DISK_SPACE_LOW`. The database is not modified.

## Automatic migration sequence

1. Flush pending store writes.
2. Read `meta.schema_version`.
3. Run `PRAGMA integrity_check` on the source database.
4. Check available disk space.
5. Run `PRAGMA wal_checkpoint(FULL)`.
6. Create a SQLite backup named:

   ```text
   <database>.pre-schema-8-<ISO timestamp>.bak
   ```

7. Verify the backup when the store exposes `checkDatabaseFile`.
8. Start `BEGIN IMMEDIATE`.
9. Create schema 8 tables and indexes with `IF NOT EXISTS`.
10. Update `meta.schema_version`, `state_meta.schemaVersion` and `schema_8_verified_at`.
11. Commit the transaction.
12. Run a second `PRAGMA integrity_check`.
13. Enable schema-8 downgrade protection for normal persistence and database restore.

Any SQL failure rolls back the transaction and returns `MIGRATION_SCHEMA8_FAILED` with the backup path in safe diagnostic details.

## Added tables

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

The server stores public device keys, credentials, hashes, ciphertext protocol records and audit metadata. Private device keys and private MLS group state remain in encrypted client storage.

## Idempotency

Starting a schema 8 database again does not create another pre-migration backup and does not duplicate tables. `CREATE TABLE/INDEX IF NOT EXISTS` and schema enforcement make the operation idempotent.

Legacy persistence cannot set the version back to 7: schema 8 wraps normal state persistence, stats and restore handling and reapplies the authoritative version.

## Supported rollback

There is no supported in-place schema 8 → 7 downgrade. A rollback is a restore operation:

1. Stop Nexora Server completely.
2. Preserve the failed/current database and WAL/SHM files for investigation.
3. Select the verified `.pre-schema-8-*.bak` created immediately before migration.
4. Restore that file as the active database using the existing maintenance/restore procedure or an atomic offline file replacement.
5. Start the matching Nexora 3.1.2 server binary.
6. Verify schema 7, `PRAGMA integrity_check`, login, rooms, files and Pulse status before reopening access.

Do not start a 3.1.2 binary against a schema 8 database. Do not edit `meta.schema_version` manually; removing the version marker does not remove schema 8 state and can corrupt compatibility assumptions.

## Client rollback implications

Client-side Trust data is scoped by Server ID and local user ID. Rolling the server back to 3.1.2 does not make that encrypted IndexedDB state usable by the legacy client. Remove the 3.2.0 test profile or use the Trusted Devices self-revoke flow before decommissioning a test device.

A server rollback also discards Trust registrations, KeyPackages, MLS groups, Welcome records, commit logs and secure ciphertext created after the schema 8 migration because those records do not exist in the schema 7 backup.

## Verification checklist

After migration:

```sql
PRAGMA integrity_check;
SELECT value FROM meta WHERE key='schema_version';
SELECT value FROM meta WHERE key='schema_8_verified_at';
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'trust_%';
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'mls_%';
```

Expected schema version: `8`.

Application checks:

- existing local accounts can authenticate;
- existing rooms/messages/files are readable;
- Pulse API reports schema 8 and retains its cache;
- first Trust device registration succeeds;
- second device remains unverified until approved;
- KeyPackage claim is one-time;
- server restart preserves schema 8 and does not create another migration backup;
- restoring a schema 7 backup reruns migration safely when using the 3.2.0 server.

Automated coverage:

- `test/trust-schema8.test.cjs`;
- `test/trust-clock.test.cjs`;
- `test/pulse-local-integration.test.cjs`.
