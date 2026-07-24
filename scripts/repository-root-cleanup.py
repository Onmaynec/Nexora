from __future__ import annotations

import json
import os
import re
from pathlib import Path

ROOT = Path.cwd()
RELEASE_ROOT = Path("docs/releases")
RELEASE_ROOT.mkdir(parents=True, exist_ok=True)

WORKFLOW_FILES = {
    Path(".github/workflows/repository-root-cleanup.yml"),
    Path(".github/workflows/repository-root-cleanup-debug.yml"),
    Path(".github/workflows/patch-root-cleanup-materializer.yml"),
    Path(".github/workflows/repository-root-cleanup-v2.yml"),
}

RELEASE_NAMES = {
    "RELEASE_NOTES": "RELEASE_NOTES.md",
    "RELEASE_VERIFICATION": "RELEASE_VERIFICATION.md",
    "SECURITY_REVIEW": "SECURITY_REVIEW.md",
}
SOURCE_PATTERN = re.compile(
    r"^(RELEASE_NOTES|RELEASE_VERIFICATION|SECURITY_REVIEW)_(\d+\.\d+\.\d+)\.md$"
)

release_moves: dict[str, Path] = {}
for source in sorted(ROOT.glob("*.md")):
    match = SOURCE_PATTERN.fullmatch(source.name)
    if match:
        kind, version = match.groups()
        release_moves[source.name] = RELEASE_ROOT / version / RELEASE_NAMES[kind]

path_moves: dict[str, Path] = dict(release_moves)
path_moves["ROADMAP.md"] = Path("docs/ROADMAP.md")
path_moves["RELEASE_HISTORY.md"] = RELEASE_ROOT / "README.md"


def is_external(target: str) -> bool:
    return (
        not target
        or target.startswith(("#", "/", "mailto:", "data:", "tel:"))
        or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", target) is not None
    )


def translated_target(target: str, new_parent: Path) -> str:
    if is_external(target):
        return target
    match = re.match(r"^([^?#]*)(.*)$", target)
    if not match:
        return target
    path_part, suffix = match.groups()
    if not path_part or path_part.startswith(".."):
        return target
    normalized = path_part[2:] if path_part.startswith("./") else path_part
    resolved = path_moves.get(normalized, Path(normalized))
    relative = os.path.relpath(resolved, new_parent).replace(os.sep, "/")
    return f"{relative}{suffix}"


def rebase_markdown(source: str, new_parent: Path) -> str:
    inline = re.compile(r"(\]\()(<)?([^\s)>]+)(>)?([^)]*)(\))")

    def inline_replace(match: re.Match[str]) -> str:
        prefix, opening, target, closing, title, suffix = match.groups()
        translated = translated_target(target, new_parent)
        return f"{prefix}{opening or ''}{translated}{closing or ''}{title}{suffix}"

    source = inline.sub(inline_replace, source)
    reference = re.compile(r"(?m)^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$")

    def reference_replace(match: re.Match[str]) -> str:
        prefix, target, tail = match.groups()
        return f"{prefix}{translated_target(target, new_parent)}{tail}"

    return reference.sub(reference_replace, source)


moved: list[tuple[str, str]] = []
for old_name, destination in sorted(release_moves.items()):
    source = Path(old_name)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if old_name not in {
            "RELEASE_NOTES_3.3.3.md",
            "RELEASE_VERIFICATION_3.3.3.md",
        }:
            raise RuntimeError(f"destination already exists for {old_name}: {destination}")
        source.unlink()
        moved.append((old_name, f"deleted compatibility pointer; canonical file is {destination}"))
        continue
    content = source.read_text(encoding="utf-8")
    destination.write_text(rebase_markdown(content, destination.parent), encoding="utf-8")
    source.unlink()
    moved.append((old_name, destination.as_posix()))

roadmap = Path("ROADMAP.md")
if roadmap.exists():
    roadmap_target = Path("docs/ROADMAP.md")
    if roadmap_target.exists():
        raise RuntimeError("docs/ROADMAP.md already exists")
    roadmap_target.write_text(
        rebase_markdown(roadmap.read_text(encoding="utf-8"), roadmap_target.parent),
        encoding="utf-8",
    )
    roadmap.unlink()
    moved.append(("ROADMAP.md", roadmap_target.as_posix()))

release_history = Path("RELEASE_HISTORY.md")
if release_history.exists():
    release_history.unlink()
    moved.append(("RELEASE_HISTORY.md", "removed; docs/releases/README.md is canonical"))

TEXT_EXTENSIONS = {
    ".md",
    ".cjs",
    ".mjs",
    ".js",
    ".json",
    ".yml",
    ".yaml",
    ".html",
    ".css",
    ".txt",
    ".xml",
    ".gradle",
    ".kts",
    ".properties",
    ".toml",
    ".ps1",
    ".sh",
}
SKIPPED_PARTS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "release",
    "artifacts",
    ".gradle",
    ".idea",
    ".vscode",
}
GENERIC_TARGETS = {
    "RELEASE_NOTES_<version>.md": Path("docs/releases/<version>/RELEASE_NOTES.md"),
    "RELEASE_VERIFICATION_<version>.md": Path(
        "docs/releases/<version>/RELEASE_VERIFICATION.md"
    ),
    "SECURITY_REVIEW_<version>.md": Path("docs/releases/<version>/SECURITY_REVIEW.md"),
    "RELEASE_NOTES_${version}.md": Path("docs/releases/${version}/RELEASE_NOTES.md"),
    "RELEASE_VERIFICATION_${version}.md": Path(
        "docs/releases/${version}/RELEASE_VERIFICATION.md"
    ),
    "SECURITY_REVIEW_${version}.md": Path(
        "docs/releases/${version}/SECURITY_REVIEW.md"
    ),
    "RELEASE_NOTES_$version.md": Path("docs/releases/$version/RELEASE_NOTES.md"),
    "RELEASE_VERIFICATION_$version.md": Path(
        "docs/releases/$version/RELEASE_VERIFICATION.md"
    ),
    "SECURITY_REVIEW_$version.md": Path("docs/releases/$version/SECURITY_REVIEW.md"),
}


def relative_file(file: Path) -> Path:
    return file.relative_to(ROOT)


def replacement_for(file: Path, destination: Path) -> str:
    if file.suffix.lower() == ".md":
        return os.path.relpath(destination, file.parent).replace(os.sep, "/")
    return destination.as_posix()


changed_files: list[str] = []
for file in sorted(ROOT.rglob("*")):
    if not file.is_file() or relative_file(file) in WORKFLOW_FILES:
        continue
    if any(part in SKIPPED_PARTS for part in file.parts):
        continue
    if file.suffix.lower() not in TEXT_EXTENSIONS:
        continue
    try:
        before = file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    after = before
    for old_name, destination in path_moves.items():
        if old_name in after:
            after = after.replace(old_name, replacement_for(file, destination))
    for old_name, destination in GENERIC_TARGETS.items():
        if old_name in after:
            after = after.replace(old_name, replacement_for(file, destination))
    if relative_file(file).as_posix() == ".github/workflows/pages.yml":
        after = after.replace('"RELEASE_NOTES_*.md"', '"docs/releases/**"')
    if relative_file(file).as_posix() == ".github/workflows/release.yml":
        after = after.replace(
            '"RELEASE_NOTES_$version.md"',
            '"docs/releases/$version/RELEASE_NOTES.md"',
        )
    if after != before:
        file.write_text(after, encoding="utf-8")
        changed_files.append(relative_file(file).as_posix())

consistency_path = Path("scripts/check-release-consistency.cjs")
consistency = consistency_path.read_text(encoding="utf-8")
marker = "  const forbiddenRootDocuments = fs.readdirSync(root)"
if marker not in consistency:
    needle = (
        "  if (!semver) fail(`package.json has invalid SemVer "
        "${JSON.stringify(version)}`);\n"
    )
    block = """
  const forbiddenRootDocuments = fs.readdirSync(root)
    .filter((name) => /^(?:RELEASE_NOTES|RELEASE_VERIFICATION|SECURITY_REVIEW)_\d+\.\d+\.\d+\.md$/.test(name)
      || name === "RELEASE_HISTORY.md"
      || name === "ROADMAP.md");
  if (forbiddenRootDocuments.length) {
    fail(`repository root contains misplaced documentation: ${forbiddenRootDocuments.join(", ")}`);
  }
"""
    if needle not in consistency:
        raise RuntimeError("unable to locate consistency-gate insertion point")
    consistency = consistency.replace(needle, needle + block, 1)

duplicate = """  const obsoleteCurrentVerificationPaths = [
    "docs/releases/3.2.4/RELEASE_VERIFICATION.md",
    "docs/releases/3.2.4/RELEASE_VERIFICATION.md",
  ];"""
consistency = consistency.replace(
    duplicate,
    """  const obsoleteCurrentVerificationPaths = [
    "docs/releases/3.2.4/RELEASE_VERIFICATION.md",
  ];""",
)
consistency_path.write_text(consistency, encoding="utf-8")

test_path = Path("test/release-consistency.test.cjs")
test_source = test_path.read_text(encoding="utf-8")
test_name = "release consistency gate rejects versioned documents in the repository root"
if test_name not in test_source:
    test_source += f"""

test("{test_name}", () => {{
  withFixture((fixture) => {{
    fs.writeFileSync(path.join(fixture, "RELEASE_NOTES_9.9.9.md"), "# misplaced\\n", "utf8");
    assert.throws(() => checkReleaseConsistency(fixture), /repository root contains misplaced documentation/);
  }});
}});
"""
    test_path.write_text(test_source, encoding="utf-8")

versions = sorted(
    [
        directory.name
        for directory in RELEASE_ROOT.iterdir()
        if directory.is_dir() and re.fullmatch(r"\d+\.\d+\.\d+", directory.name)
    ],
    key=lambda value: tuple(int(part) for part in value.split(".")),
    reverse=True,
)
current_version = json.loads(Path("package.json").read_text(encoding="utf-8"))["version"]
index = [
    "# Nexora release documentation",
    "",
    "Release-specific documents are grouped by semantic version. The repository root contains only project-level entry points and community files.",
    "",
    "The canonical chronological history remains [`CHANGELOG.md`](../../CHANGELOG.md). Machine-readable publication evidence remains under [`release-evidence/`](../../release-evidence/).",
    "",
    "## Release index",
    "",
    "| Version | Notes | Verification | Security review | Evidence |",
    "|---|---|---|---|---|",
]
for version in versions:
    directory = RELEASE_ROOT / version
    notes = (
        f"[Release notes]({version}/RELEASE_NOTES.md)"
        if (directory / "RELEASE_NOTES.md").exists()
        else "—"
    )
    verification = (
        f"[Verification]({version}/RELEASE_VERIFICATION.md)"
        if (directory / "RELEASE_VERIFICATION.md").exists()
        else "—"
    )
    security = (
        f"[Security review]({version}/SECURITY_REVIEW.md)"
        if (directory / "SECURITY_REVIEW.md").exists()
        else "—"
    )
    evidence_path = Path(f"release-evidence/v{version}.json")
    if evidence_path.exists():
        evidence = f"[`v{version}.json`](../../release-evidence/v{version}.json)"
    elif version == current_version and Path("release-evidence/current.json").exists():
        evidence = "[`current.json`](../../release-evidence/current.json)"
    else:
        evidence = "—"
    index.append(
        f"| `{version}` | {notes} | {verification} | {security} | {evidence} |"
    )
index += [
    "",
    "## Repository rules",
    "",
    "1. New release documents belong in `docs/releases/<version>/`.",
    "2. Use the fixed names `RELEASE_NOTES.md`, `RELEASE_VERIFICATION.md` and `SECURITY_REVIEW.md` inside the version directory.",
    "3. Version-specific release documents, compatibility pointers and `RELEASE_HISTORY.md` are forbidden in the repository root.",
    "4. `CHANGELOG.md` is the only chronological release timeline.",
    "5. `release-evidence/` stores machine-readable publication evidence and checksums.",
    "6. Historical branch documentation remains branch-local and is not rewritten to imitate current `main`.",
    "",
    "## Adding a release",
    "",
    "Create `docs/releases/<version>/`, add the applicable fixed-name documents, update `CHANGELOG.md`, and run `npm run release:check` before publication.",
    "",
]
(RELEASE_ROOT / "README.md").write_text("\n".join(index), encoding="utf-8")

docs_readme = Path("docs/README.md")
docs_text = docs_readme.read_text(encoding="utf-8")
if "[Roadmap](ROADMAP.md)" not in docs_text:
    anchor = "| Понять продукт | [Product Overview](PRODUCT_OVERVIEW.md) |\n"
    if anchor not in docs_text:
        raise RuntimeError("unable to add roadmap to docs index")
    docs_text = docs_text.replace(
        anchor,
        anchor + "| Посмотреть план развития | [Roadmap](ROADMAP.md) |\n",
        1,
    )
    docs_readme.write_text(docs_text, encoding="utf-8")

repository_readme = Path("README.md")
readme_text = repository_readme.read_text(encoding="utf-8")
product_row = (
    "| Продукт | [Product Overview](docs/PRODUCT_OVERVIEW.md), "
    "[Current Release Status](BRANCH_STATUS.md) |"
)
if product_row in readme_text and "docs/ROADMAP.md" not in readme_text:
    readme_text = readme_text.replace(
        product_row,
        "| Продукт | [Product Overview](docs/PRODUCT_OVERVIEW.md), "
        "[Roadmap](docs/ROADMAP.md), [Current Release Status](BRANCH_STATUS.md) |",
        1,
    )
    repository_readme.write_text(readme_text, encoding="utf-8")

legacy_reference = re.compile(
    r"\b(?:RELEASE_NOTES|RELEASE_VERIFICATION|SECURITY_REVIEW)_"
    r"(?:\d+\.\d+\.\d+|<version>|\$version|\$\{version\})\.md\b"
)
violations: list[str] = []
for file in sorted(ROOT.rglob("*")):
    rel = relative_file(file) if file.is_file() else None
    if not file.is_file() or rel in WORKFLOW_FILES or rel == Path(__file__).relative_to(ROOT):
        continue
    if any(part in SKIPPED_PARTS for part in file.parts):
        continue
    if file.suffix.lower() not in TEXT_EXTENSIONS:
        continue
    try:
        source = file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    relative_name = rel.as_posix()
    if relative_name == "test/release-consistency.test.cjs":
        source = source.replace("RELEASE_NOTES_9.9.9.md", "")
    if legacy_reference.search(source):
        violations.append(relative_name)

root_violations = [
    file.name
    for file in ROOT.iterdir()
    if file.is_file()
    and (
        SOURCE_PATTERN.fullmatch(file.name)
        or file.name in {"RELEASE_HISTORY.md", "ROADMAP.md"}
    )
]
if violations or root_violations:
    raise RuntimeError(
        f"cleanup incomplete; legacy references={violations}, root files={root_violations}"
    )

print(
    json.dumps(
        {
            "moved": moved,
            "reference_updates": sorted(set(changed_files)),
            "release_versions": versions,
        },
        ensure_ascii=False,
        indent=2,
    )
)
