"use strict";

const crypto = require("node:crypto");

class PulseSandboxError extends Error {
  constructor(message, code = "PULSE_SANDBOX_ERROR", status = 400) {
    super(message);
    this.name = "PulseSandboxError";
    this.code = code;
    this.status = status;
  }
}

function nowIso(clock) {
  return clock().toISOString();
}

function resolveUser(state, reference) {
  const value = String(reference || "").trim().replace(/^@/, "").toLowerCase();
  const user = state.users.find((item) => item.id.toLowerCase() === value || item.username.toLowerCase() === value);
  if (!user) throw new PulseSandboxError("Пользователь не найден.", "USER_NOT_FOUND", 404);
  return user;
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
    if (!this.enabled()) {
      throw new PulseSandboxError("Тестовая модель Pulse отключена на Nexora Server.", "PULSE_SANDBOX_DISABLED", 503);
    }
  }

  async setEnabled(enabled, actor = "operator") {
    if (this.productionMode && enabled) {
      throw new PulseSandboxError("Sandbox нельзя включить при активном production Pulse Cloud.", "PULSE_SANDBOX_PRODUCTION_CONFLICT", 409);
    }
    await this.store.mutate((state) => {
      state.settings.pulseSandboxEnabled = Boolean(enabled);
      state.integrationAudit ||= [];
      state.integrationAudit.push({
        id: crypto.randomUUID(),
        type: "pulse.sandbox.toggled",
        actor,
        enabled: Boolean(enabled),
        createdAt: nowIso(this.clock),
      });
    });
    this.log(`Pulse sandbox ${enabled ? "enabled" : "disabled"} by ${actor}`, "info");
    return { enabled: this.enabled() };
  }

  overview(userReference) {
    this.requireEnabled();
    return this.store.read((state) => {
      const user = resolveUser(state, userReference);
      const current = this.clock().getTime();
      const plus = state.billingEntitlements.find((item) =>
        item.scopeType === "user"
        && item.scopeId === user.id
        && item.productCode === "nexora_plus"
        && item.status === "active"
        && Date.parse(item.expiresAt) > current,
      );
      const balance = state.billingLinks.find((item) => item.localUserId === user.id)?.walletBalance || 0;
      return {
        sandbox: true,
        account: { id: `sandbox:${user.id}`, localUserId: user.id, status: "linked", testMode: true },
        wallet: { balance, currency: "IMPULSE" },
        subscription: plus ? {
          id: plus.id,
          productCode: "nexora_plus",
          status: "active",
          currentPeriodStart: plus.startsAt,
          currentPeriodEnd: plus.expiresAt,
          cancelAtPeriodEnd: false,
          sandbox: true,
        } : null,
        entitlements: plus ? [{ ...plus, sandbox: true }] : [],
      };
    });
  }

  transactions(userReference, limit = 100) {
    this.requireEnabled();
    return this.store.read((state) => {
      const user = resolveUser(state, userReference);
      return state.pulseLedger
        .filter((item) => item.userId === user.id)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, Math.max(1, Math.min(200, Number(limit) || 100)));
    });
  }

  async grantPlus(userReference, { days = 30, actor = "operator" } = {}) {
    this.requireEnabled();
    const durationDays = Math.max(1, Math.min(366, Math.trunc(Number(days) || 30)));
    const result = await this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      const timestamp = this.clock();
      const startsAt = timestamp.toISOString();
      const expiresAt = new Date(timestamp.getTime() + durationDays * 24 * 60 * 60_000).toISOString();
      let entitlement = state.billingEntitlements.find((item) => item.scopeType === "user" && item.scopeId === user.id && item.productCode === "nexora_plus" && item.source === "local_sandbox");
      const newlyActive = !entitlement || entitlement.status !== "active" || Date.parse(entitlement.expiresAt) <= timestamp.getTime();
      if (!entitlement) {
        entitlement = { id: crypto.randomUUID(), scopeType: "user", scopeId: user.id, productCode: "nexora_plus", source: "local_sandbox" };
        state.billingEntitlements.push(entitlement);
      }
      Object.assign(entitlement, { status: "active", startsAt, expiresAt, issuedBy: actor, revokedAt: null, updatedAt: startsAt });
      let link = state.billingLinks.find((item) => item.localUserId === user.id);
      if (!link) {
        link = { id: crypto.randomUUID(), localUserId: user.id, cloudAccountId: `sandbox:${user.id}`, linkedAt: startsAt, walletBalance: 0, status: "linked", source: "local_sandbox" };
        state.billingLinks.push(link);
      }
      link.status = "linked";
      link.source = "local_sandbox";
      if (newlyActive) {
        const before = Number(link.walletBalance) || 0;
        link.walletBalance = before + 400;
        state.pulseLedger.push({
          id: crypto.randomUUID(), userId: user.id, operationType: "plus_monthly_grant", amount: 400,
          currency: "IMPULSE", status: "completed", balanceBefore: before, balanceAfter: link.walletBalance,
          referenceId: entitlement.id, createdAt: startsAt, source: "local_sandbox",
        });
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
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
      throw new PulseSandboxError("Количество Импульсов должно быть целым числом от -1000000 до 1000000, кроме нуля.", "VALIDATION_FAILED", 400);
    }
    const result = await this.store.mutate((state) => {
      const user = resolveUser(state, userReference);
      const timestamp = nowIso(this.clock);
      let link = state.billingLinks.find((item) => item.localUserId === user.id);
      if (!link) {
        link = { id: crypto.randomUUID(), localUserId: user.id, cloudAccountId: `sandbox:${user.id}`, linkedAt: timestamp, walletBalance: 0, status: "linked", source: "local_sandbox" };
        state.billingLinks.push(link);
      }
      const before = Number(link.walletBalance) || 0;
      const after = before + delta;
      if (after < 0) throw new PulseSandboxError("Операция привела бы к отрицательному балансу.", "INSUFFICIENT_IMPULSES", 409);
      link.walletBalance = after;
      const transaction = {
        id: crypto.randomUUID(), userId: user.id,
        operationType: delta > 0 ? "operator_grant" : "operator_revoke",
        amount: delta, currency: "IMPULSE", status: "completed",
        balanceBefore: before, balanceAfter: after, referenceId: reason,
        createdAt: timestamp, source: "local_sandbox", actor,
      };
      state.pulseLedger.push(transaction);
      return { user: { id: user.id, username: user.username }, transaction, walletBalance: after };
    });
    this.log(`Sandbox impulses adjusted for ${result.user.username}: ${delta} by ${actor}`, "info");
    return result;
  }
}

module.exports = { PulseSandboxError, PulseSandboxService, resolveUser };
