"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("regular deletion uses in-app confirmation and legacy history is immutable", () => {
  const regular = read("client/src/components/MessagePane.jsx");
  const legacy = read("client/src/components/LegacySecureHistoryPane.jsx");
  assert.match(regular, /import ConfirmDialog from "\.\/ConfirmDialog"/);
  assert.match(regular, /title="Удалить сообщение\?"/);
  assert.doesNotMatch(regular, /window\.confirm\("Удалить сообщение/);
  assert.match(legacy, /LEGACY_READ_ONLY/);
  assert.match(legacy, /Экспортировать immutable history/);
  assert.doesNotMatch(legacy, /ConfirmDialog|onDelete|uploadFile|VoiceRecorder|Trash2|Send/);
});

test("legacy secure viewer exposes no writable composer controls", () => {
  const component = read("client/src/components/LegacySecureHistoryPane.jsx");
  assert.match(component, /История доступна только для чтения/);
  assert.match(component, /server-side расшифровка не выполнялась/);
  assert.match(component, /client-indexeddb-read-only/);
  assert.doesNotMatch(component, /secure-composer-lock|prepareEncrypted|encryptAndUpload|mls:message/);
});

test("ordinary voice messages derive live amplitude and played progress", () => {
  const recorder = read("client/src/components/VoiceRecorder.jsx");
  const player = read("client/src/components/VoicePlayer.jsx");
  assert.match(recorder, /analyser\.getByteTimeDomainData/);
  assert.match(recorder, /Math\.sqrt\(sum \/ samples\.length\)/);
  assert.match(recorder, /compactWaveform\(waveformRef\.current\)/);
  assert.match(player, /className="voice-wave"/);
  assert.match(player, /className=\{duration && .* \? "played" : ""\}/);
  assert.match(player, /cycleVoiceRate/);
  assert.match(player, /seekVoice/);
});

test("post-MLS retirement is terminal and ordinary messaging remains available", () => {
  const stableCore = read("server/stable-core.cjs");
  const workspace = read("client/src/components/Workspace.jsx");
  const app = read("client/src/App.jsx");
  assert.match(stableCore, /LEGACY_WRITE_PATTERN/);
  assert.match(stableCore, /410,[\s\S]*"LEGACY_READ_ONLY"/);
  assert.match(stableCore, /socket\.on\("mls:message", reject\)/);
  assert.match(workspace, /LegacySecureHistoryPane/);
  assert.match(workspace, /<MessagePane/);
  assert.doesNotMatch(app, /trust-client|initializeTrust|registerTrust/);
});

test("Pulse Sandbox serves catalog, receipts and room goals without Cloud fallback", () => {
  const routes = read("server/pulse-v3-routes.cjs");
  const products = read("server/pulse-product-routes.cjs");
  const sandbox = read("server/pulse-sandbox-service.cjs");
  assert.match(routes, /sandbox\.goals\(request\.pulseAuth\.user\.id, request\.params\.roomId\)/);
  assert.match(products, /sandbox\.receipts\(userId\)/);
  assert.match(products, /\/api\/v3\/pulse\/catalog/);
  assert.match(products, /\/api\/v3\/pulse\/purchases/);
  assert.match(sandbox, /operationType: "impulse_product_purchase"/);
  assert.match(sandbox, /WALLET_INSUFFICIENT_FUNDS/);
});

test("unsigned test binaries remain downloadable without updater metadata", () => {
  const workflow = read(".github/workflows/release.yml");
  const legacySite = read("website/app.js");
  const siteFixes = read("website/site-fixes.js");
  const composedSite = `${legacySite}\n${siteFixes}`;
  assert.ok(workflow.includes("Nexora-Client-Setup-$version-UNSIGNED-TEST.exe"));
  assert.ok(workflow.includes("Nexora-Server-Setup-$version-UNSIGNED-TEST.exe"));
  assert.ok(workflow.includes("Nexora-Android-$version-UNSIGNED-TEST.apk"));
  assert.ok(workflow.includes("UNSIGNED-TEST prerelease without updater metadata"));
  assert.ok(workflow.includes('if ($names -contains "latest.yml"'));
  assert.ok(workflow.includes("\\.blockmap$"));
  assert.ok(composedSite.includes("function signatureState"));
  assert.ok(composedSite.includes("unsigned[-_ ]?test|test-build|test\\.exe"));
  assert.ok(composedSite.includes("dataset.signature"));
});

test("website keeps the established UX and current version markers", () => {
  const html = read("website/index.html");
  const legacyCss = read("website/styles.css");
  const legacyScript = read("website/app.js");
  const fixesCss = read("website/site-fixes.css");
  const fixesScript = read("website/site-fixes.js");
  const version = require("../package.json").version.replace(/\./g, "\\.");

  for (const marker of ["product-window", "stage-orbit-a", "stage-orbit-b", "data-tilt", "floating-signal", "architecture-board"]) {
    assert.ok(html.includes(marker), `missing restored UX marker: ${marker}`);
  }
  assert.match(legacyScript, /class AetherField/);
  assert.match(legacyScript, /document\.querySelectorAll\("\[data-tilt\]"\)/);
  assert.match(legacyScript, /requestAnimationFrame/);
  assert.match(legacyCss, /@keyframes spin/);
  assert.match(legacyCss, /@keyframes dataTravel/);
  assert.match(fixesCss, /"Segoe UI Variable Text"/);
  assert.match(fixesCss, /"Segoe UI Variable Display"/);
  assert.match(fixesCss, /overflow-wrap: anywhere/);
  assert.match(fixesCss, /pointer-events: auto/);
  assert.doesNotMatch(fixesCss, /animation\s*:\s*none\s*!important/i);
  assert.match(fixesScript, new RegExp(`FALLBACK_VERSION = "${version}"`));
  assert.match(legacyScript, new RegExp(`FALLBACK_VERSION = "${version}"`));
  assert.match(fixesScript, /document\.addEventListener\("click"/);
  assert.match(fixesScript, /applySignatureBadges/);
});

test("Pulse Cloud preserves raw Stripe webhook body", () => {
  const cloud = read("cloud/create-cloud-server-v11.cjs");
  assert.match(cloud, /request\.path === "\/v1\/provider\/webhooks\/stripe" \? next\(\) : jsonBody/);
});
