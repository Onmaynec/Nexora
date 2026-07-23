"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { requestMlsWelcome } = require("../server/mls-welcome-recovery.cjs");

function fixture({ peers = 1 } = {}) {
  const calls = [];
  const db = {
    exec(statement) { calls.push({ kind: "exec", statement }); },
    prepare(statement) {
      return {
        get(...params) {
          calls.push({ kind: "get", statement, params });
          return { count: peers };
        },
        run(...params) {
          calls.push({ kind: "run", statement, params });
          return { changes: 1 };
        },
      };
    },
  };
  const trustCore = {
    store: { db },
    requireDevice() { return { id: "device-current", userId: "user-1" }; },
    getGroupByConversation() {
      return {
        id: "group-1",
        conversationId: "conversation-1",
        epoch: 7,
        members: [
          { deviceId: "device-current", status: "active" },
          { deviceId: "device-peer", status: "active" },
        ],
      };
    },
  };
  return { trustCore, calls };
}

test("force rejoin removes only the authenticated current device and requests a fresh Welcome", () => {
  const { trustCore, calls } = fixture();
  let payload;
  const result = requestMlsWelcome({
    trustCore,
    userId: "user-1",
    deviceId: "device-current",
    conversationId: "conversation-1",
    forceRejoin: true,
    emit(value) { payload = value; return [{ deviceId: "device-peer" }]; },
  });

  assert.equal(result.requested, true);
  assert.equal(result.recovery, true);
  assert.equal(result.recipients, 1);
  assert.equal(payload.requesterDeviceId, "device-current");
  assert.equal(payload.recovery, true);

  const membershipUpdate = calls.find((call) => call.kind === "run" && /UPDATE mls_group_members/.test(call.statement));
  assert.ok(membershipUpdate);
  assert.equal(membershipUpdate.params.at(-1), "device-current");
  assert.ok(calls.some((call) => call.kind === "exec" && call.statement === "BEGIN IMMEDIATE"));
  assert.ok(calls.some((call) => call.kind === "exec" && call.statement === "COMMIT"));
});

test("force rejoin fails closed without another active verified peer", () => {
  const { trustCore, calls } = fixture({ peers: 0 });
  assert.throws(() => requestMlsWelcome({
    trustCore,
    userId: "user-1",
    deviceId: "device-current",
    conversationId: "conversation-1",
    forceRejoin: true,
    emit() { throw new Error("must not emit"); },
  }), (error) => error.code === "MLS_RECOVERY_PEER_REQUIRED" && error.status === 409);
  assert.equal(calls.some((call) => call.kind === "run" && /UPDATE mls_group_members/.test(call.statement)), false);
});
