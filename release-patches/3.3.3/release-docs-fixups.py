from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSION = "3.3.3"
PREVIOUS = "3.3.2"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def sub_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match for {pattern!r}, found {count}")
    write(path, updated)


# README keeps the previous release in history while exposing 3.3.3 as current.
readme = read("README.md")
readme = re.sub(r"current-\d+\.\d+\.\d+%20", f"current-{VERSION}%20", readme, count=1)
old_row = next((line for line in readme.splitlines() if line.startswith(f"| `{PREVIOUS}` |")), None)
if not old_row:
    raise RuntimeError("README.md: current release row was not found")
new_row = "| `3.3.3` | Goal workflow, Telegram-style voice UX, effective Pulse purchases and safe MLS recovery | Опубликованный UNSIGNED-TEST prerelease без updater metadata |"
if new_row not in readme:
    readme = readme.replace(old_row, new_row + "\n" + old_row, 1)
readme = re.sub(
    rf"`{re.escape(PREVIOUS)}` сохраняет runtime.*?Авторитетные документы текущей линии:",
    "`3.3.3` исправляет создание коллективных целей, голосовые сообщения, применение Pulse-покупок, idempotent purchase flow и восстановление MLS-состояния. Windows Client/Server публикуются как явно маркированные `UNSIGNED-TEST` assets; updater metadata отсутствует. Авторитетные документы текущей линии:",
    readme,
    count=1,
    flags=re.DOTALL,
)
readme = readme.replace(f"[Release Notes {PREVIOUS}](RELEASE_NOTES_{PREVIOUS}.md)", f"[Release Notes {VERSION}](RELEASE_NOTES_{VERSION}.md)", 1)
readme = readme.replace(f"[Release Verification {PREVIOUS}](RELEASE_VERIFICATION_{PREVIOUS}.md)", f"[Release Verification {VERSION}](RELEASE_VERIFICATION_{VERSION}.md)", 1)
release_section = '''### Release 3.3.3

- owner и moderator создают валидируемые коллективные цели; одновременно активна только одна цель комнаты;
- voice waveform реагирует на микрофон, сохраняется в MLS media descriptor и анимируется при playback;
- покупки Pulse применяют server-owned profile, message, reaction и room effects;
- purchase requests защищены стабильным Idempotency-Key и повторное выполнение не списывает баланс дважды;
- MLS open path принудительно сверяет epoch и безопасно запрашивает fresh Welcome без plaintext fallback.

'''
if "### Release 3.3.3" not in readme:
    readme = readme.replace("### Release 3.3.2\n", release_section + "### Release 3.3.2\n", 1)
write("README.md", readme)

# Exact current-version markers enforced by release consistency CI.
marker_updates = [
    ("PROJECT_INDEX.md", r"(Repository version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/README.md", r"(Current repository version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/ARCHITECTURE.md", r"(main` версии `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/SECURITY_MODEL.md", r"(Модель безопасности Nexora )\d+\.\d+\.\d+", rf"\g<1>{VERSION}"),
    ("docs/SECURITY_MODEL.md", r"(Version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("android/README.md", r"(Current version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("android/README.md", r"(version metadata equals `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("SECURITY.md", r"(\| `)\d+\.\d+\.\d+(` \| Published `UNSIGNED-TEST` prerelease)", rf"\g<1>{VERSION}\g<2>"),
    ("SUPPORT.md", r"(\| `)\d+\.\d+\.\d+(?=` published `UNSIGNED-TEST` prerelease)", rf"\g<1>{VERSION}"),
    ("CONTRIBUTING.md", r"(Repository version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("ADMIN_GUIDE.md", r"(Repository version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("TESTER_GUIDE.md", r"(current version: `)\d+\.\d+\.\d+(` published `UNSIGNED-TEST` prerelease)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/PRODUCT_OVERVIEW.md", r"(Current repository version \| `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/OPERATIONS_RUNBOOK.md", r"(Runbook относится к Nexora `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/DEPLOYMENT.md", r"(Документ относится к Nexora `)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/GITHUB_RELEASE.md", r"(- `)\d+\.\d+\.\d+(` — published `UNSIGNED-TEST` prerelease)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/GITHUB_RELEASE.md", r"(Current tag: `v)\d+\.\d+\.\d+(`)", rf"\g<1>{VERSION}\g<2>"),
    ("docs/RELEASE_CHECKLIST.md", r"^# Nexora \d+\.\d+\.\d+ Release Checklist$", f"# Nexora {VERSION} Release Checklist", re.MULTILINE),
    ("BRANCHES.md", r"(\| `main` \| Nexora `)\d+\.\d+\.\d+(` published `UNSIGNED-TEST` prerelease)", rf"\g<1>{VERSION}\g<2>"),
    (".github/ISSUE_TEMPLATE/bug_report.yml", r"(Current version: )\d+\.\d+\.\d+( published UNSIGNED-TEST prerelease)", rf"\g<1>{VERSION}\g<2>"),
    ("website/index.html", r">\d+\.\d+\.\d+<", f">{VERSION}<"),
    ("website/app.js", r'(FALLBACK_VERSION\s*=\s*")\d+\.\d+\.\d+(";)', rf"\g<1>{VERSION}\g<2>"),
    ("website/site-fixes.js", r'(FALLBACK_VERSION\s*=\s*")\d+\.\d+\.\d+(";)', rf"\g<1>{VERSION}\g<2>"),
]
for item in marker_updates:
    path, pattern, replacement, *flags = item
    sub_once(path, pattern, replacement, flags[0] if flags else 0)

policy = read("docs/RELEASE_POLICY.md")
if f"### {VERSION}" not in policy:
    match = re.search(r"^### \d+\.\d+\.\d+$", policy, re.MULTILINE)
    if not match:
        raise RuntimeError("docs/RELEASE_POLICY.md: release decision heading not found")
    decision = f"### {VERSION}\n\nPatch release: goals, voice UX, Pulse entitlements, idempotent purchases and MLS recovery. Distribution remains UNSIGNED-TEST without updater metadata.\n\n"
    policy = policy[:match.start()] + decision + policy[match.start():]
write("docs/RELEASE_POLICY.md", policy)

# Current-document links follow the current verification source without rewriting historical release files.
current_docs = [
    "README.md", "PROJECT_INDEX.md", "docs/README.md", "docs/ARCHITECTURE.md", "docs/SECURITY_MODEL.md",
    "android/README.md", "SECURITY.md", "SECURITY_AUDIT.md", "SUPPORT.md", "CONTRIBUTING.md", "ADMIN_GUIDE.md",
    "TESTER_GUIDE.md", "BRANCH_STATUS.md", "BRANCHES.md", "docs/PRODUCT_OVERVIEW.md", "docs/OPERATIONS_RUNBOOK.md",
    "docs/DEPLOYMENT.md", "docs/RELEASE_POLICY.md", "docs/GITHUB_RELEASE.md", "docs/RELEASE_CHECKLIST.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml", "website/index.html", "website/app.js", "website/site-fixes.js",
]
for name in current_docs:
    source = read(name)
    source = source.replace("RELEASE_VERIFICATION_3.2.4.md", f"RELEASE_VERIFICATION_{VERSION}.md")
    source = source.replace(f"RELEASE_VERIFICATION_{PREVIOUS}.md", f"RELEASE_VERIFICATION_{VERSION}.md")
    source = source.replace(f"RELEASE_NOTES_{PREVIOUS}.md", f"RELEASE_NOTES_{VERSION}.md")
    write(name, source)

write(f"RELEASE_NOTES_{VERSION}.md", '''# Nexora 3.3.3 — Release Notes

Nexora 3.3.3 is a patch release for Electron and Web/PWA based on 3.3.2.

## Fixed

- The room goal action now opens an accessible form with required title, description, target Impulses and deadline.
- Owners and moderators can create goals; one active goal per room is enforced, contributions remain atomic, cancellation refunds are preserved, and goal lifecycle actions are audited and surfaced as system events.
- Secure voice messages now provide microphone-level recording bars, persistent waveform metadata, animated playback progress, play/pause, pointer and keyboard seeking, finite duration handling and 1×/1.5×/2× playback.
- Pulse catalog purchases now apply server-defined profile, message, reaction and room effects and expire back to safe defaults.
- Purchase, contribution and goal requests send a stable Idempotency-Key in the header and compatibility body; duplicate requests reuse the original result without a second debit.
- Conversations force an MLS epoch check when opened and can recover missing or inconsistent local state through a fresh device-scoped Welcome.

## Security

- Pulse effects are resolved only from the server-owned catalog allowlist.
- Goal authorization, limits and input validation are enforced by the Local Server.
- MLS recovery removes only the authenticated current device membership, requires another active verified peer and never falls back to plaintext.
- Message sending remains blocked until MLS synchronization succeeds.

## Distribution

Windows Client and Server builds are published as `UNSIGNED-TEST` artifacts because code-signing secrets are not configured. PWA is included. Updater metadata is intentionally absent for unsigned installers.
''')

write(f"RELEASE_VERIFICATION_{VERSION}.md", '''# Nexora 3.3.3 — Release Verification

## Required gates

- release metadata synchronization and consistency gate;
- syntax validation and Electron builder configuration check;
- Web/PWA production build;
- unit, API, Trust/MLS, Pulse and regression tests;
- performance tests;
- Client, Server and PWA artifact smoke checks;
- checksum verification of every published asset.

## Security invariants

- no plaintext fallback for secure conversations;
- verified-peer requirement for MLS rejoin;
- server-side owner/moderator goal authorization;
- one active goal per room;
- catalog allowlist for every purchased effect;
- idempotent wallet debits and contribution operations.

Final tag SHA, asset digests and smoke results are recorded in `release-evidence/current.json` after publication.
''')

evidence = {
    "schemaVersion": 1,
    "version": VERSION,
    "status": "candidate",
    "verifiedAt": None,
    "repository": "Onmaynec/Nexora",
    "tag": f"v{VERSION}",
    "tagSha": None,
    "releaseName": f"Nexora {VERSION} — UNSIGNED TEST BUILDS",
    "releaseUrl": f"https://github.com/Onmaynec/Nexora/releases/tag/v{VERSION}",
    "draft": True,
    "prerelease": True,
    "distribution": "unsigned-test",
    "updaterMetadataPublished": False,
    "requiredAssets": [
        f"Nexora-{VERSION}-source.zip",
        f"Nexora-PWA-{VERSION}.zip",
        f"Nexora-{VERSION}.spdx.json",
        "SHA256SUMS.txt",
        f"Nexora-Client-Setup-{VERSION}-UNSIGNED-TEST.exe",
        f"Nexora-Server-Setup-{VERSION}-UNSIGNED-TEST.exe",
    ],
    "smoke": {"status": "pending"},
    "assets": [],
}
write("release-evidence/current.json", json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")

print("Nexora 3.3.3 current release documentation prepared.")
