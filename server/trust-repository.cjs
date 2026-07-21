"use strict";

const crypto = require("node:crypto");

const MAX_KEY_PACKAGE_BYTES = 64 * 1024;
const MAX_ENVELOPE_BYTES = 1024 * 1024;
const MAX_WELCOME_BYTES = 512 * 1024;
const MAX_TREE_BYTES = 1024 * 1024;
const CIPHERSUITE = "MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519";

class TrustRepositoryError extends Error {
  constructor(message, code = "TRUST_ERROR", status = 400, details = {}) {
    super(message);
    this.name = "TrustRepositoryError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function decodeBase64(value, maxBytes, field) {
  const text = String(value || "").trim();
  if (!text || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new TrustRepositoryError(`${field} имеет неверный base64url-формат.`, "VALIDATION_FAILED", 400, { field });
  }
  const buffer = Buffer.from(text, "base64url");
  if (!buffer.length || buffer.length > maxBytes) {
    throw new TrustRepositoryError(`${field} превышает допустимый размер.`, "PAYLOAD_TOO_LARGE", 413, { field, maxBytes });
  }
  return buffer;
}

function encodeBase64(value) {
  return Buffer.from(value).toString("base64url");
}

function cleanId(value, field = "id") {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(text)) {
    throw new TrustRepositoryError(`${field} имеет неверный формат.`, "VALIDATION_FAILED", 400, { field });
  }
  return text;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function merkleParent(left, right) {
  return sha256(Buffer.concat([Buffer.from([1]), Buffer.from(left, "hex"), Buffer.from(right, "hex")]));
}

function merkleRoot(hashes) {
  if (!hashes.length) return sha256(Buffer.from("nexora-trust-empty", "utf8"));
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(merkleParent(level[index], level[index + 1] || level[index]));
    }
    level = next;
  }
  return level[0];
}

function inclusionProof(hashes, position) {
  if (position < 0 || position >= hashes.length) return [];
  let index = position;
  let level = hashes.slice();
  const proof = [];
  while (level.length > 1) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    const sibling = level[siblingIndex] || level[index];
    proof.push({ side: index % 2 === 0 ? "right" : "left", hash: sibling });
    const next = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      next.push(merkleParent(level[cursor], level[cursor + 1] || level[cursor]));
    }
    index = Math.floor(index / 2);
    level = next;
  }
  return proof;
}

function verifyInclusion({ leafHash, proof, root }) {
  let current = leafHash;
  for (const item of proof || []) {
    current = item.side === "left" ? merkleParent(item.hash, current) : merkleParent(current, item.hash);
  }
  return current === root;
}

class TrustRepository {
  constructor({ store, clock = () => new Date(), log = () => {} } = {}) {
    if (!store?.db) throw new TrustRepositoryError("Trust repository requires SQLite store.", "TRUST_REPOSITORY_MISCONFIGURED", 500);
    this.store = store;
    this.db = store.db;
    this.clock = clock;
    this.log = log;
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch (rollbackError) { this.log(`Trust transaction rollback failed: ${rollbackError.message}`, "error"); }
      throw error;
    }
  }

  appendTransparency(eventType, subjectId, payload, createdAt = nowIso(this.clock)) {
    const previous = this.db.prepare("SELECT entry_hash FROM trust_transparency_entries ORDER BY log_index DESC LIMIT 1").get()?.entry_hash || "0".repeat(64);
    const eventId = crypto.randomUUID();
    const payloadHash = sha256(Buffer.from(stableJson(payload), "utf8"));
    const entryHash = sha256(Buffer.from(`${previous}\n${eventId}\n${eventType}\n${subjectId}\n${payloadHash}\n${createdAt}`, "utf8"));
    this.db.prepare(`
      INSERT INTO trust_transparency_entries(event_id,event_type,subject_id,payload_hash,previous_hash,entry_hash,created_at)
      VALUES(?,?,?,?,?,?,?)
    `).run(eventId, eventType, subjectId, payloadHash, previous, entryHash, createdAt);
    return { eventId, eventType, subjectId, payloadHash, previousHash: previous, entryHash, createdAt };
  }

  registerDevice({ id, userId, label, credentialIdentity, signatureKey }) {
    const deviceId = cleanId(id, "deviceId");
    const ownerId = cleanId(userId, "userId");
    const credential = decodeBase64(credentialIdentity, 2048, "credentialIdentity");
    const signature = decodeBase64(signatureKey, 64, "signatureKey");
    if (signature.length !== 32) {
      throw new TrustRepositoryError("Ed25519 signature key должен содержать 32 байта.", "VALIDATION_FAILED", 400, { field: "signatureKey" });
    }
    let parsed;
    try { parsed = JSON.parse(credential.toString("utf8")); } catch {
      throw new TrustRepositoryError("MLS credential identity должна содержать JSON device credential.", "VALIDATION_FAILED", 400, { field: "credentialIdentity" });
    }
    if (parsed?.deviceId !== deviceId || parsed?.accountId !== ownerId) {
      throw new TrustRepositoryError("MLS credential не совпадает с Local Account или device ID.", "TRUST_CREDENTIAL_SCOPE_MISMATCH", 409);
    }
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      const sameKey = this.db.prepare("SELECT id,user_id,status FROM trust_devices WHERE signature_key=?").get(signatureKey);
      if (sameKey && (sameKey.id !== deviceId || sameKey.user_id !== ownerId)) {
        throw new TrustRepositoryError("Этот signing key уже закреплён за другим устройством.", "TRUST_KEY_CONFLICT", 409);
      }
      const existing = this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(deviceId);
      if (existing && existing.user_id !== ownerId) {
        throw new TrustRepositoryError("Device ID принадлежит другому пользователю.", "TRUST_DEVICE_CONFLICT", 409);
      }
      this.db.prepare(`
        INSERT INTO trust_devices(id,user_id,label,credential_identity,signature_key,status,created_at,last_seen_at,revoked_at)
        VALUES(?,?,?,?,?,'active',?,?,NULL)
        ON CONFLICT(id) DO UPDATE SET
          label=excluded.label,
          credential_identity=excluded.credential_identity,
          signature_key=excluded.signature_key,
          status='active',
          last_seen_at=excluded.last_seen_at,
          revoked_at=NULL
      `).run(deviceId, ownerId, String(label || "Устройство").trim().slice(0, 80), credentialIdentity, signatureKey, existing?.created_at || timestamp, timestamp);
      const entry = this.appendTransparency(existing ? "device.reactivated" : "device.registered", deviceId, { userId: ownerId, signatureKey }, timestamp);
      return { ...this.getDevice(deviceId), transparency: entry };
    });
  }

  getDevice(deviceId) {
    const row = this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(cleanId(deviceId, "deviceId"));
    return row ? {
      id: row.id,
      userId: row.user_id,
      label: row.label,
      credentialIdentity: row.credential_identity,
      signatureKey: row.signature_key,
      status: row.status,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    } : null;
  }

  requireActiveDevice(deviceId, userId) {
    const device = this.getDevice(deviceId);
    if (!device || device.userId !== userId) {
      throw new TrustRepositoryError("Устройство не принадлежит текущему аккаунту.", "TRUST_DEVICE_NOT_FOUND", 404);
    }
    if (device.status !== "active") {
      throw new TrustRepositoryError("Устройство отозвано.", "TRUST_DEVICE_REVOKED", 403);
    }
    return device;
  }

  listDevices(userId) {
    return this.db.prepare("SELECT * FROM trust_devices WHERE user_id=? ORDER BY created_at DESC").all(cleanId(userId, "userId")).map((row) => ({
      id: row.id,
      label: row.label,
      signatureKey: row.signature_key,
      status: row.status,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at,
    }));
  }

  revokeDevice(deviceId, userId, actorDeviceId = null) {
    const target = this.requireActiveDevice(deviceId, userId);
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      this.db.prepare("UPDATE trust_devices SET status='revoked',revoked_at=?,last_seen_at=? WHERE id=?").run(timestamp, timestamp, target.id);
      this.db.prepare("UPDATE trust_key_packages SET status='revoked' WHERE device_id=? AND status='available'").run(target.id);
      this.db.prepare("UPDATE trust_group_members SET status='pending_removal' WHERE device_id=? AND status='active'").run(target.id);
      const entry = this.appendTransparency("device.revoked", target.id, { userId, actorDeviceId }, timestamp);
      return { ...this.getDevice(target.id), transparency: entry };
    });
  }

  publishKeyPackage({ id, userId, deviceId, packageData, expiresAt }) {
    const packageId = cleanId(id, "keyPackageId");
    this.requireActiveDevice(deviceId, userId);
    const blob = decodeBase64(packageData, MAX_KEY_PACKAGE_BYTES, "keyPackage");
    const timestamp = nowIso(this.clock);
    const expiry = new Date(expiresAt || Date.now() + 30 * 24 * 60 * 60_000);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 90 * 24 * 60 * 60_000) {
      throw new TrustRepositoryError("Срок key package должен быть в пределах 90 дней.", "VALIDATION_FAILED", 400, { field: "expiresAt" });
    }
    const payloadHash = sha256(blob);
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM trust_key_packages WHERE id=? OR payload_hash=?").get(packageId, payloadHash);
      if (existing) {
        if (existing.device_id !== deviceId || existing.payload_hash !== payloadHash) {
          throw new TrustRepositoryError("Key package ID или payload уже используется в другом scope.", "IDEMPOTENCY_CONFLICT", 409);
        }
        return this.serializeKeyPackage(existing, false);
      }
      this.db.prepare(`
        INSERT INTO trust_key_packages(id,user_id,device_id,package_blob,payload_hash,status,created_at,expires_at,claimed_at,claimed_by_group_id)
        VALUES(?,?,?,?,?,'available',?,?,NULL,NULL)
      `).run(packageId, userId, deviceId, blob, payloadHash, timestamp, expiry.toISOString());
      const entry = this.appendTransparency("key_package.published", packageId, { userId, deviceId, payloadHash, expiresAt: expiry.toISOString() }, timestamp);
      return { ...this.serializeKeyPackage(this.db.prepare("SELECT * FROM trust_key_packages WHERE id=?").get(packageId), false), transparency: entry };
    });
  }

  serializeKeyPackage(row, includePayload = true) {
    return {
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      packageData: includePayload ? encodeBase64(row.package_blob) : undefined,
      payloadHash: row.payload_hash,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      claimedAt: row.claimed_at,
      claimedByGroupId: row.claimed_by_group_id,
    };
  }

  claimKeyPackage({ targetUserId, groupId, requesterDeviceId, requesterUserId }) {
    const safeGroupId = cleanId(groupId, "groupId");
    this.requireActiveDevice(requesterDeviceId, requesterUserId);
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      this.db.prepare("UPDATE trust_key_packages SET status='expired' WHERE status='available' AND expires_at<=?").run(timestamp);
      const row = this.db.prepare(`
        SELECT kp.* FROM trust_key_packages kp
        JOIN trust_devices d ON d.id=kp.device_id AND d.status='active'
        WHERE kp.user_id=? AND kp.status='available' AND kp.expires_at>?
        ORDER BY kp.created_at ASC LIMIT 1
      `).get(cleanId(targetUserId, "targetUserId"), timestamp);
      if (!row) throw new TrustRepositoryError("У пользователя нет доступного MLS key package.", "TRUST_KEY_PACKAGE_UNAVAILABLE", 409);
      const changed = this.db.prepare(`
        UPDATE trust_key_packages SET status='claimed',claimed_at=?,claimed_by_group_id=?
        WHERE id=? AND status='available'
      `).run(timestamp, safeGroupId, row.id);
      if (Number(changed.changes) !== 1) throw new TrustRepositoryError("Key package уже был использован.", "TRUST_KEY_PACKAGE_ALREADY_CLAIMED", 409);
      const claimed = this.db.prepare("SELECT * FROM trust_key_packages WHERE id=?").get(row.id);
      const entry = this.appendTransparency("key_package.claimed", row.id, { groupId: safeGroupId, requesterDeviceId }, timestamp);
      return { ...this.serializeKeyPackage(claimed, true), transparency: entry };
    });
  }

  createGroup({ id, conversationId, userId, creatorDeviceId }) {
    const groupId = cleanId(id, "groupId");
    const safeConversationId = cleanId(conversationId, "conversationId");
    this.requireActiveDevice(creatorDeviceId, userId);
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM trust_groups WHERE id=? OR conversation_id=?").get(groupId, safeConversationId);
      if (existing) {
        if (existing.id !== groupId || existing.conversation_id !== safeConversationId) {
          throw new TrustRepositoryError("Conversation уже связан с другой MLS group.", "TRUST_GROUP_CONFLICT", 409);
        }
        return this.groupStatus(groupId, creatorDeviceId, userId);
      }
      this.db.prepare(`
        INSERT INTO trust_groups(id,conversation_id,protocol,ciphersuite,status,epoch,sequence,created_by_device_id,created_at,updated_at)
        VALUES(?,?,'MLS_1_0',?,'active',0,0,?,?,?)
      `).run(groupId, safeConversationId, CIPHERSUITE, creatorDeviceId, timestamp, timestamp);
      this.db.prepare(`
        INSERT INTO trust_group_members(group_id,user_id,device_id,status,joined_epoch,removed_epoch,joined_at,removed_at)
        VALUES(?,?,?,'active',0,NULL,?,NULL)
      `).run(groupId, userId, creatorDeviceId, timestamp);
      const entry = this.appendTransparency("group.created", groupId, { conversationId: safeConversationId, creatorDeviceId, ciphersuite: CIPHERSUITE }, timestamp);
      return { ...this.groupStatus(groupId, creatorDeviceId, userId), transparency: entry };
    });
  }

  requireGroupMember(groupId, deviceId, userId) {
    const group = this.db.prepare("SELECT * FROM trust_groups WHERE id=? AND status='active'").get(cleanId(groupId, "groupId"));
    if (!group) throw new TrustRepositoryError("MLS group не найдена.", "TRUST_GROUP_NOT_FOUND", 404);
    this.requireActiveDevice(deviceId, userId);
    const member = this.db.prepare("SELECT * FROM trust_group_members WHERE group_id=? AND device_id=? AND user_id=?").get(group.id, deviceId, userId);
    if (!member || member.status !== "active") {
      throw new TrustRepositoryError("Устройство не является активным участником MLS group.", "TRUST_GROUP_ACCESS_DENIED", 403);
    }
    return { group, member };
  }

  groupStatus(groupId, deviceId, userId) {
    const { group } = this.requireGroupMember(groupId, deviceId, userId);
    const members = this.db.prepare("SELECT user_id,device_id,status,joined_epoch,removed_epoch,joined_at,removed_at FROM trust_group_members WHERE group_id=? ORDER BY joined_at ASC").all(group.id).map((row) => ({
      userId: row.user_id,
      deviceId: row.device_id,
      status: row.status,
      joinedEpoch: row.joined_epoch,
      removedEpoch: row.removed_epoch,
      joinedAt: row.joined_at,
      removedAt: row.removed_at,
    }));
    return {
      id: group.id,
      conversationId: group.conversation_id,
      protocol: group.protocol,
      ciphersuite: group.ciphersuite,
      status: group.status,
      epoch: Number(group.epoch),
      sequence: Number(group.sequence),
      createdByDeviceId: group.created_by_device_id,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      members,
    };
  }

  submitEnvelope({ id, groupId, senderDeviceId, senderUserId, type = "application", epoch, idempotencyKey, payloadData }) {
    const envelopeId = cleanId(id, "envelopeId");
    const safeType = ["application", "proposal"].includes(type) ? type : null;
    if (!safeType) throw new TrustRepositoryError("Тип envelope недоступен.", "VALIDATION_FAILED", 400, { field: "type" });
    const payload = decodeBase64(payloadData, MAX_ENVELOPE_BYTES, "payload");
    const key = cleanId(idempotencyKey, "idempotencyKey");
    const payloadHash = sha256(payload);
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      const { group } = this.requireGroupMember(groupId, senderDeviceId, senderUserId);
      if (Number(epoch) !== Number(group.epoch)) {
        throw new TrustRepositoryError("MLS epoch устарел или ещё не подтверждён.", "TRUST_EPOCH_CONFLICT", 409, { expected: Number(group.epoch), received: Number(epoch) });
      }
      const duplicate = this.db.prepare("SELECT * FROM trust_envelopes WHERE sender_device_id=? AND idempotency_key=?").get(senderDeviceId, key);
      if (duplicate) {
        if (duplicate.payload_hash !== payloadHash || duplicate.group_id !== group.id || duplicate.envelope_type !== safeType) {
          throw new TrustRepositoryError("Idempotency key повторён с другим MLS envelope.", "IDEMPOTENCY_CONFLICT", 409);
        }
        return this.serializeEnvelope(duplicate);
      }
      const sequence = Number(group.sequence) + 1;
      this.db.prepare(`
        INSERT INTO trust_envelopes(id,group_id,sender_device_id,envelope_type,epoch,sequence,idempotency_key,payload_hash,payload_blob,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)
      `).run(envelopeId, group.id, senderDeviceId, safeType, Number(epoch), sequence, key, payloadHash, payload, timestamp);
      this.db.prepare("UPDATE trust_groups SET sequence=?,updated_at=? WHERE id=?").run(sequence, timestamp, group.id);
      return this.serializeEnvelope(this.db.prepare("SELECT * FROM trust_envelopes WHERE id=?").get(envelopeId));
    });
  }

  submitCommit({ id, groupId, senderDeviceId, senderUserId, targetEpoch, idempotencyKey, payloadData, mutations = [] }) {
    const commitId = cleanId(id, "commitId");
    const key = cleanId(idempotencyKey, "idempotencyKey");
    const payload = decodeBase64(payloadData, MAX_ENVELOPE_BYTES, "payload");
    const normalizedMutations = (Array.isArray(mutations) ? mutations : []).map((mutation) => {
      const type = mutation?.type === "add" ? "add" : mutation?.type === "remove" ? "remove" : null;
      if (!type) throw new TrustRepositoryError("Неизвестная membership mutation.", "VALIDATION_FAILED", 400);
      const deviceId = cleanId(mutation.deviceId, "mutation.deviceId");
      if (type === "add") {
        return {
          type,
          deviceId,
          keyPackageId: cleanId(mutation.keyPackageId, "mutation.keyPackageId"),
          welcomeData: String(mutation.welcomeData || ""),
          ratchetTreeData: String(mutation.ratchetTreeData || ""),
        };
      }
      return { type, deviceId };
    });
    const requestHash = sha256(Buffer.concat([payload, Buffer.from(stableJson(normalizedMutations), "utf8")]));
    const timestamp = nowIso(this.clock);
    return this.transaction(() => {
      const { group } = this.requireGroupMember(groupId, senderDeviceId, senderUserId);
      const expectedEpoch = Number(group.epoch) + 1;
      if (Number(targetEpoch) !== expectedEpoch) {
        throw new TrustRepositoryError("Commit должен переводить MLS group ровно в следующий epoch.", "TRUST_EPOCH_CONFLICT", 409, { expected: expectedEpoch, received: Number(targetEpoch) });
      }
      const duplicate = this.db.prepare("SELECT * FROM trust_envelopes WHERE sender_device_id=? AND idempotency_key=?").get(senderDeviceId, key);
      if (duplicate) {
        if (duplicate.payload_hash !== requestHash || duplicate.group_id !== group.id || duplicate.envelope_type !== "commit") {
          throw new TrustRepositoryError("Idempotency key повторён с другим MLS commit.", "IDEMPOTENCY_CONFLICT", 409);
        }
        return { envelope: this.serializeEnvelope(duplicate), group: this.groupStatus(group.id, senderDeviceId, senderUserId), duplicate: true };
      }

      for (const mutation of normalizedMutations) {
        const targetDevice = this.db.prepare("SELECT * FROM trust_devices WHERE id=?").get(mutation.deviceId);
        if (!targetDevice) throw new TrustRepositoryError("Целевое устройство не найдено.", "TRUST_DEVICE_NOT_FOUND", 404, { deviceId: mutation.deviceId });
        if (mutation.type === "add") {
          if (targetDevice.status !== "active") throw new TrustRepositoryError("Нельзя добавить отозванное устройство.", "TRUST_DEVICE_REVOKED", 409);
          const keyPackage = this.db.prepare("SELECT * FROM trust_key_packages WHERE id=?").get(mutation.keyPackageId);
          if (!keyPackage || keyPackage.device_id !== mutation.deviceId || keyPackage.status !== "claimed" || keyPackage.claimed_by_group_id !== group.id) {
            throw new TrustRepositoryError("Key package не был атомарно claimed для этой group/device.", "TRUST_KEY_PACKAGE_SCOPE_MISMATCH", 409);
          }
          const welcome = decodeBase64(mutation.welcomeData, MAX_WELCOME_BYTES, "welcomeData");
          const tree = decodeBase64(mutation.ratchetTreeData, MAX_TREE_BYTES, "ratchetTreeData");
          const membership = this.db.prepare("SELECT status FROM trust_group_members WHERE group_id=? AND device_id=?").get(group.id, mutation.deviceId);
          if (membership?.status === "active") throw new TrustRepositoryError("Устройство уже состоит в MLS group.", "TRUST_MEMBER_EXISTS", 409);
          this.db.prepare(`
            INSERT INTO trust_group_members(group_id,user_id,device_id,status,joined_epoch,removed_epoch,joined_at,removed_at)
            VALUES(?,?,?,'active',?,NULL,?,NULL)
            ON CONFLICT(group_id,device_id) DO UPDATE SET
              user_id=excluded.user_id,status='active',joined_epoch=excluded.joined_epoch,removed_epoch=NULL,joined_at=excluded.joined_at,removed_at=NULL
          `).run(group.id, targetDevice.user_id, mutation.deviceId, expectedEpoch, timestamp);
          const welcomeHash = sha256(Buffer.concat([welcome, tree]));
          this.db.prepare(`
            INSERT INTO trust_welcomes(id,group_id,device_id,commit_id,welcome_blob,ratchet_tree_blob,payload_hash,created_at,claimed_at)
            VALUES(?,?,?,?,?,?,?,?,NULL)
          `).run(crypto.randomUUID(), group.id, mutation.deviceId, commitId, welcome, tree, welcomeHash, timestamp);
        } else {
          const membership = this.db.prepare("SELECT * FROM trust_group_members WHERE group_id=? AND device_id=?").get(group.id, mutation.deviceId);
          if (!membership || !["active", "pending_removal"].includes(membership.status)) {
            throw new TrustRepositoryError("Устройство не является удаляемым участником MLS group.", "TRUST_MEMBER_NOT_FOUND", 404);
          }
          if (mutation.deviceId === senderDeviceId) throw new TrustRepositoryError("Отправитель не может удалить себя этим endpoint.", "TRUST_SELF_REMOVAL_FORBIDDEN", 409);
          this.db.prepare("UPDATE trust_group_members SET status='removed',removed_epoch=?,removed_at=? WHERE group_id=? AND device_id=?")
            .run(expectedEpoch, timestamp, group.id, mutation.deviceId);
        }
      }

      const sequence = Number(group.sequence) + 1;
      this.db.prepare(`
        INSERT INTO trust_envelopes(id,group_id,sender_device_id,envelope_type,epoch,sequence,idempotency_key,payload_hash,payload_blob,created_at)
        VALUES(?,?,?,'commit',?,?,?,?,?,?)
      `).run(commitId, group.id, senderDeviceId, expectedEpoch, sequence, key, requestHash, payload, timestamp);
      this.db.prepare("UPDATE trust_groups SET epoch=?,sequence=?,updated_at=? WHERE id=?").run(expectedEpoch, sequence, timestamp, group.id);
      const entry = this.appendTransparency("group.commit", commitId, { groupId: group.id, senderDeviceId, targetEpoch: expectedEpoch, requestHash, mutations: normalizedMutations.map(({ welcomeData, ratchetTreeData, ...item }) => item) }, timestamp);
      return {
        envelope: this.serializeEnvelope(this.db.prepare("SELECT * FROM trust_envelopes WHERE id=?").get(commitId)),
        group: this.groupStatus(group.id, senderDeviceId, senderUserId),
        transparency: entry,
        duplicate: false,
      };
    });
  }

  serializeEnvelope(row) {
    return {
      id: row.id,
      groupId: row.group_id,
      senderDeviceId: row.sender_device_id,
      type: row.envelope_type,
      epoch: Number(row.epoch),
      sequence: Number(row.sequence),
      payloadHash: row.payload_hash,
      payloadData: encodeBase64(row.payload_blob),
      createdAt: row.created_at,
    };
  }

  listEnvelopes({ groupId, deviceId, userId, after = 0, limit = 200 }) {
    const { group } = this.requireGroupMember(groupId, deviceId, userId);
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    const safeAfter = Math.max(0, Number(after) || 0);
    return this.db.prepare(`
      SELECT * FROM trust_envelopes WHERE group_id=? AND sequence>? ORDER BY sequence ASC LIMIT ?
    `).all(group.id, safeAfter, safeLimit).map((row) => this.serializeEnvelope(row));
  }

  listWelcomes(deviceId, userId) {
    this.requireActiveDevice(deviceId, userId);
    return this.db.prepare(`
      SELECT w.* FROM trust_welcomes w
      JOIN trust_group_members m ON m.group_id=w.group_id AND m.device_id=w.device_id
      WHERE w.device_id=? AND w.claimed_at IS NULL AND m.status='active'
      ORDER BY w.created_at ASC
    `).all(deviceId).map((row) => ({
      id: row.id,
      groupId: row.group_id,
      commitId: row.commit_id,
      welcomeData: encodeBase64(row.welcome_blob),
      ratchetTreeData: encodeBase64(row.ratchet_tree_blob),
      payloadHash: row.payload_hash,
      createdAt: row.created_at,
    }));
  }

  acknowledgeWelcome(welcomeId, deviceId, userId) {
    this.requireActiveDevice(deviceId, userId);
    const timestamp = nowIso(this.clock);
    const changed = this.db.prepare("UPDATE trust_welcomes SET claimed_at=? WHERE id=? AND device_id=? AND claimed_at IS NULL")
      .run(timestamp, cleanId(welcomeId, "welcomeId"), deviceId);
    if (Number(changed.changes) !== 1) throw new TrustRepositoryError("Welcome не найден или уже подтверждён.", "TRUST_WELCOME_NOT_FOUND", 404);
    return { id: welcomeId, claimedAt: timestamp };
  }

  transparencyRoot() {
    const rows = this.db.prepare("SELECT log_index,entry_hash FROM trust_transparency_entries ORDER BY log_index ASC").all();
    const hashes = rows.map((row) => row.entry_hash);
    return { size: hashes.length, root: merkleRoot(hashes), lastIndex: rows.at(-1)?.log_index || 0 };
  }

  transparencyProof(logIndex) {
    const rows = this.db.prepare("SELECT * FROM trust_transparency_entries ORDER BY log_index ASC").all();
    const position = rows.findIndex((row) => Number(row.log_index) === Number(logIndex));
    if (position < 0) throw new TrustRepositoryError("Transparency entry не найдена.", "TRUST_TRANSPARENCY_ENTRY_NOT_FOUND", 404);
    const hashes = rows.map((row) => row.entry_hash);
    const root = merkleRoot(hashes);
    const proof = inclusionProof(hashes, position);
    return {
      entry: {
        index: Number(rows[position].log_index),
        eventId: rows[position].event_id,
        eventType: rows[position].event_type,
        subjectId: rows[position].subject_id,
        payloadHash: rows[position].payload_hash,
        previousHash: rows[position].previous_hash,
        entryHash: rows[position].entry_hash,
        createdAt: rows[position].created_at,
      },
      size: hashes.length,
      root,
      proof,
      verified: verifyInclusion({ leafHash: rows[position].entry_hash, proof, root }),
    };
  }
}

module.exports = {
  CIPHERSUITE,
  MAX_ENVELOPE_BYTES,
  MAX_KEY_PACKAGE_BYTES,
  TrustRepository,
  TrustRepositoryError,
  decodeBase64,
  inclusionProof,
  merkleRoot,
  sha256,
  stableJson,
  verifyInclusion,
};
