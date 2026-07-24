import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { navigation, pages, pageById, pageForVersion } from "../src/content.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const publicRoot = path.join(appRoot, "public");
const errors = [];
const ids = new Set();
const blockCounts = { mermaid: 0, image: 0, examples: 0, runbooks: 0 };
const mediaFiles = new Set();

function bilingual(value) {
  return Boolean(value && typeof value === "object" && String(value.ru || "").trim() && String(value.en || "").trim());
}

function validateBlock(pageId, sectionId, block, version) {
  const key = `${pageId}#${sectionId}@${version}`;
  if (block.type === "paragraph" && !bilingual(block.text)) errors.push(`Missing bilingual paragraph: ${key}`);
  if (["bullets", "steps"].includes(block.type) && (!Array.isArray(block.items?.ru) || !Array.isArray(block.items?.en))) errors.push(`Missing bilingual items: ${key}`);
  if (block.type === "callout" && (!bilingual(block.title) || !bilingual(block.text))) errors.push(`Missing bilingual callout: ${key}`);
  if (block.type === "mermaid") {
    if (!String(block.value || "").trim()) errors.push(`Empty Mermaid diagram: ${key}`);
    if (!bilingual(block.caption)) errors.push(`Missing bilingual Mermaid caption: ${key}`);
  }
  if (["image", "figure"].includes(block.type)) {
    if (!bilingual(block.alt) || !bilingual(block.caption)) errors.push(`Missing bilingual image alt/caption: ${key}`);
    if (!/^[a-z0-9][a-z0-9._/-]*\.(svg|png|webp)$/i.test(block.src || "")) errors.push(`Unsafe or remote image src: ${key} -> ${block.src}`);
    if (!Number.isInteger(block.width) || !Number.isInteger(block.height) || block.width < 1 || block.height < 1) errors.push(`Missing image dimensions: ${key}`);
    const full = path.resolve(publicRoot, block.src || "");
    if (!full.startsWith(`${publicRoot}${path.sep}`)) errors.push(`Image escapes public root: ${key}`);
    else if (!fs.existsSync(full)) errors.push(`Missing image asset: ${block.src}`);
    else {
      mediaFiles.add(full);
      if (fs.statSync(full).size > 500 * 1024) errors.push(`Image exceeds 500 KB: ${block.src}`);
    }
  }
  if (block.type === "table") {
    if (!Array.isArray(block.headers) || !Array.isArray(block.rows)) errors.push(`Invalid table: ${key}`);
  }
}

for (const page of pages) {
  if (ids.has(page.id)) errors.push(`Duplicate page id: ${page.id}`);
  ids.add(page.id);
  if (!bilingual(page.title)) errors.push(`Missing bilingual title: ${page.id}`);
  if (!bilingual(page.description)) errors.push(`Missing bilingual description: ${page.id}`);
  if (page.sourcePath && !fs.existsSync(path.join(repoRoot, page.sourcePath))) errors.push(`Missing sourcePath: ${page.id} -> ${page.sourcePath}`);

  for (const version of ["3.1", "3.2", "3.3"]) {
    const view = pageForVersion(page, version);
    const sectionIds = new Set();
    for (const section of view.sections || []) {
      if (sectionIds.has(section.id)) errors.push(`Duplicate section id: ${page.id}#${section.id}@${version}`);
      sectionIds.add(section.id);
      if (!bilingual(section.title)) errors.push(`Missing bilingual section title: ${page.id}#${section.id}@${version}`);
      for (const block of section.blocks || []) validateBlock(page.id, section.id, block, version);
    }
  }

  const current = pageForVersion(page, "3.3");
  for (const section of current.sections || []) {
    if (section.runbook) blockCounts.runbooks += 1;
    if (section.exampleId) blockCounts.examples += 1;
    for (const block of section.blocks || []) {
      if (block.type === "mermaid") blockCounts.mermaid += 1;
      if (["image", "figure"].includes(block.type)) blockCounts.image += 1;
    }
  }
}

for (const group of navigation) {
  if (!bilingual(group.title)) errors.push(`Missing bilingual navigation title: ${group.id}`);
  for (const id of group.items) if (!pageById.has(id)) errors.push(`Navigation target does not exist: ${id}`);
}

if (pages.length < 30) errors.push(`Expected at least 30 documentation pages, found ${pages.length}`);
const navIds = navigation.flatMap((group) => group.items);
if (navIds.length !== new Set(navIds).size) errors.push("Navigation contains duplicate page targets");
if (!navIds.includes("roadmap")) errors.push("Roadmap page is missing from navigation");
if (blockCounts.mermaid < 16) errors.push(`Expected at least 16 Mermaid diagrams, found ${blockCounts.mermaid}`);
if (blockCounts.image < 10) errors.push(`Expected at least 10 local illustrations, found ${blockCounts.image}`);
if (blockCounts.examples < 12) errors.push(`Expected at least 12 curated API examples, found ${blockCounts.examples}`);
if (blockCounts.runbooks < 8) errors.push(`Expected at least 8 runbooks, found ${blockCounts.runbooks}`);

const totalMediaBytes = [...mediaFiles].reduce((total, file) => total + fs.statSync(file).size, 0);
if (totalMediaBytes > 8 * 1024 * 1024) errors.push(`Documentation media exceeds 8 MB: ${totalMediaBytes}`);

const source = fs.readFileSync(path.join(appRoot, "src", "content.mjs"), "utf8");
for (const forbidden of ["TODO:", "FIXME:", "lorem ipsum", "dangerouslySetInnerHTML"]) {
  if (source.toLowerCase().includes(forbidden.toLowerCase())) errors.push(`Forbidden marker in content model: ${forbidden}`);
}

const reference = JSON.parse(fs.readFileSync(path.join(appRoot, "src", "generated", "reference.json"), "utf8"));
if (!Array.isArray(reference.routes) || reference.routes.length < 8) errors.push("Generated API reference is unexpectedly empty");
if (!Array.isArray(reference.events) || reference.events.length < 3) errors.push("Generated Socket.IO reference is unexpectedly empty");

const packagePath = path.join(repoRoot, "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
if (reference.currentVersion !== pkg.version) errors.push(`Reference version ${reference.currentVersion} != package version ${pkg.version}`);
const releasesSource = fs.readFileSync(path.join(appRoot, "src", "content-data", "releases.json"), "utf8");
if (releasesSource.includes(`"${pkg.version}"`)) errors.push("releases.json hardcodes the current patch; use {{version}}");

const roadmapText = fs.readFileSync(path.join(repoRoot, "docs/ROADMAP.md"), "utf8");
const expectedRoadmap = [...roadmapText.matchAll(/^\|\s*(3\.(?:4|5|6|7|8|9|10|11)\.0|4\.0\.0)\s*\|\s*([^|]+?)\s*\|/gm)]
  .map((match) => [match[1], match[2].trim()]);
const roadmapPage = pageForVersion(pageById.get("roadmap"), "3.3");
const roadmapTable = roadmapPage.sections.find((section) => section.id === "sequence")?.blocks.find((block) => block.type === "table");
const actualRoadmap = (roadmapTable?.rows || []).map((row) => [String(row[0]), String(row[1])]);
if (JSON.stringify(actualRoadmap) !== JSON.stringify(expectedRoadmap)) errors.push("Roadmap page versions/names/order drift from docs/ROADMAP.md");

const view31 = pageForVersion(pageById.get("api-v4"), "3.1");
if (!JSON.stringify(view31).includes("version-applicability")) errors.push("API v4 is not blocked in the 3.1.x view");
const search31 = pages.map((page) => pageForVersion(page, "3.1")).flatMap((page) => page.sections || []);
if (search31.some((section) => section.lines?.includes("3.3"))) errors.push("3.1.x view includes a 3.3-only section");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Advanced documentation validation passed: ${pages.length} pages, ${blockCounts.mermaid} diagrams, ${blockCounts.image} illustrations, ${blockCounts.examples} API examples, ${blockCounts.runbooks} runbooks.`);
