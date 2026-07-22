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

test("unsigned test binaries are downloadable but excluded from updater metadata", () => {
  const workflow = read(".github/workflows/release.yml");
  const site = read("website/app.js");
  assert.match(workflow, /Nexora-Client-Setup-\$version-UNSIGNED-TEST\.exe/);
  assert.match(workflow, /Nexora-Server-Setup-\$version-UNSIGNED-TEST\.exe/);
  assert.match(workflow, /Nexora-Android-\$version-UNSIGNED-TEST\.apk/);
  assert.match(workflow, /Unsigned release must not expose updater metadata/);
  assert.match(site, /function signatureState/);
  assert.match(site, /unsigned/);
  assert.match(site, /test-build/);
  assert.match(site, /test\\\.exe/);
  assert.match(site, /data-signature/);
});

test("website 3.3 typography prevents overlapping headings and keeps controls clickable", () => {
  const html = read("website/index.html");
  const css = read("website/styles.css");
  const script = read("website/app.js");
  assert.doesNotMatch(html, />3\.2\.4</);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /pointer-events:auto/);
  assert.match(css, /"Bahnschrift"/);
  assert.match(script, /document\.addEventListener\("click"/);
  assert.match(script, /FALLBACK_VERSION = "3\.3\.0"/);
});

test("Pulse Cloud preserves raw Stripe webhook body", () => {
  const cloud = read("cloud/create-cloud-server-v11.cjs");
  assert.match(cloud, /request\.path === "\/v1\/provider\/webhooks\/stripe" \? next\(\) : jsonBody/);
});
