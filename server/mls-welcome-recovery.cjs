"use strict";

const { TrustCoreError } = require("./trust-core.cjs");

function requestMlsWelcome({ trustCore, userId, deviceId, conversationId, emit } = {}) {
  if (!trustCore || typeof emit !== "function") throw new Error("MLS Welcome recovery requires Trust Core and emitter.");
  const requester = trustCore.requireDevice(userId, deviceId, { verified: true });
  const group = trustCore.getGroupByConversation(conversationId);
  if (!group) throw new TrustCoreError("MLS group не найден.", "MLS_GROUP_NOT_FOUND", 404);
  const existing = (group.members || []).find((member) => member.deviceId === requester.id && member.status === "active");
  if (existing) return { requested: false, reason: "already_member", groupId: group.id, recipients: 0 };
  const recipients = emit({
    conversationId: group.conversationId,
    groupId: group.id,
    requesterUserId: requester.userId,
    requesterDeviceId: requester.id,
    requestedAt: new Date().toISOString(),
  }) || [];
  return { requested: true, groupId: group.id, recipients: Array.isArray(recipients) ? recipients.length : Number(recipients) || 0 };
}

module.exports = { requestMlsWelcome };
