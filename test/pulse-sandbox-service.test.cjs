"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PulseSandboxService } = require("../server/pulse-sandbox-service.cjs");

function fixture() {
  const state = {
    settings: { pulseSandboxEnabled: false },
    users: [
      { id: "u1", username: "netrox", displayName: "Netrox" },
      { id: "u2", username: "member", displayName: "Member" },
      { id: "u3", username: "moderator", displayName: "Moderator" },
    ],
    rooms: [{ id: "room-1", name: "Private Club", ownerId: "u1" }],
    roomMembers: [
      { roomId: "room-1", userId: "u1", role: "owner" },
      { roomId: "room-1", userId: "u2", role: "member" },
      { roomId: "room-1", userId: "u3", role: "moderator" },
    ],
    roomBans: [],
    billingEntitlements: [],
    billingLinks: [],
    pulseLedger: [],
    pulseGoals: [],
    pulseContributions: [],
    integrationAudit: [],
  };
  const store = {
    read: (callback) => callback ? callback(state) : structuredClone(state),
    mutate: async (callback) => callback(state),
  };
  return { state, service: new PulseSandboxService({ store, clock: () => new Date("2026-07-21T20:00:00.000Z") }) };
}

test("sandbox must be explicitly enabled and cannot forge production state", async () => {
  const { service } = fixture();
  assert.throws(() => service.overview("netrox"), (error) => error.code === "PULSE_SANDBOX_DISABLED");
  await service.setEnabled(true, "test");
  assert.equal(service.overview("netrox").sandbox, true);
});

test("granting sandbox Plus grants 400 impulses once and enables entitlement", async () => {
  const { state, service } = fixture();
  await service.setEnabled(true, "test");
  await service.grantPlus("@netrox", { days: 30, actor: "test" });
  await service.grantPlus("u1", { days: 60, actor: "test" });
  const overview = service.overview("u1");
  assert.equal(overview.subscription.status, "active");
  assert.equal(overview.wallet.balance, 400);
  assert.equal(state.pulseLedger.filter((item) => item.operationType === "plus_monthly_grant").length, 1);
});

test("impulse adjustments are audited by immutable ledger and never go negative", async () => {
  const { service } = fixture();
  await service.setEnabled(true, "test");
  await service.adjustImpulses("netrox", 250, { actor: "test", reason: "qa" });
  await service.adjustImpulses("netrox", -50, { actor: "test", reason: "qa" });
  assert.equal(service.overview("netrox").wallet.balance, 200);
  await assert.rejects(service.adjustImpulses("netrox", -201, { actor: "test" }), (error) => error.code === "INSUFFICIENT_IMPULSES");
  assert.equal(service.transactions("netrox").length, 2);
});

test("catalog purchase atomically debits wallet, applies effect and is idempotent", async () => {
  const { state, service } = fixture();
  await service.setEnabled(true, "test");
  await service.adjustImpulses("netrox", 500, { actor: "test" });
  const key = "catalog:test:avatar:0001";
  const first = await service.purchase("netrox", "avatar_frame_neon", { idempotencyKey: key, actor: "u1" });
  const duplicate = await service.purchase("netrox", "avatar_frame_neon", { idempotencyKey: key, actor: "u1" });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(service.overview("netrox").wallet.balance, 380);
  assert.equal(state.users[0].avatarFrame, "neon");
  assert.equal(state.billingEntitlements.filter((item) => item.productCode === "avatar_frame_neon").length, 1);
  assert.equal(state.pulseLedger.filter((item) => item.operationType === "impulse_product_purchase").length, 1);
});

test("room catalog purchase is owner-only", async () => {
  const { service } = fixture();
  await service.setEnabled(true, "test");
  await service.adjustImpulses("netrox", 1000, { actor: "test" });
  const result = await service.purchase("netrox", "room_theme_midnight", { roomId: "room-1", idempotencyKey: "catalog:test:room:0001", actor: "u1" });
  assert.equal(result.entitlement.scopeType, "room");
  await service.adjustImpulses("member", 1000, { actor: "test" });
  await assert.rejects(
    service.purchase("member", "room_theme_midnight", { roomId: "room-1", idempotencyKey: "catalog:test:room:0002", actor: "u2" }),
    (error) => error.code === "PERMISSION_DENIED",
  );
});

test("Sandbox room goals spend impulses, issue entitlement and refund active goals", async () => {
  const { service } = fixture();
  await service.setEnabled(true, "test");
  await service.adjustImpulses("netrox", 1000, { actor: "test" });
  await service.adjustImpulses("member", 300, { actor: "test" });
  const created = await service.createGoal("netrox", "room-1", {
    productCode: "room_reaction_pack",
    title: "Реакции",
    description: "Общая цель",
    targetAmount: 400,
    expiresAt: "2026-08-20T20:00:00.000Z",
    idempotencyKey: "goal:create:test:0001",
  });
  await service.contribute("member", "room-1", created.goal.id, 100, "goal:contribute:u2:0001");
  const funded = await service.contribute("netrox", "room-1", created.goal.id, 300, "goal:contribute:u1:0001");
  assert.equal(funded.goal.status, "funded");
  assert.equal(funded.entitlement.productCode, "room_reaction_pack");
  assert.equal(service.overview("netrox").wallet.balance, 700);
  assert.equal(service.overview("member").wallet.balance, 200);

  const second = await service.createGoal("netrox", "room-1", {
    productCode: "room_banner_aurora",
    title: "Баннер",
    description: "Динамический баннер комнаты",
    targetAmount: 500,
    expiresAt: "2026-08-20T20:00:00.000Z",
    idempotencyKey: "goal:create:test:0002",
  });
  await service.contribute("member", "room-1", second.goal.id, 50, "goal:contribute:u2:0002");
  const cancelled = await service.cancelGoal("netrox", "room-1", second.goal.id, "goal:cancel:test:0002");
  assert.equal(cancelled.refundedPulse, 50);
  assert.equal(service.overview("member").wallet.balance, 200);
  assert.equal(service.receipts("netrox").length, 0);
});

test("moderator can create one validated goal but cannot cancel owner's goal", async () => {
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

test("production mode refuses local sandbox activation", async () => {
  const { service } = fixture();
  service.productionMode = true;
  await assert.rejects(service.setEnabled(true, "test"), (error) => error.code === "PULSE_SANDBOX_PRODUCTION_CONFLICT");
});
