"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { deviceInventory, publicLegacyMessage, sessionDeviceId } = require("../server/stable-core.cjs");

test("device inventory groups sessions and marks the current device", () => {
  const state = { sessions: [
    { id: "s1", userId: "u1", deviceId: "d1", deviceName: "Laptop", platform: "windows", clientVersion: "3.4.0", createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-03T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },
    { id: "s2", userId: "u1", deviceId: "d1", deviceName: "Laptop", platform: "windows", clientVersion: "3.4.0", createdAt: "2026-01-02T00:00:00.000Z", lastSeenAt: "2026-01-04T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },
    { id: "s3", userId: "u1", deviceId: "d2", deviceName: "Phone", platform: "android", clientVersion: "3.4.0", createdAt: "2026-01-02T00:00:00.000Z", lastSeenAt: "2026-01-02T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" },
  ] };
  const devices = deviceInventory(state, "u1", "s2");
  assert.equal(devices.length, 2);
  assert.equal(devices[0].deviceId, "d1");
  assert.equal(devices[0].current, true);
  assert.equal(devices[0].sessionCount, 2);
});

test("legacy messages expose ciphertext metadata but never plaintext", () => {
  const value = publicLegacyMessage({ id: "m1", conversationId: "c1", senderId: "u1", type: "encrypted", text: "must-not-leak", createdAt: "2026-01-01T00:00:00.000Z", mlsEnvelope: { ciphertext: "opaque", epoch: 3, messageHash: "hash" } });
  assert.equal(value.ciphertext, "opaque");
  assert.equal(value.readOnly, true);
  assert.equal(Object.hasOwn(value, "text"), false);
});

test("legacy sessions receive a stable fallback device id", () => {
  assert.equal(sessionDeviceId({ id: "session-1" }), "legacy-session-1");
});
