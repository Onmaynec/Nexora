import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "styles.css"), "utf8");
const app = await readFile(path.join(root, "app.js"), "utf8");
const gameHtml = await readFile(path.join(root, "game", "index.html"), "utf8");
const gameCss = await readFile(path.join(root, "game", "game.css"), "utf8");
const gameApp = await readFile(path.join(root, "game", "game.js"), "utf8");

const requiredIds = ["main", "product", "architecture", "trust", "downloads", "docs"];
const requiredFiles = [
  "styles.css",
  "app.js",
  "assets/nexora-icon.png",
  "robots.txt",
  "game/index.html",
  "game/game.css",
  "game/game.js",
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
  "href=\"game/\"",
  "data-header-stars-value",
];
const requiredGameMarkers = [
  "id=\"game-canvas\"",
  "data-mode=\"sandbox\"",
  "data-mode=\"game\"",
  "data-tool=\"blackHole\"",
  "data-tool=\"planet\"",
  "data-tool=\"predator\"",
  "data-settings-open",
  "data-setting=\"particleCount\"",
  "data-setting=\"cursorMode\"",
  "data-setting=\"quality\"",
  "data-export-config",
  "data-import-config",
];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required section #${id}`);
}
for (const marker of requiredRuntimeMarkers) {
  if (!html.includes(marker)) throw new Error(`Missing runtime marker: ${marker}`);
}
for (const marker of requiredGameMarkers) {
  if (!gameHtml.includes(marker)) throw new Error(`Missing game runtime marker: ${marker}`);
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
if (!gameApp.includes("class AetherEngine") || !gameApp.includes("class Particle")) {
  throw new Error("Aether game engine is missing");
}
if (!gameApp.includes('ru: {') || !gameApp.includes('en: {')) throw new Error("Game RU/EN dictionaries are missing");
if (!gameApp.includes("localStorage") || !gameApp.includes("sanitizeSettings")) {
  throw new Error("Safe persistent game settings are missing");
}
if (!gameCss.includes("prefers-reduced-motion") || !gameCss.includes("@media (max-width: 720px)")) {
  throw new Error("Game adaptive fallbacks are missing");
}
if (/<script[^>]+src=["']https?:/i.test(html) || /<link[^>]+href=["']https?:/i.test(html)) {
  throw new Error("External runtime scripts or styles are not allowed");
}
if (/<script[^>]+src=["']https?:/i.test(gameHtml) || /<link[^>]+href=["']https?:/i.test(gameHtml)) {
  throw new Error("External game runtime scripts or styles are not allowed");
}

const syntax = spawnSync(process.execPath, ["--check", path.join(root, "game", "game.js")], {
  encoding: "utf8",
});
if (syntax.status !== 0) {
  throw new Error(`Aether game JavaScript syntax check failed:\n${syntax.stderr || syntax.stdout}`);
}

const ids = [...gameHtml.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate game IDs: ${[...new Set(duplicateIds)].join(", ")}`);

console.log("Nexora website validation passed.");