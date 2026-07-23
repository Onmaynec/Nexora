from __future__ import annotations

import json
import pathlib
import textwrap

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    source = read(path)
    actual = source.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} occurrence(s), found {actual}: {old[:100]!r}")
    write(path, source.replace(old, new, count))


# Version source of truth. The existing sync script updates package-lock, Android and client metadata.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "3.3.3"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Public user and persisted defaults for purchased profile/message effects.
replace(
    "server/security.cjs",
    '    profileColor: user.profileColor ?? "violet",\n    plusBadgeVisible: user.plusBadgeVisible !== false,',
    '    profileColor: user.profileColor ?? "violet",\n    messageStyle: user.messageStyle ?? "default",\n    stickerPack: user.stickerPack ?? "default",\n    plusBadgeVisible: user.plusBadgeVisible !== false,',
)
replace(
    "server/store.cjs",
    '    profileColor: "violet",\n    avatarFrame: "none",\n    plusBadgeVisible: true,',
    '    profileColor: "violet",\n    avatarFrame: "none",\n    messageStyle: "default",\n    stickerPack: "default",\n    plusBadgeVisible: true,',
)
replace(
    "server/store.cjs",
    '    allowImages: true,\n    ...room,',
    '    allowImages: true,\n    reactionPack: "default",\n    theme: "default",\n    bannerStyle: "default",\n    ...room,',
)

# Serialize visual room entitlements and immutable system events to every client.
replace(
    "server/model.cjs",
    '    type: deleted ? "deleted" : attachmentExpired ? "expired" : message.type,\n    text:',
    '    type: deleted ? "deleted" : attachmentExpired ? "expired" : message.type,\n    system: Boolean(message.system || message.type === "system"),\n    systemCode: message.systemCode ?? null,\n    text:',
)
replace(
    "server/model.cjs",
    '    ownerId: room.ownerId,\n    inviteCode:',
    '    ownerId: room.ownerId,\n    reactionPack: room.reactionPack ?? "default",\n    theme: room.theme ?? "default",\n    bannerStyle: room.bannerStyle ?? "default",\n    inviteCode:',
)
replace(
    "server/model.cjs",
    '    categoryId: room.categoryId ?? null,',
    '    categoryId: room.categoryId ?? null,\n    reactionPack: room.reactionPack ?? "default",\n    theme: room.theme ?? "default",\n    bannerStyle: room.bannerStyle ?? "default",',
)

# Reconcile existing signed entitlements on startup and authorize Nova reactions.
replace(
    "server/create-server.cjs",
    'const { MAX_ACTIVE_GOALS, ROOM_CATALOG, PulseError, activeEntitlement, createPulseService } = require("./pulse.cjs");',
    'const { MAX_ACTIVE_GOALS, ROOM_CATALOG, PulseError, activeEntitlement, createPulseService } = require("./pulse.cjs");\nconst { reconcilePulseEffects } = require("./pulse-effects.cjs");',
)
replace(
    "server/create-server.cjs",
    '  await store.init();\n  const totp =',
    '  await store.init();\n  await store.mutate((state) => reconcilePulseEffects(state));\n  const totp =',
)
replace(
    "server/create-server.cjs",
    '          const plusAllowed = Boolean(activeEntitlement(state, "user", user.id, "nexora_plus"));',
    '          const currentUser = state.users.find((item) => item.id === user.id);\n          const plusAllowed = Boolean(activeEntitlement(state, "user", user.id, "nexora_plus"))\n            || Boolean(activeEntitlement(state, "user", user.id, "sticker_pack_nova"))\n            || currentUser?.stickerPack === "nova";',
)

# Sandbox uses the same verified catalog-effect implementation and supports owner/moderator goal creation.
replace(
    "server/pulse-sandbox-service.cjs",
    'const { catalogItem, publicCatalog } = require("../shared/pulse-catalog.cjs");',
    'const { catalogItem, publicCatalog } = require("../shared/pulse-catalog.cjs");\nconst { applyPulseEntitlementEffect, reconcilePulseEffects } = require("./pulse-effects.cjs");',
)
replace(
    "server/pulse-sandbox-service.cjs",
    'function requireRoom(state, roomId, userId, { owner = false } = {}) {',
    'function requireRoom(state, roomId, userId, { owner = false, roles = null } = {}) {',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '  if (owner && room.ownerId !== userId) throw new PulseSandboxError("Операция доступна только владельцу комнаты.", "PERMISSION_DENIED", 403);\n  return room;',
    '  if (owner && room.ownerId !== userId) throw new PulseSandboxError("Операция доступна только владельцу комнаты.", "PERMISSION_DENIED", 403);\n  if (Array.isArray(roles) && !roles.includes(member.role)) throw new PulseSandboxError("Недостаточно прав для операции с целью.", "PERMISSION_DENIED", 403);\n  return room;',
)
replace(
    "server/pulse-sandbox-service.cjs",
    'function applyEffect(state, product, scopeId) {\n  if (product.scope === "user") {\n    const user = state.users.find((item) => item.id === scopeId);\n    if (user) Object.assign(user, product.effect);\n    return;\n  }\n  const room = state.rooms.find((item) => item.id === scopeId);\n  if (room) Object.assign(room, product.effect);\n}',
    'function applyEffect(state, product, scopeId) {\n  applyPulseEntitlementEffect(state, {\n    productCode: product.code,\n    scopeType: product.scope,\n    scopeId,\n    status: "active",\n    startsAt: new Date().toISOString(),\n    expiresAt: new Date(Date.now() + product.durationDays * 86_400_000).toISOString(),\n  });\n}',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '    applyEffect(state, product, scopeId);\n    return entitlement;',
    '    applyEffect(state, product, scopeId);\n    reconcilePulseEffects(state, timestamp.getTime());\n    return entitlement;',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '      requireRoom(state, roomId, user.id, { owner: true });\n      const duplicate = state.pulseGoals.find((item) => item.createdBy === user.id && item.idempotencyKey === key);',
    '      requireRoom(state, roomId, user.id, { roles: ["owner", "moderator"] });\n      const duplicate = state.pulseGoals.find((item) => item.createdBy === user.id && item.idempotencyKey === key);',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '      if (duplicate) return { goal: structuredClone(duplicate), duplicate: true };\n      const expiresAt = new Date(input.expiresAt);',
    '      if (duplicate) return { goal: structuredClone(duplicate), duplicate: true };\n      if (state.pulseGoals.some((item) => item.roomId === roomId && item.status === "active")) throw new PulseSandboxError("В комнате уже есть активная цель.", "GOAL_EXISTS", 409);\n      const title = String(input.title || "").trim();\n      const description = String(input.description || "").trim();\n      if (title.length < 3 || title.length > 120 || description.length < 3 || description.length > 1000) throw new PulseSandboxError("Название и описание цели обязательны.", "VALIDATION_FAILED", 400);\n      const expiresAt = new Date(input.expiresAt);',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '        id: crypto.randomUUID(), roomId, productCode: product.code, title: String(input.title || product.displayName).trim().slice(0, 120),\n        description: String(input.description || product.description).trim().slice(0, 1000), targetAmount, currentAmount: 0,',
    '        id: crypto.randomUUID(), roomId, productCode: product.code, title,\n        description, targetAmount, currentAmount: 0,',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '      requireRoom(state, roomId, user.id, { owner: true });\n      const goal = state.pulseGoals.find((item) => item.id === goalId && item.roomId === roomId);',
    '      const room = requireRoom(state, roomId, user.id, { roles: ["owner", "moderator"] });\n      const goal = state.pulseGoals.find((item) => item.id === goalId && item.roomId === roomId);',
)
replace(
    "server/pulse-sandbox-service.cjs",
    '      if (!goal) throw new PulseSandboxError("Цель не найдена.", "GOAL_NOT_FOUND", 404);\n      if (goal.cancelIdempotencyKey === key)',
    '      if (!goal) throw new PulseSandboxError("Цель не найдена.", "GOAL_NOT_FOUND", 404);\n      if (room.ownerId !== user.id && goal.createdBy !== user.id) throw new PulseSandboxError("Модератор может отменить только созданную им цель.", "PERMISSION_DENIED", 403);\n      if (goal.cancelIdempotencyKey === key)',
)

# Collective goal API validation, moderator authorization and administrative/system events.
replace(
    "server/pulse-v3-routes.cjs",
    'const { isRoomBanned, roomRole } = require("./model.cjs");',
    'const { isRoomBanned, roomRole } = require("./model.cjs");\nconst { appendEvent } = require("./events.cjs");',
)
replace(
    "server/pulse-v3-routes.cjs",
    '  function emitRoom(roomId, eventType, payload) {',
    '''  async function recordGoalEvent(roomId, userId, action, goal, duplicate = false) {
    if (duplicate) return;
    await store.mutate((state) => {
      const conversation = state.conversations.find((item) => item.roomId === roomId);
      const actor = state.users.find((item) => item.id === userId);
      const timestamp = new Date().toISOString();
      state.roomAuditLog ||= [];
      state.roomAuditLog.push({
        id: crypto.randomUUID(), roomId, actorId: userId, action: `pulse.goal_${action}`,
        targetUserId: null, createdAt: timestamp, metadata: { goalId: goal.id, title: goal.title },
      });
      appendEvent(state, { type: `billing.goal_${action}`, actorId: userId, roomId, conversationId: conversation?.id || null, payload: { goalId: goal.id } });
      if (conversation) {
        const systemKey = `pulse-goal:${goal.id}:${action}`;
        if (!state.messages.some((item) => item.systemKey === systemKey)) {
          const labels = { created: "создал(а)", cancelled: "отменил(а)", funded: "завершил(а)" };
          state.messages.push({
            id: crypto.randomUUID(), conversationId: conversation.id, senderId: userId, type: "system", system: true,
            systemCode: `pulse.goal_${action}`, systemKey,
            text: `${actor?.displayName || "Участник"} ${labels[action] || action} коллективную цель «${goal.title}».`,
            createdAt: timestamp, updatedAt: null, deletedAt: null, pinnedAt: null,
          });
        }
      }
    });
  }

  function emitRoom(roomId, eventType, payload) {''',
)
replace(
    "server/pulse-v3-routes.cjs",
    '    const membership = requireRoomMember(request.params.roomId, userId);\n    if (membership.room.ownerId !== userId) throw new PulseRepositoryError("Только владелец комнаты может создавать цели.", "PERMISSION_DENIED", 403);\n    let result;',
    '''    const membership = requireRoomMember(request.params.roomId, userId);
    if (!["owner", "moderator"].includes(membership.role)) throw new PulseRepositoryError("Цели доступны владельцу и модераторам.", "PERMISSION_DENIED", 403);
    const title = String(request.body?.title || "").trim();
    const description = String(request.body?.description || "").trim();
    const targetAmount = Math.trunc(Number(request.body?.targetAmount));
    const expiresAt = new Date(request.body?.expiresAt);
    if (title.length < 3 || title.length > 120) throw new PulseRepositoryError("Название цели должно содержать от 3 до 120 символов.", "VALIDATION_FAILED", 400);
    if (description.length < 3 || description.length > 1000) throw new PulseRepositoryError("Описание цели должно содержать от 3 до 1000 символов.", "VALIDATION_FAILED", 400);
    if (!Number.isSafeInteger(targetAmount) || targetAmount < 400 || targetAmount > 1_000_000) throw new PulseRepositoryError("Цель должна быть целым числом от 400 до 1 000 000 Импульсов.", "VALIDATION_FAILED", 400);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 55 * 60_000 || expiresAt.getTime() > Date.now() + 366 * 86_400_000) throw new PulseRepositoryError("Срок цели недействителен.", "VALIDATION_FAILED", 400);
    const activeGoal = store.read((state) => state.pulseGoals.find((item) => item.roomId === membership.room.id && item.status === "active"));
    if (activeGoal) throw new PulseRepositoryError("В комнате уже есть активная цель.", "GOAL_EXISTS", 409);
    let result;''',
)
replace(
    "server/pulse-v3-routes.cjs",
    '        title: request.body?.title,\n        description: request.body?.description,\n        targetAmount: request.body?.targetAmount,\n        expiresAt: request.body?.expiresAt,',
    '        title,\n        description,\n        targetAmount,\n        expiresAt: expiresAt.toISOString(),',
)
replace(
    "server/pulse-v3-routes.cjs",
    '    emitRoom(membership.room.id, "billing.goal_created", result.goal);\n    response.status(result.duplicate ? 200 : 201).json',
    '    await recordGoalEvent(membership.room.id, userId, "created", result.goal, result.duplicate);\n    emitRoom(membership.room.id, "billing.goal_created", result.goal);\n    response.status(result.duplicate ? 200 : 201).json',
)
replace(
    "server/pulse-v3-routes.cjs",
    '    const membership = requireRoomMember(request.params.roomId, userId);\n    if (membership.room.ownerId !== userId) throw new PulseRepositoryError("Только владелец комнаты может отменить цель.", "PERMISSION_DENIED", 403);\n    let result;',
    '''    const membership = requireRoomMember(request.params.roomId, userId);
    if (!["owner", "moderator"].includes(membership.role)) throw new PulseRepositoryError("Недостаточно прав для отмены цели.", "PERMISSION_DENIED", 403);
    const cachedGoal = store.read((state) => state.pulseGoals.find((item) => item.id === request.params.goalId && item.roomId === membership.room.id));
    if (membership.role === "moderator" && cachedGoal?.createdBy !== userId) throw new PulseRepositoryError("Модератор может отменить только созданную им цель.", "PERMISSION_DENIED", 403);
    let result;''',
)
replace(
    "server/pulse-v3-routes.cjs",
    '    emitRoom(membership.room.id, "billing.goal_cancelled", result.goal);\n    response.json',
    '    await recordGoalEvent(membership.room.id, userId, "cancelled", result.goal, result.duplicate);\n    emitRoom(membership.room.id, "billing.goal_cancelled", result.goal);\n    response.json',
)

# Idempotency keys are generated without relying on randomUUID and are mirrored in JSON for old proxies.
replace(
    "client/src/components/PulsePageV31.jsx",
    'import ConfirmDialog from "./ConfirmDialog";',
    'import ConfirmDialog from "./ConfirmDialog";\nimport GoalDialog from "./GoalDialog";',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    '''function call(path, method = "GET", body, idempotencyKey) {
  return api(path, {
    method,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function requestKey(scope, userId) {
  return `${scope}:${userId}:${globalThis.crypto.randomUUID()}`;
}''',
    '''function call(path, method = "GET", body, idempotencyKey) {
  const payload = body === undefined ? undefined : (idempotencyKey && body && typeof body === "object" && !Array.isArray(body) ? { ...body, idempotencyKey } : body);
  return api(path, {
    method,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function requestKey(scope, userId) {
  const entropy = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}`;
  return `${scope}:${userId}:${entropy}`.replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 128);
}''',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    '  const [purchaseTarget, setPurchaseTarget] = useState(null);\n  const [busy, setBusy] = useState(false);',
    '  const [purchaseTarget, setPurchaseTarget] = useState(null);\n  const [goalDialogOpen, setGoalDialogOpen] = useState(false);\n  const [busy, setBusy] = useState(false);',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    '''  async function createGoal() {
    if (selectedRoom?.viewerRole !== "owner") return;
    const title = window.prompt("Название цели", "Новые реакции комнаты");
    if (!title) return;
    const targetAmount = Number(window.prompt("Сколько Импульсов собрать?", "400"));
    if (!Number.isSafeInteger(targetAmount) || targetAmount < 400 || targetAmount > 1_000_000) {
      showToast("Введите целое число от 400 до 1 000 000.", "error");
      return;
    }
    const description = window.prompt("Описание цели", "Откроет расширенные реакции для всей комнаты на 30 дней") || "";
    setBusy(true);
    try {
      await call(`/api/v3/rooms/${encodeURIComponent(selectedRoom.id)}/pulse/goals`, "POST", {
        productCode: "room_reaction_pack",
        title,
        description,
        targetAmount,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        entitlementDurationDays: 30,
      }, requestKey("goal:create", me.id));
      await loadGoals(selectedRoom.id);
      showToast("Цель комнаты создана");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }''',
    '''  async function createGoal(input) {
    if (!["owner", "moderator"].includes(selectedRoom?.viewerRole)) return;
    setBusy(true);
    try {
      await call(`/api/v3/rooms/${encodeURIComponent(selectedRoom.id)}/pulse/goals`, "POST", input, requestKey("goal:create", me.id));
      setGoalDialogOpen(false);
      await Promise.all([loadGoals(selectedRoom.id), onRefresh?.()]);
      showToast("Цель комнаты создана");
    } catch (error) { showToast(error.message, "error"); throw error; }
    finally { setBusy(false); }
  }''',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    '{selectedRoom?.viewerRole === "owner" && <button type="button" className="pulse31-create-goal" onClick={createGoal} disabled={busy || !linked}><Target size={17} /> Создать цель</button>}',
    '{["owner", "moderator"].includes(selectedRoom?.viewerRole) && <button type="button" className="pulse31-create-goal" onClick={() => setGoalDialogOpen(true)} disabled={busy || !linked || goals.some((goal) => goal.status === "active")}><Target size={17} /> Создать цель</button>}',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    '{selectedRoom?.viewerRole === "owner" && <button type="button" className="danger" onClick={() => cancelGoal(goal)}>Отменить</button>}',
    '{(selectedRoom?.viewerRole === "owner" || (selectedRoom?.viewerRole === "moderator" && goal.createdBy === me.id)) && <button type="button" className="danger" onClick={() => cancelGoal(goal)}>Отменить</button>}',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    'detail={selectedRoomId ? "Владелец может создать коллективную цель." : "Доступны комнаты, в которых вы состоите."}',
    'detail={selectedRoomId ? "Владелец или модератор может создать коллективную цель." : "Доступны комнаты, в которых вы состоите."}',
)
replace(
    "client/src/components/PulsePageV31.jsx",
    '    <ConfirmDialog\n      open={Boolean(purchaseTarget)}',
    '    <GoalDialog open={goalDialogOpen} room={selectedRoom} busy={busy} onCancel={() => !busy && setGoalDialogOpen(false)} onSubmit={createGoal} />\n    <ConfirmDialog\n      open={Boolean(purchaseTarget)}',
)

# Secure voice player, live microphone waveform, entitlement rendering and explicit MLS recovery UI.
replace(
    "client/src/components/SecureMessagePane.jsx",
    'import ConfirmDialog from "./ConfirmDialog";\nimport ParticleField from "./ParticleField";',
    'import ConfirmDialog from "./ConfirmDialog";\nimport ParticleField from "./ParticleField";\nimport SecureVoicePlayer from "./SecureVoicePlayer";\nimport { normalizeVoiceWaveform, waveformLevel } from "../utils/voice-waveform";',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    'const reactions = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];',
    'const BASE_REACTIONS = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];\nconst PLUS_REACTIONS = ["✨", "💜", "⚡", "🫡", "🤝", "🚀"];',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '''function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

''',
    '',
)
start = read("client/src/components/SecureMessagePane.jsx").index("function normalizeWaveform(values, target = 48) {")
end = read("client/src/components/SecureMessagePane.jsx").index("function SecureAttachment", start)
source = read("client/src/components/SecureMessagePane.jsx")
write("client/src/components/SecureMessagePane.jsx", source[:start] + source[end:])
replace(
    "client/src/components/SecureMessagePane.jsx",
    '    return normalizeWaveform(amplitudes, bars);',
    '    return normalizeVoiceWaveform(amplitudes, bars);',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    'const SecureMessage = memo(function SecureMessage({ message, onReply, onEdit, onDelete, onReact, onBookmark, onCopy, onRetry, onDiscard, showToast }) {',
    'const SecureMessage = memo(function SecureMessage({ message, availableReactions, onReply, onEdit, onDelete, onReact, onBookmark, onCopy, onRetry, onDiscard, showToast }) {',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '  return <article className={`message-row secure-message${message.isOwn ? " own" : ""}${pending ? " pending" : ""}`} id={`message-${message.id}`}>',
    '  return <article className={`message-row secure-message${message.isOwn ? " own" : ""}${pending ? " pending" : ""}${message.system ? " system-message" : ""}${message.sender?.messageStyle === "prism" ? " message-style-prism" : ""}`} id={`message-${message.id}`}>',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '{!message.isOwn && <Avatar user={message.sender} size="small" />}',
    '{!message.isOwn && !message.system && <Avatar user={message.sender} size="small" />}',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '{!deleted && !pending && <div className="message-actions secure-message-actions">',
    '{!deleted && !pending && !message.system && <div className="message-actions secure-message-actions">',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '{reactions.map((emoji) =>',
    '{availableReactions.map((emoji) =>',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '  const [groupState, setGroupState] = useState("idle");',
    '  const [groupState, setGroupState] = useState("idle");\n  const [groupError, setGroupError] = useState(null);',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '    uploadAbort.current?.abort(); clearInterval(recordingTimer.current);\n    const active = recorderRef.current;\n    if (active) { active.cancelled = true; if (active.recorder.state !== "inactive") active.recorder.stop(); active.stream.getTracks().forEach((track) => track.stop()); }',
    '    uploadAbort.current?.abort(); clearInterval(recordingTimer.current);\n    const active = recorderRef.current;\n    if (active) { active.cancelled = true; cancelAnimationFrame(active.animationFrame || 0); active.source?.disconnect?.(); active.analyser?.disconnect?.(); active.audioContext?.close?.().catch(() => {}); if (active.recorder.state !== "inactive") active.recorder.stop(); active.stream.getTracks().forEach((track) => track.stop()); }',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '''    setGroupState("initializing");
    try { const result = await ensureConversationGroup(conversationRef.current); setGroupState("ready"); return result; }
    catch (error) { setGroupState(error.code || "error"); throw error; }''',
    '''    setGroupState("initializing"); setGroupError(null);
    try { const result = await ensureConversationGroup(conversationRef.current, { forceSync: true }); setGroupState("ready"); return result; }
    catch (error) { setGroupError(error); setGroupState(error.code || "error"); throw error; }''',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '    setMessages([]); setReplyingTo(null); setEditing(null); setDeleteTarget(null); setGroupState("idle"); setMediaState(null); uploadAbort.current?.abort();',
    '    setMessages([]); setReplyingTo(null); setEditing(null); setDeleteTarget(null); setGroupState("idle"); setGroupError(null); setMediaState(null); uploadAbort.current?.abort();',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '''      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const active = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, mimeType: recorder.mimeType || mimeType || "audio/webm" };
      recorder.ondataavailable = (event) => { if (event.data?.size) active.chunks.push(event.data); };
      recorderRef.current = active; recorder.start(250); setRecording({ seconds: 0 });
      recordingTimer.current = setInterval(() => setRecording({ seconds: Math.min(300, Math.floor((Date.now() - active.startedAt) / 1000)) }), 500);''',
    '''      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const liveWaveform = Array.from({ length: 48 }, () => 12);
      let audioContext = null; let analyser = null; let sourceNode = null;
      try {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (Context) {
          audioContext = new Context(); analyser = audioContext.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.72;
          sourceNode = audioContext.createMediaStreamSource(stream); sourceNode.connect(analyser);
        }
      } catch { audioContext = null; analyser = null; sourceNode = null; }
      const active = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, mimeType: recorder.mimeType || mimeType || "audio/webm", liveWaveform, audioContext, analyser, source: sourceNode, animationFrame: 0 };
      const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
      const draw = () => {
        if (recorderRef.current !== active || active.cancelled) return;
        if (analyser && samples) { analyser.getByteTimeDomainData(samples); liveWaveform.shift(); liveWaveform.push(Math.max(8, waveformLevel(samples))); }
        setRecording({ seconds: Math.min(300, Math.floor((Date.now() - active.startedAt) / 1000)), waveform: [...liveWaveform] });
        active.animationFrame = requestAnimationFrame(draw);
      };
      recorder.ondataavailable = (event) => { if (event.data?.size) active.chunks.push(event.data); };
      recorderRef.current = active; recorder.start(250); setRecording({ seconds: 0, waveform: [...liveWaveform] }); active.animationFrame = requestAnimationFrame(draw);
      recordingTimer.current = setInterval(() => setRecording((current) => ({ seconds: Math.min(300, Math.floor((Date.now() - active.startedAt) / 1000)), waveform: current?.waveform || [...liveWaveform] })), 500);''',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '        active.stream.getTracks().forEach((track) => track.stop()); recorderRef.current = null;',
    '        cancelAnimationFrame(active.animationFrame || 0); active.source?.disconnect?.(); active.analyser?.disconnect?.(); await active.audioContext?.close?.().catch(() => {}); active.stream.getTracks().forEach((track) => track.stop()); recorderRef.current = null;',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '            const waveform = await voiceWaveform(blob);',
    '            const decodedWaveform = await voiceWaveform(blob);\n            const waveform = decodedWaveform.length ? decodedWaveform : normalizeVoiceWaveform(active.liveWaveform);',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '    active.stream.getTracks().forEach((track) => track.stop()); if (active.recorder.state !== "inactive") active.recorder.stop(); recorderRef.current = null;',
    '    cancelAnimationFrame(active.animationFrame || 0); active.source?.disconnect?.(); active.analyser?.disconnect?.(); active.audioContext?.close?.().catch(() => {}); active.stream.getTracks().forEach((track) => track.stop()); if (active.recorder.state !== "inactive") active.recorder.stop(); recorderRef.current = null;',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '  const busy = sending || Boolean(mediaState) || Boolean(recording) || groupState !== "ready";',
    '  const busy = sending || Boolean(mediaState) || Boolean(recording) || groupState !== "ready";\n  const availableReactions = useMemo(() => [...BASE_REACTIONS, ...((me.stickerPack === "nova" || conversation.reactionPack === "expanded") ? PLUS_REACTIONS : [])], [conversation.reactionPack, me.stickerPack]);\n  const paneEffects = `${conversation.theme === "midnight" ? " room-theme-midnight" : ""}`;',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '  if (!ready) return <section className="message-pane secure-message-pane"><TrustGate trustState={trustState} /></section>;\n\n  return <section className="message-pane secure-message-pane">',
    '  if (!ready) return <section className="message-pane secure-message-pane"><TrustGate trustState={trustState} /></section>;\n\n  return <section className={`message-pane secure-message-pane${paneEffects}`}>',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '    {searchOpen && <div className="chat-search-bar secure-local-search">',
    '    {conversation.bannerStyle === "aurora" && <div className="secure-room-banner-aurora"><strong>AURORA ROOM</strong><span>Активный баннер комнаты · Pulse</span></div>}\n    {searchOpen && <div className="chat-search-bar secure-local-search">',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '{loading ? <div className="messages-loading"><InlineLoader label="Проверяем ключи и расшифровываем" /></div> : displayMessages.length === 0 ?',
    '{loading ? <div className="messages-loading"><InlineLoader label="Проверяем ключи и расшифровываем" /></div> : groupState !== "ready" ? <div className="secure-mls-recovery"><ShieldAlert size={24} /><strong>MLS-сессия не синхронизирована</strong><p>{groupError?.message || "Клиент безопасно запрашивает актуальный epoch и Welcome. Отправка остаётся заблокированной без fallback на plaintext."}</p><button type="button" onClick={loadMessages}><RefreshCcw size={15} /> Повторить синхронизацию</button></div> : displayMessages.length === 0 ?',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '<SecureMessage key={message.id} message={message}',
    '<SecureMessage key={message.id} message={message} availableReactions={availableReactions}',
)
replace(
    "client/src/components/SecureMessagePane.jsx",
    '{recording && <div className="secure-recording" aria-live="polite"><span className="recording-dot" /><strong>Запись {recording.seconds} сек.</strong><button',
    '{recording && <div className="secure-recording" aria-live="polite"><span className="recording-dot" /><strong>Запись {recording.seconds} сек.</strong><div className="secure-recording-wave" aria-hidden="true">{normalizeVoiceWaveform(recording.waveform || []).map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><button',
)

# Client MLS recovery: force remote synchronization on open and safely rejoin through a fresh Welcome.
replace(
    "client/src/crypto/trust-client.js",
    'async function requestWelcomeAndWait(device, conversationId) {\n  await trustApi(`/api/v4/trust/conversations/${conversationId}/welcome/request`, { method: "POST", body: {} });',
    'async function requestWelcomeAndWait(device, conversationId, { forceRejoin = false } = {}) {\n  await trustApi(`/api/v4/trust/conversations/${conversationId}/welcome/request`, { method: "POST", body: { forceRejoin } });',
)
replace(
    "client/src/crypto/trust-client.js",
    '''    if (activeMember) {
      throw trustError(
        "Локальное MLS-состояние утрачено для активного устройства. Отзовите устройство и подключите его заново, чтобы получить новый Welcome.",
        "MLS_STATE_LOST",
      );
    }
    local = await requestWelcomeAndWait(device, conversation.id);''',
    '''    local = await requestWelcomeAndWait(device, conversation.id, { forceRejoin: Boolean(activeMember) });
    if (!local && activeMember) {
      throw trustError("Восстановление MLS запрошено. Откройте диалог на другом активном устройстве или попросите участника оставаться онлайн.", "MLS_RECOVERY_PENDING");
    }''',
)
replace(
    "client/src/crypto/trust-client.js",
    '  local = await syncMissedCommits(device, conversation, local, remote);',
    '''  try {
    local = await syncMissedCommits(device, conversation, local, remote);
  } catch (error) {
    const recoverable = new Set(["MLS_COMMIT_GAP", "MLS_COMMIT_LOG_INVALID", "MLS_PUBLIC_STATE_HASH_MISMATCH", "MLS_EPOCH_CONFLICT", "MLS_STATE_LOST"]);
    if (!recoverable.has(error.code)) throw error;
    const recovered = await requestWelcomeAndWait(device, conversation.id, { forceRejoin: true });
    if (!recovered) throw trustError("Безопасное восстановление MLS ожидает Welcome от другого активного участника.", "MLS_RECOVERY_PENDING");
    local = recovered;
    remote = await getRemoteGroup(conversation.id);
  }''',
)

# Server route accepts forceRejoin only for the authenticated current device.
replace(
    "server/trust-routes.cjs",
    '      emit: (event) => emitWelcomeRequest(event, request.trustAuth.user.id),',
    '      emit: (event) => emitWelcomeRequest(event, request.trustAuth.user.id),\n      forceRejoin: Boolean(request.body?.forceRejoin),',
)

# Tests for the new pure and server-side behavior.
write("test/voice-waveform.test.cjs", textwrap.dedent(r'''\
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const modulePromise = import(pathToFileURL(path.join(__dirname, "../client/src/utils/voice-waveform.js")).href);

test("voice duration never renders Infinity:NaN", async () => {
  const { finiteDuration, formatVoiceDuration } = await modulePromise;
  assert.equal(finiteDuration(Infinity), 0);
  assert.equal(formatVoiceDuration(Infinity), "0:00");
  assert.equal(formatVoiceDuration(65.2), "1:05");
});

test("waveform normalization is deterministic and bounded", async () => {
  const { normalizeVoiceWaveform, waveformLevel, seekRatio } = await modulePromise;
  const bars = normalizeVoiceWaveform([0, 1, 4, 9, 16], 48);
  assert.equal(bars.length, 48);
  assert.ok(bars.every((value) => value >= 14 && value <= 100));
  assert.equal(seekRatio(50, 0, 100), 0.5);
  assert.equal(seekRatio(-50, 0, 100), 0);
  assert.equal(seekRatio(150, 0, 100), 1);
  assert.equal(waveformLevel(new Uint8Array(256).fill(128)), 0);
  assert.ok(waveformLevel(Uint8Array.from({ length: 256 }, (_, index) => index % 2 ? 255 : 0)) > 70);
});
'''))

write("test/pulse-effects.test.cjs", textwrap.dedent(r'''\
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applyPulseEntitlementEffect, reconcilePulseEffects } = require("../server/pulse-effects.cjs");

test("signed catalog entitlements apply only whitelisted effects", () => {
  const state = { users: [{ id: "u1" }], rooms: [{ id: "r1" }], billingEntitlements: [] };
  const valid = { id: "e1", productCode: "message_style_prism", scopeType: "user", scopeId: "u1", status: "active", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" };
  state.billingEntitlements.push(valid);
  assert.equal(applyPulseEntitlementEffect(state, valid, {}, Date.parse("2026-07-23T00:00:00Z")), true);
  assert.equal(state.users[0].messageStyle, "prism");
  assert.equal(applyPulseEntitlementEffect(state, { ...valid, productCode: "forged", effect: { role: "admin" } }), false);
  assert.equal(state.users[0].role, undefined);
});

test("reconciliation applies room effects and removes expired catalog values", () => {
  const state = {
    users: [{ id: "u1", avatarFrame: "neon" }], rooms: [{ id: "r1" }],
    billingEntitlements: [
      { productCode: "avatar_frame_neon", scopeType: "user", scopeId: "u1", status: "active", expiresAt: "2026-01-01T00:00:00.000Z" },
      { productCode: "room_theme_midnight", scopeType: "room", scopeId: "r1", status: "active", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2027-01-01T00:00:00.000Z" },
    ],
  };
  reconcilePulseEffects(state, Date.parse("2026-07-23T00:00:00Z"));
  assert.equal(state.users[0].avatarFrame, "none");
  assert.equal(state.rooms[0].theme, "midnight");
});
'''))

# Extend existing sandbox regression coverage for moderator goals and the one-active-goal invariant.
replace(
    "test/pulse-sandbox-service.test.cjs",
    '      { id: "u2", username: "member", displayName: "Member" },',
    '      { id: "u2", username: "member", displayName: "Member" },\n      { id: "u3", username: "moderator", displayName: "Moderator" },',
)
replace(
    "test/pulse-sandbox-service.test.cjs",
    '      { roomId: "room-1", userId: "u2", role: "member" },',
    '      { roomId: "room-1", userId: "u2", role: "member" },\n      { roomId: "room-1", userId: "u3", role: "moderator" },',
)
replace(
    "test/pulse-sandbox-service.test.cjs",
    'test("production mode refuses local sandbox activation", async () => {',
    '''test("moderator can create one validated goal but cannot cancel owner's goal", async () => {
  const { service } = fixture();
  await service.setEnabled(true, "test");
  const created = await service.createGoal("moderator", "room-1", {
    productCode: "room_reaction_pack", title: "Общая цель", description: "Расширенные реакции",
    targetAmount: 400, expiresAt: "2026-08-20T20:00:00.000Z", idempotencyKey: "goal:moderator:test:0001",
  });
  assert.equal(created.goal.createdBy, "u3");
  await assert.rejects(service.createGoal("netrox", "room-1", {
    productCode: "room_banner_aurora", title: "Вторая цель", description: "Не должна создаться",
    targetAmount: 500, expiresAt: "2026-08-20T20:00:00.000Z", idempotencyKey: "goal:owner:test:0003",
  }), (error) => error.code === "GOAL_EXISTS");
  await service.cancelGoal("moderator", "room-1", created.goal.id, "goal:moderator:cancel:1");
});

test("production mode refuses local sandbox activation", async () => {''',
)

# Release notes and changelog use 3.3.3 as the current patch release.
changelog = read("CHANGELOG.md")
entry = textwrap.dedent('''\
## [3.3.3] - 2026-07-23

### Fixed
- Collective room goals now use a validated accessible dialog, support owner/moderator creation, enforce one active goal, and preserve atomic contributions/refunds.
- Voice messages now have live microphone-level waveforms, persistent waveform metadata, animated playback progress, drag/keyboard seeking, finite duration handling, and 1×/1.5×/2× speed.
- Pulse catalog entitlements now apply visible profile, message, reaction and room effects after Sandbox or Cloud purchases.
- Purchase requests now carry a stable Idempotency-Key in both the header and compatibility body, preventing the failed confirmation flow and duplicate debits.
- MLS conversations force a remote epoch check on open and can safely rejoin through a fresh Welcome without plaintext fallback.

### Security
- Pulse effects are resolved only from the server-owned catalog allowlist; client-provided effects are ignored.
- MLS state recovery removes only the authenticated current device from the group and requires another verified active peer before rejoining.

''')
if "## [3.3.3]" not in changelog:
    marker = changelog.find("## [")
    changelog = changelog[:marker] + entry + changelog[marker:] if marker >= 0 else entry + changelog
    write("CHANGELOG.md", changelog)

print("Nexora 3.3.3 source migration applied.")
