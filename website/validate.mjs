import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "styles.css"), "utf8");
const app = await readFile(path.join(root, "app.js"), "utf8");

const requiredIds = ["main", "product", "architecture", "trust", "downloads", "docs"];
const requiredFiles = [
  "styles.css",
  "app.js",
  "assets/nexora-icon.png",
  "robots.txt",
];
const requiredRuntimeMarkers = [
  "data-aether",
  "data-release-select",
  "data-activity-chart",
  "data-lang=\"ru\"",
  "data-lang=\"en\"",
  "data-download-link=\"client\"",
  "data-download-link=\"server\"",
  "data-download-link=\"pwa\"",
  "data-download-link=\"android\"",
];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required section #${id}`);
}
for (const marker of requiredRuntimeMarkers) {
  if (!html.includes(marker)) throw new Error(`Missing runtime marker: ${marker}`);
}
for (const file of requiredFiles) {
  const info = await stat(path.join(root, file));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty file: ${file}`);
}

if (!html.includes("https://github.com/Onmaynec/Nexora")) throw new Error("Repository link is missing");
if (!html.includes("assets/nexora-icon.png")) throw new Error("Canonical Nexora icon is not linked");
if (!app.includes("class AetherField")) throw new Error("Interactive Canvas background is missing");
if (!app.includes("raw.githubusercontent.com") || !app.includes("/releases?per_page=")) {
  throw new Error("Live GitHub release/version integration is missing");
}
if (!app.includes('ru: {') || !app.includes('en: {')) throw new Error("RU/EN dictionaries are missing");
if (!css.includes("@media (hover: none)") || !css.includes("prefers-reduced-motion")) {
  throw new Error("Adaptive motion fallbacks are missing");
}
if (/<script[^>]+src=["']https?:/i.test(html) || /<link[^>]+href=["']https?:/i.test(html)) {
  throw new Error("External runtime scripts or styles are not allowed");
}

console.log("Nexora website validation passed.");
