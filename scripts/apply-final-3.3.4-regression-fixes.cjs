"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceOnce(relativePath, before, after) {
  const file = path.join(root, relativePath);
  const source = fs.readFileSync(file, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${relativePath}: expected exactly one marker ${JSON.stringify(before)}, found ${count}`);
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

replaceOnce(
  "test/build-config.test.cjs",
  "assert.match(releaseWorkflow, /baseline = 'v3\\.3\\.3'/);",
  "assert.match(releaseWorkflow, /baseline\\s*=\\s*'v3\\.3\\.3'/);",
);

replaceOnce(
  "test/release-3.2.5-regressions.test.cjs",
  "  assert.match(workflow, /unsigned-test\\.\\$env:GITHUB_RUN_NUMBER/);\n  assert.match(workflow, /official stable tag remains unused/);",
  "  assert.match(workflow, /PUBLISH_TAG=\\$officialTag/);\n  assert.match(workflow, /UNSIGNED-TEST prerelease without updater metadata/);\n  assert.match(workflow, /--prerelease/);\n  assert.doesNotMatch(workflow, /Unsigned artifact set contains updater metadata[\\s\\S]{0,240}latest\\.yml/);",
);

replaceOnce(
  "client/src/components/MessagePane.jsx",
  "    if (result.failed) showToast(\"Сообщение не отправлено — доступен повтор\", \"error\");\n    else await onRefresh();",
  "    if (result.failed) showToast(\"Сообщение не отправлено — доступен повтор\", \"error\");",
);

replaceOnce(
  "test/security-hardening-3.2.3.test.cjs",
  "createSlidingWindowRateLimiter({ windowMs: 1_000, max: 2, maxBuckets: 2, clock: () => now })",
  "createSlidingWindowRateLimiter({ windowMs: 1_000, limit: 2, maxBuckets: 2, clock: () => now })",
);

replaceOnce(
  "server/create-server-v31.cjs",
  "      pulseV3: { ...client.status(), ...(sandbox.enabled() ? { mode: \"sandbox\", enabled: true, productionReady: false, testMode: true } : {}), sync: syncWorker.status() },\n      stableCore: stableCore.status(),\n      trust: { runtime: \"retired\", legacyHistory: \"read_only\", encryptedAttachments: false, deviceScopedRealtime: false },",
  "      pulseV3: { keyCount: 0, ...client.status(), ...(sandbox.enabled() ? { mode: \"sandbox\", enabled: true, productionReady: false, testMode: true } : {}), sync: syncWorker.status() },\n      stableCore: stableCore.status(),\n      trust: { runtime: \"retired\", legacyHistory: \"read_only\", encryptedAttachments: false, deviceScopedRealtime: false, activeGroups: 0 },",
);

console.log("Applied final Nexora 3.3.4 regression fixes.");
