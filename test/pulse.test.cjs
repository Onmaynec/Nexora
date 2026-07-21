"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const request = require("supertest");
const { createNexoraServer } = require("../server/create-server.cjs");
const { createPulseService, decodeSignedEnvelope } = require("../server/pulse.cjs");

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args).set("X-Nexora-Client-Version", "2.0.0");
        return ["post", "put", "patch", "delete"].includes(property) && csrf() ? builder.set("X-Nexora-CSRF", csrf()) : builder;
      };
    },
  });
}

test("Pulse Sandbox выдаёт Plus, хранит целочисленный баланс и не дублирует вклад", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-pulse-"));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pulseMode: "sandbox",
  });
  await instance.listen();
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  try {
    assert.equal(instance.status().pulse.mode, "sandbox");
    const registration = await agent.post("/api/auth/register").send({ displayName: "Pulse Owner", username: "pulse-owner", password: "StrongPass123!" }).expect(201);
    csrf = registration.body.csrfToken;

    const before = await agent.get("/api/pulse/overview").expect(200);
    assert.equal(before.body.plan.code, "free");
    assert.equal(before.body.wallet.balance, 0);
    assert.equal(before.body.status.mode, "sandbox");

    const activated = await agent.post("/api/pulse/sandbox/activate-plus").send({}).expect(201);
    assert.equal(activated.body.plan.code, "nexora_plus");
    assert.equal(activated.body.wallet.balance, 400);

    const styled = await agent.patch("/api/users/me").send({ profileColor: "ocean", avatarFrame: "orbit", bio: "Pulse profile" }).expect(200);
    assert.equal(styled.body.user.profileColor, "ocean");
    assert.equal(styled.body.user.avatarFrame, "orbit");

    const room = await agent.post("/api/rooms").send({ name: "Pulse Lab", privacy: "public" }).expect(201);
    const goal = await agent.post(`/api/pulse/rooms/${room.body.room.id}/goals`).send({ productCode: "room_reaction_pack" }).expect(201);
    const key = "pulse-test-contribution-0001";
    const first = await agent.post(`/api/pulse/goals/${goal.body.goal.id}/contributions`).set("Idempotency-Key", key).send({ amount: 100 }).expect(201);
    assert.equal(first.body.balance, 300);
    const duplicate = await agent.post(`/api/pulse/goals/${goal.body.goal.id}/contributions`).set("Idempotency-Key", key).send({ amount: 100 }).expect(200);
    assert.equal(duplicate.body.duplicate, true);

    const finalKey = "pulse-test-contribution-0002";
    const final = await agent.post(`/api/pulse/goals/${goal.body.goal.id}/contributions`).set("Idempotency-Key", finalKey).send({ amount: 100 }).expect(201);
    assert.equal(final.body.requestedPulse, 100);
    assert.equal(final.body.acceptedPulse, 40);
    assert.equal(final.body.refusedPulse, 60);
    assert.equal(final.body.balance, 260);
    assert.equal(final.body.goal.currentAmount, final.body.goal.targetAmount);
    assert.equal(final.body.goal.status, "funded");

    const goals = await agent.get(`/api/pulse/rooms/${room.body.room.id}/goals`).expect(200);
    assert.equal(goals.body.goals[0].currentAmount, 140);
    assert.equal(goals.body.goals[0].contributionCount, 2);
    const overview = await agent.get("/api/pulse/overview").expect(200);
    assert.equal(overview.body.wallet.balance, 260);

    const unavailable = await agent.post(`/api/pulse/rooms/${room.body.room.id}/goals`).send({ productCode: "room_analytics" }).expect(409);
    assert.equal(unavailable.body.code, "GOAL_CAPABILITY_UNAVAILABLE");

    const cancelRoom = await agent.post("/api/rooms").send({ name: "Pulse Cancel", privacy: "private" }).expect(201);
    const cancelGoal = await agent.post(`/api/pulse/rooms/${cancelRoom.body.room.id}/goals`).send({ productCode: "room_reaction_pack" }).expect(201);
    const contributionKey = "pulse-test-contribution-0003";
    await agent.post(`/api/pulse/goals/${cancelGoal.body.goal.id}/contributions`).set("Idempotency-Key", contributionKey).send({ amount: 10 }).expect(201);
    const cancelled = await agent.post(`/api/pulse/goals/${cancelGoal.body.goal.id}/cancel`).set("Idempotency-Key", "pulse-test-cancel-goal-0002").send({}).expect(201);
    assert.equal(cancelled.body.refundedPulse, 10);
    assert.equal(cancelled.body.goal.status, "cancelled");
    const afterRefund = await agent.get("/api/pulse/overview").expect(200);
    assert.equal(afterRefund.body.wallet.balance, 260);

    const expiryRoom = await agent.post("/api/rooms").send({ name: "Pulse Expiry", privacy: "private" }).expect(201);
    const expiryGoal = await agent.post(`/api/pulse/rooms/${expiryRoom.body.room.id}/goals`).send({ productCode: "room_reaction_pack" }).expect(201);
    await agent.post(`/api/pulse/goals/${expiryGoal.body.goal.id}/contributions`).set("Idempotency-Key", "pulse-test-contribution-0004").send({ amount: 10 }).expect(201);
    await instance.store.mutate((state) => {
      const expiring = state.pulseGoals.find((item) => item.id === expiryGoal.body.goal.id);
      expiring.expiresAt = new Date(Date.now() - 1_000).toISOString();
    });
    const afterExpiry = await agent.get(`/api/pulse/rooms/${expiryRoom.body.room.id}/goals`).expect(200);
    assert.equal(afterExpiry.body.goals.find((item) => item.id === expiryGoal.body.goal.id).status, "expired");
    const afterExpiryRefund = await agent.get("/api/pulse/overview").expect(200);
    assert.equal(afterExpiryRefund.body.wallet.balance, 260);
  } finally {
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Pulse production принимает только корректно подписанный envelope", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const payload = Buffer.from(JSON.stringify({ serverId: "server-1", userId: "user-1", expiresAt: new Date(Date.now() + 60_000).toISOString() }));
  const envelope = {
    payload: payload.toString("base64url"),
    signature: crypto.sign(null, payload, privateKey).toString("base64url"),
  };
  assert.equal(decodeSignedEnvelope(envelope, publicKey).userId, "user-1");
  const tampered = { ...envelope, payload: Buffer.from(payload.toString().replace("user-1", "user-2")).toString("base64url") };
  assert.throws(() => decodeSignedEnvelope(tampered, publicKey), /подпись/i);
  const withoutExpiryPayload = Buffer.from(JSON.stringify({ serverId: "server-1", userId: "user-1" }));
  const withoutExpiry = { payload: withoutExpiryPayload.toString("base64url"), signature: crypto.sign(null, withoutExpiryPayload, privateKey).toString("base64url") };
  assert.throws(() => decodeSignedEnvelope(withoutExpiry, publicKey), (error) => error.code === "PULSE_PAYLOAD_EXPIRY_REQUIRED");
});

test("production не выпускает room entitlement локально", () => {
  const pulse = createPulseService({
    store: {}, serverId: "server-1", mode: "production", cloudUrl: "https://billing.example",
    apiKey: "scoped-key", publicKey: "public-key",
  });
  const state = {
    pulseContributions: [],
    pulseGoals: [{ id: "goal-1", roomId: "room-1", productCode: "room_reaction_pack", targetAmount: 140, currentAmount: 100, status: "active" }],
    roomMembers: [{ roomId: "room-1", userId: "user-1", role: "member" }], roomBans: [],
    billingLinks: [{ id: "link-1", userId: "user-1", status: "linked", walletBalance: 300 }], billingEntitlements: [],
  };
  const result = pulse.applyContribution(state, {
    userId: "user-1", goalId: "goal-1", amount: 100, idempotencyKey: "production-test-0001",
    cloud: { serverId: "server-1", userId: "user-1", goalId: "goal-1", acceptedPulse: 40, newBalance: 260 },
  });
  assert.equal(result.goal.status, "activating");
  assert.equal(state.billingEntitlements.length, 0);
});

test("ошибка Pulse production изолируется и не мешает запуску мессенджера", () => {
  const options = { store: {}, serverId: "server-1", mode: "production", apiKey: "key", publicKey: "public" };
  assert.equal(createPulseService({ ...options, cloudUrl: "not a url" }).status().mode, "misconfigured");
  assert.equal(createPulseService({ ...options, cloudUrl: "http://billing.example" }).status().mode, "misconfigured");
});
