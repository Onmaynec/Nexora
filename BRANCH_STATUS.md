# Статус выпуска Nexora 3.2.3

## Классификация

| Параметр | Значение |
|---|---|
| Repository branch | `main` |
| Version | `3.2.3` |
| Base version | `3.2.2` |
| Source Pull Request | PR #20 |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Stable signed 3.2.3 approval | не предоставлен |
| Independent security review | не завершён |

Nexora `3.2.3` разрешена для контролируемого Source/PWA prerelease testing. Она не является подписанным stable Windows release и не должна описываться как independently audited E2EE.

## Patch lineage

| Версия | Основное изменение |
|---|---|
| `3.2.0` | Trust Core, MLS secure messaging, encrypted media и schema 8 |
| `3.2.1` | Authentication bootstrap ordering и serialized Server shutdown |
| `3.2.2` | Trust configuration lifecycle race и safe encrypted-draft read |
| `3.2.3` | Resource governance, route limiting, strict recovery и stale security-state cleanup |

## Реализовано в 3.2.3

- exact MLS BasicCredential binding к authenticated `{ userId, deviceId }`;
- distinct identity и MLS signature Ed25519 keys;
- atomic limit 16 active Trust devices/user;
- KeyPackage ceilings: 25/request, 32/device, 256/user;
- bounded sliding-window Trust/recovery/E2EE rate limiter;
- stable `RATE_LIMITED` + `Retry-After` contract;
- action-specific primitive Trust audit allowlists;
- active-ban fail-closed conversation access при stale membership;
- strict Client missed-commit group/scope/epoch/hash/public-state validation;
- startup/hourly cleanup expired sessions, login history >90 days и stale rate-limit buckets.

## Подтверждённые ранее существующие controls

- mutating API CSRF и Origin validation;
- Socket.IO origin rejection через `allowRequest`;
- AES-GCM sealed IndexedDB state с non-extractable WebCrypto keys;
- server-side commit/message replay constraints;
- exact opaque attachment size/hash validation;
- quota по actual stored ciphertext bytes;
- plaintext downgrade guards после MLS activation.

## Regression-first evidence

Initial security candidate CI `#290` (`29934225971`) failed against `3.2.2` as expected, подтверждая отсутствие новых controls до correction.

## Verified implementation evidence

- implementation head: `a3586fe7d399dc03a990c939c31a3ceabcbad000`;
- CI run: `#308`, ID `29937445396`;
- result: PASS.

## Final release-documentation evidence

- final head: `5369263a3220e165d420615b53d770f7732a54b3`;
- CI run: `#309`, ID `29937694136`;
- result: PASS.

Проверенные jobs:

- Windows `npm run check`;
- Windows `npm run test:unit`;
- Windows `npm run test:performance`;
- Windows `npm run audit:security`;
- Linux `npm test`;
- dedicated `npm run release:check`;
- schema 8 soak;
- Android `assembleDebug`.

Авторитетный отчёт: [RELEASE_VERIFICATION_3.2.3.md](RELEASE_VERIFICATION_3.2.3.md).

## Compatibility

- Local Server schema: 8, unchanged;
- Application API: v3, unchanged;
- Trust/MLS/encrypted-media API: v4, unchanged;
- database migration from `3.2.0`, `3.2.1` или `3.2.2`: not required;
- schema 7 → 8 migration остаётся необходимой для 3.1.x data.

## Distribution decision

Без обоих Authenticode secrets release workflow публикует только:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- SHA-256 checksums.

Unsigned `.exe`, blockmap и `latest.yml` не публикуются. Electron updater не принимает prerelease как installable Windows update.

## Remaining stable-promotion gates

1. packaged Windows Client/Server runtime E2E;
2. installed PWA и physical Android runtime matrix;
3. extended multi-device simultaneous-commit/revoke/re-add/corrupted-state scenarios;
4. longer load/soak и long-offline field evidence;
5. metadata minimization/traffic-analysis review;
6. Authenticode signing-machine и complete updater verification;
7. independent cryptographic/application-security review;
8. отсутствие unresolved high/critical findings.

## Security boundary

Local Server не получает secure-message plaintext, private MLS state, secure-attachment key, original filename, actual MIME, caption, voice duration или waveform.

Local Server всё ещё видит account/device identifiers, membership, conversation scope, uploader, attachment ID, ciphertext size, timing, IP/network context и delivery events. Traffic-analysis resistance не заявляется.

## Usage restriction

Source/PWA prerelease предназначена для controlled testing с disposable accounts/data. Она не должна использоваться как единственная защита high-risk communications или распространяться как signed/stable Windows release.
