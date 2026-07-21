"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { PulseSandboxService } = require("../server/pulse-sandbox-service.cjs");

function fixture() {
  const state = {
    settings: { pulseSandboxEnabled: false },
    users: [{ id: "u1", username: "netrox" }],
    billingEntitlements: [],
    billingLinks: [],
    pulseLedger: [],
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

test("production mode refuses local sandbox activation", async () => {
  const { service } = fixture();
  service.productionMode = true;
  await assert.rejects(service.setEnabled(true, "test"), (error) => error.code === "PULSE_SANDBOX_PRODUCTION_CONFLICT");
});
