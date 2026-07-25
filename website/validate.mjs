import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "styles.css"), "utf8");
const app = await readFile(path.join(root, "app.js"), "utf8");
const sandboxHtml = await readFile(path.join(root, "game", "index.html"), "utf8");
const sandboxCss = await readFile(path.join(root, "game", "game.css"), "utf8");
const sandboxApp = await readFile(path.join(root, "game", "game.js"), "utf8");

const requiredIds = ["main", "product", "architecture", "trust", "downloads", "docs"];
const requiredFiles = [
  "styles.css",
  "app.js",
  "assets/nexora-icon.png",
  "robots.txt",
  "game/index.html",
  "game/game.css",
  "game/game.js",
  "game/smoke.cjs",
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
const requiredSandboxMarkers = [
  "id=\"game-canvas\"",
  "class=\"sandbox-badge\"",
  "data-tool=\"cursor\"",
  "data-tool=\"magnet\"",
  "data-tool=\"vortex\"",
  "data-tool=\"predator\"",
  "data-tool=\"eraser\"",
  "data-restart-field",
  "data-settings-open",
  "data-collapse-meter",
  "data-setting=\"particleCount\"",
  "data-setting=\"regenerationRate\"",
  "data-setting=\"linkStrength\"",
  "data-setting=\"collapseThreshold\"",
  "data-setting=\"blackHoleLifetime\"",
  "data-setting=\"predatorCapacity\"",
  "data-setting=\"quality\"",
  "data-export-config",
  "data-import-config",
];
const requiredSandboxRuntime = [
  "class AetherEngine",
  "class Particle",
  "updateRegeneration",
  "updatePhysicalLinks",
  "collapseMagneticCloud",
  "createBlackHole",
  "burstPredator",
  "releaseSwallowed",
  "removeNearestObject",
  "localStorage",
  "sanitizeSettings",
];
const forbiddenSandboxMarkers = [
  "data-mode=\"game\"",
  "data-tool=\"planet\"",
  "data-tool=\"blackHole\"",
  "data-game-start",
  "data-score",
  "data-time",
  "addPlanet",
  "startRound",
  "targetScore",
];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required section #${id}`);
}
for (const marker of requiredRuntimeMarkers) {
  if (!html.includes(marker)) throw new Error(`Missing runtime marker: ${marker}`);
}
for (const marker of requiredSandboxMarkers) {
  if (!sandboxHtml.includes(marker)) throw new Error(`Missing Aether sandbox marker: ${marker}`);
}
for (const marker of requiredSandboxRuntime) {
  if (!sandboxApp.includes(marker)) throw new Error(`Missing Aether sandbox runtime: ${marker}`);
}
for (const marker of forbiddenSandboxMarkers) {
  if (sandboxHtml.includes(marker) || sandboxApp.includes(marker)) {
    throw new Error(`Removed Game/planet/manual-hole marker returned: ${marker}`);
  }
}
for (const file of requiredFiles) {
  const info = await stat(path.join(root, file));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty file: ${file}`);
}

if (!html.includes("https://github.com/Onmaynec/Nexora")) throw new Error("Repository link is missing");
if (!html.includes("assets/nexora-icon.png")) throw new Error("Canonical Nexora icon is not linked");
if (!app.includes("class AetherField")) throw new Error("Interactive Canvas background is missing");
if (html.includes("Trust Core, MLS") || html.includes("API v3 · Trust v4") || html.includes("3.3.3")) throw new Error("Retired Trust/MLS or stale version claim is present");
if (!html.includes("LEGACY_READ_ONLY") || !html.includes("serverDecrypted=false")) throw new Error("Post-MLS compatibility boundary is missing");
if (!app.includes("raw.githubusercontent.com") || !app.includes("/releases?per_page=")) {
  throw new Error("Live GitHub release/version integration is missing");
}
if (!app.includes("ru: {") || !app.includes("en: {") || !app.includes('const FALLBACK_VERSION = "3.4.0"')) throw new Error("RU/EN dictionaries or current version fallback are missing");
if (!css.includes("@media (hover: none)") || !css.includes("prefers-reduced-motion")) {
  throw new Error("Adaptive motion fallbacks are missing");
}
if (!sandboxApp.includes("ru: {") || !sandboxApp.includes("en: {")) {
  throw new Error("Aether sandbox RU/EN dictionaries are missing");
}
if (!sandboxCss.includes(".gear-icon") || !sandboxCss.includes("@media (max-width: 760px)") || !sandboxCss.includes("prefers-reduced-motion")) {
  throw new Error("Aether sandbox icon/mobile/reduced-motion styles are missing");
}
if (/<script[^>]+src=["']https?:/i.test(html) || /<link[^>]+href=["']https?:/i.test(html)) {
  throw new Error("External main-site runtime scripts or styles are not allowed");
}
if (/<script[^>]+src=["']https?:/i.test(sandboxHtml) || /<link[^>]+href=["']https?:/i.test(sandboxHtml)) {
  throw new Error("External Aether runtime scripts or styles are not allowed");
}

const syntax = spawnSync(process.execPath, ["--check", path.join(root, "game", "game.js")], {
  encoding: "utf8",
});
if (syntax.status !== 0) {
  throw new Error(`Aether sandbox JavaScript syntax check failed:\n${syntax.stderr || syntax.stdout}`);
}

const smoke = spawnSync(process.execPath, [path.join(root, "game", "smoke.cjs")], {
  encoding: "utf8",
  timeout: 30_000,
});
if (smoke.status !== 0) {
  throw new Error(`Aether sandbox mechanics smoke failed:\n${smoke.stderr || smoke.stdout}`);
}

const ids = [...sandboxHtml.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicateIds.length) {
  throw new Error(`Duplicate Aether sandbox IDs: ${[...new Set(duplicateIds)].join(", ")}`);
}

const settingKeys = [...sandboxHtml.matchAll(/data-setting=["']([^"']+)["']/g)].map((match) => match[1]);
for (const key of settingKeys) {
  if (!sandboxApp.includes(`${key}:`)) throw new Error(`Setting is missing from defaults: ${key}`);
}

console.log(smoke.stdout.trim());
console.log("Nexora website and Aether sandbox validation passed.");
