"use strict";

const crypto = require("node:crypto");
const { catalogItem, publicCatalog } = require("../shared/pulse-catalog.cjs");

class PulseSandboxError extends Error {
  constructor(message, code = "PULSE_SANDBOX_ERROR", status = 400, details = {}) {
    super(message);
    this.name = "PulseSandboxError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nowIso(clock) {
  return clock().toISOString();
}

function resolveUser(state, reference) {
  const value = String(reference || "").trim().replace(/^(?:<|\[)/, "").replace(/(?:>|\])$/, "").replace(/^@/, "").toLowerCase();
  const user = state.users.find((item) => item.id.toLowerCase() === value || item.username.toLowerCase() === value);
  if (!user) throw new PulseSandboxError("Пользователь не найден.", "USER_NOT_FOUND", 404);
  return user;
}

function requireIdempotencyKey(value) {
  const key = String(value || "");
  if (!/^[A-Za-z0-9_.:-]{12,128}$/.test(key)) throw new PulseSandboxError("Idempotency-Key обязателен.", "IDEMPOTENCY_KEY_REQUIRED", 400);
  return key;
}

function requireRoom(state, roomId, userId, { owner = false } = {}) {
  const room = state.rooms.find((item) => item.id === String(roomId || ""));
  if (!room) throw new PulseSandboxError("Комната не найдена.", "RESOURCE_NOT_FOUND", 404);
  const member = state.roomMembers.find((item) => item.roomId === room.id && item.userId === userId);
  if (!member) throw new PulseSandboxError("Для операции нужно состоять в комнате.", "PERMISSION_DENIED", 403);
  if (state.roomBans.some((item) => item.roomId === room.id && item.userId === userId && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()))) {
    throw new PulseSandboxError("Пользователь заблокирован в комнате.", "ROOM_BANNED", 403);
  }
  if (owner && room.ownerId !== userId) throw new PulseSandboxError("Операция доступна только владельцу комнаты.", "PERMISSION_DENIED", 403);
  return room;
}

function walletLink(state, user, timestamp) {
  let link = state.billingLinks.find((item) => (item.userId || item.localUserId) === user.id);
  if (!link) {
    link = { id: crypto.randomUUID(), userId: user.id, cloudAccountId: `sandbox:${user.id}`, linkedAt: timestamp, walletBalance: 0, status: "linked", source: "local_sandbox" };
    state.billingLinks.push(link);
  }
  link.userId = user.id;
  link.status = "linked";
  link.source = "local_sandbox";
  return link;
}

function activeEntitlement(state, { scopeType, scopeId, productCode, clock }) {
  const now = clock().getTime();
  return state.billingEntitlements.find((item) => item.scopeType === scopeType
    && item.scopeId === scopeId
    && item.productCode === productCode
    && item.status === "active"
    && Date.parse(item.expiresAt) > now);
}

function applyEffect(state, product, scopeId) {
  if (product.scope === "user") {
    const user = state.users.find((item) => item.id === scopeId);
    if (user) Object.assign(user, product.effect);
    return;
  }
  const room = state.rooms.find((item) => item.id === scopeId);
  if (room) Object.assign(room, product.effect);
}

function issueEntitlement(state, product, scopeId, actor, clock) {
  const timestamp = clock();
  const startsAt = timestamp.toISOString();
  const expiresAt = new Date(timestamp.getTime() + product.durationDays * 86_400_000).toISOString();
  let entitlement = state.billingEntitlements.find((item) => item.scopeType === product.scope && item.scopeId === scopeId && item.productCode === product.code && item.source === "local_sandbox");
  if (!entitlement) {
    entitlement = { id: crypto.randomUUID(), scopeType: product.scope, scopeId, productCode: product.code, source: "local_sandbox" };
    state.billingEntitlements.push(entitlement);
  }
  Object.assign(entitlement, { status: "active", startsAt, expiresAt, issuedBy: actor, revokedAt: null, updatedAt: startsAt, sandbox: true });
  applyEffect(state, product, scopeId);
  return entitlement;
}

class PulseSandboxService {
  constructor({ store, productionMode = false, clock = () => new Date(), log = () => {} } = {}) {
    if (!store) throw new PulseSandboxError("Sandbox требует Local Store.", "PULSE_SANDBOX_MISCONFIGURED", 500);
    this.store = store;
    this.productionMode = Boolean(productionMode);
    this.clock = clock;
    this.log = log;
  }

  enabled() {
    if (this.productionMode) return false;
    return this.store.read((state) => Boolean(state.settings.pulseSandboxEnabled));
  }

  requireEnabled() {
    if (!this.enabled()) throw new PulseSandboxError("Тестовая модель Pulse отключена на Nexora Server.", "PULSE_SANDBOX_DISABLED", 503);
  }

  async setEnabled(enabled, actor = "operator") {
    if (this.productionMode && enabled) throw new PulseSandboxError("Sandbox нельзя включить при активном production Pulse Cloud.", "PULSE_SANDBOX_PRODUCTION_CONFLICT", 409);
    await this.store.mutate((state) => {
      state.settings.pulseSandboxEnabled = Boolean(enabled);
      state.integrationAudit ||= [];
      state.integrationAudit.push({ id: crypto.randomUUID(), type: "pulse.sandbox.toggled", actor, enabled: Boolean(enabled), createdAt: nowIso(this.clock) });
    });
    this.log(`Pulse sandbox ${enabled ? "enabled" : "disabled"} by ${actor}`, "info");
    return { enabled: this.enabled() };
  }

  overview(userReference) {
    this.requireEnabled();
    return this.store.read((state) => {
      const user = resolveUser(state, userReference);
      const current = this.clock().getTime();
      const plus = state.billingEntitlements.find((item) => item.scopeType === "user" && item.scopeId === user.id && item.productCode === "nexora_plus" && item.status === "active" && Date.parse(item.expiresAt) > current);
      const link = state.billingLinks.find((item) => (item.userId || item.localUserId) === user.id);
      const entitlements = state.billingEntitlements.filter((item) => item.status === "active" && Date.parse(item.expiresAt) > current && (
        (item.scopeType === "user" && item.scopeId === user.id)
        || (item.scopeType === "room" && state.roomMembers.some((member) => member.roomId === item.scopeId && member.userId === user.id))
      ));
      return {
        sandbox: true,
        account: { id: `sandbox:${user.id}`, cloudAccountId: `sandbox:${user.id}`, userId: user.id, status: "linked", testMode: true, linkedAt: link?.linkedAt || null },
        wallet: { balance: Number(link?.walletBalance) || 0, currency: "IMPULSE" },
        subscription: plus ? { id: plus.id, productCode: "nexora_plus", status: "active", currentPeriodStart: plus.startsAt, currentPeriodEnd: plus.expiresAt, cancelAtPeriodEnd: false, sandbox: true } : null,
        entitlements: entitlements.map((item) => ({ ...item, sandbox: true })),
      };
    });
  }

  catalog(userReference, roomId = null) {
    this.requireEnabled();
    return this.store.read((state) => {
      const user = resolveUser(state, userReference);
      if (roomId) requireRoom(state, roomId, user.id);
      const owned = new Set(state.billingEntitlements
        .filter((item) => item.status === "active" && Date.parse(item.expiresAt) > this.clock().getTime())
        .filter((item) => item.scopeType === "user" ? item.scopeId === user.id : item.scopeId === roomId)
        .map((item) => item.productCode));
      return publicCatalog().map((item) => ({ ...item, owned: owned.has(item.code) }));
    });
  }

  transactions(userReference, limit = 100) {
    this.requireEnabled();
    return this.store.read((state) => {
      const user = resolveUser(state, userReference);
      return state.pulseLedger.filter((item) => item.userId === user.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, Math.max(1, Math.min(200, Number(limit) || 100)));
    });
  }

  receipts() {
    this.requireEnabled();
    return [];
  }

  async purchase(userReference, productCode, { roomId = null, idempotencyKey, actor = "client" } = {}) {
    this.requireEnabled();
    const key = requireIdempotencyKey(idempotencyKey);
    const product = catalogItem(productCode);
    if (!product) throw new PulseSandboxError("Товар недоступен.", "PRODUCT_UNAVAILABLE", 404);
    const result = await this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      const timestamp = nowIso(this.clock);
      const scopeId = product.scope === "room" ? requireRoom(state, roomId, user.id, { owner: true }).id : user.id;
      const duplicate = state.pulseLedger.find((item) => item.userId === user.id && item.idempotencyKey === key && item.operationType === "impulse_product_purchase");
      if (duplicate) return { duplicate: true, transaction: duplicate, walletBalance: duplicate.balanceAfter, entitlement: activeEntitlement(state, { scopeType: product.scope, scopeId, productCode: product.code, clock: this.clock }) };
      const existing = activeEntitlement(state, { scopeType: product.scope, scopeId, productCode: product.code, clock: this.clock });
      if (existing) return { duplicate: true, alreadyOwned: true, walletBalance: Number(walletLink(state, user, timestamp).walletBalance) || 0, entitlement: existing };
      const link = walletLink(state, user, timestamp);
      const before = Number(link.walletBalance) || 0;
      if (before < product.priceImpulses) throw new PulseSandboxError("Недостаточно Импульсов.", "WALLET_INSUFFICIENT_FUNDS", 409, { required: product.priceImpulses, balance: before });
      link.walletBalance = before - product.priceImpulses;
      const entitlement = issueEntitlement(state, product, scopeId, actor, this.clock);
      const transaction = {
        id: crypto.randomUUID(), userId: user.id, operationType: "impulse_product_purchase", amount: -product.priceImpulses,
        currency: "IMPULSE", status: "completed", balanceBefore: before, balanceAfter: link.walletBalance,
        referenceId: entitlement.id, productCode: product.code, scopeType: product.scope, scopeId, idempotencyKey: key,
        createdAt: timestamp, source: "local_sandbox", actor,
      };
      state.pulseLedger.push(transaction);
      state.integrationAudit ||= [];
      state.integrationAudit.push({ id: crypto.randomUUID(), type: "pulse.product.purchased", actor: user.id, productCode: product.code, scopeType: product.scope, scopeId, amount: product.priceImpulses, createdAt: timestamp });
      return { duplicate: false, transaction, walletBalance: link.walletBalance, entitlement: structuredClone(entitlement), product: { ...product, effect: undefined } };
    });
    this.log(`Sandbox product ${productCode} purchased by ${userReference}`, "info");
    return result;
  }

  goals(userReference, roomId) {
    this.requireEnabled();
    return this.store.read((state) => {
      const user = resolveUser(state, userReference);
      requireRoom(state, roomId, user.id);
      return state.pulseGoals.filter((item) => item.roomId === roomId).map((goal) => ({
        ...goal,
        contributionCount: state.pulseContributions.filter((item) => item.goalId === goal.id && item.status !== "refunded").length,
      }));
    });
  }

  async createGoal(userReference, roomId, input = {}, { actor = "client" } = {}) {
    this.requireEnabled();
    const key = requireIdempotencyKey(input.idempotencyKey);
    const product = catalogItem(input.productCode);
    if (!product || product.scope !== "room") throw new PulseSandboxError("Продукт комнаты недоступен.", "PRODUCT_UNAVAILABLE", 409);
    const targetAmount = Math.trunc(Number(input.targetAmount));
    if (!Number.isSafeInteger(targetAmount) || targetAmount < product.priceImpulses || targetAmount > 1_000_000) throw new PulseSandboxError(`Цель должна быть не меньше ${product.priceImpulses} Импульсов.`, "VALIDATION_FAILED", 400);
    return this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      requireRoom(state, roomId, user.id, { owner: true });
      const duplicate = state.pulseGoals.find((item) => item.createdBy === user.id && item.idempotencyKey === key);
      if (duplicate) return { goal: structuredClone(duplicate), duplicate: true };
      const expiresAt = new Date(input.expiresAt);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= this.clock().getTime()) throw new PulseSandboxError("Срок цели должен быть в будущем.", "VALIDATION_FAILED", 400);
      const goal = {
        id: crypto.randomUUID(), roomId, productCode: product.code, title: String(input.title || product.displayName).trim().slice(0, 120),
        description: String(input.description || product.description).trim().slice(0, 1000), targetAmount, currentAmount: 0,
        status: "active", createdBy: user.id, createdAt: nowIso(this.clock), expiresAt: expiresAt.toISOString(),
        entitlementDurationDays: product.durationDays, idempotencyKey: key, source: "local_sandbox", actor,
      };
      state.pulseGoals.push(goal);
      return { goal: structuredClone(goal), duplicate: false };
    });
  }

  async contribute(userReference, roomId, goalId, amount, idempotencyKey) {
    this.requireEnabled();
    const key = requireIdempotencyKey(idempotencyKey);
    const requested = Math.trunc(Number(amount));
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > 100_000) throw new PulseSandboxError("Сумма вклада недействительна.", "VALIDATION_FAILED", 400);
    return this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      requireRoom(state, roomId, user.id);
      const duplicate = state.pulseContributions.find((item) => item.userId === user.id && item.idempotencyKey === key);
      const link = walletLink(state, user, nowIso(this.clock));
      if (duplicate) return { duplicate: true, contribution: structuredClone(duplicate), goal: structuredClone(state.pulseGoals.find((item) => item.id === duplicate.goalId)), balance: Number(link.walletBalance) || 0 };
      const goal = state.pulseGoals.find((item) => item.id === goalId && item.roomId === roomId);
      if (!goal) throw new PulseSandboxError("Цель не найдена.", "GOAL_NOT_FOUND", 404);
      if (goal.status !== "active") throw new PulseSandboxError("Цель уже закрыта.", "GOAL_CLOSED", 409);
      if (Date.parse(goal.expiresAt) <= this.clock().getTime()) { goal.status = "expired"; throw new PulseSandboxError("Срок цели истёк.", "GOAL_EXPIRED", 410); }
      const accepted = Math.min(requested, goal.targetAmount - goal.currentAmount);
      const before = Number(link.walletBalance) || 0;
      if (before < accepted) throw new PulseSandboxError("Недостаточно Импульсов.", "WALLET_INSUFFICIENT_FUNDS", 409);
      link.walletBalance = before - accepted;
      const contribution = { id: crypto.randomUUID(), goalId, roomId, userId: user.id, requestedAmount: requested, acceptedAmount: accepted, status: "accepted", idempotencyKey: key, createdAt: nowIso(this.clock), source: "local_sandbox" };
      state.pulseContributions.push(contribution);
      goal.currentAmount += accepted;
      let entitlement = null;
      if (goal.currentAmount >= goal.targetAmount) {
        goal.currentAmount = goal.targetAmount;
        goal.status = "funded";
        goal.fundedAt = nowIso(this.clock);
        const product = catalogItem(goal.productCode);
        if (product) entitlement = issueEntitlement(state, { ...product, durationDays: goal.entitlementDurationDays }, roomId, user.id, this.clock);
      }
      state.pulseLedger.push({ id: crypto.randomUUID(), userId: user.id, operationType: "room_goal_contribution", amount: -accepted, currency: "IMPULSE", status: "completed", balanceBefore: before, balanceAfter: link.walletBalance, referenceId: contribution.id, goalId, idempotencyKey: key, createdAt: contribution.createdAt, source: "local_sandbox" });
      return { duplicate: false, contribution: structuredClone(contribution), goal: structuredClone(goal), entitlement: entitlement ? structuredClone(entitlement) : null, balance: link.walletBalance };
    });
  }

  async cancelGoal(userReference, roomId, goalId, idempotencyKey) {
    this.requireEnabled();
    const key = requireIdempotencyKey(idempotencyKey);
    return this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      requireRoom(state, roomId, user.id, { owner: true });
      const goal = state.pulseGoals.find((item) => item.id === goalId && item.roomId === roomId);
      if (!goal) throw new PulseSandboxError("Цель не найдена.", "GOAL_NOT_FOUND", 404);
      if (goal.cancelIdempotencyKey === key) return { goal: structuredClone(goal), refundedPulse: Number(goal.refundedPulse) || 0, duplicate: true };
      if (goal.status !== "active") throw new PulseSandboxError("Активную цель уже нельзя отменить.", "GOAL_CLOSED", 409);
      let refundedPulse = 0;
      for (const contribution of state.pulseContributions.filter((item) => item.goalId === goal.id && item.status === "accepted")) {
        const contributor = state.users.find((item) => item.id === contribution.userId);
        if (!contributor) continue;
        const link = walletLink(state, contributor, nowIso(this.clock));
        const before = Number(link.walletBalance) || 0;
        link.walletBalance = before + contribution.acceptedAmount;
        contribution.status = "refunded";
        contribution.refundedAt = nowIso(this.clock);
        refundedPulse += contribution.acceptedAmount;
        state.pulseLedger.push({ id: crypto.randomUUID(), userId: contributor.id, operationType: "room_goal_refund", amount: contribution.acceptedAmount, currency: "IMPULSE", status: "completed", balanceBefore: before, balanceAfter: link.walletBalance, referenceId: contribution.id, goalId, createdAt: contribution.refundedAt, source: "local_sandbox" });
      }
      Object.assign(goal, { status: "refunded", closedAt: nowIso(this.clock), cancelIdempotencyKey: key, refundedPulse });
      return { goal: structuredClone(goal), refundedPulse, duplicate: false };
    });
  }

  async grantPlus(userReference, { days = 30, actor = "operator" } = {}) {
    this.requireEnabled();
    const durationDays = Math.max(1, Math.min(366, Math.trunc(Number(days) || 30)));
    const result = await this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      const timestamp = this.clock();
      const startsAt = timestamp.toISOString();
      const expiresAt = new Date(timestamp.getTime() + durationDays * 86_400_000).toISOString();
      let entitlement = state.billingEntitlements.find((item) => item.scopeType === "user" && item.scopeId === user.id && item.productCode === "nexora_plus" && item.source === "local_sandbox");
      const newlyActive = !entitlement || entitlement.status !== "active" || Date.parse(entitlement.expiresAt) <= timestamp.getTime();
      if (!entitlement) { entitlement = { id: crypto.randomUUID(), scopeType: "user", scopeId: user.id, productCode: "nexora_plus", source: "local_sandbox" }; state.billingEntitlements.push(entitlement); }
      Object.assign(entitlement, { status: "active", startsAt, expiresAt, issuedBy: actor, revokedAt: null, updatedAt: startsAt });
      const link = walletLink(state, user, startsAt);
      if (newlyActive) {
        const before = Number(link.walletBalance) || 0;
        link.walletBalance = before + 400;
        state.pulseLedger.push({ id: crypto.randomUUID(), userId: user.id, operationType: "plus_monthly_grant", amount: 400, currency: "IMPULSE", status: "completed", balanceBefore: before, balanceAfter: link.walletBalance, referenceId: entitlement.id, createdAt: startsAt, source: "local_sandbox" });
      }
      return { user: { id: user.id, username: user.username }, entitlement: structuredClone(entitlement), walletBalance: link.walletBalance };
    });
    this.log(`Sandbox Plus granted to ${result.user.username} by ${actor}`, "info");
    return result;
  }

  async revokePlus(userReference, { actor = "operator" } = {}) {
    this.requireEnabled();
    const result = await this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      const entitlement = state.billingEntitlements.find((item) => item.scopeType === "user" && item.scopeId === user.id && item.productCode === "nexora_plus" && item.source === "local_sandbox");
      if (!entitlement || entitlement.status !== "active") throw new PulseSandboxError("Тестовая подписка Plus не активна.", "PLUS_NOT_ACTIVE", 409);
      entitlement.status = "revoked";
      entitlement.revokedAt = nowIso(this.clock);
      entitlement.updatedAt = entitlement.revokedAt;
      return { user: { id: user.id, username: user.username }, entitlement: structuredClone(entitlement) };
    });
    this.log(`Sandbox Plus revoked from ${result.user.username} by ${actor}`, "info");
    return result;
  }

  async adjustImpulses(userReference, amount, { actor = "operator", reason = "operator_adjustment" } = {}) {
    this.requireEnabled();
    const delta = Math.trunc(Number(amount));
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) throw new PulseSandboxError("Количество Импульсов должно быть целым числом от -1000000 до 1000000, кроме нуля.", "VALIDATION_FAILED", 400);
    const result = await this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      const timestamp = nowIso(this.clock);
      const link = walletLink(state, user, timestamp);
      const before = Number(link.walletBalance) || 0;
      const after = before + delta;
      if (after < 0) throw new PulseSandboxError("Операция привела бы к отрицательному балансу.", "INSUFFICIENT_IMPULSES", 409);
      link.walletBalance = after;
      const transaction = { id: crypto.randomUUID(), userId: user.id, operationType: delta > 0 ? "operator_grant" : "operator_revoke", amount: delta, currency: "IMPULSE", status: "completed", balanceBefore: before, balanceAfter: after, referenceId: reason, createdAt: timestamp, source: "local_sandbox", actor };
      state.pulseLedger.push(transaction);
      return { user: { id: user.id, username: user.username }, transaction, walletBalance: after };
    });
    this.log(`Sandbox impulses adjusted for ${result.user.username}: ${delta} by ${actor}`, "info");
    return result;
  }
}

module.exports = { PulseSandboxError, PulseSandboxService, resolveUser };
