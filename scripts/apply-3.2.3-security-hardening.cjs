"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function file(relativePath) { return path.join(root, relativePath); }
function read(relativePath) { return fs.readFileSync(file(relativePath), "utf8"); }
function write(relativePath, content) { fs.writeFileSync(file(relativePath), content, "utf8"); }

function replaceOnce(relativePath, before, after, label = relativePath) {
  const source = read(relativePath);
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Patch target is ambiguous: ${label}`);
  write(relativePath, source.slice(0, index) + after + source.slice(index + before.length));
}

replaceOnce(
  "server/trust-core.cjs",
  `const MAX_KEY_PACKAGE_BYTES = 64 * 1024;
const MAX_MLS_MESSAGE_BYTES = 256 * 1024;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");`,
  `const MAX_KEY_PACKAGE_BYTES = 64 * 1024;
const MAX_MLS_MESSAGE_BYTES = 256 * 1024;
const MAX_ACTIVE_DEVICES_PER_USER = 16;
const MAX_KEY_PACKAGES_PER_UPLOAD = 25;
const MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE = 32;
const MAX_ACTIVE_KEY_PACKAGES_PER_USER = 256;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const AUDIT_METADATA_FIELDS = Object.freeze({
  "device.registered": ["trustState", "proofHash"],
  "device.verified": ["proofHash"],
  "device.revoked": ["proofHash"],
  "mls.key_packages_uploaded": ["count"],
  "mls.key_package_claimed": ["targetUserId"],
  "mls.group_created": ["groupRecordId", "ciphersuite"],
  "mls.commit_recorded": ["previousEpoch", "epoch", "commitHash", "added", "removed"],
  "mls.welcome_claimed": ["conversationId", "epoch"],
});`,
  "Trust resource constants",
);

replaceOnce(
  "server/trust-core.cjs",
  `function normalizedBase64(value, options) {
  return decodeBase64(value, options).toString("base64");
}

function normalizeUuid`,
  `function normalizedBase64(value, options) {
  return decodeBase64(value, options).toString("base64");
}

function normalizeCredential(value, userId, deviceId) {
  const bytes = decodeBase64(value, { min: 1, max: 1024, field: "credential" });
  let credential;
  try { credential = JSON.parse(bytes.toString("utf8")); }
  catch { throw new TrustCoreError("MLS credential имеет неверный формат.", "TRUST_CREDENTIAL_INVALID", 400); }
  const keys = credential && typeof credential === "object" && !Array.isArray(credential) ? Object.keys(credential).sort() : [];
  if (keys.join(",") !== "deviceId,userId,version"
    || credential.version !== 1
    || String(credential.userId) !== String(userId)
    || String(credential.deviceId).toLowerCase() !== String(deviceId).toLowerCase()) {
    throw new TrustCoreError("MLS credential не соответствует пользователю или устройству.", "TRUST_CREDENTIAL_SCOPE_INVALID", 409);
  }
  return bytes.toString("base64");
}

function normalizeUuid`,
  "credential binding helper",
);

replaceOnce(
  "server/trust-core.cjs",
  `class TrustCore {`,
  `function sanitizeAuditMetadata(action, metadata) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const result = {};
  for (const key of AUDIT_METADATA_FIELDS[String(action)] || []) {
    const value = source[key];
    if (typeof value === "string") result[key] = value.slice(0, 256);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean" || value === null) result[key] = value;
  }
  return result;
}

class TrustCore {`,
  "audit allowlist helper",
);

replaceOnce(
  "server/trust-core.cjs",
  `  audit({ userId = null, actorDeviceId = null, action, targetType, targetId = null, metadata = {} }) {
    const safeMetadata = structuredClone(metadata || {});
    for (const key of Object.keys(safeMetadata)) {
      if (/key|signature|credential|package|welcome|ciphertext|token|secret/i.test(key)) delete safeMetadata[key];
    }
    this.db.prepare(\`INSERT INTO trust_audit(id,user_id,actor_device_id,action,target_type,target_id,created_at,metadata_json)
      VALUES(?,?,?,?,?,?,?,?)\`).run(
      crypto.randomUUID(), userId, actorDeviceId, String(action), String(targetType), targetId, this.timestamp(), JSON.stringify(safeMetadata),
    );
  }`,
  `  audit({ userId = null, actorDeviceId = null, action, targetType, targetId = null, metadata = {} }) {
    const safeMetadata = sanitizeAuditMetadata(action, metadata);
    this.db.prepare(\`INSERT INTO trust_audit(id,user_id,actor_device_id,action,target_type,target_id,created_at,metadata_json)
      VALUES(?,?,?,?,?,?,?,?)\`).run(
      crypto.randomUUID(), userId, actorDeviceId, String(action), String(targetType), targetId, this.timestamp(), JSON.stringify(safeMetadata),
    );
  }`,
  "Trust audit sanitizer",
);

replaceOnce(
  "server/trust-core.cjs",
  `    const identity = rawEd25519Key(identityKey, "identityKey").base64;
    const signing = rawEd25519Key(signatureKey, "signatureKey").base64;
    const normalizedCredential = normalizedBase64(credential, { min: 1, max: 1024, field: "credential" });`,
  `    const identity = rawEd25519Key(identityKey, "identityKey").base64;
    const signing = rawEd25519Key(signatureKey, "signatureKey").base64;
    if (identity === signing) throw new TrustCoreError("Identity и MLS signature keys должны быть различными.", "TRUST_KEY_REUSE_FORBIDDEN", 409);
    const normalizedCredential = normalizeCredential(credential, String(userId), id);`,
  "Trust registration key and credential validation",
);

replaceOnce(
  "server/trust-core.cjs",
  `      const activeCount = Number(this.db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active'").get(String(userId)).count || 0);
      const trustState = activeCount === 0 ? "verified" : "unverified";`,
  `      const activeCount = Number(this.db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active'").get(String(userId)).count || 0);
      if (activeCount >= MAX_ACTIVE_DEVICES_PER_USER) {
        throw new TrustCoreError("Достигнут лимит активных доверенных устройств.", "TRUST_DEVICE_LIMIT_REACHED", 409, { limit: MAX_ACTIVE_DEVICES_PER_USER });
      }
      const trustState = activeCount === 0 ? "verified" : "unverified";`,
  "active Trust device limit",
);

replaceOnce(
  "server/trust-core.cjs",
  `  uploadKeyPackages({ userId, deviceId, packages }) {
    const device = this.requireDevice(userId, deviceId, { verified: true });
    const list = Array.isArray(packages) ? packages.slice(0, 25) : [];
    if (!list.length) throw new TrustCoreError("KeyPackage не переданы.", "MLS_KEY_PACKAGE_REQUIRED", 400);`,
  `  uploadKeyPackages({ userId, deviceId, packages }) {
    const device = this.requireDevice(userId, deviceId, { verified: true });
    const list = Array.isArray(packages) ? packages : [];
    if (!list.length) throw new TrustCoreError("KeyPackage не переданы.", "MLS_KEY_PACKAGE_REQUIRED", 400);
    if (list.length > MAX_KEY_PACKAGES_PER_UPLOAD) {
      throw new TrustCoreError("Слишком много KeyPackage в одном запросе.", "MLS_KEY_PACKAGE_BATCH_TOO_LARGE", 413, { limit: MAX_KEY_PACKAGES_PER_UPLOAD });
    }`,
  "KeyPackage batch validation",
);

replaceOnce(
  "server/trust-core.cjs",
  `    const results = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of list) {`,
  `    const results = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM mls_key_packages WHERE expires_at <= ? OR (claimed_at IS NOT NULL AND claimed_at < datetime(?, '-7 days'))").run(now, now);
      let deviceAvailable = Number(this.db.prepare("SELECT COUNT(*) AS count FROM mls_key_packages WHERE device_id=? AND claimed_at IS NULL AND expires_at>?").get(device.id, now).count || 0);
      let userAvailable = Number(this.db.prepare("SELECT COUNT(*) AS count FROM mls_key_packages WHERE user_id=? AND claimed_at IS NULL AND expires_at>?").get(String(userId), now).count || 0);
      for (const item of list) {`,
  "KeyPackage transactional counters",
);

replaceOnce(
  "server/trust-core.cjs",
  `        const id = crypto.randomUUID();
        this.db.prepare(\`INSERT INTO mls_key_packages(
          id,user_id,device_id,ciphersuite,package_hash,package_data,created_at,expires_at,claimed_at,claimed_by_user_id,claimed_by_device_id
        ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,NULL)\`).run(id, String(userId), device.id, ciphersuite, packageHash, bytes.toString("base64"), now, expiresAt.toISOString());
        results.push({ id, packageHash, duplicate: false, expiresAt: expiresAt.toISOString() });`,
  `        if (deviceAvailable >= MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE || userAvailable >= MAX_ACTIVE_KEY_PACKAGES_PER_USER) {
          throw new TrustCoreError("Достигнут лимит доступных MLS KeyPackage.", "MLS_KEY_PACKAGE_LIMIT_REACHED", 409, {
            deviceLimit: MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE,
            userLimit: MAX_ACTIVE_KEY_PACKAGES_PER_USER,
          });
        }
        const id = crypto.randomUUID();
        this.db.prepare(\`INSERT INTO mls_key_packages(
          id,user_id,device_id,ciphersuite,package_hash,package_data,created_at,expires_at,claimed_at,claimed_by_user_id,claimed_by_device_id
        ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,NULL)\`).run(id, String(userId), device.id, ciphersuite, packageHash, bytes.toString("base64"), now, expiresAt.toISOString());
        deviceAvailable += 1;
        userAvailable += 1;
        results.push({ id, packageHash, duplicate: false, expiresAt: expiresAt.toISOString() });`,
  "KeyPackage total limits",
);

replaceOnce(
  "server/trust-core.cjs",
  `module.exports = {
  CHALLENGE_TTL_MS,
  MLS_CIPHERSUITE,
  MAX_KEY_PACKAGE_BYTES,
  MAX_MLS_MESSAGE_BYTES,`,
  `module.exports = {
  CHALLENGE_TTL_MS,
  MLS_CIPHERSUITE,
  MAX_ACTIVE_DEVICES_PER_USER,
  MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE,
  MAX_ACTIVE_KEY_PACKAGES_PER_USER,
  MAX_KEY_PACKAGES_PER_UPLOAD,
  MAX_KEY_PACKAGE_BYTES,
  MAX_MLS_MESSAGE_BYTES,`,
  "Trust constants exports",
);

replaceOnce(
  "server/trust-core.cjs",
  `  publicDevice,
  publicGroup,
  verifyProof,`,
  `  publicDevice,
  publicGroup,
  sanitizeAuditMetadata,
  verifyProof,`,
  "audit sanitizer export",
);

replaceOnce(
  "server/model.cjs",
  `  return Boolean(roomRole(state, conversation.roomId, userId));`,
  `  return Boolean(roomRole(state, conversation.roomId, userId)) && !isRoomBanned(state, conversation.roomId, userId);`,
  "fail-closed room access",
);

replaceOnce(
  "server/maintenance.cjs",
  `const scrypt = promisify(crypto.scrypt);`,
  `const scrypt = promisify(crypto.scrypt);
const SECURITY_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;`,
  "maintenance retention constants",
);

replaceOnce(
  "server/maintenance.cjs",
  `    await this.cleanupFiles();
    await this.ensureAutomaticBackup();
    this.timer = setInterval(() => {
      this.cleanupFiles().then(() => this.ensureAutomaticBackup()).catch((error) => this.log(\`Фоновое обслуживание: \${error.message}\`, "warn"));
    }, 60 * 60 * 1000);`,
  `    await this.cleanupFiles();
    await this.cleanupSecurityState();
    await this.ensureAutomaticBackup();
    this.timer = setInterval(() => {
      this.cleanupFiles()
        .then(() => this.cleanupSecurityState())
        .then(() => this.ensureAutomaticBackup())
        .catch((error) => this.log(\`Фоновое обслуживание: \${error.message}\`, "warn"));
    }, 60 * 60 * 1000);`,
  "security maintenance scheduling",
);

replaceOnce(
  "server/maintenance.cjs",
  `  async cleanupFiles(options = {}) {`,
  `  async cleanupSecurityState({ now = Date.now() } = {}) {
    const securityCutoff = Number(now) - SECURITY_HISTORY_RETENTION_MS;
    const rateLimitCutoff = Number(now) - RATE_LIMIT_RETENTION_MS;
    let removed = { sessions: 0, loginAttempts: 0, rateLimits: 0 };
    await this.store.mutate((state) => {
      const sessions = Array.isArray(state.sessions) ? state.sessions : [];
      const loginAttempts = Array.isArray(state.loginAttempts) ? state.loginAttempts : [];
      const rateLimits = Array.isArray(state.rateLimits) ? state.rateLimits : [];
      const nextSessions = sessions.filter((item) => Date.parse(item.expiresAt) > Number(now));
      const nextLoginAttempts = loginAttempts.filter((item) => Date.parse(item.createdAt) >= securityCutoff);
      const nextRateLimits = rateLimits.filter((item) => Date.parse(item.windowStartedAt) >= rateLimitCutoff);
      removed = {
        sessions: sessions.length - nextSessions.length,
        loginAttempts: loginAttempts.length - nextLoginAttempts.length,
        rateLimits: rateLimits.length - nextRateLimits.length,
      };
      state.sessions = nextSessions;
      state.loginAttempts = nextLoginAttempts;
      state.rateLimits = nextRateLimits;
    });
    if (removed.sessions || removed.loginAttempts || removed.rateLimits) {
      this.log(\`Очистка security state: сессий \${removed.sessions}, login history \${removed.loginAttempts}, rate-limit buckets \${removed.rateLimits}\`);
    }
    return removed;
  }

  async cleanupFiles(options = {}) {`,
  "security state cleanup",
);

replaceOnce(
  "client/src/crypto/trust-client.js",
  `} from "./mls-engine";
import { memberDirectory } from "./mls-members";`,
  `} from "./mls-engine";
import { replayMissedCommits } from "./mls-recovery.mjs";
import { memberDirectory } from "./mls-members";`,
  "MLS recovery import",
);

replaceOnce(
  "client/src/crypto/trust-client.js",
  `async function syncMissedCommits(local, remote, device) {
  if (!local || local.epoch >= remote.epoch) return local;
  const result = await trustApi(\`/groups/\${encodeURIComponent(remote.id)}/commits?after=\${local.epoch}\`, { deviceId: device.id });
  let state = local.state;
  let publicStateHash = local.publicStateHash;
  for (const item of result.commits || []) {
    const processed = await processCommitMessage({ state, commitBytes: fromBase64(item.commit), resolveDevice: resolveTrustedDevice });
    state = processed.state;
    publicStateHash = processed.publicStateHash;
    if (processed.epoch !== Number(item.epoch)) throw Object.assign(new Error("MLS commit epoch mismatch."), { code: "MLS_EPOCH_CONFLICT" });
  }
  if (Number(state.groupContext.epoch) !== Number(remote.epoch)) throw Object.assign(new Error("Не удалось восстановить актуальную MLS epoch."), { code: "MLS_COMMIT_GAP" });
  return persistGroup(remote.conversationId, remote.id, state, publicStateHash);
}`,
  `async function syncMissedCommits(local, remote, device) {
  if (!local || local.epoch >= remote.epoch) return local;
  const result = await trustApi(\`/groups/\${encodeURIComponent(remote.id)}/commits?after=\${local.epoch}\`, { deviceId: device.id });
  const replayed = await replayMissedCommits({
    local,
    remote,
    result,
    decodeCommit: fromBase64,
    hashCommit: sha256Hex,
    processCommit: ({ state, commitBytes, resolveDevice }) => processCommitMessage({ state, commitBytes, resolveDevice }),
    resolveDevice: resolveTrustedDevice,
  });
  return persistGroup(remote.conversationId, remote.id, replayed.state, replayed.publicStateHash);
}`,
  "strict MLS recovery",
);

replaceOnce(
  "server/trust-routes.cjs",
  `const { disconnectTrustDevice, emitToVerifiedGroupDevices } = require("./trust-socket.cjs");`,
  `const { disconnectTrustDevice, emitToVerifiedGroupDevices } = require("./trust-socket.cjs");
const { createSlidingWindowRateLimiter } = require("./rate-limit.cjs");`,
  "Trust rate limiter import",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  if (!app || !store || !io || !trustCore) throw new Error("Trust routes require app, store, io and trustCore.");

  function context`,
  `  if (!app || !store || !io || !trustCore) throw new Error("Trust routes require app, store, io and trustCore.");

  const trustRateLimits = Object.freeze({
    directory: createSlidingWindowRateLimiter({ windowMs: 60 * 60_000, limit: 100, maxBuckets: 20_000 }),
    registrationChallenge: createSlidingWindowRateLimiter({ windowMs: 60 * 60_000, limit: 20, maxBuckets: 20_000 }),
    deviceRegistration: createSlidingWindowRateLimiter({ windowMs: 60 * 60_000, limit: 10, maxBuckets: 20_000 }),
    keyPackageUpload: createSlidingWindowRateLimiter({ windowMs: 60 * 60_000, limit: 60, maxBuckets: 20_000 }),
    keyPackageClaim: createSlidingWindowRateLimiter({ windowMs: 60 * 60_000, limit: 120, maxBuckets: 20_000 }),
    recovery: createSlidingWindowRateLimiter({ windowMs: 60 * 60_000, limit: 240, maxBuckets: 20_000 }),
  });

  function enforceRateLimit(limiter, key, response, message = "Слишком много запросов к Trust Core.") {
    const decision = limiter.consume(key);
    if (decision.allowed) return decision;
    const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    response.setHeader("Retry-After", String(retryAfter));
    throw new TrustCoreError(message, "RATE_LIMITED", 429, { retryAfter });
  }

  function context`,
  "Trust route limiters",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  app.get("/api/v4/trust/users/:userId/devices", asyncRoute(async (request, response) => {
    if (!usersCanExchangeKeys`,
  `  app.get("/api/v4/trust/users/:userId/devices", asyncRoute(async (request, response) => {
    enforceRateLimit(trustRateLimits.directory, String(request.ip || "unknown"), response, "Слишком много запросов каталога устройств.");
    if (!usersCanExchangeKeys`,
  "device directory rate limit",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  app.post("/api/v4/trust/challenges", asyncRoute(async (request, response) => {
    const purpose = String(request.body?.purpose || "");`,
  `  app.post("/api/v4/trust/challenges", asyncRoute(async (request, response) => {
    const purpose = String(request.body?.purpose || "");
    if (purpose === "register_device") {
      enforceRateLimit(
        trustRateLimits.registrationChallenge,
        \`\${request.trustAuth.user.id}:\${request.ip || "unknown"}\`,
        response,
        "Слишком много запросов регистрации устройства.",
      );
    }`,
  "device challenge rate limit",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  app.post("/api/v4/trust/devices", asyncRoute(async (request, response) => {
    const result = trustCore.registerDevice({`,
  `  app.post("/api/v4/trust/devices", asyncRoute(async (request, response) => {
    enforceRateLimit(
      trustRateLimits.deviceRegistration,
      \`\${request.trustAuth.user.id}:\${request.ip || "unknown"}\`,
      response,
      "Слишком много регистраций устройств.",
    );
    const result = trustCore.registerDevice({`,
  "device registration route limit",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  app.post("/api/v4/trust/key-packages", asyncRoute(async (request, response) => {
    const packages = trustCore.uploadKeyPackages({
      userId: request.trustAuth.user.id,
      deviceId: deviceId(request),`,
  `  app.post("/api/v4/trust/key-packages", asyncRoute(async (request, response) => {
    const requesterDeviceId = deviceId(request);
    enforceRateLimit(
      trustRateLimits.keyPackageUpload,
      \`\${request.trustAuth.user.id}:\${requesterDeviceId}\`,
      response,
      "Слишком много загрузок KeyPackage.",
    );
    const packages = trustCore.uploadKeyPackages({
      userId: request.trustAuth.user.id,
      deviceId: requesterDeviceId,`,
  "KeyPackage upload rate limit",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  app.post("/api/v4/trust/users/:userId/key-packages/claim", asyncRoute(async (request, response) => {
    if (!usersCanExchangeKeys`,
  `  app.post("/api/v4/trust/users/:userId/key-packages/claim", asyncRoute(async (request, response) => {
    const requesterDeviceId = deviceId(request);
    enforceRateLimit(
      trustRateLimits.keyPackageClaim,
      \`\${request.trustAuth.user.id}:\${requesterDeviceId}\`,
      response,
      "Слишком много запросов KeyPackage.",
    );
    if (!usersCanExchangeKeys`,
  "generic KeyPackage claim rate limit",
);

replaceOnce(
  "server/trust-routes.cjs",
  `      requesterDeviceId: deviceId(request),`,
  `      requesterDeviceId,`,
  "reuse generic requester device id",
);

replaceOnce(
  "server/trust-routes.cjs",
  `  return { authRequired, requireConversation, usersCanExchangeKeys };`,
  `  return { authRequired, requireConversation, usersCanExchangeKeys, enforceRateLimit, trustRateLimits };`,
  "shared Trust route controls",
);

replaceOnce(
  "server/trust-recovery-routes.cjs",
  `function mountTrustRecoveryRoutes({ app, trustCore, authRequired, requireConversation, usersCanExchangeKeys } = {}) {`,
  `function mountTrustRecoveryRoutes({ app, trustCore, authRequired, requireConversation, usersCanExchangeKeys, enforceRateLimit, trustRateLimits } = {}) {`,
  "Trust recovery controls signature",
);

replaceOnce(
  "server/trust-recovery-routes.cjs",
  `    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    const keyPackage = claimKeyPackageForDevice`,
  `    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    enforceRateLimit(trustRateLimits.keyPackageClaim, \`\${request.trustAuth.user.id}:\${requesterDeviceId}\`, response, "Слишком много запросов KeyPackage.");
    const keyPackage = claimKeyPackageForDevice`,
  "device-specific KeyPackage claim rate limit",
);

replaceOnce(
  "server/trust-recovery-routes.cjs",
  `    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    const welcome = claimWelcomeForConversation`,
  `    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    enforceRateLimit(trustRateLimits.recovery, \`welcome:\${request.trustAuth.user.id}:\${requesterDeviceId}\`, response, "Слишком много запросов MLS recovery.");
    const welcome = claimWelcomeForConversation`,
  "Welcome recovery rate limit",
);

replaceOnce(
  "server/trust-recovery-routes.cjs",
  `    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    const group = trustCore.db.prepare`,
  `    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    enforceRateLimit(trustRateLimits.recovery, \`commits:\${request.trustAuth.user.id}:\${requesterDeviceId}\`, response, "Слишком много запросов MLS recovery.");
    const group = trustCore.db.prepare`,
  "commit recovery rate limit",
);

replaceOnce(
  "server/e2ee-attachments.cjs",
  `const { stableError } = require("./trust-routes.cjs");`,
  `const { stableError } = require("./trust-routes.cjs");
const { createSlidingWindowRateLimiter } = require("./rate-limit.cjs");`,
  "attachment shared limiter import",
);

replaceOnce(
  "server/e2ee-attachments.cjs",
  `function createRateLimiter({ windowMs = 60_000, limit = 30 } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    buckets.set(key, recent);
    return true;
  };
}

`,
  ``,
  "remove duplicate attachment limiter",
);

replaceOnce(
  "server/e2ee-attachments.cjs",
  `  const uploadRate = createRateLimiter({ windowMs: 60_000, limit: 20 });`,
  `  const uploadRate = createSlidingWindowRateLimiter({ windowMs: 60_000, limit: 20, maxBuckets: 20_000 });`,
  "attachment shared limiter",
);

replaceOnce(
  "server/e2ee-attachments.cjs",
  `        const userId = request.trustAuth.user.id;
        if (!uploadRate(userId)) throw new TrustCoreError("Слишком много E2EE upload-запросов.", "RATE_LIMITED", 429);`,
  `        const userId = request.trustAuth.user.id;
        const rateDecision = uploadRate.consume(userId);
        if (!rateDecision.allowed) {
          const retryAfter = Math.max(1, Math.ceil(rateDecision.retryAfterMs / 1000));
          response.setHeader("Retry-After", String(retryAfter));
          throw new TrustCoreError("Слишком много E2EE upload-запросов.", "RATE_LIMITED", 429, { retryAfter });
        }`,
  "attachment limiter decision",
);

const packageJson = JSON.parse(read("package.json"));
packageJson.version = "3.2.3";
write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

replaceOnce(
  "scripts/security-audit.cjs",
  `const trustStore = read("client/src/crypto/trust-store.js");
const mlsEngine = read("client/src/crypto/mls-engine.js");`,
  `const trustStore = read("client/src/crypto/trust-store.js");
const mlsRecovery = read("client/src/crypto/mls-recovery.mjs");
const mlsEngine = read("client/src/crypto/mls-engine.js");
const rateLimit = read("server/rate-limit.cjs");
const maintenance = read("server/maintenance.cjs");`,
  "security audit sources",
);

replaceOnce(
  "scripts/security-audit.cjs",
  `  ["Trust device proofs use Ed25519 verification", containsAll(trustCore, ["verifyProof", "crypto.verify(null"]), "boolean"],`,
  `  ["Trust device proofs use Ed25519 verification", containsAll(trustCore, ["verifyProof", "crypto.verify(null"]), "boolean"],
  ["Trust credential is bound to user and device", containsAll(trustCore, ["normalizeCredential", "TRUST_CREDENTIAL_SCOPE_INVALID", "TRUST_KEY_REUSE_FORBIDDEN"]), "boolean"],
  ["Trust active devices are bounded", containsAll(trustCore, ["MAX_ACTIVE_DEVICES_PER_USER", "TRUST_DEVICE_LIMIT_REACHED"]), "boolean"],
  ["MLS KeyPackage inventory is bounded", containsAll(trustCore, ["MAX_ACTIVE_KEY_PACKAGES_PER_DEVICE", "MAX_ACTIVE_KEY_PACKAGES_PER_USER", "MLS_KEY_PACKAGE_LIMIT_REACHED"]), "boolean"],
  ["Trust audit metadata uses an action allowlist", containsAll(trustCore, ["AUDIT_METADATA_FIELDS", "sanitizeAuditMetadata"]), "boolean"],
  ["Trust endpoints use bounded shared rate limiting", containsAll(trustRoutes, ["trustRateLimits", "directory", "deviceRegistration", "keyPackageUpload"]) && containsAll(rateLimit, ["createSlidingWindowRateLimiter", "maxBuckets"]), "boolean"],`,
  "Trust security audit checks",
);

replaceOnce(
  "scripts/security-audit.cjs",
  `  ["MLS transport rejects ciphertext replay", trustCore.includes("MLS_MESSAGE_REPLAY") && trustCore.includes("mls_replay_cache") && mlsTransport.includes("trustCore.reserveMessage"), "boolean"],`,
  `  ["MLS transport rejects ciphertext replay", trustCore.includes("MLS_MESSAGE_REPLAY") && trustCore.includes("mls_replay_cache") && mlsTransport.includes("trustCore.reserveMessage"), "boolean"],
  ["MLS recovery validates scope, sequence, hashes and duplicate commits", containsAll(mlsRecovery, ["MLS_COMMIT_SCOPE_INVALID", "MLS_COMMIT_SEQUENCE_INVALID", "MLS_COMMIT_HASH_MISMATCH", "MLS_COMMIT_REPLAY"]), "boolean"],
  ["Room access fails closed for active bans", model.includes("Boolean(roomRole(state, conversation.roomId, userId)) && !isRoomBanned"), "boolean"],
  ["Expired sessions and security history are periodically removed", containsAll(maintenance, ["cleanupSecurityState", "SECURITY_HISTORY_RETENTION_MS", "RATE_LIMIT_RETENTION_MS"]), "boolean"],`,
  "recovery and cleanup audit checks",
);

replaceOnce(
  "CHANGELOG.md",
  `## [3.2.2] — 2026-07-22`,
  `## [3.2.3] — 2026-07-22

### Security

- Trust device registration validates that the MLS BasicCredential is exactly bound to the authenticated user and candidate device, and rejects reuse of one Ed25519 key for both identity proof and MLS signatures;
- active Trust devices are limited to 16 per user; duplicate registration remains idempotent and revoked devices release capacity;
- unclaimed MLS KeyPackage inventory is limited to 32 per device and 256 per user, with atomic enforcement and expired-row cleanup;
- Trust directory, enrollment, KeyPackage and recovery endpoints use bounded shared sliding-window rate limits with stable \`RATE_LIMITED\` errors and \`Retry-After\`;
- Trust audit metadata now uses an action-specific primitive allowlist instead of a shallow key blacklist;
- room conversation access fails closed when an inconsistent active ban and stale membership coexist;
- missed MLS commit recovery verifies group scope, contiguous epochs, ciphertext hash, duplicate hashes and every public-state hash before persisting state;
- hourly maintenance removes expired sessions, login history older than 90 days and stale persistent rate-limit buckets.

### Confirmed existing protections

- CSRF and Origin validation, Socket.IO Origin rejection, AES-GCM sealed IndexedDB state, exact opaque attachment size/hash/quota checks and server-side MLS replay constraints were already present and remain covered by release security gates.

### Compatibility

- Local Server schema remains 8; API v3 and Trust/MLS API v4 remain compatible; no database migration is required.

## [3.2.2] — 2026-07-22`,
  "3.2.3 changelog",
);

write("RELEASE_NOTES_3.2.3.md", `# Nexora 3.2.3 — Security hardening

Nexora 3.2.3 is a focused security patch for Trust Core resource governance, recovery validation and stale security-state cleanup.

## Fixed

- MLS BasicCredential is now strictly bound to the authenticated user and candidate device.
- Identity and MLS signature Ed25519 keys must be distinct.
- Active Trust devices are limited to 16 per account.
- Available KeyPackage inventory is limited to 32 per device and 256 per account.
- Trust directory, enrollment, KeyPackage and recovery operations have bounded route-specific rate limits.
- Trust audit metadata uses an action allowlist and cannot retain nested arbitrary structures.
- Room access rejects actively banned users even if stale membership data exists.
- Missed MLS commits are validated for group scope, exact epoch continuity, commit hash, duplicate replay and public state hash before local persistence.
- Expired sessions, old login history and stale rate-limit buckets are removed at startup and hourly.

## Existing controls verified

The review confirmed that Nexora already validates CSRF tokens and request Origin, rejects disallowed Socket.IO origins, seals persisted Trust state with WebCrypto AES-GCM/non-extractable keys, rejects server-side MLS commit/message replay, and charges E2EE attachment quota by actual ciphertext bytes after exact size and SHA-256 validation.

## Compatibility

- Version: 3.2.3
- Local Server schema: 8 (unchanged)
- Application API: v3 (unchanged)
- Trust/MLS/encrypted-media API: v4 (unchanged)
- Database migration: not required

## Distribution

Without configured Authenticode credentials, the release workflow publishes verified Source/PWA artifacts, SPDX SBOM and SHA-256 checksums. Unsigned updater assets remain blocked.
`);

write("SECURITY_REVIEW_3.2.3.md", `# Nexora 3.2.3 Security Review

## Method

Every submitted finding was checked against the 3.2.2 release source before changing production code. Confirmed gaps received regression tests first. Claims contradicted by current implementation were documented rather than replaced with ineffective controls.

## Confirmed and corrected

1. Active Trust device resource exhaustion: fixed with an atomic 16-device account limit.
2. KeyPackage storage exhaustion: fixed with atomic per-device and per-user inventory limits.
3. Credential scope ambiguity: fixed by parsing and binding MLS BasicCredential to userId/deviceId.
4. Identity/signature key role reuse: rejected during device registration.
5. Trust audit nested metadata exposure: replaced with action-specific primitive allowlists.
6. Device directory/enrollment/recovery request flooding: protected by bounded sliding-window rate limiters.
7. Stale membership plus active room ban: conversation access now fails closed.
8. Client missed-commit envelope trust: scope, sequence, hash, replay and state hashes are verified before persistence.
9. Stale sessions and security telemetry: removed at startup and hourly according to retention limits.

## Findings already mitigated in 3.2.2

- Trust bootstrap ordering uses parent layout configuration and safe draft reads.
- CSRF tokens are required on mutating application and Trust APIs; mutating API requests also validate Origin.
- Socket.IO uses allowRequest with the same allowed-origin policy.
- IndexedDB private material is sealed with AES-256-GCM and non-extractable WebCrypto keys. Same-origin XSS remains outside what storage encryption can neutralize and is mitigated by CSP, renderer isolation and output handling.
- E2EE upload parsing caps actual ciphertext bytes, requires exact plaintextSize + GCM tag length, verifies ciphertext SHA-256 and charges quota by actual ciphertext size.
- SQLite enforces unique MLS commit hashes and unique group epochs; the recovery endpoint also validates a contiguous server log.

## Rejected recommendations

- SHA-256 collision handling beyond full key/credential equality is not a practical security control for device registration.
- timingSafeEqual cannot hide whether a KeyPackage exists because availability is the explicit API result.
- the server cannot decrypt opaque E2EE attachments to measure plaintext without violating the E2EE boundary.
- keeping a persistent wrapping key only in memory would make durable offline Trust state unrecoverable after restart; OS/WebAuthn-backed key wrapping is a future product capability, not a safe patch substitution.

## Compatibility

No schema or protocol migration is required. All new limits are enforced server-side with stable error codes.
`);

console.log("Applied Nexora 3.2.3 security hardening patch.");
