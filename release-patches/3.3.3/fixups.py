from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    if source.count(old) != 1:
        raise RuntimeError(f"{path}: expected one occurrence of {old[:120]!r}, found {source.count(old)}")
    write(path, source.replace(old, new, 1))


def replace_route(path: str, route_literal: str, replacement: str) -> None:
    source = read(path)
    pattern = re.compile(
        rf'  app\.post\("{re.escape(route_literal)}", authRequired, asyncRoute\(async \(request, response\) => \{{.*?\n  \}}\)\);',
        re.DOTALL,
    )
    updated, count = pattern.subn(replacement.rstrip(), source, count=1)
    if count != 1:
        raise RuntimeError(f"{path}: route {route_literal!r} was not replaced")
    write(path, updated)


path = "server/pulse-v3-routes.cjs"
replace_once(
    path,
    'const { isRoomBanned, roomRole } = require("./model.cjs");',
    'const { isRoomBanned, roomRole } = require("./model.cjs");\nconst { appendEvent } = require("./events.cjs");',
)

replace_once(
    path,
    '''  function emitUser(userId, eventType, payload) {
    io.to(userSocketRoom(userId)).emit(eventType, payload);
    io.to(userSocketRoom(userId)).emit("billing:event", { type: eventType, payload });
  }
''',
    '''  function emitUser(userId, eventType, payload) {
    io.to(userSocketRoom(userId)).emit(eventType, payload);
    io.to(userSocketRoom(userId)).emit("billing:event", { type: eventType, payload });
  }

  function emitRoom(roomId, eventType, payload) {
    const conversationId = store.read((state) => state.conversations.find((item) => item.roomId === roomId)?.id);
    if (!conversationId) return;
    io.to(`conversation:${conversationId}`).emit(eventType, payload);
  }

  async function recordGoalEvent(roomId, userId, action, goal, duplicate = false) {
    if (duplicate || !goal) return;
    const systemMessage = await store.mutate((state) => {
      const conversation = state.conversations.find((item) => item.roomId === roomId);
      const actor = state.users.find((item) => item.id === userId);
      const createdAt = new Date().toISOString();
      state.roomAuditLog ||= [];
      state.roomAuditLog.push({
        id: crypto.randomUUID(), roomId, actorId: userId, action: `pulse.goal_${action}`,
        targetUserId: null, createdAt, metadata: { goalId: goal.id, title: String(goal.title || "").slice(0, 120) },
      });
      appendEvent(state, {
        type: `billing.goal_${action}`, actorId: userId, roomId,
        conversationId: conversation?.id || null, payload: { goalId: goal.id },
      });
      if (!conversation) return null;
      const systemKey = `pulse-goal:${goal.id}:${action}`;
      const existing = state.messages.find((item) => item.systemKey === systemKey);
      if (existing) return existing;
      const verbs = { created: "создал(а)", cancelled: "отменил(а)", funded: "завершил(а)" };
      const message = {
        id: crypto.randomUUID(), conversationId: conversation.id, senderId: userId,
        type: "system", system: true, systemCode: `pulse.goal_${action}`, systemKey,
        text: `${actor?.displayName || "Участник"} ${verbs[action] || action} коллективную цель «${goal.title}».`,
        fileId: null, clientId: null, replyToId: null, threadRootId: null, mentions: [],
        createdAt, updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null,
      };
      state.messages.push(message);
      return message;
    });
    emitRoom(roomId, "data:refresh", { reason: `pulse.goal_${action}`, messageId: systemMessage?.id || null });
  }
''',
)

create_route = r'''  app.post("/api/v3/rooms/:roomId/pulse/goals", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const membership = requireRoomMember(request.params.roomId, userId);
    if (!["owner", "moderator"].includes(membership.role)) {
      throw new PulseRepositoryError("Цели доступны владельцу и модераторам комнаты.", "PERMISSION_DENIED", 403);
    }
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const title = String(request.body?.title || "").trim();
    const description = String(request.body?.description || "").trim();
    const targetAmount = Math.trunc(Number(request.body?.targetAmount));
    const expiresAt = new Date(request.body?.expiresAt);
    if (title.length < 3 || title.length > 120) throw new PulseRepositoryError("Название цели должно содержать от 3 до 120 символов.", "VALIDATION_FAILED", 400);
    if (description.length < 3 || description.length > 1000) throw new PulseRepositoryError("Описание цели должно содержать от 3 до 1000 символов.", "VALIDATION_FAILED", 400);
    if (!Number.isSafeInteger(targetAmount) || targetAmount < 400 || targetAmount > 1_000_000) throw new PulseRepositoryError("Цель должна быть целым числом от 400 до 1 000 000 Импульсов.", "VALIDATION_FAILED", 400);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 55 * 60_000 || expiresAt.getTime() > Date.now() + 366 * 86_400_000) {
      throw new PulseRepositoryError("Срок цели недействителен.", "VALIDATION_FAILED", 400);
    }
    const input = {
      productCode: "room_reaction_pack", title, description, targetAmount,
      expiresAt: expiresAt.toISOString(), entitlementDurationDays: 30, idempotencyKey,
    };
    if (sandbox?.enabled()) {
      const result = await sandbox.createGoal(userId, request.params.roomId, input);
      await recordGoalEvent(request.params.roomId, userId, "created", result.goal, result.duplicate);
      emitRoom(request.params.roomId, "billing.goal_created", result.goal);
      return response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.pulseRequestId, ...result });
    }
    const result = await client.createGoal(userId, request.params.roomId, input, request.pulseRequestId);
    await store.mutate((state) => {
      const existing = state.pulseGoals.find((item) => item.id === result.goal.id);
      if (existing) Object.assign(existing, result.goal, { roomId: request.params.roomId, source: "pulse_cloud" });
      else state.pulseGoals.push({ ...result.goal, roomId: request.params.roomId, source: "pulse_cloud" });
    });
    repository.enqueueLocalEvent("billing.goal_created", { goalId: result.goal.id, roomId: request.params.roomId }, { roomId: request.params.roomId });
    await recordGoalEvent(request.params.roomId, userId, "created", result.goal, Boolean(result.duplicate));
    emitRoom(request.params.roomId, "billing.goal_created", result.goal);
    response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, goal: result.goal, duplicate: Boolean(result.duplicate) });
  }));'''
replace_route(path, "/api/v3/rooms/:roomId/pulse/goals", create_route)

contribution_route = r'''  app.post("/api/v3/rooms/:roomId/pulse/goals/:goalId/contributions", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const membership = requireRoomMember(request.params.roomId, userId);
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    const previousStatus = membership.state.pulseGoals.find((item) => item.id === request.params.goalId)?.status || null;
    if (sandbox?.enabled()) {
      const result = await sandbox.contribute(userId, request.params.roomId, request.params.goalId, request.body?.amount, idempotencyKey);
      emitUser(userId, "billing.wallet_updated", { balance: result.balance });
      emitRoom(request.params.roomId, "billing.goal_updated", result.goal);
      if (previousStatus !== "funded" && result.goal?.status === "funded") await recordGoalEvent(request.params.roomId, userId, "funded", result.goal, result.duplicate);
      return response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.pulseRequestId, ...result });
    }
    const result = await client.contribute(userId, request.params.roomId, request.params.goalId, request.body?.amount, idempotencyKey, request.pulseRequestId);
    await store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
      if (goal && result.result.goal) Object.assign(goal, result.result.goal);
      const contribution = result.result.contribution;
      if (contribution && !state.pulseContributions.some((item) => item.id === contribution.id)) state.pulseContributions.push({ ...contribution, roomId: request.params.roomId, source: "pulse_cloud" });
    });
    emitUser(userId, "billing.wallet_updated", { balance: result.result.balance ?? result.result.newBalance });
    emitRoom(request.params.roomId, "billing.goal_updated", result.result.goal);
    if (previousStatus !== "funded" && result.result.goal?.status === "funded") await recordGoalEvent(request.params.roomId, userId, "funded", result.result.goal, result.result.duplicate);
    response.status(result.result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, ...result.result });
  }));'''
replace_route(path, "/api/v3/rooms/:roomId/pulse/goals/:goalId/contributions", contribution_route)

cancel_route = r'''  app.post("/api/v3/rooms/:roomId/pulse/goals/:goalId/cancel", authRequired, asyncRoute(async (request, response) => {
    const userId = request.pulseAuth.user.id;
    const membership = requireRoomMember(request.params.roomId, userId);
    if (!["owner", "moderator"].includes(membership.role)) throw new PulseRepositoryError("Недостаточно прав для отмены цели.", "PERMISSION_DENIED", 403);
    const cachedGoal = membership.state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
    if (membership.role === "moderator" && cachedGoal?.createdBy !== userId) {
      throw new PulseRepositoryError("Модератор может отменить только созданную им цель.", "PERMISSION_DENIED", 403);
    }
    const idempotencyKey = String(request.headers["idempotency-key"] || request.body?.idempotencyKey || "");
    if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(idempotencyKey)) throw new PulseRepositoryError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
    if (sandbox?.enabled()) {
      const result = await sandbox.cancelGoal(userId, request.params.roomId, request.params.goalId, idempotencyKey);
      await recordGoalEvent(request.params.roomId, userId, "cancelled", result.goal, result.duplicate);
      emitRoom(request.params.roomId, "billing.goal_cancelled", result.goal);
      return response.status(result.duplicate ? 200 : 201).json({ ok: true, requestId: request.pulseRequestId, ...result });
    }
    const result = await client.cancelGoal(userId, request.params.roomId, request.params.goalId, idempotencyKey, request.pulseRequestId);
    await store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === request.params.roomId);
      if (goal) Object.assign(goal, result.result.goal || { status: result.result.status || "cancelled" });
    });
    repository.enqueueLocalEvent("billing.goal_cancelled", { goalId: request.params.goalId, roomId: request.params.roomId }, { roomId: request.params.roomId });
    await recordGoalEvent(request.params.roomId, userId, "cancelled", result.result.goal || cachedGoal, result.result.duplicate);
    emitRoom(request.params.roomId, "billing.goal_cancelled", result.result.goal || result.result);
    response.status(result.result.duplicate ? 200 : 201).json({ ok: true, requestId: result.requestId, ...result.result });
  }));'''
replace_route(path, "/api/v3/rooms/:roomId/pulse/goals/:goalId/cancel", cancel_route)

print("Nexora 3.3.3 route fixups applied.")
