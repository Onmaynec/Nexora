import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flattenSearch, navigation, pageById, pageForVersion, pages } from "../src/content.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const meta = { currentVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version };

function blocksFor(version) {
  return pages.flatMap((page) => pageForVersion(page, version).sections || []).flatMap((section) => section.blocks || []);
}

test("roadmap route is navigable and sourced from ROADMAP.md", () => {
  assert.ok(navigation.find((group) => group.id === "releases")?.items.includes("roadmap"));
  const page = pageById.get("roadmap");
  assert.equal(page.sourcePath, "ROADMAP.md");
  assert.ok(page.sections.some((section) => section.id === "sequence"));
});

test("version selector changes page content and search applicability", () => {
  const v31 = pageForVersion(pageById.get("api-v4"), "3.1");
  const v33 = pageForVersion(pageById.get("api-v4"), "3.3");
  assert.equal(v31.sections.length, 1);
  assert.equal(v31.sections[0].id, "version-applicability");
  assert.ok(v33.sections.some((section) => section.id === "routes"));

  const search31 = flattenSearch("en", meta, "3.1").find((entry) => entry.id === "api-v4");
  const search33 = flattenSearch("en", meta, "3.3").find((entry) => entry.id === "api-v4");
  assert.ok(search31.haystack.includes("unavailable"));
  assert.ok(search33.haystack.includes("keypackage"));
});

test("figures are local, bilingual and dimensioned", () => {
  const figures = blocksFor("3.3").filter((block) => ["image", "figure"].includes(block.type));
  assert.ok(figures.length >= 10);
  for (const figure of figures) {
    assert.match(figure.src, /^docs-media\/.+\.(svg|png|webp)$/);
    assert.ok(figure.alt?.ru && figure.alt?.en);
    assert.ok(figure.caption?.ru && figure.caption?.en);
    assert.ok(Number.isInteger(figure.width) && figure.width > 0);
    assert.ok(Number.isInteger(figure.height) && figure.height > 0);
    assert.ok(fs.existsSync(path.join(appRoot, "public", figure.src)));
  }
});

test("documentation contains required visual and operational depth", () => {
  const currentPages = pages.map((page) => pageForVersion(page, "3.3"));
  const diagrams = currentPages.flatMap((page) => page.sections || []).flatMap((section) => section.blocks || []).filter((block) => block.type === "mermaid");
  const examples = currentPages.flatMap((page) => page.sections || []).filter((section) => section.exampleId);
  const runbooks = currentPages.flatMap((page) => page.sections || []).filter((section) => section.runbook);
  assert.ok(diagrams.length >= 16);
  assert.ok(examples.length >= 12);
  assert.ok(runbooks.length >= 8);
});

test("figure renderer keeps strict local media and lazy loading", () => {
  const source = fs.readFileSync(path.join(appRoot, "src", "components", "ContentBlocks.jsx"), "utf8");
  assert.match(source, /LOCAL_MEDIA/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /decoding="async"/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("roadmap content order matches authoritative ROADMAP.md", () => {
  const roadmapText = fs.readFileSync(path.join(repoRoot, "ROADMAP.md"), "utf8");
  const expected = [...roadmapText.matchAll(/^\|\s*(3\.(?:4|5|6|7|8|9|10|11)\.0|4\.0\.0)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map((match) => [match[1], match[2].trim()]);
  const page = pageForVersion(pageById.get("roadmap"), "3.3");
  const table = page.sections.find((section) => section.id === "sequence").blocks.find((block) => block.type === "table");
  const actual = table.rows.map((row) => [String(row[0]), String(row[1])]);
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
