"use strict";

const { catalogItem } = require("../shared/pulse-catalog.cjs");

const ACTIVE_STATUSES = new Set(["active", "cancel_at_period_end", "grace"]);
const USER_DEFAULTS = Object.freeze({ avatarFrame: "none", profileColor: "violet", messageStyle: "default", stickerPack: "default" });
const ROOM_DEFAULTS = Object.freeze({ reactionPack: "default", theme: "default", bannerStyle: "default" });

function field(value, camel, snake, fallback = null) {
  return value?.[camel] ?? value?.[snake] ?? fallback;
}

function entitlementActive(entitlement, now = Date.now()) {
  const status = String(field(entitlement, "status", "status", "active"));
  if (!ACTIVE_STATUSES.has(status)) return false;
  const startsAt = field(entitlement, "startsAt", "starts_at");
  const expiresAt = field(entitlement, "expiresAt", "expires_at");
  if (startsAt && (!Number.isFinite(Date.parse(startsAt)) || Date.parse(startsAt) > now)) return false;
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now)) return false;
  return true;
}

function normalizedEntitlement(entitlement, fallback = {}) {
  const productCode = String(field(entitlement, "productCode", "product_code", fallback.productCode || ""));
  const product = catalogItem(productCode);
  if (!product) return null;
  const roomId = String(field(entitlement, "roomId", "room_id", fallback.roomId || "") || "") || null;
  const scopeType = String(field(entitlement, "scopeType", "scope_type", fallback.scopeType || product.scope));
  const scopeId = String(field(entitlement, "scopeId", "scope_id", fallback.scopeId || (product.scope === "room" ? roomId : fallback.userId || "")) || "") || null;
  if (scopeType !== product.scope || !scopeId) return null;
  return { ...entitlement, productCode, scopeType, scopeId, roomId, product };
}

function applyPulseEntitlementEffect(state, entitlement, fallback = {}, now = Date.now()) {
  const normalized = normalizedEntitlement(entitlement, fallback);
  if (!normalized || !entitlementActive(normalized, now)) return false;
  const target = normalized.scopeType === "user"
    ? state.users.find((item) => item.id === normalized.scopeId)
    : state.rooms.find((item) => item.id === normalized.scopeId);
  if (!target) return false;
  Object.assign(target, normalized.product.effect);
  return true;
}

function reconcilePulseEffects(state, now = Date.now()) {
  for (const user of state.users || []) Object.assign(user, USER_DEFAULTS, user);
  for (const room of state.rooms || []) Object.assign(room, ROOM_DEFAULTS, room);

  const active = (state.billingEntitlements || [])
    .map((item) => normalizedEntitlement(item))
    .filter((item) => item && entitlementActive(item, now))
    .sort((a, b) => Date.parse(field(a, "startsAt", "starts_at", 0)) - Date.parse(field(b, "startsAt", "starts_at", 0)));

  const desiredUsers = new Map();
  const desiredRooms = new Map();
  for (const entitlement of active) {
    const target = entitlement.scopeType === "user" ? desiredUsers : desiredRooms;
    const current = target.get(entitlement.scopeId) || {};
    Object.assign(current, entitlement.product.effect);
    target.set(entitlement.scopeId, current);
  }

  for (const user of state.users || []) {
    for (const [key, defaultValue] of Object.entries(USER_DEFAULTS)) {
      const desired = desiredUsers.get(user.id)?.[key];
      const catalogValues = new Set((state.billingEntitlements || []).map((item) => normalizedEntitlement(item)?.product?.effect?.[key]).filter(Boolean));
      if (desired !== undefined) user[key] = desired;
      else if (catalogValues.has(user[key])) user[key] = defaultValue;
      else if (user[key] == null) user[key] = defaultValue;
    }
  }
  for (const room of state.rooms || []) {
    for (const [key, defaultValue] of Object.entries(ROOM_DEFAULTS)) {
      const desired = desiredRooms.get(room.id)?.[key];
      const catalogValues = new Set((state.billingEntitlements || []).map((item) => normalizedEntitlement(item)?.product?.effect?.[key]).filter(Boolean));
      if (desired !== undefined) room[key] = desired;
      else if (catalogValues.has(room[key])) room[key] = defaultValue;
      else if (room[key] == null) room[key] = defaultValue;
    }
  }
  return { users: desiredUsers.size, rooms: desiredRooms.size, active: active.length };
}

module.exports = {
  ACTIVE_STATUSES,
  ROOM_DEFAULTS,
  USER_DEFAULTS,
  applyPulseEntitlementEffect,
  entitlementActive,
  normalizedEntitlement,
  reconcilePulseEffects,
};
