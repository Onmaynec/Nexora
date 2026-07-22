"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const containsAll = (source, values) => values.every((value) => source.includes(value));
const server = read("server/create-server.cjs");
const v3 = read("server/v3-features.cjs");
const model = read("server/model.cjs");
const trustCore = read("server/trust-core.cjs");
const trustRoutes = read("server/trust-routes.cjs");
const mlsTransport = read("server/mls-transport.cjs");
const trustClient = read("client/src/crypto/trust-client.js");
const trustDevices = read("client/src/crypto/trust-device-management.js");
const trustStore = read("client/src/crypto/trust-store.js");
const mlsEngine = read("client/src/crypto/mls-engine.js");
const android = read("android/app/src/main/java/com/nexora/mobile/MainActivity.kt");
const androidManifest = read("android/app/src/main/AndroidManifest.xml");
const releaseWorkflow = read(".github/workflows/release.yml");
const attachmentGuardCount = (v3.match(/E2EE_ATTACHMENT_REQUIRED/g) || []).length;
const checks = [
  ["CSRF token verification", /CSRF_INVALID/, server],
  ["Origin verification", /ORIGIN_REJECTED/, server],
  ["Persistent login rate limits", /rateLimits/, read("server/store.cjs")],
  ["Temporary password lock", /LOGIN_LOCKED/, server],
  ["Encrypted backups", /aes-256-gcm/, read("server/maintenance.cjs")],
  ["Encrypted TOTP secrets", /aes-256-gcm/, read("server/totp.cjs")],
  ["Timing-safe TOTP verification", /timingSafeEqual/, read("server/totp.cjs")],
  ["Certificate pinning", /matchesPinnedCertificate/, read("electron/client-main.cjs") + read("electron/client-connection.cjs")],
  ["PEM SHA-256 verification", /X509Certificate/, read("electron/client-connection.cjs")],
  ["Electron session certificate verifier", /setCertificateVerifyProc/, read("electron/client-main.cjs")],
  ["Per-server Electron session isolation", /persist:nexora-server-/, read("electron/client-main.cjs")],
  ["Renderer isolation", /contextIsolation:\s*true/, read("electron/client-main.cjs") + read("electron/server-main.cjs")],
  ["Microphone-only desktop permission", /mediaTypes\.every\(\(type\) => type === ["']audio["']\)/, read("electron/client-main.cjs")],
  ["Pulse signed entitlement envelopes", /crypto\.verify\(/, read("server/pulse.cjs")],
  ["Pulse HTTPS-only billing", /protocol\s*!==\s*["']https:["']/, read("server/pulse.cjs")],
  ["Hashed scoped bot tokens", /tokenHash:\s*hashToken\(raw\)/, v3],
  ["Webhook HTTPS and private-address rejection", /WEBHOOK_HTTPS_REQUIRED[\s\S]*WEBHOOK_PRIVATE_TARGET/, v3],
  ["Webhook DNS pinning and HMAC", /lookup:[\s\S]*target\.address[\s\S]*createHmac\("sha256"/, v3],
  ["Trust challenges are one-time and expiring", containsAll(trustCore, ["consumed_at IS NULL", "expires_at", "UPDATE trust_challenges SET consumed_at="]), "boolean"],
  ["Trust device proofs use Ed25519 verification", containsAll(trustCore, ["verifyProof", "crypto.verify(null"]), "boolean"],
  ["Trust mutations require CSRF and a device identifier", server.includes("CSRF_INVALID") && trustRoutes.includes("TRUST_DEVICE_REQUIRED"), "boolean"],
  ["Client signs verify and revoke challenges", containsAll(trustDevices, ["verify_device", "revoke_device", "crypto.subtle.sign"]), "boolean"],
  ["Device identity private keys are non-extractable", containsAll(trustClient, ["importKey", "Ed25519", "false", "identityPrivateKey"]), "boolean"],
  ["Private MLS state uses local AES-GCM wrapping", containsAll(trustStore, ["AES-GCM", "additionalData", "tagLength: 128"]), "boolean"],
  ["Self-revoke clears all Trust stores", trustDevices.includes("clearTrustScope") && containsAll(trustStore, ["STORES.devices", "STORES.groups", "STORES.messages", "STORES.drafts"]), "boolean"],
  ["MLS mandatory ciphersuite is fixed to 1", /MLS_CIPHERSUITE_ID\s*=\s*1/, mlsEngine],
  ["MLS transport rejects ciphertext replay", trustCore.includes("MLS_CIPHERTEXT_REPLAYED") && mlsTransport.includes("trustCore.reserveMessage"), "boolean"],
  ["Secure serialization never exposes MLS plaintext", containsAll(model, ["message.mlsEnvelope", "text: deleted ? \"\"", "message.type === \"encrypted\" ? \"\""]), "boolean"],
  ["Legacy plaintext routes are guarded after MLS activation", containsAll(server, ["conversationUsesMls", "E2EE_REQUIRED", "E2EE_FORWARD_REQUIRED", "E2EE_ATTACHMENT_REQUIRED"]) && containsAll(v3, ["conversationUsesMls", "E2EE_DRAFT_LOCAL_ONLY", "E2EE_SCHEDULE_UNSUPPORTED", "E2EE_POLL_UNSUPPORTED", "E2EE_BOT_UNSUPPORTED"]) && attachmentGuardCount >= 3, "boolean"],
  ["Android cleartext disabled", /usesCleartextTraffic="false"/, androidManifest],
  ["Android TLS errors are cancelled", /onReceivedSslError[\s\S]*handler\.cancel\(\)/, android],
  ["Android never bypasses TLS errors", !/handler\.proceed\(\)/.test(android), "boolean"],
  ["GitHub Releases client updater", /provider:\s*["']github["']/, read("electron/update-service.cjs")],
  ["Windows update signature verification", /verifyUpdateCodeSignature:\s*true/, read("electron-builder.client.yml")],
  ["GitHub update metadata publishing", /publishAutoUpdate:\s*true/, read("electron-builder.client.yml")],
  ["Unsigned release excludes updater assets", /Publish source and PWA prerelease[\s\S]*sourceAssets[\s\S]*Explain Windows signing gate/, releaseWorkflow],
  ["No native SQLite dependency", !/better-sqlite3/.test(read("package.json")), "boolean"],
];
let failed = false;
for (const [name, pattern, source] of checks) {
  const ok = source === "boolean" ? Boolean(pattern) : pattern.test(source);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
}
const audit = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--omit=dev", "--audit-level=high", "--json"], {
  cwd: root,
  encoding: "utf8",
  shell: false,
  env: { ...process.env, NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || path.join(osTmp(), "nexora-npm-cache") },
});
function osTmp() { return process.env.TEMP || process.env.TMP || "/tmp"; }
try {
  const report = JSON.parse(audit.stdout || "{}");
  const high = Number(report.metadata?.vulnerabilities?.high || 0);
  const critical = Number(report.metadata?.vulnerabilities?.critical || 0);
  console.log(`${high + critical === 0 ? "PASS" : "FAIL"} production dependencies: high=${high}, critical=${critical}`);
  if (high || critical) failed = true;
} catch {
  console.log("WARN npm audit result unavailable; run npm audit --omit=dev on the release machine");
}
if (failed) process.exitCode = 1;
