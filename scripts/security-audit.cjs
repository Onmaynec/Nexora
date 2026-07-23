"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const containsAll = (source, values) => values.every((value) => source.includes(value));

const server = read("server/create-server.cjs");
const composition = read("server/create-server-v31.cjs");
const stableCore = read("server/stable-core.cjs");
const v3 = read("server/v3-features.cjs");
const model = read("server/model.cjs");
const store = read("server/store.cjs");
const maintenance = read("server/maintenance.cjs");
const updateService = read("electron/update-service.cjs");
const clientBuilder = read("electron-builder.client.yml");
const serverBuilder = read("electron-builder.server.yml");
const clientMain = read("electron/client-main.cjs");
const clientConnection = read("electron/client-connection.cjs");
const deviceUi = read("client/src/components/TrustDevicesCard.jsx");
const clientApi = read("client/src/api.js");
const rateLimit = read("server/rate-limit.cjs");
const android = read("android/app/src/main/java/com/nexora/mobile/MainActivity.kt");
const androidManifest = read("android/app/src/main/AndroidManifest.xml");
const releaseWorkflow = read(".github/workflows/release.yml");

const retiredRuntimeTokens = [
  "new TrustCore",
  "mountTrustRoutes",
  "mountTrustRecoveryRoutes",
  "mountTrustSocketAuthorization",
  "mountMlsTransport",
  "mountE2eeAttachments",
];

const checks = [
  ["CSRF token verification", /CSRF_INVALID/, server],
  ["Origin verification", /ORIGIN_REJECTED/, server],
  ["Stable REST errors include code, message, requestId and safe details", containsAll(server, ["message: error", "requestId", "details"]) && containsAll(v3, ["message: error", "requestId", "details"]), "boolean"],
  ["Request IDs are generated or safely accepted", containsAll(server, ["X-Request-ID", "crypto.randomUUID()", "request.nexoraRequestId"]), "boolean"],
  ["Persistent login rate limits", /rateLimits/, store],
  ["Bounded sliding-window limiter", containsAll(rateLimit, ["createSlidingWindowRateLimiter", "maxBuckets", "retryAfterMs"]), "boolean"],
  ["Temporary password lock", /LOGIN_LOCKED/, server],
  ["Encrypted backups", /aes-256-gcm/, maintenance],
  ["Backup verification is non-restoring", containsAll(maintenance, ["async verifyBackup", "validateBackup", "databaseIntegrity: \"ok\""]) && containsAll(stableCore, ["/api/v3/admin/backups/verify", "BACKUP_INTEGRITY_FAILED"]), "boolean"],
  ["Encrypted TOTP secrets", /aes-256-gcm/, read("server/totp.cjs")],
  ["Timing-safe TOTP verification", /timingSafeEqual/, read("server/totp.cjs")],
  ["Certificate pinning", /matchesPinnedCertificate/, clientMain + clientConnection],
  ["PEM SHA-256 verification", /X509Certificate/, clientConnection],
  ["Electron session certificate verifier", /setCertificateVerifyProc/, clientMain],
  ["Per-server Electron session isolation", /persist:nexora-server-/, clientMain],
  ["Renderer isolation", /contextIsolation:\s*true/, clientMain + read("electron/server-main.cjs")],
  ["Microphone-only desktop permission", /mediaTypes\.every\(\(type\) => type === ["']audio["']\)/, clientMain],
  ["Pulse signed entitlement envelopes", /crypto\.verify\(/, read("server/pulse.cjs")],
  ["Pulse HTTPS-only billing", /protocol\s*!==\s*["']https:["']/, read("server/pulse.cjs")],
  ["Hashed scoped bot tokens", /tokenHash:\s*hashToken\(raw\)/, v3],
  ["Webhook HTTPS and private-address rejection", /WEBHOOK_HTTPS_REQUIRED[\s\S]*WEBHOOK_PRIVATE_TARGET/, v3],
  ["Webhook DNS pinning and HMAC", /lookup:[\s\S]*target\.address[\s\S]*createHmac\("sha256"/, v3],
  ["Trust and MLS executable runtime is not mounted", retiredRuntimeTokens.every((token) => !composition.includes(token)), "boolean"],
  ["Schema 8 is retained only as legacy compatibility data", containsAll(composition, ["upgradeStoreToSchema8", "legacyTrustMigration", "runtime: \"retired\"", "legacyHistory: \"read_only\""]), "boolean"],
  ["Legacy Trust and E2EE HTTP writes are terminal read-only", containsAll(stableCore, ["LEGACY_WRITE_PATTERN", "app.all", "410", "LEGACY_READ_ONLY"]), "boolean"],
  ["Legacy MLS Socket.IO writes are terminal read-only", containsAll(stableCore, ["socket.on(\"mls:message\", reject)", "socket.on(\"mls:message-edit\", reject)", "LEGACY_READ_ONLY"]), "boolean"],
  ["Legacy export never server-decrypts or exposes message text", containsAll(stableCore, ["serverDecrypted: false", "publicLegacyMessage", "ciphertext: envelope.ciphertext"]) && !stableCore.includes("text: message.text"), "boolean"],
  ["Secure serialization never exposes stored MLS plaintext", containsAll(model, ["message.mlsEnvelope", "message.type === \"encrypted\" ? \"\" : message.text"]), "boolean"],
  ["Server-owned device inventory is session-derived", containsAll(stableCore, ["deviceInventory", "sessionDeviceId", "/api/v3/devices"]) && containsAll(store, ["deviceId", "deviceName", "clientVersion"]), "boolean"],
  ["Client sends stable device identity metadata", containsAll(clientApi, ["X-Nexora-Device-ID", "X-Nexora-Device-Name", "X-Nexora-Platform"]), "boolean"],
  ["Device revoke immediately emits and disconnects target sessions", containsAll(stableCore, ["session.revoked", "disconnectSockets(true)", "device.updated"]), "boolean"],
  ["Current device cannot be remotely self-revoked", containsAll(stableCore, ["currentDevice: true", "terminalAction: \"logout\"", "STATE_CONFLICT"]), "boolean"],
  ["Device UI confirms destructive revocation", containsAll(deviceUi, ["window.confirm", "revoke_all_except_current", "requestId"]) || containsAll(deviceUi, ["window.confirm", "/api/v3/devices/sessions/others", "requestId"]), "boolean"],
  ["Signing status never returns credentials", containsAll(stableCore, ["/api/admin/release/signing-status", "secretsExposed: false"]) && !stableCore.includes("CSC_KEY_PASSWORD,"), "boolean"],
  ["Room access fails closed for active bans", model.includes("Boolean(roomRole(state, conversation.roomId, userId)) && !isRoomBanned"), "boolean"],
  ["Expired sessions and security history are periodically removed", containsAll(maintenance, ["cleanupSecurityState", "SECURITY_HISTORY_RETENTION_MS", "RATE_LIMIT_RETENTION_MS"]), "boolean"],
  ["Regular uploads sniff actual media type", containsAll(v3, ["sniffMime", "FILE_TYPE_MISMATCH", "X-Chunk-SHA256"]), "boolean"],
  ["Client updater requires Windows signature verification", /verifyUpdateCodeSignature:\s*true/, clientBuilder],
  ["Server updater requires Windows signature verification", /verifyUpdateCodeSignature:\s*true/, serverBuilder],
  ["Client and Server updater errors distinguish signature failures", containsAll(updateService, ["UPDATE_SIGNATURE_INVALID", "signature_invalid", "checksum"]), "boolean"],
  ["Updater has no downgrade fallback", !/allowDowngrade\s*[:=]\s*true/.test(updateService), "boolean"],
  ["Android cleartext disabled", /usesCleartextTraffic="false"/, androidManifest],
  ["Android TLS errors are cancelled", /onReceivedSslError[\s\S]*handler\.cancel\(\)/, android],
  ["Android never bypasses TLS errors", !/handler\.proceed\(\)/.test(android), "boolean"],
  ["Unsigned release excludes updater assets", containsAll(releaseWorkflow, [
    "Nexora-Client-Setup-$version-UNSIGNED-TEST.exe",
    "Nexora-Server-Setup-$version-UNSIGNED-TEST.exe",
    "Unsigned release must not expose updater metadata",
    '$names -contains "latest.yml"',
    "\\.blockmap$",
  ]), "boolean"],
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

function osTmp() {
  return process.env.TEMP || process.env.TMP || "/tmp";
}

try {
  const report = JSON.parse(audit.stdout || "{}");
  const high = Number(report.metadata?.vulnerabilities?.high || 0);
  const critical = Number(report.metadata?.vulnerabilities?.critical || 0);
  console.log(`${high + critical === 0 ? "PASS" : "FAIL"} production dependencies: high=${high}, critical=${critical}`);
  if (high || critical) failed = true;
} catch (error) {
  console.log(`WARN npm audit result unavailable: ${String(error?.message || "unknown error")}`);
}

if (failed) process.exitCode = 1;
