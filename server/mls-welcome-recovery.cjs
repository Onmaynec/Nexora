"use strict";

const { TrustCoreError } = require("./trust-core.cjs");

function requestMlsWelcome({ trustCore, userId, deviceId, conversationId, emit, forceRejoin = false } = {}) {
  if (!trustCore || typeof emit !== "function") throw new Error("MLS Welcome recovery requires Trust Core and emitter.");
  const requester = trustCore.requireDevice(userId, deviceId, { verified: true });
  const group = trustCore.getGroupByConversation(conversationId);
  if (!group) throw new TrustCoreError("MLS group не найден.", "MLS_GROUP_NOT_FOUND", 404);
  const existing = (group.members || []).find((member) => member.deviceId === requester.id && member.status === "active");
  if (existing && !forceRejoin) return { requested: false, reason: "already_member", groupId: group.id, recipients: 0 };

  if (existing && forceRejoin) {
    const peers = trustCore.store.db.prepare(`
      SELECT COUNT(*) AS count
      FROM mls_group_members gm
      JOIN trust_devices td ON td.id=gm.device_id
      WHERE gm.group_id=? AND gm.status='active' AND gm.device_id<>?
        AND td.status='active' AND td.trust_state='verified'
    `).get(group.id, requester.id);
    if (Number(peers?.count || 0) < 1) {
      throw new TrustCoreError(
        "Для безопасного восстановления нужен другой активный участник или подтверждённое устройство в MLS-группе.",
        "MLS_RECOVERY_PEER_REQUIRED",
        409,
      );
    }
    const now = new Date().toISOString();
    trustCore.store.db.exec("BEGIN IMMEDIATE");
    try {
      trustCore.store.db.prepare(`
        UPDATE mls_group_members
        SET status='removed', removed_epoch=?, updated_at=?
        WHERE group_id=? AND device_id=? AND status='active'
      `).run(Number(group.epoch), now, group.id, requester.id);
      trustCore.store.db.prepare(`
        DELETE FROM mls_welcome_queue
        WHERE group_id=? AND target_device_id=? AND claimed_at IS NULL
      `).run(group.id, requester.id);
      trustCore.store.db.prepare(`
        INSERT INTO trust_audit(id,user_id,actor_device_id,action,target_type,target_id,created_at,metadata_json)
        VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?)
      `).run(userId, requester.id, "mls.rejoin_requested", "mls_group", group.id, now, JSON.stringify({ conversationId, epoch: Number(group.epoch) }));
      trustCore.store.db.exec("COMMIT");
    } catch (error) {
      try { trustCore.store.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  const recipients = emit({
    conversationId: group.conversationId,
    groupId: group.id,
    requesterUserId: requester.userId,
    requesterDeviceId: requester.id,
    requestedAt: new Date().toISOString(),
    recovery: Boolean(existing && forceRejoin),
  }) || [];
  return { requested: true, recovery: Boolean(existing && forceRejoin), groupId: group.id, recipients: Array.isArray(recipients) ? recipients.length : Number(recipients) || 0 };
}

module.exports = { requestMlsWelcome };
