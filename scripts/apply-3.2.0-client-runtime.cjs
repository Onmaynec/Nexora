"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function update(file, transform) {
  const target = path.join(root, file);
  const before = fs.readFileSync(target, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${file}: patch made no changes`);
  fs.writeFileSync(target, after, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

update("client/src/crypto/trust-client.js", (source) => {
  let next = replaceRequired(
    source,
    `async function identityPublicKey(keyPair) {\n  return new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));\n}`,
    `async function hardenIdentityKeyPair(keyPair) {\n  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));\n  const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));\n  try {\n    const privateKey = await crypto.subtle.importKey("pkcs8", privateBytes, { name: "Ed25519" }, false, ["sign"]);\n    return { publicKey, privateKey };\n  } finally {\n    privateBytes.fill(0);\n  }\n}`,
    "harden identity key pair",
  );
  next = replaceRequired(
    next,
    `    identityPair = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);`,
    `    identityPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);`,
    "temporary extractable identity keypair",
  );
  next = replaceRequired(
    next,
    `  const signaturePair = await generateDeviceSignatureKeys();\n  const identityKey = toBase64(await identityPublicKey(identityPair));`,
    `  const hardenedIdentity = await hardenIdentityKeyPair(identityPair);\n  identityPair = { publicKey: identityPair.publicKey, privateKey: hardenedIdentity.privateKey };\n  const signaturePair = await generateDeviceSignatureKeys();\n  const identityKey = toBase64(hardenedIdentity.publicKey);`,
    "use hardened identity key",
  );
  next = replaceRequired(
    next,
    `  return { ...record, state: deserializeState(record.stateBytes) };`,
    `  return { ...record, state: deserializeState(record.stateBytes, resolveTrustedDevice) };`,
    "restore Trust-backed clientConfig",
  );
  next = replaceRequired(
    next,
    `function participantIds(conversation) {\n  return [...new Set((conversation?.members || []).map((item) => String(item?.id || item?.userId || "")).filter(Boolean))];\n}`,
    `function participantIds(conversation) {\n  return [...new Set([\n    current().userId,\n    conversation?.peer?.id,\n    ...(conversation?.members || []).map((item) => item?.id || item?.userId),\n  ].map((item) => String(item || "")).filter(Boolean))];\n}`,
    "include DM peer in MLS membership",
  );
  return next;
});

console.log("3.2.0 client runtime patch applied");
