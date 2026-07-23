"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("regular and secure message deletion use the in-app confirmation dialog", () => {
  const regular = read("client/src/components/MessagePane.jsx");
  const secure = read("client/src/components/SecureMessagePane.jsx");
  assert.match(regular, /import ConfirmDialog from "\.\/ConfirmDialog"/);
  assert.match(regular, /title="Удалить сообщение\?"/);
  assert.doesNotMatch(regular, /window\.confirm\("Удалить сообщение/);
  assert.match(secure, /title="Удалить защищённое сообщение\?"/);
  assert.doesNotMatch(secure, /window\.confirm\("Удалить защищённое сообщение/);
});

test("secure composer no longer exposes an inert lock control", () => {
  const component = read("client/src/components/SecureMessagePane.jsx");
  assert.doesNotMatch(component, /secure-composer-lock/);
  assert.match(component, /className="composer secure-composer"/);
});

test("voice messages derive normalized amplitude bars and played color", () => {
  const component = read("client/src/components/SecureMessagePane.jsx");
  const styles = read("client/src/secure-messaging.css");
  assert.match(component, /function normalizeWaveform/);
  assert.match(component, /sumSquares/);
  assert.match(component, /Math\.sqrt\(sumSquares/);
  assert.match(styles, /secure-voice-wave i\.played/);
  assert.match(styles, /secure-wave-active/);
});

test("MLS Welcome recovery is conversation scoped and client coalesced", () => {
  const server = read("server/trust-recovery-routes.cjs");
  const client = read("client/src/api.js");
  assert.match(server, /welcome:\$\{request\.trustAuth\.user\.id\}:\$\{requesterDeviceId\}:\$\{conversationId\}/);
  assert.match(client, /WELCOME_CLAIM_MIN_INTERVAL_MS = 2_000/);
  assert.match(client, /recoveryRequests\.get/);
  assert.match(client, /retry-after/);
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
  assert.ok(workflow.includes("Unsigned release must not expose updater metadata"));
  assert.ok(workflow.includes('if ($names -contains "latest.yml"'));
  assert.ok(workflow.includes("\\.blockmap$"));
  assert.ok(composedSite.includes("function signatureState"));
  assert.ok(composedSite.includes("unsigned[-_ ]?test|test-build|test\\.exe"));
  assert.ok(composedSite.includes("dataset.signature"));
});

test("website keeps the 3.2.5 UX and applies only typography, localization and hit-testing fixes", () => {
  const html = read("website/index.html");
  const legacyCss = read("website/styles.css");
  const legacyScript = read("website/app.js");
  const fixesCss = read("website/site-fixes.css");
  const fixesScript = read("website/site-fixes.js");

  for (const marker of ["product-window", "stage-orbit-a", "stage-orbit-b", "data-tilt", "floating-signal", "architecture-board", "trust-lifecycle"]) {
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

  assert.match(fixesScript, /FALLBACK_VERSION = "3\.3\.0"/);
  assert.match(fixesScript, /document\.addEventListener\("click"/);
  assert.match(fixesScript, /Самостоятельно размещаемая платформа/);
  assert.match(fixesScript, /ПОЛНОМОЧИЯ СЕРВЕРА/);
  assert.match(fixesScript, /applySignatureBadges/);
});

test("Pulse Cloud preserves raw Stripe webhook body", () => {
  const cloud = read("cloud/create-cloud-server-v11.cjs");
  assert.match(cloud, /request\.path === "\/v1\/provider\/webhooks\/stripe" \? next\(\) : jsonBody/);
});
