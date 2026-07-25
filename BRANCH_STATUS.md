# Статус ветки `release/3.4.0-stable-promotion`

## Классификация

| Параметр | Значение |
|---|---|
| Classification | Active Stable Core promotion candidate |
| Target version | Nexora `3.4.0` |
| Required source baseline | merged post-MLS baseline commit `6202bbdf8ff636711d9874452958df5dd40d9656` |
| Required published baseline | verified GitHub Release `v3.3.4` |
| Pull Request | Draft PR `#98` |
| Synchronization | current `main` merged by PR `#97` |
| Published candidate | immutable prerelease `v3.4.0-rc.1` from commit `19c637134c93b93ea1255bf7ccf97ee95f97c33b` |
| Current product source of truth | `main`, Nexora `3.3.4` until stable promotion is merged |
| Release state | RC1 published as `UNSIGNED-TEST`; official signed stable remains blocked |
| Package metadata | synchronized to `3.4.0` on this branch |

## Scope

- ordinary server-readable messaging remains the only writable messaging core;
- executable Trust/MLS runtime and `ts-mls` remain removed;
- schema 8 legacy ciphertext is preserved through read-only viewer/export;
- device/session inventory and immediate remote revocation are server-owned;
- backup verification, rollback and migration reliability are enforced;
- Client/Server updater and release evidence are hardened for signed stable publication;
- Client, Server, Android, current documentation and version metadata are synchronized.

## Completed source and publication baseline

PR #70 merged the post-MLS prerequisite implementation into `main` as commit `6202bbdf8ff636711d9874452958df5dd40d9656`. Old mixed-scope PR #69 is closed and is not a release source.

The required `v3.3.4` prerequisite is published and checksum-verified. Permanent evidence is stored in `release-evidence/v3.3.4-publication.json`.

Nexora `v3.4.0-rc.1` is published as an explicit `UNSIGNED-TEST` prerelease without updater metadata. Installed unsigned Windows Client/Server smoke and published asset redownload/SHA-256 verification passed. Permanent evidence is stored in `release-evidence/v3.4.0-rc.1-publication.json`.

PR #97 synchronized the latest verified `main` into this branch. CI run `30124965881` passed release consistency, syntax/build, unit/API/integration/realtime, performance, security audit, Linux tests, schema 8 soak and Android source build.

## Required verification before stable merge

- complete Authenticode signing policy in a protected signing environment;
- signed Client and Server installers with certificate subject/thumbprint and timestamp verification;
- signed updater metadata, checksum, channel, monotonic-version and no-downgrade validation;
- Windows 10 installed `3.3.4 → 3.4.0` acceptance;
- Windows 11 installed `3.3.4 → 3.4.0` acceptance;
- independent security review with zero unresolved high/critical findings;
- final green CI on the exact merge candidate;
- post-publication asset redownload, signature, checksum and installed-runtime smoke evidence.

## Security boundary

Historical encrypted records must not be silently decrypted, rewritten or deleted. Legacy write paths remain terminal `410/LEGACY_READ_ONLY`. Device/session revocation and privileged operations remain server-authoritative. Signing credentials, tokens and private data must not be committed or logged. The official stable workflow remains signed-only and has no unsigned fallback.

## External blockers

- Authenticode credentials, certificate subject/thumbprint and timestamp evidence are unavailable in repository source;
- signed Windows Client/Server and updater metadata have not been verified;
- Windows 10 and Windows 11 installed upgrade acceptance is not approved;
- independent review is not approved;
- final stable publication evidence cannot be produced before the preceding gates pass.

## Merge and closure rule

PR #98 remains draft until every blocker is closed with actual evidence. After successful merge, immutable `v3.4.0` tag creation, signed GitHub Release publication and post-publication verification, this branch must be deleted and the PR/release evidence retained as completed provenance.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
