import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "styles.css"), "utf8");
const app = await readFile(path.join(root, "app.js"), "utf8");

const requiredIds = ["main", "product", "architecture", "security", "pulse", "downloads", "docs"];
const requiredFiles = ["styles.css", "app.js", "assets/nexora-icon.png", "robots.txt"];
const requiredMarkers = [
  "data-aether",
  "data-release-select",
  "data-lang=\"ru\"",
  "data-lang=\"en\"",
  "data-current-version",
  "data-stat-ci",
  "data-download-link=\"client\"",
  "data-download-link=\"server\"",
  "data-download-link=\"pwa\"",
  "data-download-link=\"android\"",
  "data-download-link=\"source\"",
];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required section #${id}`);
}
for (const marker of requiredMarkers) {
  if (!html.includes(marker)) throw new Error(`Missing runtime marker: ${marker}`);
}
for (const file of requiredFiles) {
  const info = await stat(path.join(root, file));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty file: ${file}`);
}

if (!html.includes("https://github.com/Onmaynec/Nexora")) throw new Error("Repository link is missing");
if (!html.includes("assets/nexora-icon.png")) throw new Error("Canonical Nexora icon is not linked");
if (!html.includes("skip-link")) throw new Error("Keyboard skip link is missing");
if (!app.includes("class AetherField")) throw new Error("Interactive Canvas background is missing");
if (!app.includes("raw.githubusercontent.com") || !app.includes("/releases?per_page=")) throw new Error("Live GitHub integration is missing");
if (!app.includes("const ru = {") || !app.includes("const en = {")) throw new Error("RU/EN dictionaries are missing");
if (!app.includes("closest(\"[data-lang]\")")) throw new Error("Language controls are missing");
if (!app.toLowerCase().includes("unsigned")) throw new Error("Unsigned artifact labelling is missing");
if (!css.includes("prefers-reduced-motion") || !css.includes("pointer-events:auto") || !css.includes("overflow-wrap:anywhere")) throw new Error("Accessibility or overflow fallbacks are missing");
if (!css.includes("@media(max-width:1040px)") || !css.includes("@media(max-width:720px)")) throw new Error("Responsive boundaries are missing");
if (html.includes(">3.2.4<") || app.includes('FALLBACK_VERSION = "3.2.4"')) throw new Error("Outdated website metadata remains");

console.log("Nexora 3.3 website validation passed.");
