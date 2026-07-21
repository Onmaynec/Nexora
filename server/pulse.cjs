"use strict";

const crypto = require("node:crypto");

const PLUS_PRODUCT = "nexora_plus";
const MONTHLY_PLUS_IMPULSES = 400;
const MIN_CONTRIBUTION = 10;
const MAX_ACTIVE_GOALS = 3;
const ACTIVE_ENTITLEMENT_STATUSES = new Set(["active", "cancel_at_period_end", "grace"]);
const ROOM_CATALOG = Object.freeze([
  { code: "room_backup_20gb", title: "Резервные копии 20 ГБ", description: "Расширенное пространство для зашифрованных резервных копий комнаты.", target: 800, icon: "database", available: false, availabilityReason: "Нужен Cloud Backup adapter" },
  { code: "room_analytics", title: "Аналитика комнаты", description: "Динамика активности, удержание и отчёты без чтения содержимого сообщений.", target: 350, icon: "chart", available: false, availabilityReason: "Нужен Analytics adapter" },
  { code: "room_retention_plus", title: "Гибкое хранение", description: "Расширенные политики срока хранения медиа и документов.", target: 260, icon: "archive", available: false, availabilityReason: "Нужен Retention adapter" },
  { code: "room_invite_branding", title: "Фирменные приглашения", description: "Обложка, акцент и описание для страницы приглашения.", target: 180, icon: "sparkles", available: false, availabilityReason: "Нужен Branding adapter" },
  { code: "room_reaction_pack", title: "Пакет реакций", description: "Дополнительные реакции для всех участников комнаты.", target: 140, icon: "smile", available: true, availabilityReason: null },
]);

const PLUS_BENEFITS = Object.freeze([
  "400 импульсов каждый расчётный месяц",
  "Премиальные темы и цветовые акценты",
  "Анимированные рамки аватара",
  "Расширенные звуки и наборы реакций",
  "Увеличенный локальный офлайн-кэш",
  "Скрываемый значок Plus",
]);

class PulseError extends Error {
  constructor(message, code = "PULSE_ERROR", status = 400) {
    super(message);
    this.name = "PulseError";
    this.code = code;
    this.status = status;
  }
}

function activeEntitlement(state, scopeType, scopeId, productCode, now = Date.now()) {
  return state.billingEntitlements.find((item) =>
    item.scopeType === scopeType
    && item.scopeId === scopeId
    && item.productCode === productCode
    && ACTIVE_ENTITLEMENT_STATUSES.has(item.status)
    && (!item.startsAt || Date.parse(item.startsAt) <= now)
    && (!item.expiresAt || Date.parse(item.expiresAt) > now),
  ) ?? null;
}

function decodeSignedEnvelope(envelope, publicKey) {
  if (!envelope?.payload || !envelope?.signature || !publicKey) {
    throw new PulseError("Ответ биллинга не содержит проверяемой подписи.", "PULSE_SIGNATURE_REQUIRED", 502);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(String(envelope.payload)) || !/^[A-Za-z0-9_-]+$/.test(String(envelope.signature)) || String(envelope.payload).length > 1_000_000) {
    throw new PulseError("Формат подписанного ответа биллинга недействителен.", "PULSE_ENVELOPE_INVALID", 502);
  }
  const payload = Buffer.from(String(envelope.payload), "base64url");
  const signature = Buffer.from(String(envelope.signature), "base64url");
  let valid = false;
  try { valid = crypto.verify(null, payload, publicKey, signature); } catch {}
  if (!valid) throw new PulseError("Подпись ответа Nexora Billing недействительна.", "PULSE_SIGNATURE_INVALID", 502);
  let value;
  try { value = JSON.parse(payload.toString("utf8")); } catch { throw new PulseError("Ответ биллинга повреждён.", "PULSE_PAYLOAD_INVALID", 502); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PulseError("Ответ биллинга имеет неверную структуру.", "PULSE_PAYLOAD_INVALID", 502);
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiresAt)) throw new PulseError("Подписанный ответ биллинга не содержит корректный срок действия.", "PULSE_PAYLOAD_EXPIRY_REQUIRED", 502);
  if (expiresAt <= Date.now()) throw new PulseError("Подписанный ответ биллинга устарел.", "PULSE_PAYLOAD_EXPIRED", 502);
  return value;
}

function cleanCloudUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PulseError("Адрес Pulse Cloud имеет неверный формат.", "PULSE_CLOUD_URL_INVALID", 500);
  }
  if (parsed.protocol !== "https:") throw new PulseError("Pulse Cloud должен использовать HTTPS.", "PULSE_CLOUD_HTTPS_REQUIRED", 500);
  return parsed.toString().replace(/\/$/, "");
}

class PulseService {
  constructor({ store, serverId, mode, cloudUrl, apiKey, publicKey, log = () => {} }) {
    this.store = store;
    this.serverId = serverId;
    this.mode = ["disabled", "sandbox", "production"].includes(mode) ? mode : "disabled";
    this.cloudUrl = "";
    this.apiKey = String(apiKey || "");
    this.publicKey = String(publicKey || "");
    this.log = log;
    if (this.mode === "production") {
      try {
        this.cloudUrl = cleanCloudUrl(cloudUrl);
      } catch (error) {
        this.mode = "misconfigured";
        this.log(`Pulse production отключён: ${error.message}`, "warn");
      }
    }
    if (this.mode === "production" && (!this.cloudUrl || !this.apiKey || !this.publicKey)) {
      this.mode = "misconfigured";
      this.log("Pulse production отключён: нужны NEXORA_PULSE_CLOUD_URL, NEXORA_PULSE_API_KEY и NEXORA_PULSE_PUBLIC_KEY.", "warn");
    }
  }

  status() {
    return {
      mode: this.mode,
      enabled: ["sandbox", "production"].includes(this.mode),
      productionReady: this.mode === "production",
      billingAuthority: this.mode === "production" ? new URL(this.cloudUrl).origin : null,
      localActivationAllowed: this.mode === "sandbox",
    };
  }

  localOverview(userId, extra = {}) {
    const state = this.store.read();
    const link = state.billingLinks.find((item) => item.userId === userId && item.status !== "unlinked") ?? null;
    const plus = activeEntitlement(state, "user", userId, PLUS_PRODUCT);
    return {
      status: this.status(),
      plan: plus ? {
        code: PLUS_PRODUCT,
        name: "Nexora Plus",
        active: true,
        renewsAt: plus.expiresAt ?? null,
        badgeVisible: state.users.find((user) => user.id === userId)?.plusBadgeVisible !== false,
      } : { code: "free", name: "Nexora Free", active: true, renewsAt: null, badgeVisible: false },
      wallet: { currency: "IMPULSE", balance: Number(link?.walletBalance || 0), monthlyGrant: plus ? MONTHLY_PLUS_IMPULSES : 0 },
      benefits: PLUS_BENEFITS,
      roomCatalog: ROOM_CATALOG,
      cachedAt: link?.syncedAt ?? null,
      ...extra,
    };
  }

  async cloudRequest(path, { method = "GET", body, idempotencyKey } = {}) {
    if (this.mode !== "production") throw new PulseError("Pulse Cloud недоступен в этом режиме.", "PULSE_CLOUD_UNAVAILABLE", 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${this.cloudUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Nexora-Server-ID": this.serverId,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new PulseError(value.error || "Nexora Billing временно недоступен.", value.code || "PULSE_CLOUD_ERROR", response.status);
      return decodeSignedEnvelope(value, this.publicKey);
    } catch (error) {
      if (error instanceof PulseError) throw error;
      throw new PulseError("Не удалось связаться с Nexora Billing. Денежная операция не выполнена.", "PULSE_CLOUD_OFFLINE", 503);
    } finally {
      clearTimeout(timer);
    }
  }

  async syncCloudOverview(userId) {
    if (this.mode !== "production") return this.localOverview(userId);
    const value = await this.cloudRequest(`/v1/servers/${encodeURIComponent(this.serverId)}/users/${encodeURIComponent(userId)}/overview`);
    if (value.userId !== userId || value.serverId !== this.serverId) throw new PulseError("Billing вернул данные другого аккаунта.", "PULSE_SCOPE_MISMATCH", 502);
    await this.store.mutate((state) => {
      let link = state.billingLinks.find((item) => item.userId === userId);
      if (!link) {
        link = { id: crypto.randomUUID(), userId, cloudAccountId: value.cloudAccountId, status: "linked" };
        state.billingLinks.push(link);
      }
      Object.assign(link, { cloudAccountId: value.cloudAccountId, status: "linked", walletBalance: Number(value.wallet?.balance || 0), syncedAt: new Date().toISOString() });
      state.billingEntitlements = state.billingEntitlements.filter((item) => !(item.scopeType === "user" && item.scopeId === userId));
      for (const entitlement of value.entitlements || []) {
        if (String(entitlement.productCode) !== PLUS_PRODUCT) throw new PulseError("Billing вернул неизвестное персональное право.", "ENTITLEMENT_INVALID", 502);
        const expiresAt = entitlement.expiresAt == null ? null : Date.parse(entitlement.expiresAt);
        if (entitlement.expiresAt != null && !Number.isFinite(expiresAt)) throw new PulseError("Billing вернул право с неверным сроком.", "ENTITLEMENT_INVALID", 502);
        state.billingEntitlements.push({
          id: String(entitlement.id || crypto.randomUUID()), scopeType: "user", scopeId: userId,
          productCode: String(entitlement.productCode), status: String(entitlement.status || "active"),
          startsAt: entitlement.startsAt ?? null, expiresAt: entitlement.expiresAt ?? null,
          source: "pulse_cloud", signatureKeyId: value.keyId ?? null, syncedAt: new Date().toISOString(),
        });
      }
    });
    return this.localOverview(userId, { cached: false });
  }

  async activateSandboxPlus(userId) {
    if (this.mode !== "sandbox") throw new PulseError("Локальная активация разрешена только в Pulse Sandbox.", "PULSE_SANDBOX_ONLY", 403);
    await this.store.mutate((state) => {
      let link = state.billingLinks.find((item) => item.userId === userId);
      if (!link) {
        link = { id: crypto.randomUUID(), userId, cloudAccountId: `sandbox-${userId}`, status: "linked", walletBalance: 0 };
        state.billingLinks.push(link);
      }
      const plus = activeEntitlement(state, "user", userId, PLUS_PRODUCT);
      if (!plus) {
        state.billingEntitlements.push({
          id: crypto.randomUUID(), scopeType: "user", scopeId: userId, productCode: PLUS_PRODUCT,
          status: "active", startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), source: "sandbox",
        });
        link.walletBalance = Number(link.walletBalance || 0) + MONTHLY_PLUS_IMPULSES;
      }
      link.syncedAt = new Date().toISOString();
    });
    return this.localOverview(userId);
  }

  async createCheckout(userId) {
    if (this.mode !== "production") throw new PulseError("Покупки доступны только после подключения Nexora Billing.", "PULSE_CHECKOUT_UNAVAILABLE", 503);
    const value = await this.cloudRequest("/v1/checkout/sessions", { method: "POST", body: { serverId: this.serverId, userId, productCode: PLUS_PRODUCT } });
    if (!/^https:\/\//i.test(String(value.url || ""))) throw new PulseError("Billing не вернул безопасную ссылку оплаты.", "PULSE_CHECKOUT_INVALID", 502);
    return { url: value.url, expiresAt: value.expiresAt ?? null };
  }

  async contribute({ userId, goalId, amount, idempotencyKey }) {
    const normalizedAmount = Math.trunc(Number(amount));
    if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount < MIN_CONTRIBUTION || normalizedAmount > 100_000) throw new PulseError(`Укажите от ${MIN_CONTRIBUTION} до 100 000 импульсов.`, "GOAL_CONTRIBUTION_TOO_SMALL");
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(idempotencyKey || ""))) throw new PulseError("Нужен ключ идемпотентности.", "IDEMPOTENCY_KEY_REQUIRED");
    if (this.mode === "production") {
      const value = await this.cloudRequest(`/v1/goals/${encodeURIComponent(goalId)}/contributions`, { method: "POST", body: { serverId: this.serverId, userId, amount: normalizedAmount }, idempotencyKey });
      return this.store.mutate((state) => this.applyContribution(state, { userId, goalId, amount: normalizedAmount, idempotencyKey, cloud: value }));
    }
    if (this.mode !== "sandbox") throw new PulseError("Импульсы не настроены на этом сервере.", "PULSE_DISABLED", 503);
    return this.store.mutate((state) => this.applyContribution(state, { userId, goalId, amount: normalizedAmount, idempotencyKey }));
  }

  applyContribution(state, { userId, goalId, amount, idempotencyKey, cloud = null }) {
    const duplicate = state.pulseContributions.find((item) => item.idempotencyKey === idempotencyKey && item.userId === userId);
    if (duplicate) {
      const link = state.billingLinks.find((item) => item.userId === userId && item.status !== "unlinked");
      return {
        contribution: duplicate,
        goal: state.pulseGoals.find((item) => item.id === duplicate.goalId) ?? null,
        requestedPulse: Number(duplicate.requestedAmount || duplicate.amount),
        acceptedPulse: Number(duplicate.amount),
        refusedPulse: Number(duplicate.refusedAmount || 0),
        newBalance: Number(link?.walletBalance || 0),
        balance: Number(link?.walletBalance || 0),
        duplicate: true,
      };
    }
    const goal = state.pulseGoals.find((item) => item.id === goalId && item.status === "active");
    if (!goal) throw new PulseError("Цель комнаты не найдена или уже закрыта.", "PULSE_GOAL_NOT_FOUND", 404);
    if (goal.expiresAt && Date.parse(goal.expiresAt) <= Date.now()) {
      if (this.mode === "sandbox") this.refundSandboxGoal(state, goal, "expired");
      throw new PulseError("Срок цели истёк.", "GOAL_EXPIRED", 410);
    }
    const member = state.roomMembers.some((item) => item.roomId === goal.roomId && item.userId === userId);
    const banned = state.roomBans.some((item) => item.roomId === goal.roomId && item.userId === userId);
    if (!member || banned) throw new PulseError("Для взноса нужно состоять в комнате.", "ROOM_MEMBERSHIP_REQUIRED", 403);
    const remaining = Math.max(0, Number(goal.targetAmount || 0) - Number(goal.currentAmount || 0));
    if (!remaining) throw new PulseError("Цель уже собрана.", "GOAL_ALREADY_FUNDED", 409);
    let acceptedAmount = Math.min(amount, remaining);
    if (cloud) {
      if ((cloud.serverId && cloud.serverId !== this.serverId) || (cloud.userId && cloud.userId !== userId) || (cloud.goalId && cloud.goalId !== goalId)) {
        throw new PulseError("Billing вернул данные другой цели.", "PULSE_SCOPE_MISMATCH", 502);
      }
      const cloudAccepted = Number(cloud.acceptedPulse ?? acceptedAmount);
      if (!Number.isSafeInteger(cloudAccepted) || cloudAccepted < 1 || cloudAccepted > acceptedAmount) {
        throw new PulseError("Billing вернул недопустимую сумму взноса.", "PULSE_CLOUD_RESPONSE_INVALID", 502);
      }
      acceptedAmount = cloudAccepted;
    }
    const link = state.billingLinks.find((item) => item.userId === userId && item.status !== "unlinked");
    if (!cloud && Number(link?.walletBalance || 0) < acceptedAmount) throw new PulseError("Недостаточно импульсов.", "WALLET_INSUFFICIENT_FUNDS", 409);
    const contribution = {
      id: String(cloud?.contributionId || crypto.randomUUID()), goalId, userId, amount: acceptedAmount,
      requestedAmount: amount, refusedAmount: amount - acceptedAmount, idempotencyKey, status: "accepted",
      createdAt: cloud?.createdAt || new Date().toISOString(), source: this.mode,
    };
    state.pulseContributions.push(contribution);
    goal.currentAmount = Number(goal.currentAmount || 0) + acceptedAmount;
    if (goal.currentAmount >= goal.targetAmount) {
      goal.currentAmount = Number(goal.targetAmount);
      goal.status = cloud && !cloud.entitlement ? "activating" : "funded";
      goal.fundedAt = new Date().toISOString();
      if (cloud?.entitlement) {
        const entitlement = cloud.entitlement;
        const expiresAt = Date.parse(entitlement.expiresAt);
        if (entitlement.roomId !== goal.roomId || entitlement.productCode !== goal.productCode || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
          throw new PulseError("Billing вернул недействительное право комнаты.", "ENTITLEMENT_INVALID", 502);
        }
        state.billingEntitlements.push({
          id: String(entitlement.id || entitlement.jti || crypto.randomUUID()), scopeType: "room", scopeId: goal.roomId,
          productCode: goal.productCode, status: String(entitlement.status || "active"),
          startsAt: entitlement.startsAt || entitlement.notBefore || new Date().toISOString(), expiresAt: entitlement.expiresAt,
          source: "pulse_cloud", signatureKeyId: cloud.keyId ?? entitlement.keyId ?? null, syncedAt: new Date().toISOString(),
        });
        goal.status = "funded";
      } else if (!cloud) {
        state.billingEntitlements.push({
          id: crypto.randomUUID(), scopeType: "room", scopeId: goal.roomId, productCode: goal.productCode,
          status: "active", startsAt: new Date().toISOString(),
          expiresAt: goal.entitlementExpiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          source: "sandbox",
        });
      }
    }
    if (link) {
      link.walletBalance = cloud ? Number(cloud.newBalance ?? cloud.balance ?? link.walletBalance) : Number(link.walletBalance || 0) - acceptedAmount;
      link.syncedAt = new Date().toISOString();
    }
    const newBalance = Number(link?.walletBalance || 0);
    return {
      contribution, goal, requestedPulse: amount, acceptedPulse: acceptedAmount,
      refusedPulse: amount - acceptedAmount, newBalance, balance: newBalance, duplicate: false,
    };
  }

  refundSandboxGoal(state, goal, reason) {
    let refundedAmount = 0;
    const refundedAt = new Date().toISOString();
    for (const contribution of state.pulseContributions.filter((item) => item.goalId === goal.id && !item.refundedAt)) {
      const link = state.billingLinks.find((item) => item.userId === contribution.userId && item.status !== "unlinked");
      if (link) link.walletBalance = Number(link.walletBalance || 0) + Number(contribution.amount || 0);
      contribution.status = "refunded";
      contribution.refundedAt = refundedAt;
      contribution.refundReason = reason;
      refundedAmount += Number(contribution.amount || 0);
    }
    goal.status = reason === "expired" ? "expired" : "cancelled";
    goal.closedAt = refundedAt;
    goal.refundedAmount = Number(goal.refundedAmount || 0) + refundedAmount;
    return refundedAmount;
  }

  async reconcileExpiredGoals(roomId = null) {
    if (this.mode !== "sandbox") return { expired: 0, refunded: 0 };
    return this.store.mutate((state) => {
      let expired = 0;
      let refunded = 0;
      for (const goal of state.pulseGoals) {
        if (roomId && goal.roomId !== roomId) continue;
        const due = goal.expiresAt && Date.parse(goal.expiresAt) <= Date.now();
        const needsRefund = goal.status === "expired" && state.pulseContributions.some((item) => item.goalId === goal.id && !item.refundedAt);
        if ((goal.status === "active" && due) || needsRefund) {
          refunded += this.refundSandboxGoal(state, goal, "expired");
          expired += 1;
        }
      }
      return { expired, refunded };
    });
  }

  async cancelGoal({ userId, goalId, idempotencyKey }) {
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(idempotencyKey || ""))) throw new PulseError("Нужен ключ идемпотентности.", "IDEMPOTENCY_KEY_REQUIRED");
    if (this.mode === "production") {
      const value = await this.cloudRequest(`/v1/goals/${encodeURIComponent(goalId)}/cancel`, { method: "POST", body: { serverId: this.serverId, userId }, idempotencyKey });
      return this.store.mutate((state) => {
        const goal = state.pulseGoals.find((item) => item.id === goalId);
        if (!goal) throw new PulseError("Цель не найдена.", "PULSE_GOAL_NOT_FOUND", 404);
        goal.status = String(value.status || "cancelled");
        goal.closedAt = value.closedAt || new Date().toISOString();
        return { goal, refundedPulse: Number(value.refundedPulse || 0), duplicate: Boolean(value.duplicate) };
      });
    }
    if (this.mode !== "sandbox") throw new PulseError("Импульсы не настроены на этом сервере.", "PULSE_DISABLED", 503);
    return this.store.mutate((state) => {
      const goal = state.pulseGoals.find((item) => item.id === goalId);
      if (!goal) throw new PulseError("Цель не найдена.", "PULSE_GOAL_NOT_FOUND", 404);
      if (goal.cancelIdempotencyKey === idempotencyKey) return { goal, refundedPulse: Number(goal.refundedAmount || 0), duplicate: true };
      const room = state.rooms.find((item) => item.id === goal.roomId);
      if (!room || room.ownerId !== userId) throw new PulseError("Только владелец комнаты может отменить цель.", "ROOM_OWNER_REQUIRED", 403);
      if (goal.status !== "active") throw new PulseError("Активную цель уже нельзя отменить.", "GOAL_CANCEL_CONFLICT", 409);
      goal.cancelIdempotencyKey = idempotencyKey;
      return { goal, refundedPulse: this.refundSandboxGoal(state, goal, "cancelled"), duplicate: false };
    });
  }
}

function createPulseService(options) {
  return new PulseService(options);
}

module.exports = {
  MONTHLY_PLUS_IMPULSES,
  MIN_CONTRIBUTION,
  MAX_ACTIVE_GOALS,
  PLUS_BENEFITS,
  PLUS_PRODUCT,
  ROOM_CATALOG,
  PulseError,
  activeEntitlement,
  createPulseService,
  decodeSignedEnvelope,
};
