"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const composition = fs.readFileSync(path.join(root, "server/create-server-v31.cjs"), "utf8");
const stableCore = fs.readFileSync(path.join(root, "server/stable-core.cjs"), "utf8");
const createServer = fs.readFileSync(path.join(root, "server/create-server.cjs"), "utf8");
const v3 = fs.readFileSync(path.join(root, "server/v3-features.cjs"), "utf8");

function count(source, token) {
  return source.split(token).length - 1;
}

test("Trust and MLS executable runtime is absent from the composition root", () => {
  for (const forbidden of [
    "new TrustCore",
    "mountTrustRoutes",
    "mountTrustRecoveryRoutes",
    "mountTrustSocketAuthorization",
    "mountMlsTransport",
    "mountE2eeAttachments",
  ]) {
    assert.equal(composition.includes(forbidden), false, `${forbidden} must not be mounted`);
  }
  assert.match(composition, /mountStableCore/);
  assert.match(composition, /runtime: "retired"/);
  assert.match(composition, /legacyHistory: "read_only"/);
});

test("all legacy Trust, E2EE and MLS write surfaces converge on LEGACY_READ_ONLY", () => {
  assert.match(stableCore, /LEGACY_WRITE_PATTERN/);
  assert.match(stableCore, /response\.status\(status\)\.json/);
  assert.match(stableCore, /410,[\s\S]{0,160}"LEGACY_READ_ONLY"/);
  assert.match(stableCore, /socket\.on\("mls:message", reject\)/);
  assert.match(stableCore, /socket\.on\("mls:message-edit", reject\)/);
  assert.ok(count(createServer, "LEGACY_READ_ONLY") >= 3, "legacy Socket.IO and upload compatibility guards must use the stable code");
  assert.ok(count(v3, "LEGACY_READ_ONLY") >= 7, "draft, schedule, poll, bot and resumable upload guards must use the stable code");
});

test("legacy serialization and export expose ciphertext but never stored plaintext", () => {
  const model = fs.readFileSync(path.join(root, "server/model.cjs"), "utf8");
  assert.match(model, /message\.type === "encrypted" \? "" : message\.text/);
  assert.match(model, /ciphertext: message\.mlsEnvelope\.ciphertext/);
  assert.match(stableCore, /ciphertext: envelope\.ciphertext \|\| envelope\.message \|\| null/);
  assert.match(stableCore, /serverDecrypted: false/);
  assert.equal(/text:\s*message\.text/.test(stableCore), false);
});
