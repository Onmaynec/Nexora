"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function equalBytes(first, second) {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function credential(userId, deviceId) {
  return {
    credentialType: "basic",
    identity: textEncoder.encode(JSON.stringify({ version: 1, userId, deviceId })),
  };
}

function identityFromCredential(value) {
  if (value?.credentialType !== "basic") return null;
  try {
    const parsed = JSON.parse(textDecoder.decode(value.identity));
    return parsed?.version === 1 && parsed.userId && parsed.deviceId ? parsed : null;
  } catch {
    return null;
  }
}

function decodeExact(decoder, value) {
  const decoded = decoder(value, 0);
  assert.equal(decoded[1], value.length, "decoder must consume the complete MLS state");
  return decoded[0];
}

test("Alice and Bob complete RFC 9420 add, Welcome, encrypt, decrypt and state restore", async () => {
  const mls = await import("ts-mls");
  const ciphersuite = await mls.getCiphersuiteImpl(
    mls.getCiphersuiteFromName("MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519"),
  );
  const aliceKeys = await ciphersuite.signature.keygen();
  const bobKeys = await ciphersuite.signature.keygen();
  const aliceCredential = credential("alice", "alice-device");
  const bobCredential = credential("bob", "bob-device");
  const directory = new Map([
    ["alice:alice-device", { credential: aliceCredential, signaturePublicKey: aliceKeys.publicKey }],
    ["bob:bob-device", { credential: bobCredential, signaturePublicKey: bobKeys.publicKey }],
  ]);
  let validations = 0;
  const authService = {
    async validateCredential(candidate, signaturePublicKey) {
      validations += 1;
      const identity = identityFromCredential(candidate);
      if (!identity) return false;
      const trusted = directory.get(`${identity.userId}:${identity.deviceId}`);
      return Boolean(trusted)
        && equalBytes(candidate.identity, trusted.credential.identity)
        && equalBytes(signaturePublicKey, trusted.signaturePublicKey);
    },
  };
  const clientConfig = {
    keyRetentionConfig: mls.defaultKeyRetentionConfig,
    lifetimeConfig: mls.defaultLifetimeConfig,
    keyPackageEqualityConfig: mls.defaultKeyPackageEqualityConfig,
    paddingConfig: mls.defaultPaddingConfig,
    authService,
  };
  const now = Math.floor(Date.now() / 1000);
  const lifetime = { notBefore: BigInt(now - 60), notAfter: BigInt(now + 7 * 24 * 60 * 60) };
  const alicePackage = await mls.generateKeyPackageWithKey(
    aliceCredential,
    mls.defaultCapabilities(),
    lifetime,
    [],
    aliceKeys,
    ciphersuite,
    [],
  );
  const bobPackage = await mls.generateKeyPackageWithKey(
    bobCredential,
    mls.defaultCapabilities(),
    lifetime,
    [],
    bobKeys,
    ciphersuite,
    [],
  );

  const groupId = crypto.randomBytes(32);
  const aliceEpoch0 = await mls.createGroup(
    groupId,
    alicePackage.publicPackage,
    alicePackage.privatePackage,
    [],
    ciphersuite,
    clientConfig,
  );
  const addCommit = await mls.createCommit(
    { state: aliceEpoch0, cipherSuite: ciphersuite, pskIndex: mls.emptyPskIndex },
    {
      extraProposals: [{ proposalType: "add", add: { keyPackage: bobPackage.publicPackage } }],
      ratchetTreeExtension: true,
    },
  );
  assert.ok(addCommit.welcome, "add commit must create a Welcome");
  assert.equal(addCommit.newState.groupContext.epoch, 1n);

  const bobEpoch1 = await mls.joinGroup(
    addCommit.welcome,
    bobPackage.publicPackage,
    bobPackage.privatePackage,
    mls.emptyPskIndex,
    ciphersuite,
    undefined,
    undefined,
    clientConfig,
  );
  assert.equal(bobEpoch1.groupContext.epoch, 1n);
  assert.ok(validations > 0, "Trust-backed AuthenticationService must validate MLS credentials");

  const firstPlaintext = textEncoder.encode("hello from Alice");
  const firstAad = textEncoder.encode(JSON.stringify({ conversationId: "dm-1", senderDeviceId: "alice-device" }));
  const firstEncrypted = await mls.createApplicationMessage(addCommit.newState, firstPlaintext, ciphersuite, firstAad);
  const firstResult = await mls.processMessage(
    { version: "mls10", wireformat: "mls_private_message", privateMessage: firstEncrypted.privateMessage },
    bobEpoch1,
    mls.emptyPskIndex,
    mls.acceptAll,
    ciphersuite,
  );
  assert.equal(firstResult.kind, "applicationMessage");
  assert.equal(textDecoder.decode(firstResult.message), "hello from Alice");
  assert.equal(firstResult.newState.groupContext.epoch, 1n);

  const serializedAlice = mls.encodeGroupState(firstEncrypted.newState);
  const decodedAlice = decodeExact(mls.decodeGroupState, serializedAlice);
  const restoredAlice = { ...decodedAlice, clientConfig };
  assert.equal(restoredAlice.groupContext.epoch, 1n);

  const secondPlaintext = textEncoder.encode("message after sealed state restore");
  const secondEncrypted = await mls.createApplicationMessage(restoredAlice, secondPlaintext, ciphersuite);
  const secondResult = await mls.processMessage(
    { version: "mls10", wireformat: "mls_private_message", privateMessage: secondEncrypted.privateMessage },
    firstResult.newState,
    mls.emptyPskIndex,
    mls.acceptAll,
    ciphersuite,
  );
  assert.equal(secondResult.kind, "applicationMessage");
  assert.equal(textDecoder.decode(secondResult.message), "message after sealed state restore");

  for (const operation of [addCommit, firstEncrypted, firstResult, secondEncrypted, secondResult]) {
    for (const consumed of operation.consumed || []) mls.zeroOutUint8Array(consumed);
  }
});
