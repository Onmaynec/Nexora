import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(import.meta.url);
const websiteRoot = path.dirname(file);
const repositoryRoot = path.resolve(websiteRoot, "..");
const changelogPath = path.join(repositoryRoot, "CHANGELOG.md");
const outputPath = path.join(websiteRoot, "release-fallback.js");
const repository = "Onmaynec/Nexora";

export function parseReleaseHistory(markdown) {
  const matches = [...markdown.matchAll(/^## \[(\d+\.\d+\.\d+)\]\s*[—-]\s*(Unreleased|\d{4}-\d{2}-\d{2})([^\n]*)$/gmi)];
  const releases = [];
  for (let index = 0; index < matches.length; index += 1) {
    const [, version, dateToken, suffix = ""] = matches[index];
    const nextDated = matches.slice(index + 1).find((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry[2]));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateToken) ? dateToken : nextDated?.[2];
    if (!date) throw new Error(`Unreleased ${version} requires a later dated changelog entry for deterministic fallback metadata.`);
    releases.push({
      version,
      date,
      // Fallback metadata must never upgrade an unsigned/historical line to a stable claim.
      prerelease: true,
      sourceLabel: dateToken.toLowerCase() === "unreleased" ? "Unreleased" : suffix.trim(),
    });
  }
  return releases;
}

export function renderFallbackScript(releases) {
  const entries = releases.map(({ version, date }) => [
    "    {",
    `      tag_name: "v${version}",`,
    "      prerelease: true,",
    `      html_url: "https://github.com/${repository}/releases/tag/v${version}",`,
    `      published_at: "${date}T00:00:00Z",`,
    `      zipball_url: "https://github.com/${repository}/archive/refs/tags/v${version}.zip",`,
    "      assets: [],",
    "    },",
  ].join("\n")).join("\n");

  return `/* Generated from CHANGELOG.md by generate-release-fallback.mjs. */\n(() => {\n  "use strict";\n\n  window.NexoraReleaseFallback = Object.freeze([\n${entries}\n  ]);\n})();\n`;
}

async function main() {
  const changelog = await readFile(changelogPath, "utf8");
  const releases = parseReleaseHistory(changelog);
  if (!releases.length) throw new Error("CHANGELOG.md does not contain release headings");
  const expected = renderFallbackScript(releases);

  if (process.argv.includes("--check")) {
    const current = await readFile(outputPath, "utf8");
    if (current !== expected) {
      throw new Error("website/release-fallback.js is stale; run node website/generate-release-fallback.mjs");
    }
    console.log(`Release fallback catalog is current (${releases.length} versions).`);
    return;
  }

  await writeFile(outputPath, expected, "utf8");
  console.log(`Generated ${path.relative(repositoryRoot, outputPath)} with ${releases.length} versions.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === file) {
  await main();
}
