# Статус ветки `release/3.4.0-stable-core-v2`

## Классификация

| Параметр | Значение |
|---|---|
| Classification | Active Stable Core release candidate |
| Target version | Nexora `3.4.0` |
| Required source baseline | merged post-MLS baseline commit `6202bbdf8ff636711d9874452958df5dd40d9656` |
| Required published baseline | verified GitHub Release `v3.3.4` |
| Pull Request | Draft PR `#96` |
| Current product source of truth | `main`, Nexora `3.3.4` source baseline |
| Release state | not tagged, not published, external gates blocked |
| Package metadata | synchronized to `3.4.0` on this branch |

## Scope

- ordinary server-readable messaging remains the only writable messaging core;
- executable Trust/MLS runtime and `ts-mls` remain removed;
- schema 8 legacy ciphertext is preserved through read-only viewer/export;
- device/session inventory and immediate remote revocation are server-owned;
- backup verification, rollback and migration reliability are enforced;
- Client/Server updater and release evidence are hardened for signed stable publication;
- Client, Server, Android, current documentation and version metadata are synchronized.

## Completed source baseline

PR #70 merged the post-MLS prerequisite implementation into `main` as commit `6202bbdf8ff636711d9874452958df5dd40d9656`. Old mixed-scope PR #69 is closed and is not a release source.

The remaining prerequisite distinction is publication evidence: the official `v3.3.4` GitHub Release/tag/assets must exist and pass download/checksum verification before `v3.4.0` stable packaging.

## Required verification

- metadata synchronization and release consistency;
- syntax, builder config and production web build;
- unit, API, integration и realtime tests;
- performance and security audit;
- schema 8 soak;
- Android source build;
- introductory and Advanced Documentation websites;
- signed Client/Server packaging and updater metadata;
- Windows 10/11 installed `3.3.4 → 3.4.0` acceptance;
- independent security review and closure evidence.

## Security boundary

Historical encrypted records must not be silently decrypted, rewritten or deleted. Legacy write paths remain terminal `410/LEGACY_READ_ONLY`. Device/session revocation and privileged operations remain server-authoritative. Signing credentials, tokens and private data must not be committed or logged.

## External blockers

- published verified `v3.3.4` tag/release/assets are not yet recorded as complete;
- Authenticode credentials/subject/thumbprint/timestamp evidence are unavailable in repository source;
- Windows 10 and Windows 11 installed acceptance is not approved;
- independent review is not approved;
- final green CI is required on the exact merge candidate.

## Merge and closure rule

PR #96 remains draft until every blocker is closed with actual evidence. After successful merge, stable publication, immutable tag and post-publication asset verification, this branch may be deleted/closed as completed provenance.
