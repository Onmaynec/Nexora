# Статус ветки `release/3.3.4-post-mls`

## Классификация

| Параметр | Значение |
|---|---|
| Classification | Active development / draft release candidate |
| Target version | Nexora `3.3.4` |
| Base release | Nexora `3.3.3` |
| Pull Request | Draft PR `#70` |
| Branch role | Mandatory post-MLS prerequisite for the planned 3.4.0 line |
| Current product source of truth | `main`, Nexora `3.3.3` |
| Release state | Not approved, not tagged, not published |
| Package metadata | `3.3.4` on this branch only |

## Scope

- remove executable Trust/MLS runtime and the `ts-mls` dependency;
- restore ordinary server-readable messaging as the only writable messaging path;
- preserve schema 8 legacy ciphertext as read-only history/export without server-side decryption;
- reject legacy Trust/E2EE mutations with `410/LEGACY_READ_ONLY`;
- complete related Client bootstrap, UX, release and regression corrections;
- prepare an explicitly classified 3.3.4 prerelease with checksums and re-download smoke evidence.

## Merge and release boundary

This branch does not change the current product state until PR #70 is reviewed, merged into `main`, verified by the complete release gate and published from the resulting immutable commit. It must not be represented as stable or production-signed before those conditions are met.

The overlapping `release/3.3.4` / PR #67 line must be reconciled explicitly. Independent merge or publication of both branches is prohibited.

## Required verification

- version and documentation consistency;
- syntax, type/build and Electron configuration checks;
- unit, API, integration, regression and performance tests;
- security audit and legacy-read-only bypass tests;
- schema 8 compatibility/soak;
- Windows, PWA and Android source/artifact gates;
- published asset checksum and re-download smoke checks.

## Security boundary

Legacy ciphertext remains opaque and read-only. No server-side decryption, plaintext downgrade of historical secure records, secret logging or silent data deletion is permitted. New ordinary messages follow the server-readable 3.3.4 contract only after the branch is approved and merged.

## Real limitations

- the branch is a draft and may change;
- Authenticode credentials and installed Windows acceptance remain external prerequisites for a signed stable release;
- independent security review is not complete;
- `main` 3.3.3 remains the only current product source of truth.
