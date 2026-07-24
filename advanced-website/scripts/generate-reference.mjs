import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const generatedDir = path.join(appRoot, "src", "generated");
const referencePath = path.join(generatedDir, "reference.json");
const releasesPath = path.join(generatedDir, "release-fallback.json");

fs.mkdirSync(generatedDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function walk(root, extensions) {
  if (!fs.existsSync(root)) return [];
  const result = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "build", "coverage"].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (extensions.has(path.extname(entry.name))) result.push(full);
    }
  }
  return result.sort();
}

function lineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function routeGroup(routePath, source) {
  if (routePath.startsWith("/api/v4/trust") || /trust|mls|e2ee/i.test(source)) return "trust-v4";
  if (routePath.startsWith("/api/v3")) return "application-v3";
  if (routePath.startsWith("/api/auth") || routePath.startsWith("/api/sessions")) return "auth";
  if (routePath.startsWith("/api/rooms")) return "rooms";
  if (routePath.includes("/messages") || routePath.includes("/conversations")) return "messaging";
  if (routePath.includes("pulse") || routePath.includes("cloud-account")) return "pulse";
  if (routePath.startsWith("/api/admin") || routePath.startsWith("/metrics") || routePath.startsWith("/healthz")) return "operations";
  if (source.startsWith("cloud/")) return "pulse-cloud";
  return "application-v3";
}

function compareVersionsDescending(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index];
  }
  return 0;
}

function collectReleaseNotes() {
  const byVersion = new Map();
  const versionedRoot = path.join(repoRoot, "docs", "releases");

  if (fs.existsSync(versionedRoot)) {
    for (const entry of fs.readdirSync(versionedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+\.\d+\.\d+$/.test(entry.name)) continue;
      const file = path.join(versionedRoot, entry.name, "RELEASE_NOTES.md");
      if (fs.existsSync(file)) byVersion.set(entry.name, file);
    }
  }

  if (fs.existsSync(repoRoot)) {
    for (const name of fs.readdirSync(repoRoot)) {
      const match = /^RELEASE_NOTES_(\d+\.\d+\.\d+)\.md$/.exec(name);
      if (!match || byVersion.has(match[1])) continue;
      byVersion.set(match[1], path.join(repoRoot, name));
    }
  }

  return [...byVersion.entries()]
    .map(([version, file]) => ({ version, file }))
    .sort((left, right) => compareVersionsDescending(left.version, right.version));
}

const sourceRoots = ["server", "cloud"].map((dir) => path.join(repoRoot, dir));
const routeFiles = sourceRoots.flatMap((root) => walk(root, new Set([".cjs", ".mjs", ".js"]))).filter((file) => !file.includes(`${path.sep}test${path.sep}`));
const routes = [];
const events = [];
const routePattern = /\b(?:app|router)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(\s*(["'`])([^"'`]+)\2/g;
const eventPattern = /\.\s*(on|once|emit)\s*\(\s*(["'`])([^"'`]+)\2/g;

for (const file of routeFiles) {
  const source = path.relative(repoRoot, file).split(path.sep).join("/");
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(routePattern)) {
    const routePath = match[3];
    if (!routePath.startsWith("/")) continue;
    routes.push({
      method: match[1].toUpperCase(),
      path: routePath,
      source,
      line: lineNumber(text, match.index),
      group: routeGroup(routePath, source),
    });
  }
  for (const match of text.matchAll(eventPattern)) {
    const name = match[3];
    if (!name || name.startsWith("/") || name.length > 120 || /\s/.test(name)) continue;
    if (["error", "data", "end", "close", "finish", "drain", "readable"].includes(name)) continue;
    events.push({
      direction: match[1] === "emit" ? "emit" : "on",
      name,
      source,
      line: lineNumber(text, match.index),
    });
  }
}

const unique = (items, key) => [...new Map(items.map((item) => [key(item), item])).values()];
const normalizedRoutes = unique(routes, (item) => `${item.method} ${item.path} ${item.source}`)
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const normalizedEvents = unique(events, (item) => `${item.direction} ${item.name} ${item.source}`)
  .sort((a, b) => a.name.localeCompare(b.name) || a.direction.localeCompare(b.direction));

const packageJson = readJson(path.join(repoRoot, "package.json"), { version: "unknown" });
const existingReference = readJson(referencePath, { routes: [], events: [], stats: {} });
const hasRepositorySources = normalizedRoutes.length > 0;
const finalReference = hasRepositorySources ? {
  currentVersion: packageJson.version,
  routes: normalizedRoutes,
  events: normalizedEvents,
  stats: {
    routeCount: normalizedRoutes.length,
    eventCount: normalizedEvents.length,
    sourceFiles: new Set([...normalizedRoutes, ...normalizedEvents].map((item) => item.source)).size,
  },
  generatedFromSource: true,
} : {
  ...existingReference,
  currentVersion: packageJson.version !== "unknown" ? packageJson.version : existingReference.currentVersion,
  generatedFromSource: false,
};
fs.writeFileSync(referencePath, `${JSON.stringify(finalReference, null, 2)}\n`);

const releaseFiles = collectReleaseNotes();
const fallbackReleases = releaseFiles.map(({ version, file }) => {
  const body = fs.readFileSync(file, "utf8").trim().slice(0, 12000);
  return {
    tag_name: `v${version}`,
    name: `Nexora ${version}`,
    prerelease: version !== "3.1.2",
    published_at: null,
    html_url: `https://github.com/Onmaynec/Nexora/releases/tag/v${version}`,
    body,
    assets: [],
  };
});
const existingReleases = readJson(releasesPath, { releases: [] });
fs.writeFileSync(releasesPath, `${JSON.stringify({ releases: fallbackReleases.length ? fallbackReleases : existingReleases.releases }, null, 2)}\n`);

console.log(`Advanced reference: ${finalReference.stats.routeCount || 0} routes, ${finalReference.stats.eventCount || 0} events, version ${finalReference.currentVersion}.`);
