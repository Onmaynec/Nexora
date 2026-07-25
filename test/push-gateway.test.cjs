"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const { appendEvent } = require("../server/events.cjs");
const { encryptSecret, parseTokenKey } = require("../server/mobile-continuity.cjs");
const { buildPushDelivery, createMobilePushService, decryptSecret } = require("../server/mobile-push-service.cjs");
const { createPushGatewayTransport, isPrivateAddress, signGatewayRequest, validateGatewayConfig } = require("../server/push-gateway.cjs");

test("push gateway rejects non-HTTPS, private, translated and reserved targets", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.51.100.1",
    "203.0.113.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:0a00:0001::1",
    "64:ff9b::7f00:1",
  ]) assert.equal(isPrivateAddress(address), true, `${address} must be rejected`);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
  assert.throws(() => validateGatewayConfig({ url: "http://push.example.test/v1/deliver", secret: "s".repeat(32) }), /HTTPS/i);
  assert.throws(() => validateGatewayConfig({ url: "https://127.0.0.1/v1/deliver", secret: "s".repeat(32) }), /public address/i);
  assert.throws(() => validateGatewayConfig({ url: "https://push.example.test/v1/deliver", secret: "short" }), /32/);
});

test("push gateway rejects DNS answers when any target is private or reserved", async () => {
  const transport = createPushGatewayTransport({
    url: "https://push.example.test/v1/deliver",
    secret: "gateway-shared-secret-that-is-long-enough",
    lookup: async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
    requestFactory() { throw new Error("request must not start"); },
  });
  await assert.rejects(
    transport.send({ provider: "fcm", token: "provider-token-that-is-long-enough", installationId: "installation-12345678" }),
    (error) => error.code === "PUSH_GATEWAY_PRIVATE_TARGET" && error.permanent === true,
  );
});

test("push gateway pins DNS, signs the exact body and accepts a bounded response", async () => {
  let captured = null;
  const requestFactory = (options, callback) => {
    const request = new EventEmitter();
    request.end = (body) => {
      captured = { options, body };
      const response = new EventEmitter();
      response.statusCode = 202;
      callback(response);
      queueMicrotask(() => {
        response.emit("data", Buffer.from(JSON.stringify({ messageId: "provider-message-1" })));
        response.emit("end");
      });
    };
    request.destroy = (error) => queueMicrotask(() => request.emit("error", error));
    return request;
  };
  const secret = "gateway-shared-secret-that-is-long-enough";
  const transport = createPushGatewayTransport({
    url: "https://push.example.test/v1/deliver?tenant=nexora",
    secret,
    clock: () => 1_721_824_000_000,
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    requestFactory,
  });
  const result = await transport.send({
    deliveryId: "delivery-12345678",
    serverId: "server-12345678",
    provider: "fcm",
    token: "provider-token-that-is-long-enough",
    installationId: "installation-12345678",
    notification: { title: "Nexora", body: "Новое сообщение" },
    data: { conversationId: "conversation-12345678", messageId: "message-12345678" },
  });

  assert.equal(result.providerMessageId, "provider-message-1");
  assert.equal(captured.options.hostname, "push.example.test");
  assert.equal(captured.options.path, "/v1/deliver?tenant=nexora");
  assert.equal(captured.options.rejectUnauthorized, true);
  await new Promise((resolve, reject) => captured.options.lookup("push.example.test", {}, (error, address, family) => {
    if (error) return reject(error);
    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
    resolve();
  }));
  assert.equal(captured.options.headers["X-Nexora-Timestamp"], "1721824000000");
  assert.equal(
    captured.options.headers["X-Nexora-Signature"],
    `sha256=${signGatewayRequest(secret, "1721824000000", captured.body)}`,
  );
});

function createMemoryStore(state, subscriptions, eventEmitter) {
  const db = {
    prepare(sql) {
      if (sql.includes("SELECT * FROM mobile_push_subscriptions")) {
        return {
          all(userId, serverId) {
            return subscriptions.filter((row) => row.user_id === userId && row.server_id === serverId && !row.revoked_at);
          },
        };
      }
      if (sql.includes("UPDATE mobile_push_subscriptions")) {
        return {
          run(...values) {
            const subscriptionId = values.at(-1);
            const row = subscriptions.find((item) => item.id === subscriptionId);
            if (row) row.last_error_code = values.at(-2);
            return { changes: row ? 1 : 0 };
          },
        };
      }
      throw new Error(`Unexpected SQL in push test: ${sql}`);
    },
  };
  return {
    db,
    read(selector) { return typeof selector === "function" ? selector(state) : state; },
    async mutate(callback) {
      const result = callback(state);
      eventEmitter.emit("stats", {});
      return result;
    },
  };
}

function pushFixture(now = new Date("2026-07-25T12:00:00.000Z")) {
  const state = {
    meta: { lastEventSequence: 0 },
    settings: { eventRetentionLimit: 1_000 },
    events: [],
    users: [
      { id: "sender-12345678", displayName: "Sender", notificationMode: "all", disabledAt: null },
      { id: "recipient-12345678", displayName: "Recipient", notificationMode: "all", quietHoursStart: "", quietHoursEnd: "", disabledAt: null },
    ],
    conversationSettings: [],
    conversations: [{ id: "conversation-12345678", type: "dm", roomId: null, userIds: ["sender-12345678", "recipient-12345678"] }],
    roomMembers: [],
    roomBans: [],
    messages: [],
  };
  const message = {
    id: "message-12345678",
    conversationId: "conversation-12345678",
    senderId: "sender-12345678",
    type: "text",
    text: "private message text must not be in the default preview",
    mentions: [],
    replyToId: null,
    silent: false,
    pendingApproval: false,
    createdAt: now.toISOString(),
    deletedAt: null,
  };
  state.messages.push(message);
  const event = appendEvent(state, {
    type: "message.created",
    actorId: message.senderId,
    conversationId: message.conversationId,
    payload: { messageId: message.id, type: "text", silent: false },
    createdAt: now.toISOString(),
  });
  const keySource = "mobile-push-roundtrip-key-that-is-long-enough";
  const key = parseTokenKey(keySource);
  const providerToken = "provider-token-that-must-only-reach-the-gateway";
  const subscriptions = [{
    id: "subscription-12345678",
    user_id: "recipient-12345678",
    device_id: "device-12345678",
    server_id: "server-12345678",
    installation_id: "installation-12345678",
    provider: "fcm",
    token_ciphertext: encryptSecret(providerToken, key),
    preview_policy: "generic",
    revoked_at: null,
  }];
  return { state, message, event, keySource, key, providerToken, subscriptions };
}

test("mobile push dispatch is policy-aware, durable and generic by default", async () => {
  const now = new Date("2026-07-25T12:00:00.000Z");
  const { state, message, event, keySource, key, providerToken, subscriptions } = pushFixture(now);
  assert.equal(decryptSecret(subscriptions[0].token_ciphertext, key), providerToken);

  const emitted = new EventEmitter();
  const store = createMemoryStore(state, subscriptions, emitted);
  const deliveries = [];
  const transport = {
    configured: true,
    status: () => ({ configured: true, endpointHost: "push.example.test" }),
    async send(delivery) { deliveries.push(structuredClone(delivery)); return { ok: true }; },
  };
  const service = createMobilePushService({
    store,
    events: emitted,
    serverId: "server-12345678",
    pushTokenKey: keySource,
    transport,
    clock: () => new Date(now),
  });

  const result = await service.drain();
  assert.equal(result.processed, 1);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].token, providerToken);
  assert.equal(deliveries[0].notification.body, "Новое сообщение");
  assert.equal(JSON.stringify(deliveries[0].notification).includes(message.text), false);
  assert.deepEqual(deliveries[0].data, {
    type: "message.new",
    conversationId: message.conversationId,
    messageId: message.id,
  });
  assert.ok(state.meta.mobilePushDispatch[event.id].completedAt);
  assert.equal(state.meta.mobilePushDispatch[event.id].subscriptions[subscriptions[0].id].status, "delivered");
  await service.close();
});

test("mobile push activation is persisted and graceful close waits for an in-flight delivery", async () => {
  const now = new Date("2026-07-25T12:00:00.000Z");
  const { state, keySource, subscriptions } = pushFixture(now);
  const emitted = new EventEmitter();
  const store = createMemoryStore(state, subscriptions, emitted);
  let releaseDelivery;
  const enteredDelivery = new Promise((resolve) => { releaseDelivery = { entered: resolve, finish: null }; });
  const transport = {
    configured: true,
    status: () => ({ configured: true, endpointHost: "push.example.test" }),
    send() {
      releaseDelivery.entered();
      return new Promise((resolve) => { releaseDelivery.finish = resolve; });
    },
  };
  const service = createMobilePushService({
    store,
    events: emitted,
    serverId: "server-12345678",
    pushTokenKey: keySource,
    transport,
    clock: () => new Date(now),
  });
  await service.start();
  assert.equal(state.meta.mobilePushActivatedAt, now.toISOString());
  const draining = service.drain();
  await enteredDelivery;
  let closed = false;
  const closing = service.close().then(() => { closed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, false);
  releaseDelivery.finish({ ok: true });
  await Promise.all([draining, closing]);
  assert.equal(closed, true);
  assert.equal(service.status().closed, true);
});

test("full preview is only produced for an explicitly selected subscription policy", () => {
  const state = {
    users: [{ id: "s", displayName: "Sender", disabledAt: null }, { id: "r", notificationMode: "all", quietHoursStart: "", quietHoursEnd: "", disabledAt: null }],
    conversationSettings: [],
    conversations: [{ id: "conversation-12345678", type: "dm", userIds: ["s", "r"] }],
    roomMembers: [], roomBans: [],
    messages: [{ id: "message-12345678", conversationId: "conversation-12345678", senderId: "s", type: "text", text: "explicit preview", mentions: [], createdAt: new Date().toISOString(), deletedAt: null }],
  };
  const event = { id: "event-12345678", conversationId: "conversation-12345678", payload: { messageId: "message-12345678" } };
  const generic = buildPushDelivery(state, event, { id: "sub-generic", user_id: "r", provider: "fcm", installation_id: "i", preview_policy: "generic" }, "server");
  const full = buildPushDelivery(state, event, { id: "sub-full", user_id: "r", provider: "fcm", installation_id: "i", preview_policy: "full" }, "server");
  assert.equal(generic.notification.body.includes("explicit preview"), false);
  assert.equal(full.notification.body.includes("explicit preview"), true);
});
