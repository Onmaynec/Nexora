import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flattenSearch, navigation, pageById, pageForVersion, pagesForVersion } from "../src/content.mjs";
import { hasUnsafeDocumentationSvgContent, isSafeDocumentationMediaPath } from "../src/media-path.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const meta = { currentVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version };

function blocksFor(version) {
  return pagesForVersion(version).flatMap((page) => page.sections || []).flatMap((section) => section.blocks || []);
}

test("roadmap route is navigable and sourced from docs/ROADMAP.md", () => {
  assert.ok(navigation.find((group) => group.id === "releases")?.items.includes("roadmap"));
  const page = pageById.get("roadmap");
  assert.equal(page.sourcePath, "docs/ROADMAP.md");
  assert.ok(pageForVersion(page, "3.3").sections.some((section) => section.id === "sequence"));
});

test("version selector excludes unavailable pages from navigation and search", () => {
  const v31 = pageForVersion(pageById.get("api-v4"), "3.1");
  const v33 = pageForVersion(pageById.get("api-v4"), "3.3");
  assert.equal(v31.sections.length, 1);
  assert.equal(v31.sections[0].id, "version-applicability");
  assert.ok(v33.sections.some((section) => section.id === "routes"));

  const pageIds31 = new Set(pagesForVersion("3.1").map((page) => page.id));
  assert.equal(pageIds31.has("api-v4"), false);
  assert.equal(pageIds31.has("trust-mls"), false);
  assert.equal(pageIds31.has("pulse-cloud"), false);

  const pageIds32 = new Set(pagesForVersion("3.2").map((page) => page.id));
  assert.equal(pageIds32.has("api-v4"), true);
  assert.equal(pageIds32.has("trust-mls"), true);
  assert.equal(pageIds32.has("pulse-cloud"), false);

  const search31 = flattenSearch("en", meta, "3.1");
  const search33 = flattenSearch("en", meta, "3.3");
  assert.equal(search31.find((entry) => entry.id === "api-v4"), undefined);
  assert.equal(search31.find((entry) => entry.id === "trust-mls"), undefined);
  assert.equal(search31.find((entry) => entry.id === "pulse-cloud"), undefined);
  assert.ok(search33.find((entry) => entry.id === "api-v4")?.haystack.includes("keypackage"));
});

test("figures are local, bilingual and dimensioned", () => {
  const figures = blocksFor("3.3").filter((block) => ["image", "figure"].includes(block.type));
  assert.ok(figures.length >= 10);
  for (const figure of figures) {
    assert.ok(isSafeDocumentationMediaPath(figure.src), figure.src);
    assert.ok(figure.alt?.ru && figure.alt?.en);
    assert.ok(figure.caption?.ru && figure.caption?.en);
    assert.ok(Number.isInteger(figure.width) && figure.width > 0);
    assert.ok(Number.isInteger(figure.height) && figure.height > 0);
    assert.ok(fs.existsSync(path.join(appRoot, "public", figure.src)));
  }
});

test("media paths and SVG content fail closed", () => {
  assert.equal(isSafeDocumentationMediaPath("docs-media/system-context.svg"), true);
  assert.equal(isSafeDocumentationMediaPath("docs-media/architecture/system-context.svg"), true);
  for (const value of [
    "../system-context.svg",
    "docs-media/../system-context.svg",
    "docs-media/%2e%2e/system-context.svg",
    "docs-media/system-context.svg?raw=1",
    "docs-media\\system-context.svg",
    "https://example.invalid/system-context.svg",
    "data:image/svg+xml,<svg/>",
  ]) assert.equal(isSafeDocumentationMediaPath(value), false, value);

  assert.equal(hasUnsafeDocumentationSvgContent("<svg><rect width=\"1\" height=\"1\"/></svg>"), false);
  for (const value of [
    "<svg><script>alert(1)</script></svg>",
    "<svg onload=\"alert(1)\"></svg>",
    "<svg><image href=\"https://example.invalid/a.png\"/></svg>",
    "<!DOCTYPE svg [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><svg>&xxe;</svg>",
  ]) assert.equal(hasUnsafeDocumentationSvgContent(value), true, value);
});

test("documentation contains required visual and operational depth", () => {
  const currentPages = pagesForVersion("3.3");
  const diagrams = currentPages.flatMap((page) => page.sections || []).flatMap((section) => section.blocks || []).filter((block) => block.type === "mermaid");
  const examples = currentPages.flatMap((page) => page.sections || []).filter((section) => section.exampleId);
  const runbooks = currentPages.flatMap((page) => page.sections || []).filter((section) => section.runbook);
  assert.ok(diagrams.length >= 16);
  assert.ok(examples.length >= 12);
  assert.ok(runbooks.length >= 8);
});

test("figure renderer keeps strict local media, generated metadata and lazy loading", () => {
  const source = fs.readFileSync(path.join(appRoot, "src", "components", "ContentBlocks.jsx"), "utf8");
  assert.match(source, /isSafeDocumentationMediaPath/);
  assert.match(source, /localizeCell\(block\.alt, language, meta\)/);
  assert.match(source, /renderTokens\(block\.version, meta\)/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /decoding="async"/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("application wires version into search, navigation and generated inventory", () => {
  const source = fs.readFileSync(path.join(appRoot, "src", "App.jsx"), "utf8");
  assert.match(source, /pagesForVersion\(version\)/);
  assert.match(source, /flattenSearch\(language, meta, version\)/);
  assert.match(source, /function ReferenceInventory\(\{ pageId, language, version \}\)/);
  assert.match(source, /version === "3\.1"/);
  assert.match(source, /version === "3\.2"/);
  assert.match(source, /<ReferenceInventory pageId=\{page\.id\} language=\{language\} version=\{version\} \/>/);
});

test("roadmap content matches authoritative version, name and dependency order", () => {
  const roadmapText = fs.readFileSync(path.join(repoRoot, "docs", "ROADMAP.md"), "utf8");
  const expected = roadmapText.split(/\r?\n/).map((line) => {
    const match = line.match(/^\|\s*(3\.(?:4|5|6|7|8|9|10|11)\.0|4\.0\.0)\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*([^|]+?)\s*\|$/);
    return match ? [match[1], match[2].trim(), match[3].trim()] : null;
  }).filter(Boolean);
  const page = pageForVersion(pageById.get("roadmap"), "3.3");
  const table = page.sections.find((section) => section.id === "sequence").blocks.find((block) => block.type === "table");
  const actual = table.rows.map((row) => [String(row[0]), String(row[1]), String(row[3])]);
  assert.deepEqual(actual, expected);
});

test("matrix-critical API overview and limits pages include dedicated flows", () => {
  const apiOverview = pageForVersion(pageById.get("api-overview"), "3.3");
  const limitsErrors = pageForVersion(pageById.get("limits-errors"), "3.3");
  assert.ok(apiOverview.sections.some((section) => section.id === "request-lifecycle"));
  assert.ok(apiOverview.sections.some((section) => section.id === "transport-conventions"));
  assert.ok(limitsErrors.sections.some((section) => section.id === "resource-limit-contract"));
  assert.ok(limitsErrors.sections.some((section) => section.id === "error-decision-tree"));
});
