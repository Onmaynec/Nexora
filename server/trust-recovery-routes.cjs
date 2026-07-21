"use strict";

const { TrustCoreError } = require("./trust-core.cjs");
const { claimKeyPackageForDevice, listCommits } = require("./trust-recovery.cjs");

function mountTrustRecoveryRoutes({ app, trustCore, authRequired, requireConversation, usersCanExchangeKeys } = {}) {
  if (!app || !trustCore || !authRequired || !requireConversation || !usersCanExchangeKeys) {
    throw new Error("Trust recovery routes require app, trustCore and shared Trust middleware.");
  }

  function asyncRoute(handler) {
    return async (request, response) => {
      try { await handler(request, response); }
      catch (error) {
        const known = error instanceof TrustCoreError;
        response.status(known ? error.status : Number(error?.status || 500)).json({
          ok: false,
          requestId: request.trustRequestId,
          code: known ? error.code : String(error?.code || "INTERNAL_ERROR"),
          message: known ? error.message : "Временная ошибка Trust Core.",
          details: known ? error.details || {} : {},
        });
      }
    };
  }

  app.post("/api/v4/trust/users/:userId/devices/:deviceId/key-packages/claim", authRequired, asyncRoute(async (request, response) => {
    if (!usersCanExchangeKeys(request.trustAuth.user.id, request.params.userId)) {
      throw new TrustCoreError("KeyPackage пользователя недоступен.", "PERMISSION_DENIED", 403);
    }
    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    const keyPackage = claimKeyPackageForDevice(trustCore, {
      targetUserId: request.params.userId,
      targetDeviceId: request.params.deviceId,
      requesterUserId: request.trustAuth.user.id,
      requesterDeviceId,
    });
    response.json({ ok: true, requestId: request.trustRequestId, keyPackage });
  }));

  app.get("/api/v4/trust/groups/:groupId/commits", authRequired, asyncRoute(async (request, response) => {
    const requesterDeviceId = String(request.headers["x-nexora-device-id"] || "");
    if (!requesterDeviceId) throw new TrustCoreError("Укажите X-Nexora-Device-ID.", "TRUST_DEVICE_REQUIRED", 401);
    const group = trustCore.db.prepare("SELECT conversation_id FROM mls_groups WHERE id=?").get(String(request.params.groupId || "").toLowerCase());
    if (!group) throw new TrustCoreError("MLS group не найден.", "MLS_GROUP_NOT_FOUND", 404);
    requireConversation(request.trustAuth.user.id, group.conversation_id);
    const result = listCommits(trustCore, {
      groupRecordId: request.params.groupId,
      requesterUserId: request.trustAuth.user.id,
      requesterDeviceId,
      afterEpoch: request.query.after,
      limit: request.query.limit,
    });
    response.json({ ok: true, requestId: request.trustRequestId, ...result });
  }));
}

module.exports = { mountTrustRecoveryRoutes };
