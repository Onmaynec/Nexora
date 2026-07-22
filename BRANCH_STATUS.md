# Статус выпуска Nexora 3.2.4

## Классификация

| Параметр | Значение |
|---|---|
| Repository branch | `main` |
| Version | `3.2.4` |
| Base version | `3.2.3` |
| Source Pull Request | PR #21 |
| Distribution | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Stable signed 3.2.4 approval | не предоставлен |
| Independent security review | не завершён |

Nexora `3.2.4` разрешена для контролируемого Source/PWA prerelease testing. Она не является подписанным stable Windows release и не должна описываться как independently audited E2EE.

## Patch lineage

| Версия | Основное изменение |
|---|---|
| `3.2.0` | Trust Core, MLS secure messaging, encrypted media и schema 8 |
| `3.2.1` | Authentication bootstrap ordering и serialized Server shutdown |
| `3.2.2` | Trust configuration lifecycle race и safe encrypted-draft read |
| `3.2.3` | Resource governance, route limiting, strict recovery и stale security-state cleanup |
| `3.2.4` | GitHub updater recovery, Server console fixes, automatic MLS Welcome и Windows diagnostics |

## Реализовано в 3.2.4

- packaged Client использует официальный GitHub Releases channel и scheduled automatic checks;
- ручная проверка имеет checking/progress/terminal/error states и retry;
- signed-update, no-downgrade и Authenticode gates сохранены;
- audited Server console возвращает stable codes и нормализует copied help placeholders;
- verified pending device запрашивает MLS Welcome у active group devices и повторяет one-time claim;
- text, encrypted media и voice остаются на общем fail-closed MLS path;
- после обновления показывается release summary с GitHub details link и per-version dismissal;
- opt-in Windows test mode открывает live PowerShell tail локального Client log;
- NSIS installer использует Nexora icon, branded sidebar и Russian language.

## Automated evidence

Авторитетный отчёт: [RELEASE_VERIFICATION_3.2.4.md](RELEASE_VERIFICATION_3.2.4.md).

Проверяемые gates:

- Windows `npm run check`;
- Windows `npm run test:unit`;
- Windows `npm run test:performance`;
- Windows `npm run audit:security`;
- Linux `npm test`;
- dedicated `npm run release:check`;
- schema 8 soak;
- Android `assembleDebug`.

## Compatibility

- Local Server schema: 8, unchanged;
- Application API: v3, unchanged;
- Trust/MLS/encrypted-media API: v4, compatible extension;
- database migration from `3.2.0–3.2.3`: not required;
- schema 7 → 8 migration остаётся необходимой для 3.1.x data.

## Distribution decision

Без обоих Authenticode secrets release workflow публикует только source ZIP, built PWA ZIP, SPDX SBOM и SHA-256 checksums. Unsigned `.exe`, `.blockmap` и `latest.yml` не публикуются, поэтому end-to-end Windows auto-update требует signed release assets.

## Remaining stable-promotion gates

1. packaged Windows Client/Server runtime E2E, включая installed auto-update;
2. installed PWA и physical Android runtime matrix;
3. extended multi-device simultaneous Welcome/commit/revoke/re-add/corrupted-state scenarios;
4. longer load/soak и long-offline field evidence;
5. metadata minimization/traffic-analysis review;
6. Authenticode signing-machine и complete updater verification;
7. independent cryptographic/application-security review;
8. отсутствие unresolved high/critical findings.

## Security boundary

Local Server не получает secure-message plaintext, private MLS state, secure-attachment key, original filename, actual MIME, caption, voice duration или waveform. Welcome recovery передаёт только scoped device/group identifiers and timing; RFC 9420 Welcome создаёт active verified Client.

Local Server всё ещё видит account/device identifiers, membership, conversation scope, ciphertext size, timing, IP/network context и delivery events. Traffic-analysis resistance не заявляется.

## Usage restriction

Source/PWA prerelease предназначена для controlled testing с disposable accounts/data. Она не должна использоваться как единственная защита high-risk communications или распространяться как signed/stable Windows release.
