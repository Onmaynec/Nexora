import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flattenSearch, navigation, pageById, pages } from "../src/content.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..");
const reference = JSON.parse(fs.readFileSync(path.join(appRoot, "src", "generated", "reference.json"), "utf8"));
const releaseFallback = JSON.parse(fs.readFileSync(path.join(appRoot, "src", "generated", "release-fallback.json"), "utf8"));

test("all navigation targets resolve exactly once", () => {
  const targets = navigation.flatMap((group) => group.items);
  assert.equal(targets.length, new Set(targets).size);
  for (const target of targets) assert.ok(pageById.has(target), `missing page ${target}`);
});

test("documentation is bilingual and section anchors are unique", () => {
  assert.ok(pages.length >= 25);
  for (const page of pages) {
    assert.ok(page.title.ru && page.title.en, page.id);
    assert.ok(page.description.ru && page.description.en, page.id);
    const sectionIds = (page.sections || []).map((section) => section.id);
    assert.equal(sectionIds.length, new Set(sectionIds).size, page.id);
  }
});

test("search index includes technical terms in both languages", () => {
  const meta = { currentVersion: reference.currentVersion };
  const ru = flattenSearch("ru", meta);
  const en = flattenSearch("en", meta);
  assert.equal(ru.length, pages.length);
  assert.equal(en.length, pages.length);
  assert.ok(ru.some((entry) => entry.haystack.includes("schema 8")));
  assert.ok(en.some((entry) => entry.haystack.includes("authorization")));
});

test("generated reference has unique method/path/source keys", () => {
  const keys = reference.routes.map((route) => `${route.method} ${route.path} ${route.source}`);
  assert.equal(keys.length, new Set(keys).size);
  assert.ok(reference.routes.some((route) => route.path.startsWith("/api/v4/trust")));
});

test("release fallback uses canonical versioned notes instead of root compatibility pointers", () => {
  const current = releaseFallback.releases.find((release) => release.tag_name === `v${reference.currentVersion}`);
  assert.ok(current, `missing fallback release v${reference.currentVersion}`);

  const canonicalPath = path.join(repoRoot, "docs", "releases", reference.currentVersion, "RELEASE_NOTES.md");
  const canonicalBody = fs.readFileSync(canonicalPath, "utf8").trim().slice(0, 12000);
  assert.equal(current.body, canonicalBody);
  assert.doesNotMatch(current.body, /compatibility pointer/i);
});
