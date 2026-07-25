"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { isPrivateAddress, validateGatewayConfig } = require("../server/push-gateway.cjs");

test("push gateway rejects bracketed IPv6 loopback and the IPv6 discard prefix", () => {
  assert.equal(isPrivateAddress("[::1]"), true);
  assert.equal(isPrivateAddress("100::1"), true);
  assert.throws(
    () => validateGatewayConfig({ url: "https://[::1]/v1/deliver", secret: "s".repeat(32) }),
    (error) => error.code === "PUSH_GATEWAY_PRIVATE_TARGET" && error.permanent === true,
  );
});
