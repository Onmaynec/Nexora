"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { test } = require("node:test");

async function loadModule() {
  const source = fs.readFileSync(path.join(__dirname, "..", "client", "src", "trust", "encrypted-state.js"), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("Trust state uses non-exportable AES-GCM and detects tampering", async () => {
  const { encryptJson, decryptJson } = await loadModule();
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await assert.rejects(webcrypto.subtle.exportKey("raw", key), /not extractable/i);
  const value = {
    providerState: "opaque-private-mls-state",
    identityBundle: "opaque-device-identity",
    cursor: 17,
    messages: [{ id: "secure-1", text: "plaintext exists only inside encrypted cache" }],
  };
  const encrypted = await encryptJson(key, "account:user-1", value, webcrypto);
  assert.equal(JSON.stringify(encrypted).includes("plaintext exists only"), false);
  assert.deepEqual(await decryptJson(key, "account:user-1", encrypted, webcrypto), value);
  encrypted.ciphertext[0] ^= 1;
  await assert.rejects(decryptJson(key, "account:user-1", encrypted, webcrypto), (error) => error.code === "TRUST_STATE_DECRYPT_FAILED");
});

test("additional authenticated data binds encrypted state to its record name", async () => {
  const { encryptJson, decryptJson } = await loadModule();
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const encrypted = await encryptJson(key, "device:alice", { epoch: 4 }, webcrypto);
  await assert.rejects(decryptJson(key, "device:bob", encrypted, webcrypto), (error) => error.code === "TRUST_STATE_DECRYPT_FAILED");
});
