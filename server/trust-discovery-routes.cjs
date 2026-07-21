"use strict";

const { canAccessConversation, findConversation, isRoomBanned } = require("./model.cjs");
const { TrustRepositoryError } = require("./trust-repository.cjs");

function conversationUserIds(state, conversation) {
  if (conversation.type === "dm") return conversation.userIds.slice();
  return state.roomMembers
    .filter((member) => member.roomId === conversation.roomId && !isRoomBanned(state, conversation.roomId, member.userId))
    .map((member) => member.userId);
}

function mountTrustDiscoveryRoutes({ app, store, repository, log = () => {} }) {
  function asyncRoute(handler) {
    return async (request, response) => {
      try {
        await handler(request, response);
      } catch (error) {
        if (!(error instanceof TrustRepositoryError)) log(`Trust discovery ${request.trustRequestId}: ${error.stack || error.message}`, "error");
        response.status(error instanceof TrustRepositoryError ? error.status : 500).json({
          ok: false,
          requestId: request.trustRequestId,
          code: error instanceof TrustRepositoryError ? error.code : "INTERNAL_ERROR",
          message: error instanceof TrustRepositoryError ? error.message : "Временная ошибка Trust Discovery Service.",
          details: error instanceof TrustRepositoryError ? error.details : {},
        });
      }
    };
  }

  function requireConversation(conversationId, userId) {
    const state = store.read();
    const conversation = findConversation(state, String(conversationId || ""));
    if (!canAccessConversation(state, conversation, userId)) {
      throw new TrustRepositoryError("Conversation недоступен.", "TRUST_CONVERSATION_ACCESS_DENIED", 403);
    }
    return { state, conversation };
  }

  app.get("/api/v4/trust/conversations/:conversationId", asyncRoute(async (request, response) => {
    const userId = request.trustAuth.user.id;
    const deviceId = String(request.query.deviceId || request.headers["x-nexora-device-id"] || "");
    const { conversation } = requireConversation(request.params.conversationId, userId);
    const group = repository.db.prepare("SELECT * FROM trust_groups WHERE conversation_id=? AND status='active'").get(conversation.id);
    if (!group) {
      return response.json({ ok: true, requestId: request.trustRequestId, group: null, state: "not_created" });
    }
    const membership = deviceId
      ? repository.db.prepare("SELECT * FROM trust_group_members WHERE group_id=? AND device_id=? AND user_id=?").get(group.id, deviceId, userId)
      : null;
    const welcomePending = deviceId
      ? Boolean(repository.db.prepare("SELECT 1 FROM trust_welcomes WHERE group_id=? AND device_id=? AND claimed_at IS NULL").get(group.id, deviceId))
      : false;
    let stateName = "device_required";
    let fullGroup = null;
    if (membership?.status === "active") {
      fullGroup = repository.groupStatus(group.id, deviceId, userId);
      stateName = "active";
    } else if (welcomePending) {
      stateName = "welcome_pending";
    } else if (membership?.status === "pending_removal" || membership?.status === "removed") {
      stateName = "revoked";
    } else {
      stateName = "not_member";
    }
    response.json({
      ok: true,
      requestId: request.trustRequestId,
      state: stateName,
      group: fullGroup || {
        id: group.id,
        conversationId: group.conversation_id,
        protocol: group.protocol,
        ciphersuite: group.ciphersuite,
        status: group.status,
        epoch: Number(group.epoch),
        sequence: Number(group.sequence),
      },
    });
  }));

  app.get("/api/v4/trust/conversations/:conversationId/devices", asyncRoute(async (request, response) => {
    const userId = request.trustAuth.user.id;
    const { state, conversation } = requireConversation(request.params.conversationId, userId);
    const users = conversationUserIds(state, conversation);
    const placeholders = users.map(() => "?").join(",");
    const rows = users.length ? repository.db.prepare(`
      SELECT d.id,d.user_id,d.label,d.signature_key,d.created_at,d.last_seen_at,
        (SELECT COUNT(*) FROM trust_key_packages kp WHERE kp.device_id=d.id AND kp.status='available' AND kp.expires_at>?) AS key_packages
      FROM trust_devices d
      WHERE d.status='active' AND d.user_id IN (${placeholders})
      ORDER BY d.user_id,d.created_at
    `).all(new Date().toISOString(), ...users) : [];
    response.json({
      ok: true,
      requestId: request.trustRequestId,
      devices: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        label: row.label,
        signatureKey: row.signature_key,
        keyPackages: Number(row.key_packages || 0),
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        currentUser: row.user_id === userId,
      })),
    });
  }));

  return { conversationUserIds };
}

module.exports = {
  conversationUserIds,
  mountTrustDiscoveryRoutes,
};
