"use strict";

const crypto = require("node:crypto");

const MLS_CIPHERSUITE = 1;
const CHALLENGE_TTL_MS = 5 * 60_000;
const WELCOME_TTL_MS = 14 * 24 * 60 * 60_000;
const REPLAY_TTL_MS = 30 * 24 * 60 * 60_000;
const MAX_KEY_PACKAGE_BYTES = 64 * 1024;
const MAX_MLS_MESSAGE_BYTES = 256 * 1024;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

class TrustCoreError extends Error {
  constructor(message, code, status = 400, details = {}) {
    super(message);
    this.name = "TrustCoreError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : String(value), Buffer.isBuffer(value) ? undefined : "utf8").digest("hex");
}

function clockDate(clock = Date) {
  let value;
  if (clock === Date) {
    value = new Date();
  } else if (typeof clock === "function") {
    try { value = clock(); }
    catch (callError) {
      try { value = Reflect.construct(clock, []); }
      catch { throw callError; }
    }
  } else {
    value = clock;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("TrustCore clock must return a valid Date or timestamp.");
  return date;
}

function nowIso(clock = Date) {
  return clockDate(clock).toISOString();
}

function decodeBase64(value, { min = 1, max = MAX_MLS_MESSAGE_BYTES, field = "data" } = {}) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9+/_=-]+$/.test(text)) throw new TrustCoreError(`${field}: неверный base64.`, "TRUST_VALIDATION_FAILED", 400, { field });
  let bytes;
  try { bytes = Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64"); } catch { bytes = Buffer.alloc(0); }
  if (bytes.length < min || bytes.length > max) {
    throw new TrustCoreError(`${field}: недопустимый размер.`, "TRUST_VALIDATION_FAILED", 400, { field, min, max, actual: bytes.length });
  }
  return bytes;
}

function normalizedBase64(value, options) {
  return decodeBase64(value, options).toString("base64");
}

function normalizeUuid(value, field = "id") {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new TrustCoreError(`${field}: неверный UUID.`, "TRUST_VALIDATION_FAILED", 400, { field });
  }
  return text;
}

function cleanName(value) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (text.length < 2) throw new TrustCoreError("Название устройства слишком короткое.", "TRUST_VALIDATION_FAILED", 400, { field: "displayName" });
  return text;
}

function rawEd25519Key(value, field) {
  const bytes = decodeBase64(value, { min: 32, max: 32, field });
  return { bytes, base64: bytes.toString("base64") };
}

function publicKeyFromRaw(raw) {
  return crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

function proofPayload(purpose, values) {
  return Buffer.from(`NEXORA-TRUST-V1\n${purpose}\n${canonical(values)}`, "utf8");
}

function verifyProof(identityKeyBase64, purpose, values, signatureBase64) {
  const key = rawEd25519Key(identityKeyBase64, "identityKey");
  const signature = decodeBase64(signatureBase64, { min: 64, max: 64, field: "proofSignature" });
  try {
    return crypto.verify(null, proofPayload(purpose, values), publicKeyFromRaw(key.bytes), signature);
  } catch {
    return false;
  }
}

function publicDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    identityKey: row.identity_key,
    signatureKey: row.signature_key,
    credential: row.credential,
    fingerprint: row.fingerprint,
    status: row.status,
    trustState: row.trust_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    verifiedAt: row.verified_at,
    revokedAt: row.revoked_at,
    capabilities: JSON.parse(row.data || "{}").capabilities || [],
  };
}

function publicGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    groupId: row.group_id,
    ciphersuite: Number(row.ciphersuite),
    epoch: Number(row.epoch),
    status: row.status,
    creatorDeviceId: row.creator_device_id,
    publicStateHash: row.public_state_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class TrustCore {
  constructor({ store, clock = Date, log = () => {} } = {}) {
    if (!store?.db) throw new Error("TrustCore requires an initialized SQLite store.");
    this.store = store;
    this.db = store.db;
    this.clock = clock;
    this.log = log;
  }

  timestamp() { return nowIso(this.clock); }

  audit({ userId = null, actorDeviceId = null, action, targetType, targetId = null, metadata = {} }) {
    const safeMetadata = structuredClone(metadata || {});
    for (const key of Object.keys(safeMetadata)) {
      if (/key|signature|credential|package|welcome|ciphertext|token|secret/i.test(key)) delete safeMetadata[key];
    }
    this.db.prepare(`INSERT INTO trust_audit(id,user_id,actor_device_id,action,target_type,target_id,created_at,metadata_json)
      VALUES(?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(), userId, actorDeviceId, String(action), String(targetType), targetId, this.timestamp(), JSON.stringify(safeMetadata),
    );
  }

  cleanup() {
    const now = this.timestamp();
    this.db.prepare("DELETE FROM trust_challenges WHERE expires_at <= ? OR consumed_at IS NOT NULL").run(now);
    this.db.prepare("DELETE FROM mls_key_packages WHERE expires_at <= ? OR (claimed_at IS NOT NULL AND claimed_at < datetime(?, '-7 days'))").run(now, now);
    this.db.prepare("DELETE FROM mls_welcome_queue WHERE expires_at <= ? OR (claimed_at IS NOT NULL AND claimed_at < datetime(?, '-7 days'))").run(now, now);
    this.db.prepare("DELETE FROM mls_replay_cache WHERE expires_at <= ?").run(now);
  }

  createChallenge({ userId, purpose, targetDeviceId = null, context = {} }) {
    if (!['register_device', 'verify_device', 'revoke_device'].includes(purpose)) {
      throw new TrustCoreError("Неизвестное назначение challenge.", "TRUST_VALIDATION_FAILED", 400);
    }
    const id = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString("base64url");
    const createdAt = this.timestamp();
    const expiresAt = new Date(Date.parse(createdAt) + CHALLENGE_TTL_MS).toISOString();
    const normalizedTarget = targetDeviceId ? normalizeUuid(targetDeviceId, "targetDeviceId") : null;
    this.db.prepare(`INSERT INTO trust_challenges(id,user_id,purpose,target_device_id,nonce,context_hash,created_at,expires_at,consumed_at)
      VALUES(?,?,?,?,?,?,?,?,NULL)`).run(id, String(userId), purpose, normalizedTarget, nonce, hash(canonical(context)), createdAt, expiresAt);
    return { id, purpose, targetDeviceId: normalizedTarget, nonce, createdAt, expiresAt, context };
  }

  consumeChallenge({ challengeId, userId, purpose, targetDeviceId = null, context = {}, identityKey, signature }) {
    const id = normalizeUuid(challengeId, "challengeId");
    const row = this.db.prepare("SELECT * FROM trust_challenges WHERE id=?").get(id);
    const now = this.timestamp();
    if (!row || row.user_id !== String(userId) || row.purpose !== purpose || row.consumed_at || Date.parse(row.expires_at) <= Date.parse(now)) {
      throw new TrustCoreError("Challenge недействителен или истёк.", "TRUST_CHALLENGE_INVALID", 409);
    }
    const expectedTarget = targetDeviceId ? normalizeUuid(targetDeviceId, "targetDeviceId") : null;
    if ((row.target_device_id || null) !== expectedTarget || row.context_hash !== hash(canonical(context))) {
      throw new TrustCoreError("Challenge не соответствует операции.", "TRUST_CHALLENGE_SCOPE_MISMATCH", 409);
    }
    const signed = { challengeId: id, nonce: row.nonce, userId: String(userId), purpose, targetDeviceId: expectedTarget, context };
    if (!verifyProof(identityKey, purpose, signed, signature)) {
      throw new TrustCoreError("Подпись устройства не подтверждена.", "TRUST_PROOF_INVALID", 403);
    }
    const changed = this.db.prepare("UPDATE trust_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL").run(now, id);
    if (Number(changed.changes || 0) !== 1) throw new TrustCoreError("Challenge уже использован.", "TRUST_CHALLENGE_CONSUMED", 409);
    return { row, proofHash: hash(decodeBase64(signature, { min: 64, max: 64, field: "proofSignature" })) };
  }

  registerDevice({ userId, challengeId, deviceId, displayName, identityKey, signatureKey, credential, capabilities = [], proofSignature }) {
    const id = normalizeUuid(deviceId, "deviceId");
    const identity = rawEd25519Key(identityKey, "identityKey").base64;
    const signing = rawEd25519Key(signatureKey, "signatureKey").base64;
    const normalizedCredential = normalizedBase64(credential, { min: 1, max: 1024, field: "credential" });
    const normalizedCapabilities = [...new Set((Array.isArray(capabilities) ? capabilities : []).map(String).filter((item) => /^[a-z0-9_.:-]{1,64}$/i.test(item)).slice(0, 32))].sort();
    const fingerprint = hash(canonical({ userId: String(userId), identityKey: identity, signatureKey: signing, credential: normalizedCredential }));
    const context = { deviceId: id, fingerprint };
    const challenge = this.consumeChallenge({
      challengeId, userId, purpose: "register_device", context, identityKey: identity, signature: proofSignature,
    });
    const now = this.timestamp();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const byId = this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(id);
      if (byId && (byId.user_id !== String(userId) || byId.fingerprint !== fingerprint)) {
        throw new TrustCoreError("Device ID уже принадлежит другому ключу.", "TRUST_DEVICE_CONFLICT", 409);
      }
      const existing = this.db.prepare("SELECT * FROM trust_devices WHERE user_id=? AND fingerprint=?").get(String(userId), fingerprint);
      if (existing) {
        if (existing.status === "revoked") throw new TrustCoreError("Отозванный ключ нельзя зарегистрировать повторно.", "TRUST_DEVICE_REVOKED", 409);
        this.db.prepare("UPDATE trust_devices SET display_name=?,updated_at=?,last_seen_at=?,data=? WHERE id=?")
          .run(cleanName(displayName), now, now, JSON.stringify({ capabilities: normalizedCapabilities }), existing.id);
        this.db.exec("COMMIT");
        return { device: publicDevice(this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(existing.id)), duplicate: true };
      }
      const activeCount = Number(this.db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active'").get(String(userId)).count || 0);
      const trustState = activeCount === 0 ? "verified" : "unverified";
      this.db.prepare(`INSERT INTO trust_devices(
        id,user_id,display_name,identity_key,signature_key,credential,fingerprint,status,trust_state,
        created_at,updated_at,last_seen_at,verified_at,revoked_at,data
      ) VALUES(?,?,?,?,?,?,?,'active',?,?,?,?,?,NULL,?)`).run(
        id, String(userId), cleanName(displayName), identity, signing, normalizedCredential, fingerprint, trustState,
        now, now, now, trustState === "verified" ? now : null, JSON.stringify({ capabilities: normalizedCapabilities }),
      );
      this.audit({ userId: String(userId), actorDeviceId: id, action: "device.registered", targetType: "device", targetId: id, metadata: { trustState, proofHash: challenge.proofHash } });
      this.db.exec("COMMIT");
      return { device: publicDevice(this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(id)), duplicate: false };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  getDevice(deviceId) {
    return publicDevice(this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(normalizeUuid(deviceId, "deviceId")));
  }

  requireDevice(userId, deviceId, { verified = false } = {}) {
    const id = normalizeUuid(deviceId, "deviceId");
    const row = this.db.prepare("SELECT * FROM trust_devices WHERE id=? AND user_id=?").get(id, String(userId));
    if (!row || row.status !== "active") throw new TrustCoreError("Устройство не зарегистрировано или отозвано.", "TRUST_DEVICE_REQUIRED", 401);
    if (verified && row.trust_state !== "verified") throw new TrustCoreError("Устройство ещё не подтверждено.", "TRUST_DEVICE_UNVERIFIED", 403);
    const now = this.timestamp();
    if (!row.last_seen_at || Date.parse(now) - Date.parse(row.last_seen_at) > 60_000) {
      this.db.prepare("UPDATE trust_devices SET last_seen_at=?,updated_at=? WHERE id=?").run(now, now, id);
      row.last_seen_at = now;
      row.updated_at = now;
    }
    return publicDevice(row);
  }

  listDevices(userId) {
    return this.db.prepare("SELECT * FROM trust_devices WHERE user_id=? ORDER BY status='active' DESC, created_at DESC")
      .all(String(userId)).map(publicDevice);
  }

  verifyDevice({ userId, actorDeviceId, targetDeviceId, challengeId, proofSignature }) {
    const actor = this.requireDevice(userId, actorDeviceId, { verified: true });
    const targetId = normalizeUuid(targetDeviceId, "targetDeviceId");
    if (actor.id === targetId) throw new TrustCoreError("Устройство уже доверяет себе.", "TRUST_DEVICE_ALREADY_VERIFIED", 409);
    const targetRow = this.db.prepare("SELECT * FROM trust_devices WHERE id=? AND user_id=?").get(targetId, String(userId));
    if (!targetRow || targetRow.status !== "active") throw new TrustCoreError("Целевое устройство не найдено.", "TRUST_DEVICE_NOT_FOUND", 404);
    const context = { actorDeviceId: actor.id, targetDeviceId: targetId, targetFingerprint: targetRow.fingerprint };
    const challenge = this.consumeChallenge({
      challengeId, userId, purpose: "verify_device", targetDeviceId: targetId, context,
      identityKey: actor.identityKey, signature: proofSignature,
    });
    const now = this.timestamp();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const changed = this.db.prepare("UPDATE trust_devices SET trust_state='verified',verified_at=?,updated_at=? WHERE id=? AND user_id=? AND status='active'")
        .run(now, now, targetId, String(userId));
      if (Number(changed.changes || 0) !== 1) throw new TrustCoreError("Устройство нельзя подтвердить.", "TRUST_DEVICE_NOT_FOUND", 404);
      this.db.prepare(`INSERT INTO trust_device_verifications(id,user_id,verifier_device_id,target_device_id,action,proof_hash,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(crypto.randomUUID(), String(userId), actor.id, targetId, "verified", challenge.proofHash, now);
      this.audit({ userId: String(userId), actorDeviceId: actor.id, action: "device.verified", targetType: "device", targetId, metadata: { proofHash: challenge.proofHash } });
      this.db.exec("COMMIT");
      return publicDevice(this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(targetId));
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  revokeDevice({ userId, actorDeviceId, targetDeviceId, challengeId, proofSignature }) {
    const actor = this.requireDevice(userId, actorDeviceId, { verified: actorDeviceId !== targetDeviceId });
    const targetId = normalizeUuid(targetDeviceId, "targetDeviceId");
    const targetRow = this.db.prepare("SELECT * FROM trust_devices WHERE id=? AND user_id=?").get(targetId, String(userId));
    if (!targetRow || targetRow.status !== "active") throw new TrustCoreError("Устройство уже отозвано или не найдено.", "TRUST_DEVICE_NOT_FOUND", 404);
    const context = { actorDeviceId: actor.id, targetDeviceId: targetId, targetFingerprint: targetRow.fingerprint };
    const challenge = this.consumeChallenge({
      challengeId, userId, purpose: "revoke_device", targetDeviceId: targetId, context,
      identityKey: actor.identityKey, signature: proofSignature,
    });
    const now = this.timestamp();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE trust_devices SET status='revoked',trust_state='blocked',revoked_at=?,updated_at=? WHERE id=?")
        .run(now, now, targetId);
      this.db.prepare("DELETE FROM mls_key_packages WHERE device_id=? AND claimed_at IS NULL").run(targetId);
      this.db.prepare("DELETE FROM mls_welcome_queue WHERE target_device_id=? AND claimed_at IS NULL").run(targetId);
      this.db.prepare("UPDATE mls_group_members SET status='removed',removed_epoch=COALESCE(removed_epoch,joined_epoch),updated_at=? WHERE device_id=? AND status='active'")
        .run(now, targetId);
      this.db.prepare(`INSERT INTO trust_device_verifications(id,user_id,verifier_device_id,target_device_id,action,proof_hash,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(crypto.randomUUID(), String(userId), actor.id, targetId, "revoked", challenge.proofHash, now);
      this.audit({ userId: String(userId), actorDeviceId: actor.id, action: "device.revoked", targetType: "device", targetId, metadata: { proofHash: challenge.proofHash } });
      this.db.exec("COMMIT");
      return publicDevice(this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(targetId));
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  uploadKeyPackages({ userId, deviceId, packages }) {
    const device = this.requireDevice(userId, deviceId, { verified: true });
    const list = Array.isArray(packages) ? packages.slice(0, 25) : [];
    if (!list.length) throw new TrustCoreError("KeyPackage не переданы.", "MLS_KEY_PACKAGE_REQUIRED", 400);
    const now = this.timestamp();
    const results = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of list) {
        const ciphersuite = Number(item?.ciphersuite);
        if (ciphersuite !== MLS_CIPHERSUITE) throw new TrustCoreError("Поддерживается только обязательный MLS ciphersuite 1.", "MLS_CIPHERSUITE_UNSUPPORTED", 400);
        const bytes = decodeBase64(item?.keyPackage, { min: 64, max: MAX_KEY_PACKAGE_BYTES, field: "keyPackage" });
        const expiresAt = new Date(String(item?.expiresAt || ""));
        const lifetime = expiresAt.getTime() - Date.parse(now);
        if (!Number.isFinite(expiresAt.getTime()) || lifetime < 60 * 60_000 || lifetime > 30 * 24 * 60 * 60_000) {
          throw new TrustCoreError("Срок KeyPackage должен быть от 1 часа до 30 дней.", "MLS_KEY_PACKAGE_EXPIRY_INVALID", 400);
        }
        const packageHash = hash(bytes);
        const existing = this.db.prepare("SELECT * FROM mls_key_packages WHERE package_hash=?").get(packageHash);
        if (existing) {
          if (existing.device_id !== device.id) throw new TrustCoreError("KeyPackage уже принадлежит другому устройству.", "MLS_KEY_PACKAGE_CONFLICT", 409);
          results.push({ id: existing.id, packageHash, duplicate: true, expiresAt: existing.expires_at });
          continue;
        }
        const id = crypto.randomUUID();
        this.db.prepare(`INSERT INTO mls_key_packages(
          id,user_id,device_id,ciphersuite,package_hash,package_data,created_at,expires_at,claimed_at,claimed_by_user_id,claimed_by_device_id
        ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,NULL)`).run(id, String(userId), device.id, ciphersuite, packageHash, bytes.toString("base64"), now, expiresAt.toISOString());
        results.push({ id, packageHash, duplicate: false, expiresAt: expiresAt.toISOString() });
      }
      this.audit({ userId: String(userId), actorDeviceId: device.id, action: "mls.key_packages_uploaded", targetType: "device", targetId: device.id, metadata: { count: results.length } });
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  claimKeyPackage({ targetUserId, requesterUserId, requesterDeviceId }) {
    const requester = this.requireDevice(requesterUserId, requesterDeviceId, { verified: true });
    const now = this.timestamp();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(`SELECT kp.*,d.display_name,d.identity_key,d.signature_key,d.credential,d.fingerprint,d.trust_state
        FROM mls_key_packages kp JOIN trust_devices d ON d.id=kp.device_id
        WHERE kp.user_id=? AND kp.claimed_at IS NULL AND kp.expires_at>? AND d.status='active' AND d.trust_state='verified'
        ORDER BY kp.created_at LIMIT 1`).get(String(targetUserId), now);
      if (!row) throw new TrustCoreError("У пользователя нет доступного MLS KeyPackage.", "MLS_KEY_PACKAGE_UNAVAILABLE", 409);
      const changed = this.db.prepare(`UPDATE mls_key_packages SET claimed_at=?,claimed_by_user_id=?,claimed_by_device_id=?
        WHERE id=? AND claimed_at IS NULL`).run(now, String(requesterUserId), requester.id, row.id);
      if (Number(changed.changes || 0) !== 1) throw new TrustCoreError("KeyPackage уже получен другим запросом.", "MLS_KEY_PACKAGE_RACE", 409);
      this.audit({ userId: String(requesterUserId), actorDeviceId: requester.id, action: "mls.key_package_claimed", targetType: "device", targetId: row.device_id, metadata: { targetUserId: String(targetUserId), packageId: row.id } });
      this.db.exec("COMMIT");
      return {
        id: row.id,
        userId: row.user_id,
        deviceId: row.device_id,
        ciphersuite: Number(row.ciphersuite),
        keyPackage: row.package_data,
        packageHash: row.package_hash,
        expiresAt: row.expires_at,
        device: {
          id: row.device_id, displayName: row.display_name, identityKey: row.identity_key,
          signatureKey: row.signature_key, credential: row.credential, fingerprint: row.fingerprint,
          trustState: row.trust_state,
        },
      };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  createGroup({ conversationId, creatorUserId, creatorDeviceId, groupId, publicStateHash, leafIndex = 0 }) {
    const creator = this.requireDevice(creatorUserId, creatorDeviceId, { verified: true });
    const groupBytes = decodeBase64(groupId, { min: 16, max: 255, field: "groupId" });
    if (!/^[a-f0-9]{64}$/.test(String(publicStateHash || ""))) throw new TrustCoreError("publicStateHash должен быть SHA-256.", "MLS_STATE_HASH_INVALID", 400);
    const now = this.timestamp();
    const id = crypto.randomUUID();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db.prepare("SELECT * FROM mls_groups WHERE conversation_id=?").get(String(conversationId));
      if (existing) {
        this.db.exec("COMMIT");
        return { group: publicGroup(existing), duplicate: true };
      }
      this.db.prepare(`INSERT INTO mls_groups(id,conversation_id,group_id,ciphersuite,epoch,status,creator_device_id,public_state_hash,created_at,updated_at)
        VALUES(?,?,?,? ,0,'active',?,?,?,?)`).run(id, String(conversationId), groupBytes.toString("base64"), MLS_CIPHERSUITE, creator.id, String(publicStateHash), now, now);
      this.db.prepare(`INSERT INTO mls_group_members(group_id,user_id,device_id,leaf_index,status,joined_epoch,removed_epoch,created_at,updated_at)
        VALUES(?,?,?,?,'active',0,NULL,?,?)`).run(id, String(creatorUserId), creator.id, Math.max(0, Number(leafIndex) || 0), now, now);
      this.audit({ userId: String(creatorUserId), actorDeviceId: creator.id, action: "mls.group_created", targetType: "conversation", targetId: String(conversationId), metadata: { groupRecordId: id, ciphersuite: MLS_CIPHERSUITE } });
      this.db.exec("COMMIT");
      return { group: publicGroup(this.db.prepare("SELECT * FROM mls_groups WHERE id=?").get(id)), duplicate: false };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      if (String(error.message).includes("UNIQUE")) throw new TrustCoreError("MLS group уже существует.", "MLS_GROUP_CONFLICT", 409);
      throw error;
    }
  }

  getGroupByConversation(conversationId) {
    const row = this.db.prepare("SELECT * FROM mls_groups WHERE conversation_id=?").get(String(conversationId));
    if (!row) return null;
    const group = publicGroup(row);
    group.members = this.db.prepare(`SELECT gm.user_id,gm.device_id,gm.leaf_index,gm.status,gm.joined_epoch,gm.removed_epoch,
      d.display_name,d.fingerprint,d.trust_state,d.status AS device_status
      FROM mls_group_members gm LEFT JOIN trust_devices d ON d.id=gm.device_id
      WHERE gm.group_id=? ORDER BY gm.joined_epoch,gm.leaf_index`).all(row.id).map((item) => ({
        userId: item.user_id, deviceId: item.device_id, leafIndex: item.leaf_index == null ? null : Number(item.leaf_index),
        status: item.status, joinedEpoch: Number(item.joined_epoch), removedEpoch: item.removed_epoch == null ? null : Number(item.removed_epoch),
        device: { displayName: item.display_name, fingerprint: item.fingerprint, trustState: item.trust_state, status: item.device_status },
      }));
    return group;
  }

  recordCommit({ groupRecordId, actorUserId, actorDeviceId, previousEpoch, epoch, commit, publicStateHash, addedDevices = [], removedDeviceIds = [], welcomes = [], proofSignature }) {
    const actor = this.requireDevice(actorUserId, actorDeviceId, { verified: true });
    const id = normalizeUuid(groupRecordId, "groupRecordId");
    const commitBytes = decodeBase64(commit, { min: 32, max: MAX_MLS_MESSAGE_BYTES, field: "commit" });
    const commitHash = hash(commitBytes);
    const prev = Number(previousEpoch);
    const next = Number(epoch);
    if (!Number.isSafeInteger(prev) || !Number.isSafeInteger(next) || next !== prev + 1) throw new TrustCoreError("MLS epoch должен увеличиваться ровно на один.", "MLS_EPOCH_INVALID", 409);
    if (!/^[a-f0-9]{64}$/.test(String(publicStateHash || ""))) throw new TrustCoreError("publicStateHash должен быть SHA-256.", "MLS_STATE_HASH_INVALID", 400);
    const normalizedAdded = addedDevices.map((item) => ({
      userId: String(item.userId), deviceId: normalizeUuid(item.deviceId, "addedDeviceId"), leafIndex: Math.max(0, Number(item.leafIndex) || 0),
    }));
    const normalizedRemoved = [...new Set(removedDeviceIds.map((value) => normalizeUuid(value, "removedDeviceId")))];
    const proofValues = { groupRecordId: id, actorDeviceId: actor.id, previousEpoch: prev, epoch: next, commitHash, publicStateHash: String(publicStateHash), addedDevices: normalizedAdded, removedDeviceIds: normalizedRemoved };
    if (!verifyProof(actor.identityKey, "mls_commit", proofValues, proofSignature)) throw new TrustCoreError("Подпись MLS commit не подтверждена.", "MLS_COMMIT_PROOF_INVALID", 403);
    const now = this.timestamp();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const group = this.db.prepare("SELECT * FROM mls_groups WHERE id=?").get(id);
      if (!group || group.status !== "active") throw new TrustCoreError("MLS group не найден или закрыт.", "MLS_GROUP_NOT_FOUND", 404);
      if (Number(group.epoch) !== prev) throw new TrustCoreError("MLS commit создан для устаревшей эпохи.", "MLS_EPOCH_CONFLICT", 409, { currentEpoch: Number(group.epoch) });
      const membership = this.db.prepare("SELECT * FROM mls_group_members WHERE group_id=? AND device_id=? AND status='active'").get(id, actor.id);
      if (!membership) throw new TrustCoreError("Устройство не состоит в MLS group.", "MLS_GROUP_MEMBERSHIP_REQUIRED", 403);
      if (this.db.prepare("SELECT 1 FROM mls_commit_log WHERE commit_hash=?").get(commitHash)) throw new TrustCoreError("MLS commit уже обработан.", "MLS_COMMIT_REPLAY", 409);

      this.db.prepare("UPDATE mls_groups SET epoch=?,public_state_hash=?,updated_at=? WHERE id=?")
        .run(next, String(publicStateHash), now, id);
      this.db.prepare(`INSERT INTO mls_commit_log(id,group_id,previous_epoch,epoch,actor_user_id,actor_device_id,commit_hash,commit_data,public_state_hash,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(), id, prev, next, String(actorUserId), actor.id, commitHash, commitBytes.toString("base64"), String(publicStateHash), now);

      for (const member of normalizedAdded) {
        const device = this.db.prepare("SELECT * FROM trust_devices WHERE id=? AND user_id=? AND status='active' AND trust_state='verified'").get(member.deviceId, member.userId);
        if (!device) throw new TrustCoreError("Добавляемое устройство не доверено.", "MLS_MEMBER_DEVICE_INVALID", 409, { deviceId: member.deviceId });
        this.db.prepare(`INSERT INTO mls_group_members(group_id,user_id,device_id,leaf_index,status,joined_epoch,removed_epoch,created_at,updated_at)
          VALUES(?,?,?,?, 'active',?,NULL,?,?)
          ON CONFLICT(group_id,device_id) DO UPDATE SET user_id=excluded.user_id,leaf_index=excluded.leaf_index,status='active',joined_epoch=excluded.joined_epoch,removed_epoch=NULL,updated_at=excluded.updated_at`)
          .run(id, member.userId, member.deviceId, member.leafIndex, next, now, now);
      }
      for (const deviceId of normalizedRemoved) {
        this.db.prepare("UPDATE mls_group_members SET status='removed',removed_epoch=?,updated_at=? WHERE group_id=? AND device_id=? AND status='active'")
          .run(next, now, id, deviceId);
      }

      for (const item of welcomes) {
        const targetDeviceId = normalizeUuid(item?.targetDeviceId, "targetDeviceId");
        const target = normalizedAdded.find((member) => member.deviceId === targetDeviceId);
        if (!target) throw new TrustCoreError("Welcome разрешён только для добавленного устройства.", "MLS_WELCOME_TARGET_INVALID", 400);
        const welcomeBytes = decodeBase64(item?.welcome, { min: 32, max: MAX_MLS_MESSAGE_BYTES, field: "welcome" });
        const ratchetTree = item?.ratchetTree ? normalizedBase64(item.ratchetTree, { min: 1, max: MAX_MLS_MESSAGE_BYTES, field: "ratchetTree" }) : null;
        const welcomeHash = hash(welcomeBytes);
        const expiresAt = new Date(Date.parse(now) + WELCOME_TTL_MS).toISOString();
        this.db.prepare(`INSERT INTO mls_welcome_queue(id,group_id,target_user_id,target_device_id,epoch,welcome_hash,welcome_data,ratchet_tree_data,created_at,expires_at,claimed_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,NULL)`).run(crypto.randomUUID(), id, target.userId, targetDeviceId, next, welcomeHash, welcomeBytes.toString("base64"), ratchetTree, now, expiresAt);
      }

      this.audit({ userId: String(actorUserId), actorDeviceId: actor.id, action: "mls.commit_recorded", targetType: "mls_group", targetId: id, metadata: { previousEpoch: prev, epoch: next, commitHash, added: normalizedAdded.length, removed: normalizedRemoved.length } });
      this.db.exec("COMMIT");
      return { group: this.getGroupByConversation(group.conversation_id), commitHash, duplicate: false };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      if (String(error.message).includes("UNIQUE") && String(error.message).includes("commit_hash")) throw new TrustCoreError("MLS commit уже обработан.", "MLS_COMMIT_REPLAY", 409);
      throw error;
    }
  }

  claimWelcome({ userId, deviceId }) {
    const device = this.requireDevice(userId, deviceId, { verified: true });
    const now = this.timestamp();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare(`SELECT w.*,g.conversation_id,g.group_id AS protocol_group_id,g.ciphersuite,g.public_state_hash
        FROM mls_welcome_queue w JOIN mls_groups g ON g.id=w.group_id
        WHERE w.target_user_id=? AND w.target_device_id=? AND w.claimed_at IS NULL AND w.expires_at>?
        ORDER BY w.created_at LIMIT 1`).get(String(userId), device.id, now);
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }
      const changed = this.db.prepare("UPDATE mls_welcome_queue SET claimed_at=? WHERE id=? AND claimed_at IS NULL").run(now, row.id);
      if (Number(changed.changes || 0) !== 1) throw new TrustCoreError("Welcome уже получен.", "MLS_WELCOME_RACE", 409);
      this.audit({ userId: String(userId), actorDeviceId: device.id, action: "mls.welcome_claimed", targetType: "mls_group", targetId: row.group_id, metadata: { epoch: Number(row.epoch), welcomeHash: row.welcome_hash } });
      this.db.exec("COMMIT");
      return {
        id: row.id,
        groupRecordId: row.group_id,
        conversationId: row.conversation_id,
        groupId: row.protocol_group_id,
        ciphersuite: Number(row.ciphersuite),
        epoch: Number(row.epoch),
        welcome: row.welcome_data,
        ratchetTree: row.ratchet_tree_data,
        welcomeHash: row.welcome_hash,
        publicStateHash: row.public_state_hash,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  reserveMessage({ groupRecordId, conversationId, epoch, senderUserId, senderDeviceId, message, authenticatedDataHash = null, generation = null }) {
    const device = this.requireDevice(senderUserId, senderDeviceId, { verified: true });
    const groupId = normalizeUuid(groupRecordId, "groupRecordId");
    const bytes = decodeBase64(message, { min: 32, max: MAX_MLS_MESSAGE_BYTES, field: "message" });
    const messageHash = hash(bytes);
    const now = this.timestamp();
    const expiresAt = new Date(Date.parse(now) + REPLAY_TTL_MS).toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const group = this.db.prepare("SELECT * FROM mls_groups WHERE id=? AND conversation_id=? AND status='active'").get(groupId, String(conversationId));
      if (!group) throw new TrustCoreError("MLS group не соответствует диалогу.", "MLS_GROUP_SCOPE_INVALID", 409);
      if (Number(group.epoch) !== Number(epoch)) throw new TrustCoreError("MLS message создано для другой эпохи.", "MLS_EPOCH_CONFLICT", 409, { currentEpoch: Number(group.epoch) });
      const member = this.db.prepare("SELECT 1 FROM mls_group_members WHERE group_id=? AND device_id=? AND user_id=? AND status='active'")
        .get(groupId, device.id, String(senderUserId));
      if (!member) throw new TrustCoreError("Устройство не состоит в MLS group.", "MLS_GROUP_MEMBERSHIP_REQUIRED", 403);
      this.db.prepare(`INSERT INTO mls_replay_cache(message_hash,group_id,conversation_id,epoch,sender_device_id,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?)`).run(messageHash, groupId, String(conversationId), Number(epoch), device.id, now, expiresAt);
      this.db.exec("COMMIT");
      return {
        messageHash,
        groupRecordId: groupId,
        protocolGroupId: group.group_id,
        epoch: Number(epoch),
        senderDeviceId: device.id,
        ciphertext: bytes.toString("base64"),
        authenticatedDataHash: authenticatedDataHash && /^[a-f0-9]{64}$/.test(String(authenticatedDataHash)) ? String(authenticatedDataHash) : null,
        generation: Number.isSafeInteger(Number(generation)) && Number(generation) >= 0 ? Number(generation) : null,
      };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      if (String(error.message).includes("UNIQUE")) throw new TrustCoreError("MLS message уже обработано.", "MLS_MESSAGE_REPLAY", 409);
      throw error;
    }
  }

  releaseMessage(messageHash) {
    if (/^[a-f0-9]{64}$/.test(String(messageHash || ""))) this.db.prepare("DELETE FROM mls_replay_cache WHERE message_hash=?").run(String(messageHash));
  }

  listAudit(userId, limit = 100) {
    const bounded = Math.max(1, Math.min(500, Number(limit) || 100));
    return this.db.prepare("SELECT * FROM trust_audit WHERE user_id=? ORDER BY created_at DESC LIMIT ?").all(String(userId), bounded).map((row) => ({
      id: row.id, userId: row.user_id, actorDeviceId: row.actor_device_id, action: row.action,
      targetType: row.target_type, targetId: row.target_id, createdAt: row.created_at,
      metadata: JSON.parse(row.metadata_json || "{}"),
    }));
  }

  status(userId = null) {
    const result = {
      schemaVersion: 8,
      protocol: "MLS 1.0 / RFC 9420",
      ciphersuite: MLS_CIPHERSUITE,
      privateKeysOnServer: false,
      devices: null,
      activeGroups: 0,
    };
    const db = this.store?.db;
    if (!db) return result;
    result.activeGroups = Number(db.prepare("SELECT COUNT(*) AS count FROM mls_groups WHERE status='active'").get().count || 0);
    if (userId) {
      result.devices = {
        active: Number(db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active'").get(String(userId)).count || 0),
        verified: Number(db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active' AND trust_state='verified'").get(String(userId)).count || 0),
      };
    }
    return result;
  }
}

module.exports = {
  CHALLENGE_TTL_MS,
  MLS_CIPHERSUITE,
  MAX_KEY_PACKAGE_BYTES,
  MAX_MLS_MESSAGE_BYTES,
  TrustCore,
  TrustCoreError,
  canonical,
  hash,
  proofPayload,
  publicDevice,
  publicGroup,
  verifyProof,
};
