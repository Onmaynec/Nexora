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
  assert.doesNotMatch(legacy, /ConfirmDialog|onDelete|uploadFile|VoiceRecorder|<Trash2|<Send/);
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

test("official 3.6.0 release is signed, non-prerelease and updater-complete", () => {
  const workflow = read(".github/workflows/release.yml");
  const notes = read("docs/releases/3.6.0/RELEASE_NOTES.md");
  const evidence = JSON.parse(read("release-evidence/current.json"));
  const legacySite = read("website/app.js");
  const siteFixes = read("website/site-fixes.js");
  const composedSite = `${legacySite}\n${siteFixes}`;

  assert.match(workflow, /name: Nexora 3\.6\.0 signed stable release/);
  assert.match(workflow, /environment: nexora-production-release/);
  assert.match(workflow, /Verify release approval and external evidence/);
  assert.match(workflow, /Build signed Windows Client and Server/);
  assert.match(workflow, /Build and verify signed Android artifact/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /apksigner verify/);
  assert.match(workflow, /Nexora-Client-Setup-\$version\.exe/);
  assert.match(workflow, /Nexora-Server-Setup-\$version\.exe/);
  assert.match(workflow, /Nexora-Android-\$version\.apk/);
  assert.match(workflow, /WINDOWS-SIGNATURE-EVIDENCE\.json/);
  assert.match(workflow, /ANDROID-SIGNATURE-EVIDENCE\.txt/);
  assert.match(workflow, /latest\.yml/);
  assert.match(workflow, /server\.yml/);
  assert.match(workflow, /updaterMetadataPublished = \$true/);
  assert.match(workflow, /--latest/);
  assert.doesNotMatch(workflow, /--prerelease/);
  assert.doesNotMatch(workflow, /UNSIGNED/i);
  assert.match(notes, /signed/i);
  assert.match(notes, /SHA256SUMS\.txt/);
  assert.equal(evidence.status, "implementation-candidate");
  assert.equal(evidence.publicationPolicy.requiresSignedArtifacts, true);
  assert.equal(evidence.publicationPolicy.updaterMetadataPublished, false);
  assert.ok(evidence.releaseBlockers.length > 0);

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
  assert.match(legacyCss, /\.site-nav/);
  assert.match(fixesCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(fixesScript, new RegExp(`FALLBACK_VERSION\\s*=\\s*"${version}"`));
});
