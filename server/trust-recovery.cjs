"use strict";

const { TrustCoreError } = require("./trust-core.cjs");

function normalizeUuid(value, field = "id") {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new TrustCoreError(`${field}: неверный UUID.`, "TRUST_VALIDATION_FAILED", 400, { field });
  }
  return text;
}

function claimKeyPackageForDevice(core, {
  targetUserId,
  targetDeviceId,
  requesterUserId,
  requesterDeviceId,
}) {
  const requester = core.requireDevice(requesterUserId, requesterDeviceId, { verified: true });
  const targetId = normalizeUuid(targetDeviceId, "targetDeviceId");
  const now = core.timestamp();

  core.db.exec("BEGIN IMMEDIATE");
  try {
    const target = core.db.prepare(`SELECT * FROM trust_devices
      WHERE id=? AND user_id=? AND status='active' AND trust_state='verified'`)
      .get(targetId, String(targetUserId));
    if (!target) throw new TrustCoreError("Целевое устройство не найдено или не доверено.", "TRUST_DEVICE_NOT_FOUND", 404);

    const row = core.db.prepare(`SELECT kp.*
      FROM mls_key_packages kp
      WHERE kp.user_id=? AND kp.device_id=? AND kp.claimed_at IS NULL AND kp.expires_at>?
      ORDER BY kp.created_at LIMIT 1`)
      .get(String(targetUserId), targetId, now);
    if (!row) throw new TrustCoreError("У устройства нет доступного MLS KeyPackage.", "MLS_KEY_PACKAGE_UNAVAILABLE", 409, { targetDeviceId: targetId });

    const changed = core.db.prepare(`UPDATE mls_key_packages
      SET claimed_at=?,claimed_by_user_id=?,claimed_by_device_id=?
      WHERE id=? AND claimed_at IS NULL`)
      .run(now, String(requesterUserId), requester.id, row.id);
    if (Number(changed.changes || 0) !== 1) throw new TrustCoreError("KeyPackage уже получен другим запросом.", "MLS_KEY_PACKAGE_RACE", 409);

    core.audit({
      userId: String(requesterUserId),
      actorDeviceId: requester.id,
      action: "mls.key_package_claimed",
      targetType: "device",
      targetId,
      metadata: { targetUserId: String(targetUserId), packageId: row.id },
    });
    core.db.exec("COMMIT");
    return {
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      ciphersuite: Number(row.ciphersuite),
      keyPackage: row.package_data,
      packageHash: row.package_hash,
      expiresAt: row.expires_at,
      device: {
        id: target.id,
        displayName: target.display_name,
        identityKey: target.identity_key,
        signatureKey: target.signature_key,
        credential: target.credential,
        fingerprint: target.fingerprint,
        trustState: target.trust_state,
      },
    };
  } catch (error) {
    try { core.db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function listCommits(core, {
  groupRecordId,
  requesterUserId,
  requesterDeviceId,
  afterEpoch = -1,
  limit = 200,
}) {
  const requester = core.requireDevice(requesterUserId, requesterDeviceId, { verified: true });
  const groupId = normalizeUuid(groupRecordId, "groupRecordId");
  const after = Math.max(-1, Number.isSafeInteger(Number(afterEpoch)) ? Number(afterEpoch) : -1);
  const bounded = Math.max(1, Math.min(500, Number(limit) || 200));
  const group = core.db.prepare("SELECT * FROM mls_groups WHERE id=? AND status='active'").get(groupId);
  if (!group) throw new TrustCoreError("MLS group не найден.", "MLS_GROUP_NOT_FOUND", 404);
  const member = core.db.prepare(`SELECT 1 FROM mls_group_members
    WHERE group_id=? AND device_id=? AND user_id=? AND status='active'`)
    .get(groupId, requester.id, String(requesterUserId));
  if (!member) throw new TrustCoreError("Устройство не состоит в MLS group.", "MLS_GROUP_MEMBERSHIP_REQUIRED", 403);

  const rows = core.db.prepare(`SELECT id,previous_epoch,epoch,actor_user_id,actor_device_id,
      commit_hash,commit_data,public_state_hash,created_at
    FROM mls_commit_log
    WHERE group_id=? AND epoch>?
    ORDER BY epoch ASC
    LIMIT ?`).all(groupId, after, bounded);

  let expected = after + 1;
  for (const row of rows) {
    if (Number(row.epoch) !== expected) {
      throw new TrustCoreError("В журнале MLS commit обнаружен разрыв эпох.", "MLS_COMMIT_LOG_GAP", 500, { expected, actual: Number(row.epoch) });
    }
    expected += 1;
  }
  return {
    group: {
      id: group.id,
      conversationId: group.conversation_id,
      epoch: Number(group.epoch),
      publicStateHash: group.public_state_hash,
    },
    commits: rows.map((row) => ({
      id: row.id,
      previousEpoch: Number(row.previous_epoch),
      epoch: Number(row.epoch),
      actorUserId: row.actor_user_id,
      actorDeviceId: row.actor_device_id,
      commitHash: row.commit_hash,
      commit: row.commit_data,
      publicStateHash: row.public_state_hash,
      createdAt: row.created_at,
    })),
  };
}

module.exports = { claimKeyPackageForDevice, listCommits };
