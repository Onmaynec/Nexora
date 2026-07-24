"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const website = __dirname;
const releasesApi = "https://api.github.com/repos/Onmaynec/Nexora/releases?per_page=12";

const read = (file) => readFileSync(path.join(website, file), "utf8");

function changelogVersions() {
  const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  return [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]);
}

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

function bootRuntime(fetchImplementation, { immediateTimeout = false } = {}) {
  const localStorage = createStorage();
  const window = {
    fetch: fetchImplementation,
    location: { href: "https://onmaynec.github.io/Nexora/" },
    localStorage,
  };
  let timerSequence = 0;
  const context = vm.createContext({
    window,
    localStorage,
    URL,
    Response,
    Request,
    AbortController,
    setTimeout: immediateTimeout
      ? (callback) => {
          const id = ++timerSequence;
          queueMicrotask(callback);
          return id;
        }
      : setTimeout,
    clearTimeout: immediateTimeout ? () => {} : clearTimeout,
  });

  vm.runInContext(read("release-fallback.js"), context, { filename: "release-fallback.js" });
  vm.runInContext(read("network-resilience.js"), context, { filename: "network-resilience.js" });
  return { window, localStorage };
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
  assert.ok(
    fallbackIndex >= 0 && resilienceIndex > fallbackIndex && appIndex > resilienceIndex,
    "release fallback and request resilience must execute before the main website runtime",
  );
});

test("live GitHub releases remain authoritative and are merged with historical fallback versions", async () => {
  const liveReleases = [{
    tag_name: "v3.3.3",
    prerelease: true,
    html_url: "https://github.com/Onmaynec/Nexora/releases/tag/v3.3.3",
    published_at: "2026-07-23T12:00:00Z",
    zipball_url: "https://api.github.com/repos/Onmaynec/Nexora/zipball/v3.3.3",
    assets: [{
      name: "Nexora-Client-3.3.3-UNSIGNED-TEST.exe",
      browser_download_url: "https://github.com/Onmaynec/Nexora/releases/download/v3.3.3/Nexora-Client.exe",
      size: 123456,
    }],
  }];

  const { window, localStorage } = bootRuntime(async () => new Response(JSON.stringify(liveReleases), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));

  const response = await window.fetch(releasesApi);
  const releases = await response.json();
  const current = releases.find((release) => release.tag_name === "v3.3.3");

  assert.equal(response.headers.get("X-Nexora-Release-Source"), "github-api");
  assert.equal(current.assets[0].name, "Nexora-Client-3.3.3-UNSIGNED-TEST.exe");
  assert.ok(releases.some((release) => release.tag_name === "v0.3.0"));
  assert.match(localStorage.getItem("nexora-site-release-cache-v1"), /Nexora-Client-3\.3\.3/);
});

test("a stalled GitHub release request resolves to the complete fallback catalog", async () => {
  const stalledFetch = (_input, init = {}) => new Promise((resolve, reject) => {
    const abort = () => {
      const error = new Error("request aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (init.signal?.aborted) abort();
    else init.signal?.addEventListener("abort", abort, { once: true });
  });

  const { window } = bootRuntime(stalledFetch, { immediateTimeout: true });
  const response = await window.fetch(releasesApi);
  const releases = await response.json();

  assert.equal(response.headers.get("X-Nexora-Release-Source"), "timeout");
  assert.deepEqual(
    releases.map((release) => release.tag_name),
    changelogVersions().map((version) => `v${version}`),
  );
  assert.ok(releases.every((release) => Array.isArray(release.assets)));
});
