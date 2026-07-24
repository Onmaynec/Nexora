"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const website = __dirname;

const read = (file) => readFileSync(path.join(website, file), "utf8");

function changelogVersions() {
  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  return [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]);
}

test("release selector has a bounded GitHub request and a complete changelog fallback", () => {
  const fallback = read("release-fallback.js");
  const resilience = read("network-resilience.js");
  const workflow = readFileSync(path.join(root, ".github", "workflows", "pages.yml"), "utf8");
  const versions = changelogVersions();

  assert.ok(versions.length >= 10, "expected the canonical changelog release history");
  for (const version of versions) {
    assert.match(fallback, new RegExp(`tag_name:\\s*\"v${version.replaceAll(".", "\\.")}\"`));
  }

  assert.match(resilience, /AbortController/);
  assert.match(resilience, /RELEASE_REQUEST_TIMEOUT_MS/);
  assert.match(resilience, /NexoraReleaseFallback/);
  assert.match(resilience, /api\.github\.com\/repos\/Onmaynec\/Nexora\/releases/);
  assert.match(resilience, /new Response\(/);

  const fallbackIndex = workflow.indexOf("cat website/release-fallback.js");
  const resilienceIndex = workflow.indexOf("cat website/network-resilience.js");
  const appIndex = workflow.indexOf("cat website/app.js");
  assert.ok(fallbackIndex >= 0 && resilienceIndex > fallbackIndex && appIndex > resilienceIndex,
    "release fallback and request resilience must execute before the main website runtime");
});
