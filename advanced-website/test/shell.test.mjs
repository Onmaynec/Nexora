import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const app = fs.readFileSync(path.join(appRoot, "src", "App.jsx"), "utf8");
const aether = fs.readFileSync(path.join(appRoot, "src", "components", "AetherField.jsx"), "utf8");
const blocks = fs.readFileSync(path.join(appRoot, "src", "components", "ContentBlocks.jsx"), "utf8");
const styles = fs.readFileSync(path.join(appRoot, "src", "styles.css"), "utf8");
const workflowMarkers = ["SearchDialog", "TableOfContents", "ReferenceInventory", "ReleasePanel", "versionLines"];

test("documentation shell includes required advanced portal features", () => {
  for (const marker of workflowMarkers) assert.match(app, new RegExp(marker));
  assert.match(app, /metaKey.*ctrlKey|ctrlKey.*metaKey/s);
  assert.match(blocks, /Edit on GitHub|Изменить на GitHub/);
  assert.match(app, /api\.github\.com\/repos/);
  assert.match(blocks, /navigator\.clipboard\.writeText/);
  assert.match(blocks, /window\.mermaid/);
});

test("interactive background is bounded and respects reduced motion", () => {
  assert.match(aether, /MAX_PARTICLES/);
  assert.match(aether, /prefers-reduced-motion/);
  assert.match(aether, /CELL_SIZE/);
  assert.doesNotMatch(aether, /for \(let b = a/);
});

test("responsive and accessible states are defined", () => {
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.skip-link/);
});
