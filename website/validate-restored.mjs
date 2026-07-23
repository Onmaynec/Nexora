import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFile(path.join(root, file), "utf8");
const [html, css, app, fixesCss, fixesJs, build, packageSource] = await Promise.all([
  read("index.html"),
  read("styles.css"),
  read("app.js"),
  read("site-fixes.css"),
  read("site-fixes.js"),
  read("build.json"),
  readFile(path.join(root, "..", "package.json"), "utf8"),
]);
const packageVersion = JSON.parse(packageSource).version;

const requiredLegacyUx = [
  "product-window",
  "stage-orbit-a",
  "stage-orbit-b",
  "data-tilt",
  "floating-signal",
  "activity-chart",
  "architecture-board",
  "trust-lifecycle",
];
for (const marker of requiredLegacyUx) {
  if (!html.includes(marker)) throw new Error(`Restored 3.2.5 UX marker is missing: ${marker}`);
}

for (const marker of [
  "class AetherField",
  'document.querySelectorAll("[data-tilt]")',
  'style.setProperty("--rx"',
  "data-parallax",
  "requestAnimationFrame",
]) {
  if (!app.includes(marker)) throw new Error(`Restored animation marker is missing: ${marker}`);
}

for (const marker of ["@keyframes spin", "@keyframes dataTravel", ".tilt-card", ".product-window"]) {
  if (!css.includes(marker)) throw new Error(`Restored visual marker is missing: ${marker}`);
}

for (const marker of [
  '"Segoe UI Variable Text"',
  '"Segoe UI Variable Display"',
  "overflow-wrap: anywhere",
  "pointer-events: auto",
  'html[lang="ru"] .hero h1',
  ".signature-badge",
]) {
  if (!fixesCss.includes(marker)) throw new Error(`Targeted CSS fix is missing: ${marker}`);
}

for (const marker of [
  `FALLBACK_VERSION = "${packageVersion}"`,
  "function signatureState",
  "dataset.signature",
  'document.addEventListener("click"',
  "Самостоятельно размещаемая платформа",
  "ПОЛНОМОЧИЯ СЕРВЕРА",
  "НЕПОДПИСАННАЯ ТЕСТОВАЯ СБОРКА",
]) {
  if (!fixesJs.includes(marker)) throw new Error(`Targeted runtime fix is missing: ${marker}`);
}

if (/\.tilt-card\s*\{[^}]*display\s*:\s*none/is.test(fixesCss)) {
  throw new Error("Targeted fixes must not remove restored 3D cards");
}
if (/animation\s*:\s*none\s*!important/is.test(fixesCss)) {
  throw new Error("Targeted fixes must not globally disable original animations");
}

const buildData = JSON.parse(build);
if (!String(buildData.siteBuild || "").startsWith("restored-3.2.5-ux-")) {
  throw new Error("Restored site build marker is missing");
}

console.log(`Restored Nexora 3.2.5 website UX and targeted fixes validated for ${packageVersion}.`);
