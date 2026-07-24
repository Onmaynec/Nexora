import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  contentSourcePages,
  flattenSearch,
  navigation,
  pages,
  pageById,
  pageForVersion,
  pagesForVersion,
  versionLines,
} from "../src/content.mjs";
import { hasUnsafeDocumentationSvgContent, isSafeDocumentationMediaPath } from "../src/media-path.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const publicRoot = path.join(appRoot, "public");
const errors = [];
const ids = new Set();
const knownLines = new Set(versionLines.map((line) => line.id));
const allowedBlockTypes = new Set(["paragraph", "bullets", "steps", "code", "callout", "table", "mermaid", "image", "figure"]);
const blockCounts = { mermaid: 0, image: 0, examples: 0, runbooks: 0 };
const mediaFiles = new Set();

function bilingual(value) {
  return Boolean(value && typeof value === "object" && String(value.ru || "").trim() && String(value.en || "").trim());
}

function compareLines(left, right) {
  const [leftMajor, leftMinor] = String(left).split(".").map(Number);
  const [rightMajor, rightMinor] = String(right).split(".").map(Number);
  return leftMajor === rightMajor ? leftMinor - rightMinor : leftMajor - rightMajor;
}

function validateApplicability(item, key) {
  if (item.lines !== undefined) {
    if (!Array.isArray(item.lines) || item.lines.length === 0) errors.push(`Invalid lines metadata: ${key}`);
    else for (const line of item.lines) if (!knownLines.has(line)) errors.push(`Unknown version line ${line}: ${key}`);
  }
  for (const property of ["since", "until"]) {
    if (item[property] !== undefined && !knownLines.has(item[property])) errors.push(`Unknown ${property} line ${item[property]}: ${key}`);
  }
  if (item.since && item.until && compareLines(item.since, item.until) > 0) errors.push(`Invalid version range: ${key}`);
}

function isSafeRepositoryPath(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\") || value.includes("?") || value.includes("#")) return false;
  const segments = value.split("/");
  return segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}

function validateSvgAsset(full, src, key) {
  const svg = fs.readFileSync(full, "utf8");
  if (hasUnsafeDocumentationSvgContent(svg)) errors.push(`Unsafe executable, external or malformed SVG content: ${key} -> ${src}`);
}

function validateBlock(pageId, sectionId, block, version) {
  const key = `${pageId}#${sectionId}@${version}`;
  validateApplicability(block, key);
  if (!allowedBlockTypes.has(block.type)) errors.push(`Unsupported block type ${block.type}: ${key}`);
  if (block.type === "paragraph" && !bilingual(block.text)) errors.push(`Missing bilingual paragraph: ${key}`);
  if (["bullets", "steps"].includes(block.type) && (!Array.isArray(block.items?.ru) || !Array.isArray(block.items?.en))) errors.push(`Missing bilingual items: ${key}`);
  if (block.type === "callout" && (!bilingual(block.title) || !bilingual(block.text))) errors.push(`Missing bilingual callout: ${key}`);
  if (block.type === "mermaid") {
    if (!String(block.value || "").trim()) errors.push(`Empty Mermaid diagram: ${key}`);
    if (!bilingual(block.caption)) errors.push(`Missing bilingual Mermaid caption: ${key}`);
  }
  if (["image", "figure"].includes(block.type)) {
    if (!bilingual(block.alt) || !bilingual(block.caption)) errors.push(`Missing bilingual image alt/caption: ${key}`);
    const safePath = isSafeDocumentationMediaPath(block.src);
    if (!safePath) errors.push(`Unsafe or remote image src: ${key} -> ${block.src}`);
    if (!Number.isInteger(block.width) || !Number.isInteger(block.height) || block.width < 1 || block.height < 1) errors.push(`Missing image dimensions: ${key}`);
    if (safePath) {
      const full = path.resolve(publicRoot, block.src);
      if (!full.startsWith(`${publicRoot}${path.sep}`)) errors.push(`Image escapes public root: ${key}`);
      else if (!fs.existsSync(full) || !fs.statSync(full).isFile()) errors.push(`Missing image asset: ${block.src}`);
      else {
        mediaFiles.add(full);
        if (fs.statSync(full).size > 500 * 1024) errors.push(`Image exceeds 500 KB: ${block.src}`);
        if (path.extname(full).toLowerCase() === ".svg") validateSvgAsset(full, block.src, key);
      }
    }
  }
  if (block.type === "table" && (!Array.isArray(block.headers) || !Array.isArray(block.rows))) errors.push(`Invalid table: ${key}`);
}

for (const page of contentSourcePages) {
  if (ids.has(page.id)) errors.push(`Duplicate page id: ${page.id}`);
  ids.add(page.id);
  if (!bilingual(page.title)) errors.push(`Missing bilingual title: ${page.id}`);
  if (!bilingual(page.description)) errors.push(`Missing bilingual description: ${page.id}`);
  validateApplicability(page, page.id);
  if (page.sourcePath) {
    if (!isSafeRepositoryPath(page.sourcePath)) errors.push(`Unsafe sourcePath: ${page.id} -> ${page.sourcePath}`);
    else {
      const sourcePath = path.resolve(repoRoot, page.sourcePath);
      if (!sourcePath.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) errors.push(`Missing sourcePath: ${page.id} -> ${page.sourcePath}`);
    }
  }

  const rawSectionIds = new Set();
  for (const section of page.sections || []) {
    if (rawSectionIds.has(section.id)) errors.push(`Duplicate raw section id: ${page.id}#${section.id}`);
    rawSectionIds.add(section.id);
    if (!bilingual(section.title)) errors.push(`Missing bilingual section title: ${page.id}#${section.id}`);
    validateApplicability(section, `${page.id}#${section.id}`);
    for (const block of section.blocks || []) validateBlock(page.id, section.id, block, "raw");
  }

  for (const version of knownLines) {
    const view = pageForVersion(page, version);
    const sectionIds = new Set();
    for (const section of view.sections || []) {
      if (sectionIds.has(section.id)) errors.push(`Duplicate section id: ${page.id}#${section.id}@${version}`);
      sectionIds.add(section.id);
      if (!bilingual(section.title)) errors.push(`Missing bilingual section title: ${page.id}#${section.id}@${version}`);
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

for (const page of pagesForVersion("3.3")) {
  for (const section of page.sections || []) {
    if (section.runbook) blockCounts.runbooks += 1;
    if (section.exampleId) blockCounts.examples += 1;
    for (const block of section.blocks || []) {
      if (block.type === "mermaid") blockCounts.mermaid += 1;
      if (["image", "figure"].includes(block.type)) blockCounts.image += 1;
    }
  }
}
if (blockCounts.mermaid < 16) errors.push(`Expected at least 16 Mermaid diagrams, found ${blockCounts.mermaid}`);
if (blockCounts.image < 10) errors.push(`Expected at least 10 local illustrations, found ${blockCounts.image}`);
if (blockCounts.examples < 12) errors.push(`Expected at least 12 curated API examples, found ${blockCounts.examples}`);
if (blockCounts.runbooks < 8) errors.push(`Expected at least 8 runbooks, found ${blockCounts.runbooks}`);

const line31Ids = new Set(pagesForVersion("3.1").map((page) => page.id));
for (const forbidden of ["api-v4", "trust-mls", "pulse-cloud"]) {
  if (line31Ids.has(forbidden)) errors.push(`3.1.x navigation exposes ${forbidden}`);
}
const line32Ids = new Set(pagesForVersion("3.2").map((page) => page.id));
if (line32Ids.has("pulse-cloud")) errors.push("3.2.x navigation exposes pulse-cloud");
const search31Ids = new Set(flattenSearch("en", { currentVersion: "validation" }, "3.1").map((entry) => entry.id));
for (const forbidden of ["api-v4", "trust-mls", "pulse-cloud"]) {
  if (search31Ids.has(forbidden)) errors.push(`3.1.x search exposes ${forbidden}`);
}

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
const releasePage = pageForVersion(pageById.get("releases"), "3.3");
const classification = releasePage.sections.find((section) => section.id === "classification")?.blocks.find((block) => block.type === "table");
if (classification?.rows?.[0]?.[0] !== "{{version}}") errors.push("Current release classification must use {{version}}");
const releasesSource = fs.readFileSync(path.join(appRoot, "src", "content-data", "releases.json"), "utf8");
if (releasesSource.includes(`"${pkg.version}"`)) errors.push("releases.json hardcodes the current patch; use {{version}}");
for (const mediaFile of mediaFiles) {
  if (path.extname(mediaFile).toLowerCase() === ".svg" && fs.readFileSync(mediaFile, "utf8").includes(pkg.version)) {
    errors.push(`Media asset hardcodes current patch ${pkg.version}: ${path.relative(publicRoot, mediaFile)}`);
  }
}

const roadmapPath = path.join(repoRoot, "docs", "ROADMAP.md");
const roadmapText = fs.readFileSync(roadmapPath, "utf8");
const expectedRoadmap = roadmapText.split(/\r?\n/).map((line) => {
  const match = line.match(/^\|\s*(3\.(?:4|5|6|7|8|9|10|11)\.0|4\.0\.0)\s*\|\s*([^|]+?)\s*\|[^|]*\|\s*([^|]+?)\s*\|$/);
  return match ? [match[1], match[2].trim(), match[3].trim()] : null;
}).filter(Boolean);
const roadmapPage = pageForVersion(pageById.get("roadmap"), "3.3");
if (roadmapPage.sourcePath !== "docs/ROADMAP.md") errors.push("Roadmap sourcePath must be docs/ROADMAP.md");
const roadmapTable = roadmapPage.sections.find((section) => section.id === "sequence")?.blocks.find((block) => block.type === "table");
const actualRoadmap = (roadmapTable?.rows || []).map((row) => [String(row[0]), String(row[1]), String(row[3])]);
if (JSON.stringify(actualRoadmap) !== JSON.stringify(expectedRoadmap)) errors.push("Roadmap page version/name/dependency order drifts from docs/ROADMAP.md");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Advanced documentation validation passed: ${pages.length} pages, ${blockCounts.mermaid} diagrams, ${blockCounts.image} illustrations, ${blockCounts.examples} API examples, ${blockCounts.runbooks} runbooks.`);
