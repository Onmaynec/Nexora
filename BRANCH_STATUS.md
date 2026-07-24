# Статус ветки Nexora 3.3.4 Post-MLS Baseline

## Классификация

| Параметр | Значение |
|---|---|
| Version | `3.3.4` |
| Branch | `release/3.3.4-post-mls` |
| Pull Request | `#70` |
| Baseline | published Nexora `3.3.3` line |
| Classification | Release candidate; signed when policy exists, otherwise explicit `UNSIGNED-TEST` prerelease |
| Application API | v3 |
| Local Server schema | 8 compatibility layer |
| Trust/MLS runtime | retired; legacy history read-only |
| Publication | pending final CI, merge, annotated `v3.3.4`, GitHub Release and asset smoke |

## Implemented boundary

- ordinary server-readable messaging is the only writable messaging path;
- executable Trust/MLS services and `ts-mls` are removed;
- schema 8 legacy ciphertext, IDs, epochs, timestamps and audit provenance are retained;
- legacy viewer/export is immutable and the server never decrypts ciphertext;
- legacy REST and Socket.IO mutations fail with `410/LEGACY_READ_ONLY`;
- session-derived devices support targeted revoke and immediate realtime disconnect;
- backup verification is non-restoring and restore/migration failure paths are covered;
- updater and release tooling distinguish signed assets from explicit unsigned test assets.

## Release completion gates

1. final PR CI, focused regressions and website validation pass;
2. PR #70 is reviewed and merged with release commit identity;
3. post-merge CI passes;
4. annotated `v3.3.4` and GitHub Release are created;
5. checksums and release evidence are published;
6. all assets are re-downloaded and verified.

Authenticode credentials are optional for this prerequisite. Without them, the release remains a clearly marked `UNSIGNED-TEST` prerelease and must not contain updater metadata. Independent review and signed 3.3.4→3.4.0 acceptance remain 3.4.0 gates.
