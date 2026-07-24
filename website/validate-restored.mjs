import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFile(path.join(root, file), "utf8");
const [
  html,
  css,
  app,
  fixesCss,
  fixesJs,
  polishCss,
  polishJs,
  releaseFallback,
  networkResilience,
  fallbackGenerator,
  audit,
  build,
  packageSource,
  pagesWorkflow,
] = await Promise.all([
  read("index.html"),
  read("styles.css"),
  read("app.js"),
  read("site-fixes.css"),
  read("site-fixes.js"),
  read("site-polish.css"),
  read("site-polish.js"),
  read("release-fallback.js"),
  read("network-resilience.js"),
  read("generate-release-fallback.mjs"),
  read("UX_AUDIT_2026-07-24.md"),
  read("build.json"),
  readFile(path.join(root, "..", "package.json"), "utf8"),
  readFile(path.join(root, "..", ".github", "workflows", "pages.yml"), "utf8"),
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
  "Mobile cascade guard",
  "grid-template-columns: minmax(0, 1fr)",
  "overflow-x: clip",
  "word-break: normal",
  "hyphens: none",
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

for (const marker of [
  "--motion-micro",
  "--motion-component",
  "--motion-reveal",
  "nexoraHeroIn",
  'data-asset-state="loading"',
  'data-ux-offscreen="true"',
  "animation-play-state: paused",
  "prefers-reduced-motion: reduce",
  "forced-colors: active",
  "min-height: 44px",
]) {
  if (!polishCss.includes(marker)) throw new Error(`Main-site polish CSS marker is missing: ${marker}`);
}

for (const marker of [
  'event.key === "Escape"',
  'setAttribute("aria-current", "page")',
  'setAttribute("aria-busy"',
  "IntersectionObserver",
  "dataset.uxOffscreen",
  "dataset.pageHidden",
  "dataset.uxPolish",
  "pointercancel",
  "Close menu",
]) {
  if (!polishJs.includes(marker)) throw new Error(`Main-site polish runtime marker is missing: ${marker}`);
}

for (const marker of [
  "window.NexoraReleaseFallback",
  'tag_name: "v3.3.3"',
  'tag_name: "v3.0.0"',
  "assets: []",
]) {
  if (!releaseFallback.includes(marker)) throw new Error(`Release fallback marker is missing: ${marker}`);
}

for (const marker of [
  "RELEASE_REQUEST_TIMEOUT_MS",
  "AbortController",
  "RELEASE_CACHE_KEY",
  "NexoraReleaseFallback",
  "releaseFallbackResponse",
  "new Response(",
]) {
  if (!networkResilience.includes(marker)) throw new Error(`Release network resilience marker is missing: ${marker}`);
}

for (const marker of [
  "parseReleaseHistory",
  "renderFallbackScript",
  "CHANGELOG.md",
  "--check",
]) {
  if (!fallbackGenerator.includes(marker)) throw new Error(`Release fallback generator marker is missing: ${marker}`);
}

if (/\bfetch\s*\(/.test(polishJs)) throw new Error("Polish runtime must not add network requests");
if (/\.innerHTML\s*=/.test(polishJs + networkResilience)) throw new Error("Website enhancement runtimes must not inject HTML");
if (/webgl/i.test(polishJs + polishCss + networkResilience)) throw new Error("WebGL was added without an approved performance case");

if (/\.tilt-card\s*\{[^}]*display\s*:\s*none/is.test(fixesCss + polishCss)) {
  throw new Error("Website enhancements must not remove restored 3D cards");
}
if (/animation\s*:\s*none\s*!important/is.test(fixesCss + polishCss)) {
  throw new Error("Website enhancements must not globally disable original animations");
}

const broadHeroRule = fixesCss.lastIndexOf("grid-template-columns: minmax(0, .95fr) minmax(480px, 1.05fr)");
const narrowHeroRule = fixesCss.lastIndexOf("grid-template-columns: minmax(0, 1fr)");
if (narrowHeroRule <= broadHeroRule) throw new Error("Mobile single-column hero override must follow the broad compatibility rule");
if (!fixesCss.includes('@media (max-width: 520px)') || !fixesCss.includes('width: min(calc(100% - 1rem), var(--max))')) throw new Error("Narrow mobile width guard is missing");

const fixesCssCompose = pagesWorkflow.indexOf("cat website/site-fixes.css >> website/styles.css");
const polishCssCompose = pagesWorkflow.indexOf("cat website/site-polish.css >> website/styles.css");
if (fixesCssCompose < 0 || polishCssCompose <= fixesCssCompose) throw new Error("CSS composition order must be base -> fixes -> polish");

const fallbackJsCompose = pagesWorkflow.indexOf("cat website/release-fallback.js");
const resilienceJsCompose = pagesWorkflow.indexOf("cat website/network-resilience.js");
const appJsCompose = pagesWorkflow.indexOf("cat website/app.js");
const fixesJsCompose = pagesWorkflow.indexOf("cat website/site-fixes.js");
const polishJsCompose = pagesWorkflow.indexOf("cat website/site-polish.js");
if (
  fallbackJsCompose < 0 ||
  resilienceJsCompose <= fallbackJsCompose ||
  appJsCompose <= resilienceJsCompose ||
  fixesJsCompose <= appJsCompose ||
  polishJsCompose <= fixesJsCompose
) {
  throw new Error("JavaScript composition order must be release fallback -> resilience -> base -> fixes -> polish");
}
if (!pagesWorkflow.includes("node --check website/network-resilience.js")) throw new Error("Release resilience JavaScript syntax gate is missing");
if (!pagesWorkflow.includes("node website/generate-release-fallback.mjs --check")) throw new Error("Release fallback freshness gate is missing");
if (!pagesWorkflow.includes("node --test website/release-resilience.test.cjs")) throw new Error("Release selector regression test is missing");
if (!pagesWorkflow.includes("node --check website/site-polish.js")) throw new Error("Polish JavaScript syntax gate is missing");

for (const marker of [
  "Scope: `website/` public main page only",
  "WebGL is not introduced",
  "Security and privacy review",
  "Real limitations",
]) {
  if (!audit.includes(marker)) throw new Error(`UX audit marker is missing: ${marker}`);
}

const buildData = JSON.parse(build);
if (!String(buildData.siteBuild || "").startsWith("main-site-ux-polish-")) {
  throw new Error("Main-site UX polish build marker is missing");
}

console.log(`Nexora main-site UX, release resilience, motion and accessibility polish validated for ${packageVersion}.`);
