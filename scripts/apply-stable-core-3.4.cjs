"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function write(file, value) { fs.writeFileSync(path.join(root, file), value); }

function replaceExact(file, before, after) {
  let source = read(file);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected exactly one source match, found ${count}`);
  source = source.replace(before, after);
  write(file, source);
}

function replaceAll(file, before, after, minimum = 1) {
  let source = read(file);
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return;
  if (count < minimum) throw new Error(`${file}: expected at least ${minimum} matches for ${before}, found ${count}`);
  source = source.split(before).join(after);
  write(file, source);
}

replaceExact("server/stable-core.cjs",
  "    request.stableRequestId ||= request.pulseRequestId || requestId(request.headers[\"x-request-id\"]);\n    response.setHeader(\"X-Request-ID\", request.stableRequestId);",
  "    request.stableRequestId ||= request.pulseRequestId || requestId(request.headers[\"x-request-id\"]);\n    request.pulseRequestId ||= request.stableRequestId;\n    response.setHeader(\"X-Request-ID\", request.stableRequestId);",
);

replaceExact("server/create-server.cjs",
  "function apiError(response, status, error, code = \"REQUEST_FAILED\") {\n  response.status(status).json({ ok: false, error, code });\n}",
  "function apiError(response, status, error, code = \"REQUEST_FAILED\", details = {}) {\n  const requestId = response.locals?.requestId || crypto.randomUUID();\n  response.status(status).json({ ok: false, error, message: error, code, requestId, details });\n}",
);

replaceExact("server/create-server.cjs",
  "function normalizeUsername(value) {\n  return cleanLine(value, LIMITS.username).toLowerCase();\n}\n",
  `function normalizeUsername(value) {\n  return cleanLine(value, LIMITS.username).toLowerCase();\n}\n\nfunction sessionMetadata(request) {\n  const userAgent = cleanLine(request.headers[\"user-agent\"], 180);\n  const suppliedId = cleanLine(request.headers[\"x-nexora-device-id\"], 160);\n  const deviceId = /^[A-Za-z0-9_.:-]{8,160}$/.test(suppliedId)\n    ? suppliedId\n    : \`legacy-\${crypto.createHash(\"sha256\").update(userAgent || \"unknown\").digest(\"hex\").slice(0, 32)}\`;\n  const inferredPlatform = /Electron/i.test(userAgent) ? \"windows\"\n    : /Android/i.test(userAgent) ? \"android\"\n      : /iPhone|iPad/i.test(userAgent) ? \"ios\" : \"web\";\n  return {\n    deviceId,\n    deviceName: cleanLine(request.headers[\"x-nexora-device-name\"], 80) || (inferredPlatform === \"windows\" ? \"Nexora Client\" : \"Nexora Web\"),\n    platform: cleanLine(request.headers[\"x-nexora-platform\"], 40) || inferredPlatform,\n    clientVersion: cleanLine(request.headers[\"x-nexora-client-version\"], 40) || null,\n    userAgent,\n  };\n}\n`,
);

replaceExact("server/create-server.cjs",
  "  const app = express();\n  const operational = createOperationalRuntime({",
  `  const app = express();\n  app.use((request, response, next) => {\n    const supplied = String(request.headers[\"x-request-id\"] || \"\");\n    const requestId = /^[A-Za-z0-9_.:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();\n    request.nexoraRequestId = requestId;\n    response.locals.requestId = requestId;\n    response.setHeader(\"X-Request-ID\", requestId);\n    next();\n  });\n  const operational = createOperationalRuntime({`,
);

replaceExact("server/create-server.cjs",
  "    const userAgent = cleanLine(request.headers[\"user-agent\"], 180);\n    const ip = cleanLine(request.ip, 64);",
  "    const device = sessionMetadata(request);\n    const userAgent = device.userAgent;\n    const ip = cleanLine(request.ip, 64);",
);

replaceExact("server/create-server.cjs",
  "        createdAt, expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(), lastSeenAt: createdAt,\n        userAgent, ip,",
  "        createdAt, expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(), lastSeenAt: createdAt,\n        deviceId: device.deviceId, deviceName: device.deviceName, platform: device.platform, clientVersion: device.clientVersion,\n        userAgent, ip,",
);

replaceExact("server/create-server.cjs",
  "    const passwordData = await hashPassword(password);\n    const token = createSessionToken();",
  "    const passwordData = await hashPassword(password);\n    const token = createSessionToken();\n    const device = sessionMetadata(request);",
);

replaceExact("server/create-server.cjs",
  "          lastSeenAt: createdAt,\n          userAgent: cleanLine(request.headers[\"user-agent\"], 180),\n          ip: cleanLine(request.ip, 64),",
  "          lastSeenAt: createdAt,\n          deviceId: device.deviceId,\n          deviceName: device.deviceName,\n          platform: device.platform,\n          clientVersion: device.clientVersion,\n          userAgent: device.userAgent,\n          ip: cleanLine(request.ip, 64),",
);

replaceAll("server/create-server.cjs", "\"RATE_LIMIT\"", "\"RATE_LIMITED\"", 2);
replaceExact("server/create-server.cjs", "apiError(response, 401, \"Требуется вход в аккаунт.\", \"UNAUTHORIZED\")", "apiError(response, 401, \"Требуется вход в аккаунт.\", \"AUTH_REQUIRED\")");
replaceAll("server/create-server.cjs", "E2EE_REQUIRED", "LEGACY_READ_ONLY", 1);
replaceAll("server/create-server.cjs", "E2EE_FORWARD_REQUIRED", "LEGACY_READ_ONLY", 1);
replaceAll("server/create-server.cjs", "E2EE_ATTACHMENT_REQUIRED", "LEGACY_READ_ONLY", 1);
replaceAll("server/create-server.cjs", "MLS-диалог", "legacy secure dialog", 1);

replaceExact("server/create-server.cjs",
  "        resumableUploads: true, bots: true, pwa: true, android: true, totp: true,",
  "        resumableUploads: true, bots: true, pwa: true, android: true, totp: true,\n        trustRuntime: false, legacySecureHistory: true, legacySecureWrite: false, deviceInventory: true,",
);

replaceExact("server/create-server.cjs",
  "    operational,\n    dataDir,",
  "    operational,\n    maintenance,\n    dataDir,",
);

replaceExact("server/store.cjs",
  "  normalized.sessions = normalized.sessions.map((session) => ({\n    ...session,\n    csrfToken: session.csrfToken || crypto.randomBytes(24).toString(\"base64url\"),\n  }));",
  `  normalized.sessions = normalized.sessions.map((session) => ({\n    ...session,\n    csrfToken: session.csrfToken || crypto.randomBytes(24).toString(\"base64url\"),\n    deviceId: session.deviceId || \`legacy-\${session.id}\`,\n    deviceName: session.deviceName || session.name || \"Nexora device\",\n    platform: session.platform || \"unknown\",\n    clientVersion: session.clientVersion || null,\n  }));`,
);

replaceExact("server/maintenance.cjs",
  "  async restoreBackup(directory, options = {}) {",
  `  async verifyBackup(directory, options = {}) {\n    if (!options.locked) return this.withFileLock(() => this.verifyBackup(directory, { ...options, locked: true }));\n    const backup = await this.validateBackup(directory, { passphrase: options.passphrase });\n    try {\n      return {\n        backupId: path.basename(backup.directory),\n        createdAt: backup.manifest.createdAt,\n        appVersion: backup.manifest.appVersion || null,\n        schemaVersion: backup.manifest.schemaVersion || null,\n        encrypted: Boolean(backup.manifest.encrypted),\n        databaseIntegrity: \"ok\",\n        uploadsPresent: true,\n        verifiedAt: new Date().toISOString(),\n      };\n    } finally {\n      if (backup.materialized) await fs.rm(backup.materialized, { recursive: true, force: true });\n    }\n  }\n\n  async restoreBackup(directory, options = {}) {`,
);

for (const code of ["E2EE_DRAFT_LOCAL_ONLY", "E2EE_SCHEDULE_UNSUPPORTED", "E2EE_POLL_UNSUPPORTED", "E2EE_BOT_UNSUPPORTED", "E2EE_ATTACHMENT_REQUIRED"]) {
  replaceAll("server/v3-features.cjs", code, "LEGACY_READ_ONLY", 1);
}

replaceExact("client/src/api.js",
  "  constructor(message, status, code, details = {}) {",
  "  constructor(message, status, code, details = {}, requestId = null) {",
);
replaceExact("client/src/api.js",
  "    this.details = details;\n  }",
  "    this.details = details;\n    this.requestId = requestId || details?.requestId || null;\n  }",
);
replaceExact("client/src/api.js", "export const CLIENT_VERSION = \"3.3.3\";", "export const CLIENT_VERSION = \"3.4.0\";\nconst DEVICE_ID_KEY = \"nexora:device-id\";\nexport const DEVICE_ID = localStorage.getItem(DEVICE_ID_KEY) || crypto.randomUUID();\nlocalStorage.setItem(DEVICE_ID_KEY, DEVICE_ID);\nconst DEVICE_NAME = /Electron/i.test(navigator.userAgent) ? \"Nexora Client\" : \"Nexora Web\";\nconst DEVICE_PLATFORM = /Android/i.test(navigator.userAgent) ? \"android\" : /Electron|Windows/i.test(navigator.userAgent) ? \"windows\" : \"web\";");
replaceExact("client/src/api.js",
  "      \"X-Nexora-Client-Version\": CLIENT_VERSION,",
  "      \"X-Nexora-Client-Version\": CLIENT_VERSION,\n      \"X-Nexora-Device-ID\": DEVICE_ID,\n      \"X-Nexora-Device-Name\": DEVICE_NAME,\n      \"X-Nexora-Platform\": DEVICE_PLATFORM,",
);
replaceExact("client/src/api.js",
  "    throw new ApiError(body?.message ?? body?.error ?? `Ошибка ${response.status}`, response.status, body?.code, {\n      ...(body?.details || {}),\n      ...(retryAfter ? { retryAfter } : {}),\n    });",
  "    throw new ApiError(body?.message ?? body?.error ?? `Ошибка ${response.status}`, response.status, body?.code, {\n      ...(body?.details || {}),\n      ...(retryAfter ? { retryAfter } : {}),\n      ...(body?.requestId ? { requestId: body.requestId } : {}),\n    }, body?.requestId || response.headers.get(\"x-request-id\"));",
);
replaceAll("client/src/api.js",
  "\"X-Nexora-Client-Version\": CLIENT_VERSION, \"X-Chunk-SHA256\": checksum",
  "\"X-Nexora-Client-Version\": CLIENT_VERSION, \"X-Nexora-Device-ID\": DEVICE_ID, \"X-Nexora-Device-Name\": DEVICE_NAME, \"X-Nexora-Platform\": DEVICE_PLATFORM, \"X-Chunk-SHA256\": checksum",
  1,
);
replaceExact("client/src/api.js",
  "    requestValue.setRequestHeader(\"X-Nexora-Client-Version\", CLIENT_VERSION);",
  "    requestValue.setRequestHeader(\"X-Nexora-Client-Version\", CLIENT_VERSION);\n    requestValue.setRequestHeader(\"X-Nexora-Device-ID\", DEVICE_ID);\n    requestValue.setRequestHeader(\"X-Nexora-Device-Name\", DEVICE_NAME);\n    requestValue.setRequestHeader(\"X-Nexora-Platform\", DEVICE_PLATFORM);",
);

replaceAll("package.json", "\"version\": \"3.3.3\"", "\"version\": \"3.4.0\"", 1);
replaceAll("package-lock.json", "\"version\": \"3.3.3\"", "\"version\": \"3.4.0\"", 2);
replaceExact("android/app/build.gradle.kts", "        versionCode = 30303\n        versionName = \"3.3.3\"", "        versionCode = 30400\n        versionName = \"3.4.0\"");

replaceExact("electron-builder.server.yml",
  "directories:\n  output: release/server\nfiles:",
  "directories:\n  output: release/server\npublish:\n  provider: generic\n  url: https://github.com/Onmaynec/Nexora/releases/download/server-stable\n  channel: server\nfiles:",
);
replaceExact("electron-builder.server.yml",
  "win:\n  icon: build/icon.ico\n  target:",
  "win:\n  icon: build/icon.ico\n  verifyUpdateCodeSignature: true\n  target:",
);

replaceExact("electron/update-service.cjs",
  "  if (kind !== \"client\") return null;\n  return {\n    ...DEFAULT_GITHUB_RELEASES,",
  "  return {\n    ...DEFAULT_GITHUB_RELEASES,",
);
replaceExact("electron/update-service.cjs",
  "    repo: String(process.env.NEXORA_GITHUB_REPO || DEFAULT_GITHUB_RELEASES.repo),\n  };",
  "    repo: String(process.env.NEXORA_GITHUB_REPO || DEFAULT_GITHUB_RELEASES.repo),\n    ...(kind === \"server\" ? { channel: \"server\" } : {}),\n  };",
);
replaceExact("electron/update-service.cjs",
  "  if (/net::ERR_|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(message)) {",
  "  if (/signature|publisher|certificate|checksum|sha-?256|tamper/i.test(message)) {\n    return { reason: \"signature_invalid\", code: \"UPDATE_SIGNATURE_INVALID\", error: \"Подпись или контрольная сумма обновления недействительна.\" };\n  }\n  if (/net::ERR_|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(message)) {",
);
replaceExact("electron/update-service.cjs",
  "  return { reason: \"update_error\", error: message };",
  "  return { reason: \"update_error\", code: \"TEMPORARY_UNAVAILABLE\", error: message };",
);
replaceExact("electron/update-service.cjs",
  "    detailsUrl: kind === \"client\" ? \"https://github.com/Onmaynec/Nexora/releases/latest\" : null,",
  "    detailsUrl: \"https://github.com/Onmaynec/Nexora/releases/latest\",\n    signature: \"required\",",
);

const stableTest = `"use strict";\n\nconst assert = require("node:assert/strict");\nconst test = require("node:test");\nconst { deviceInventory, publicLegacyMessage, sessionDeviceId } = require("../server/stable-core.cjs");\n\ntest("device inventory groups sessions and marks the current device", () => {\n  const state = { sessions: [\n    { id: "s1", userId: "u1", deviceId: "d1", deviceName: "Laptop", platform: "windows", clientVersion: "3.4.0", createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-03T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },\n    { id: "s2", userId: "u1", deviceId: "d1", deviceName: "Laptop", platform: "windows", clientVersion: "3.4.0", createdAt: "2026-01-02T00:00:00.000Z", lastSeenAt: "2026-01-04T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },\n    { id: "s3", userId: "u1", deviceId: "d2", deviceName: "Phone", platform: "android", clientVersion: "3.4.0", createdAt: "2026-01-02T00:00:00.000Z", lastSeenAt: "2026-01-02T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },\n  ] };\n  const devices = deviceInventory(state, "u1", "s2");\n  assert.equal(devices.length, 2);\n  assert.equal(devices[0].deviceId, "d1");\n  assert.equal(devices[0].current, true);\n  assert.equal(devices[0].sessionCount, 2);\n});\n\ntest("legacy messages expose ciphertext metadata but never plaintext", () => {\n  const value = publicLegacyMessage({ id: "m1", conversationId: "c1", senderId: "u1", type: "encrypted", text: "must-not-leak", createdAt: "2026-01-01T00:00:00.000Z", mlsEnvelope: { ciphertext: "opaque", epoch: 3, messageHash: "hash" } });\n  assert.equal(value.ciphertext, "opaque");\n  assert.equal(value.readOnly, true);\n  assert.equal(Object.hasOwn(value, "text"), false);\n});\n\ntest("legacy sessions receive a stable fallback device id", () => {\n  assert.equal(sessionDeviceId({ id: "session-1" }), "legacy-session-1");\n});\n`;
write("test/stable-core.test.cjs", stableTest);

console.log("Stable Core 3.4.0 deterministic migration applied");
