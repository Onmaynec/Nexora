import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { navigation, pages, pageById } from "../src/content.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const errors = [];
const ids = new Set();

for (const page of pages) {
  if (ids.has(page.id)) errors.push(`Duplicate page id: ${page.id}`);
  ids.add(page.id);
  if (!page.title?.ru || !page.title?.en) errors.push(`Missing bilingual title: ${page.id}`);
  if (!page.description?.ru || !page.description?.en) errors.push(`Missing bilingual description: ${page.id}`);
  const sectionIds = new Set();
  for (const section of page.sections || []) {
    if (sectionIds.has(section.id)) errors.push(`Duplicate section id: ${page.id}#${section.id}`);
    sectionIds.add(section.id);
    if (!section.title?.ru || !section.title?.en) errors.push(`Missing bilingual section title: ${page.id}#${section.id}`);
  }
}

for (const group of navigation) {
  if (!group.title?.ru || !group.title?.en) errors.push(`Missing bilingual navigation title: ${group.id}`);
  for (const id of group.items) if (!pageById.has(id)) errors.push(`Navigation target does not exist: ${id}`);
}

if (pages.length < 25) errors.push(`Expected at least 25 documentation pages, found ${pages.length}`);
const navIds = navigation.flatMap((group) => group.items);
if (navIds.length !== new Set(navIds).size) errors.push("Navigation contains duplicate page targets");

const source = fs.readFileSync(path.join(appRoot, "src", "content.mjs"), "utf8");
for (const forbidden of ["TODO:", "FIXME:", "lorem ipsum", "example.com"]) {
  if (source.toLowerCase().includes(forbidden.toLowerCase())) errors.push(`Forbidden placeholder marker: ${forbidden}`);
}

const reference = JSON.parse(fs.readFileSync(path.join(appRoot, "src", "generated", "reference.json"), "utf8"));
if (!Array.isArray(reference.routes) || reference.routes.length < 8) errors.push("Generated API reference is unexpectedly empty");
if (!Array.isArray(reference.events) || reference.events.length < 3) errors.push("Generated Socket.IO reference is unexpectedly empty");

const packagePath = path.join(repoRoot, "package.json");
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (reference.currentVersion !== pkg.version) errors.push(`Reference version ${reference.currentVersion} != package version ${pkg.version}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Advanced documentation validation passed: ${pages.length} pages, ${reference.routes.length} routes, ${reference.events.length} events.`);
