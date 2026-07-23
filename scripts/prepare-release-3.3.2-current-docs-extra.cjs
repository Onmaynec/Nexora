"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function replaceInFile(relativePath, replacements) {
  const file = path.join(root, relativePath);
  let source = fs.readFileSync(file, "utf8");
  for (const [before, after] of replacements) {
    source = source.split(before).join(after);
  }
  fs.writeFileSync(file, source, "utf8");
}

const contributingPath = path.join(root, "CONTRIBUTING.md");
const contributing = fs.readFileSync(contributingPath, "utf8");
const currentBefore = "| Repository version | `3.3.1` |";
const currentAfter = "| Repository version | `3.3.2` |";
if (contributing.includes(currentBefore)) {
  fs.writeFileSync(contributingPath, contributing.replace(currentBefore, currentAfter), "utf8");
} else if (!contributing.includes(currentAfter)) {
  throw new Error("CONTRIBUTING.md does not contain a recognized current version marker");
}

const currentDocuments = [
  "README.md",
  "PROJECT_INDEX.md",
  "docs/README.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "android/README.md",
  "SECURITY.md",
  "SECURITY_AUDIT.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "ADMIN_GUIDE.md",
  "TESTER_GUIDE.md",
  "BRANCH_STATUS.md",
  "BRANCHES.md",
  "docs/PRODUCT_OVERVIEW.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/DEPLOYMENT.md",
  "docs/RELEASE_POLICY.md",
  "docs/GITHUB_RELEASE.md",
  "docs/RELEASE_CHECKLIST.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  "website/index.html",
  "website/app.js",
  "website/site-fixes.js",
];

for (const relativePath of currentDocuments) {
  replaceInFile(relativePath, [
    ["RELEASE_VERIFICATION_3.2.4.md", "RELEASE_VERIFICATION_3.3.2.md"],
    ["Release Verification 3.2.4", "Release Verification 3.3.2"],
  ]);
}

replaceInFile("TESTER_GUIDE.md", [
  ["previous signed Client → signed 3.2.4", "previous signed Client → signed 3.3.2"],
  ["## 19. Server console 3.2.4", "## 19. Server console 3.3.0+"],
  ["### 3.1.x → 3.2.4", "### 3.1.x → 3.3.2"],
  ["### 3.2.0–3.2.3 → 3.2.4", "### 3.2.0–3.3.1 → 3.3.2"],
]);

const canonicalChangelog = execFileSync("git", ["show", "origin/main:CHANGELOG.md"], {
  cwd: root,
  encoding: "utf8",
});
const startAnchor = "## [3.3.2] — 2026-07-23";
const endAnchor = "## [3.3.1] — 2026-07-23";
const start = canonicalChangelog.indexOf(startAnchor);
const end = canonicalChangelog.indexOf(endAnchor);
if (start < 0 || end <= start) throw new Error("Canonical CHANGELOG.md anchors were not found");

const currentSection = `## [3.3.2] — 2026-07-23

### Исправлено

- version metadata, current documentation и release evidence приведены к одному источнику истины;
- current-ссылки на устаревшую Release Verification 3.2.4 заменены актуальными;
- Architecture, Security Model, Android README, Project Index, Security/Support policies, Admin/Tester/Deployment/Operations guides, Product Overview, Release Policy/Checklist, branch index, issue template и публичный сайт больше не содержат противоречивых current claims;
- current feature baselines, ранее ошибочно обозначенные как текущая версия 3.2.4, нормализованы как линия 3.3.0+ при сохранении исторических release-specific документов.

### CI и выпуск

- добавлен release consistency gate для package, lockfile, Android metadata, Client handshake, 24 current documentation surfaces, website fallbacks и release evidence;
- добавлены негативные регрессии для Android version drift, stale Security Policy и устаревшей current verification-ссылки;
- release evidence workflow скачивает опубликованные Client, Server, Android и PWA assets, проверяет SHA-256, PE/ZIP integrity и обязательное содержимое;
- \`CHANGELOG.md\` закреплён как единственный канонический release history, а \`RELEASE_HISTORY.md\` оставлен указателем.

### Организационная очистка

- конфликтующие устаревшие PR #30 и #31 закрыты;
- obsolete automation PR #6 и #7 закрыты;
- экспериментальный Rust/OpenMLS PR #11 закрыт как superseded отдельным текущим JavaScript/\`ts-mls\` Trust/MLS-контуром.

### Совместимость

- schema 8, API v3 и Trust/MLS API v4 сохранены;
- runtime code, зависимости, migrations и пользовательские функции не изменены.

`;

fs.writeFileSync(
  path.join(root, "CHANGELOG.md"),
  `${canonicalChangelog.slice(0, start)}${currentSection}${canonicalChangelog.slice(end)}`,
  "utf8",
);

console.log("Synchronized current verification links, Tester Guide baselines and canonical 3.3.2 changelog section.");
