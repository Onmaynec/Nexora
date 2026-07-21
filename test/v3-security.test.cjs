"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { privateAddress, sniffMime } = require("../server/v3-features.cjs");

test("webhook SSRF-фильтр распознаёт локальные, VPN, reserved, multicast и CGNAT адреса", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "26.1.2.3", "172.16.0.1", "192.168.1.2", "169.254.1.1", "100.64.1.1", "198.51.100.2", "224.0.0.1", "::", "::1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1"]) {
    assert.equal(privateAddress(address), true, address);
  }
  assert.equal(privateAddress("93.184.216.34"), false);
});

test("тип чувствительного медиа определяется по сигнатуре, а не заголовку", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  assert.equal(sniffMime(png, "application/octet-stream"), "image/png");
  assert.equal(sniffMime(Buffer.from("not a png"), "image/png"), "application/octet-stream");
  assert.equal(sniffMime(Buffer.from("not audio"), "audio/webm"), "application/octet-stream");
});
