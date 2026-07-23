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
