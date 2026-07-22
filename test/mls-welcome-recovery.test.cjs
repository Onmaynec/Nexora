"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { requestMlsWelcome } = require("../server/mls-welcome-recovery.cjs");

function trustFixture({ member = false } = {}) {
  const device = { id: "device-new", userId: "user-1", trustState: "verified" };
  return {
    requireDevice(userId, deviceId, options) {
      assert.equal(userId, "user-1"); assert.equal(deviceId, "device-new"); assert.equal(options.verified, true); return device;
    },
    getGroupByConversation(conversationId) {
      assert.equal(conversationId, "conversation-1");
      return { id: "group-1", conversationId, members: member ? [{ deviceId: device.id, status: "active" }] : [{ deviceId: "device-old", status: "active" }] };
    },
  };
}

test("pending verified device requests Welcome from active MLS members", () => {
  let payload;
  const result = requestMlsWelcome({ trustCore: trustFixture(), userId: "user-1", deviceId: "device-new", conversationId: "conversation-1", emit: (value) => { payload = value; return [{ deviceId: "device-old" }]; } });
  assert.equal(result.requested, true);
  assert.equal(result.recipients, 1);
  assert.equal(payload.requesterDeviceId, "device-new");
  assert.equal(payload.groupId, "group-1");
});

test("existing MLS member does not create a redundant Welcome request", () => {
  let emitted = false;
  const result = requestMlsWelcome({ trustCore: trustFixture({ member: true }), userId: "user-1", deviceId: "device-new", conversationId: "conversation-1", emit: () => { emitted = true; } });
  assert.equal(result.requested, false);
  assert.equal(result.reason, "already_member");
  assert.equal(emitted, false);
});
