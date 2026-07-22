from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")
    print(f"updated {path}")


def replace(path, before, after, count=1):
    source = read(path)
    actual = source.count(before)
    if actual < count:
        raise SystemExit(f"Expected at least {count} occurrence(s) in {path}: {before[:120]!r}; found {actual}")
    write(path, source.replace(before, after, count))


# README: current release boundary and user-visible 3.2.4 scope.
replace("README.md", "current-3.2.3%20prerelease", "current-3.2.4%20prerelease")
replace(
    "README.md",
    "| `3.2.3` | Trust Core, MLS secure messaging, encrypted media и security hardening | Source/PWA prerelease для контролируемого тестирования |",
    "| `3.2.4` | Windows updater recovery, Server console fixes, automatic MLS Welcome delivery и Client diagnostics | Source/PWA prerelease для контролируемого тестирования |",
)
replace(
    "README.md",
    "`3.2.3` прошла автоматические build-, unit-, API-, integration-, performance-, security-, soak- и Android source-gates. Она не является подписанным стабильным Windows-релизом и не заявляется как независимо аудированная E2EE-система. Авторитетные документы текущей линии:\n\n- [Release Notes 3.2.3](RELEASE_NOTES_3.2.3.md);\n- [Security Review 3.2.3](SECURITY_REVIEW_3.2.3.md);\n- [Release Verification 3.2.3](RELEASE_VERIFICATION_3.2.3.md).",
    "`3.2.4` прошла автоматические build-, unit-, API-, integration-, performance-, security-, soak- и Android source-gates. Она не является подписанным стабильным Windows-релизом и не заявляется как независимо аудированная E2EE-система. Авторитетные документы текущей линии:\n\n- [Release Notes 3.2.4](RELEASE_NOTES_3.2.4.md);\n- [Security Review 3.2.4](SECURITY_REVIEW_3.2.4.md);\n- [Release Verification 3.2.4](RELEASE_VERIFICATION_3.2.4.md).",
)
replace(
    "README.md",
    "### Security hardening 3.2.3",
    """### Patch release 3.2.4

- автоматическая проверка GitHub Releases после запуска и по расписанию;
- наблюдаемая ручная проверка с progress, terminal state, retry и понятными ошибками;
- стабильные коды ошибок audited Server console без Electron IPC wrapper text;
- безопасная нормализация `<user>` и `[days]`, скопированных из help;
- автоматический запрос MLS Welcome для verified устройства и повтор claim без plaintext downgrade;
- краткое окно изменений после обновления со ссылкой на GitHub release;
- opt-in Windows test mode с live PowerShell tail локального Client log;
- branded Russian NSIS installer и отдельный Start Menu shortcut тестового режима.

### Security hardening 3.2.3""",
)

# Project index: current modules, API and regression suite.
replace("PROJECT_INDEX.md", "| Repository version | `3.2.3` |", "| Repository version | `3.2.4` |")
replace(
    "PROJECT_INDEX.md",
    "| `server/trust-routes.cjs` | Trust API v4 device/group/message routes и route limiting |",
    "| `server/trust-routes.cjs` | Trust API v4 device/group/message routes, MLS Welcome request и route limiting |\n| `server/mls-welcome-recovery.cjs` | verified requester validation и device-scoped Welcome recovery notification |",
)
replace(
    "PROJECT_INDEX.md",
    "| `client/src/components/SettingsPage.jsx` | profile, TOTP, Trust devices, sessions и preferences |",
    "| `client/src/components/SettingsPage.jsx` | profile, TOTP, Trust devices, sessions, preferences и observable Client update controls |",
)
replace(
    "PROJECT_INDEX.md",
    "| `client/src/crypto/trust-client.js` | device lifecycle, BasicCredential creation, KeyPackage pool и recovery orchestration |",
    "| `client/src/crypto/trust-client.js` | device lifecycle, BasicCredential creation, KeyPackage pool, commit recovery и automatic Welcome request/claim |",
)
replace(
    "PROJECT_INDEX.md",
    "| `electron/update-service.cjs` | signed updater, single-flight checks и stable diagnostics |",
    "| `electron/update-service.cjs` | GitHub signed updater, scheduled/single-flight checks, terminal fallback и stable diagnostics |\n| `electron/release-experience.cjs` | post-update summary state, official release link и Windows test-log console |",
)
replace(
    "PROJECT_INDEX.md",
    "- Welcome claim;",
    "- Welcome request from an active verified group device and one-time Welcome claim;",
)
replace("PROJECT_INDEX.md", "## Ключевые лимиты 3.2.3", "## Ключевые лимиты, действующие в 3.2.4")
replace(
    "PROJECT_INDEX.md",
    "| `test/security-hardening-3.2.3.test.cjs` | credential/key roles, limits, rate limiting, bans, cleanup и strict recovery |",
    "| `test/security-hardening-3.2.3.test.cjs` | credential/key roles, limits, rate limiting, bans, cleanup и strict recovery |\n| `test/update-service.test.cjs` | GitHub provider, manual terminal fallback, scheduling и updater errors |\n| `test/client-update-ui.test.cjs` | progress, terminal result, retry и duplicate-check prevention |\n| `test/developer-commands.test.cjs` | registry execution, audit и copied placeholder normalization |\n| `test/mls-welcome-recovery.test.cjs` | verified pending-device request и redundant-request suppression |\n| `test/release-experience.test.cjs` | post-update dialog, dismissal, GitHub details link и test-mode switch |",
)

# Documentation index: mark 3.2.4 as current while retaining 3.2.3 provenance.
replace("docs/README.md", "| Текущая версия репозитория | `3.2.3` |", "| Текущая версия репозитория | `3.2.4` |")
replace(
    "docs/README.md",
    "`3.2.3` включает Trust/MLS и encrypted-media foundation `3.2.0`, исправления lifecycle `3.2.1–3.2.2` и security hardening `3.2.3`. Документация различает реализованное поведение, автоматические доказательства, ручные release-gates и независимую проверку.",
    "`3.2.4` включает Trust/MLS и encrypted-media foundation `3.2.0`, lifecycle fixes `3.2.1–3.2.2`, security hardening `3.2.3` и recovery patch `3.2.4` для updater, Server console, MLS Welcome и Client diagnostics. Документация различает реализованное поведение, автоматические доказательства, ручные release-gates и независимую проверку.",
)
for name in ["Product Overview", "Architecture", "Project Index", "Security Model"]:
    replace("docs/README.md", f"| [{name}", f"| [{name}", count=1)
# Exact status replacements are intentionally scoped to the four current rows.
for old, new in [
    ("| [Product Overview](PRODUCT_OVERVIEW.md) | назначение, платформы, функции, версии и ограничения | Current 3.2.3 |", "| [Product Overview](PRODUCT_OVERVIEW.md) | назначение, платформы, функции, версии и ограничения | Current through 3.2.4 |"),
    ("| [Architecture](ARCHITECTURE.md) | компоненты, data flow, storage, authorization и trust boundaries | Current 3.2.3 |", "| [Architecture](ARCHITECTURE.md) | компоненты, data flow, storage, authorization и trust boundaries | Current through 3.2.4 |"),
    ("| [Project Index](../PROJECT_INDEX.md) | карта entrypoints, модулей, API и тестов | Current 3.2.3 |", "| [Project Index](../PROJECT_INDEX.md) | карта entrypoints, модулей, API и тестов | Current 3.2.4 |"),
    ("| [Security Model](SECURITY_MODEL.md) | threat model, Trust/MLS, resource governance и residual risks | Current 3.2.3 |", "| [Security Model](SECURITY_MODEL.md) | threat model, Trust/MLS, resource governance и residual risks | Current through 3.2.4 |"),
]:
    replace("docs/README.md", old, new)
replace(
    "docs/README.md",
    "| [Security Review 3.2.3](../SECURITY_REVIEW_3.2.3.md) | подтверждённые findings и security patch decisions | Release-specific |\n| [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md) | CI evidence и compatibility boundary | Release-specific |",
    "| [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) | updater, console, Welcome recovery и test-mode security boundary | Current release-specific |\n| [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md) | CI evidence и compatibility boundary | Current release-specific |\n| [Security Review 3.2.3](../SECURITY_REVIEW_3.2.3.md) | resource-governance findings и security patch decisions | Historical release-specific |\n| [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md) | 3.2.3 CI evidence и compatibility boundary | Historical release-specific |",
)
replace(
    "docs/README.md",
    "| [Release Notes 3.2.3](../RELEASE_NOTES_3.2.3.md) | текущий security hardening patch |\n| [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md) | авторитетное автоматическое evidence текущей версии |",
    "| [Release Notes 3.2.4](../RELEASE_NOTES_3.2.4.md) | текущий updater/console/Welcome recovery patch |\n| [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) | security boundaries текущего patch release |\n| [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md) | авторитетное автоматическое evidence текущей версии |\n| [Release Notes 3.2.3](../RELEASE_NOTES_3.2.3.md) | исторический security hardening patch |",
)

# Branch/current-release documents are rewritten as post-merge authority.
write("BRANCH_STATUS.md", """# Статус выпуска Nexora 3.2.4

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
""")

replace("BRANCHES.md", "Nexora `3.2.3` Source/PWA prerelease", "Nexora `3.2.4` Source/PWA prerelease")
replace(
    "BRANCHES.md",
    "| `agent/nexora-3.2.3-security-hardening` | Trust resource limits, route controls, strict recovery и cleanup | Merged through PR #20 |",
    "| `agent/nexora-3.2.3-security-hardening` | Trust resource limits, route controls, strict recovery и cleanup | Merged through PR #20 |\n| `agent/nexora-3.2.4-updater-mls-recovery` | Updater, Server console, automatic MLS Welcome, post-update UX и diagnostics | Merged through PR #21 |",
)
replace("BRANCHES.md", "- current repository version: `3.2.3`;", "- current repository version: `3.2.4`;")
replace("BRANCHES.md", "- migration from 3.2.0–3.2.2: not required;", "- migration from 3.2.0–3.2.3: not required;")

# One-shot mechanics must not remain in release source.
for relative in ["scripts/apply-3.2.4-doc-sync.py", ".github/workflows/apply-3.2.4-doc-sync.yml"]:
    target = ROOT / relative
    if target.exists():
        target.unlink()
        print(f"removed {relative}")
