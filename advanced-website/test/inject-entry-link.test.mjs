import test from "node:test";
import assert from "node:assert/strict";
import { injectAdvancedLink } from "../scripts/inject-entry-link.mjs";

const fixture = `<!doctype html><html lang="ru"><head><title>Nexora</title></head><body><div class="hero-actions"><a href="#downloads">Download</a></div></body></html>`;

test("advanced documentation entry is injected exactly once", () => {
  const once = injectAdvancedLink(fixture);
  const twice = injectAdvancedLink(once);
  assert.match(once, /href="advanced\/" data-advanced-docs/);
  assert.match(once, /Продвинутая документация/);
  assert.match(once, /Advanced documentation/);
  assert.equal((twice.match(/data-advanced-docs/g) || []).length, 1);
  assert.equal(once, twice);
});

test("missing hero target fails closed", () => {
  assert.throws(() => injectAdvancedLink("<html><head></head><body></body></html>"), /hero-actions/);
});
