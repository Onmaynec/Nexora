# Статус выпуска Nexora 3.3.2

## Классификация

| Параметр | Значение |
|---|---|
| Version | `3.3.2` |
| Release scope | Release consistency, documentation, CI and repository cleanup |
| Source Pull Request | PR `#42`, merged |
| Source merge commit | `82af775fb39515bd219078fec368cc259441c288` |
| Release tag | `v3.3.2` |
| GitHub Release | `Nexora 3.3.2 — UNSIGNED TEST BUILDS` при отсутствии signing secrets |
| Distribution | `UNSIGNED-TEST` prerelease boundary |
| Production updater metadata | not published for unsigned assets |
| Local Server schema | `8` |
| Application API | `v3` |
| Trust/MLS API | `v4` |
| Database migration | not required |
| Independent security audit | not performed |

Nexora `3.3.2` не добавляет пользовательские функции и не меняет runtime. Выпуск синхронизирует version metadata, current documentation, release history и release evidence, а также добавляет post-publication smoke-проверку Client, Server, Android и PWA assets.

## Verification

- PR CI run `30002580071`: Windows verify, Linux suite, release gate, schema 8 soak и Android source build — success;
- focused Nexora 3.3 regressions run `30002580107` — success;
- `package.json` является источником SemVer;
- `npm run release:consistency` проверяет package-lock, Android metadata, README, Documentation Portal, Project Index, Architecture, Security Model, Android README и current evidence;
- `npm run release:check` включает consistency gate, build, unit/API/integration, performance и security audit;
- release evidence workflow скачивает опубликованные assets, проверяет `SHA256SUMS.txt`, PE/ZIP integrity и обязательное содержимое;
- окончательные release run ID, размеры и SHA-256 записываются в `release-evidence/v3.3.2.json`.

## Организационная очистка

- конфликтующие PR #30 и #31, основанные на устаревшем `main`, закрыты без merge;
- obsolete automation PR #6 и #7 для исторической линии 3.1.0 закрыты без merge;
- экспериментальный Rust/OpenMLS PR #11 закрыт как superseded: текущий `main` использует интегрированный JavaScript/`ts-mls` Trust/MLS API v4;
- повторное рассмотрение Rust/OpenMLS возможно только через отдельный RFC, новый development branch, migration/interoperability plan, reproducible-build gate и независимый security review.

## Security and compatibility

- authorization, room roles, bans, upload policy, Pulse pricing/ledger and Trust Core are unchanged;
- no new dependencies, secrets, executable payload or network permissions are added;
- schema 8, API v3 and Trust/MLS API v4 remain compatible;
- no migration or rollback is required.

## Real limitations

- Windows Client/Server and Android remain unsigned test artifacts unless the release environment contains valid signing credentials;
- production updater cannot consume an unsigned prerelease because `latest.yml` and `.blockmap` are intentionally absent;
- independent cryptographic/application-security audit is not performed;
- physical-device Android and installed Windows acceptance remain external release evidence requirements.
