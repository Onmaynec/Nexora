import {
  clientStateDecoder,
  clientStateEncoder,
  createApplicationMessage,
  createCommit,
  createGroup,
  decode,
  defaultCredentialTypes,
  encode,
  generateKeyPackageWithKey,
  generateSignatureKeyPair,
  getCiphersuiteImpl,
  joinGroup,
  keyPackageDecoder,
  keyPackageEncoder,
  mlsMessageDecoder,
  mlsMessageEncoder,
  privateKeyPackageDecoder,
  privateKeyPackageEncoder,
  processKeyPackage,
  processMessage,
  protocolVersions,
  wireformats,
  zeroOutUint8Array,
} from "ts-mls";

export const MLS_CIPHERSUITE_NAME = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";
export const MLS_CIPHERSUITE_ID = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let implementationPromise;

export function toBase64(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(value) {
  const binary = atob(String(value || "").replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : textEncoder.encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(first, second) {
  const a = first instanceof Uint8Array ? first : new Uint8Array(first);
  const b = second instanceof Uint8Array ? second : new Uint8Array(second);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function parseCredential(credential) {
  if (!credential || credential.credentialType !== defaultCredentialTypes.basic) return null;
  try {
    const value = JSON.parse(textDecoder.decode(credential.identity));
    if (value?.version !== 1 || !value.userId || !value.deviceId) return null;
    return { version: 1, userId: String(value.userId), deviceId: String(value.deviceId) };
  } catch {
    return null;
  }
}

export function createCredential(userId, deviceId) {
  return {
    credentialType: defaultCredentialTypes.basic,
    identity: textEncoder.encode(JSON.stringify({ version: 1, userId: String(userId), deviceId: String(deviceId) })),
  };
}

export function createAuthenticationService(resolveDevice) {
  if (typeof resolveDevice !== "function") throw new Error("MLS_AUTH_RESOLVER_REQUIRED");
  return {
    async validateCredential(credential, signaturePublicKey) {
      const identity = parseCredential(credential);
      if (!identity) return false;
      const device = await resolveDevice(identity.userId, identity.deviceId);
      if (!device || device.status !== "active" || device.trustState !== "verified") return false;
      if (device.credential !== toBase64(credential.identity)) return false;
      return constantTimeEqual(fromBase64(device.signatureKey), signaturePublicKey);
    },
    async validateSuccessorCredential(oldCredential, newCredential) {
      const oldIdentity = parseCredential(oldCredential);
      const newIdentity = parseCredential(newCredential);
      if (!oldIdentity || !newIdentity) return false;
      return oldIdentity.userId === newIdentity.userId && oldIdentity.deviceId === newIdentity.deviceId;
    },
  };
}

export async function getImplementation() {
  implementationPromise ||= getCiphersuiteImpl(MLS_CIPHERSUITE_NAME);
  return implementationPromise;
}

export async function createMlsContext(resolveDevice) {
  return { cipherSuite: await getImplementation(), authService: createAuthenticationService(resolveDevice) };
}

export async function generateDeviceSignatureKeys() {
  const pair = await generateSignatureKeyPair(await getImplementation());
  return { signKey: pair.signKey, publicKey: pair.publicKey };
}

function packageLifetime(days = 14) {
  const now = Math.floor(Date.now() / 1000);
  const boundedDays = Math.max(1, Math.min(30, Number(days) || 14));
  return {
    notBefore: BigInt(now - 300),
    notAfter: BigInt(now + boundedDays * 24 * 60 * 60),
  };
}

export async function generateDeviceKeyPackage({ userId, deviceId, signatureKeyPair, lifetimeDays = 14 }) {
  const implementation = await getImplementation();
  const generated = await generateKeyPackageWithKey({
    credential: createCredential(userId, deviceId),
    signatureKeyPair,
    cipherSuite: implementation,
    lifetime: packageLifetime(lifetimeDays),
  });
  const publicPackage = encode(keyPackageEncoder, generated.publicPackage);
  const privatePackage = encode(privateKeyPackageEncoder, generated.privatePackage);
  return {
    publicPackage,
    privatePackage,
    packageHash: await sha256Hex(publicPackage),
    expiresAt: new Date(Date.now() + Math.max(1, Math.min(30, Number(lifetimeDays) || 14)) * 24 * 60 * 60_000).toISOString(),
  };
}

export function decodeKeyPackage(publicBytes) {
  const value = decode(keyPackageDecoder, publicBytes);
  if (!value) throw new Error("MLS_KEY_PACKAGE_DECODE_FAILED");
  return value;
}

export function decodePrivateKeyPackage(privateBytes) {
  const value = decode(privateKeyPackageDecoder, privateBytes);
  if (!value) throw new Error("MLS_PRIVATE_KEY_PACKAGE_DECODE_FAILED");
  return value;
}

export function serializeState(state) {
  return encode(clientStateEncoder, state);
}

export function deserializeState(value) {
  const state = decode(clientStateDecoder, value);
  if (!state) throw new Error("MLS_STATE_DECODE_FAILED");
  return state;
}

export async function stateHash(state) {
  return sha256Hex(serializeState(state));
}

export function stateMetadata(state) {
  return {
    protocolGroupId: toBase64(state.groupContext.groupId),
    epoch: Number(state.groupContext.epoch),
    ciphersuite: Number(state.groupContext.cipherSuite),
  };
}

export async function createInitialGroup({ userId, deviceId, signatureKeyPair, groupId, resolveDevice }) {
  const context = await createMlsContext(resolveDevice);
  const own = await generateKeyPackageWithKey({
    credential: createCredential(userId, deviceId),
    signatureKeyPair,
    cipherSuite: context.cipherSuite,
    lifetime: packageLifetime(30),
  });
  const state = await createGroup({
    context,
    groupId: groupId instanceof Uint8Array ? groupId : fromBase64(groupId),
    keyPackage: own.publicPackage,
    privateKeyPackage: own.privatePackage,
  });
  return { state, publicStateHash: await stateHash(state), ...stateMetadata(state) };
}

export async function addMembers({ state, encodedKeyPackages, resolveDevice }) {
  if (!encodedKeyPackages.length) return null;
  const context = await createMlsContext(resolveDevice);
  const extraProposals = [];
  for (const bytes of encodedKeyPackages) {
    extraProposals.push(await processKeyPackage({ context, state, keyPackage: decodeKeyPackage(bytes) }));
  }
  const result = await createCommit({ context, state, extraProposals, ratchetTreeExtension: true });
  try {
    if (!result.welcome) throw new Error("MLS_WELCOME_MISSING");
    return {
      state: result.newState,
      commit: encode(mlsMessageEncoder, result.commit),
      welcome: encode(mlsMessageEncoder, result.welcome),
      publicStateHash: await stateHash(result.newState),
      ...stateMetadata(result.newState),
    };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export async function joinFromWelcome({ welcomeBytes, candidatePackages, resolveDevice }) {
  const context = await createMlsContext(resolveDevice);
  const decodedWelcome = decode(mlsMessageDecoder, welcomeBytes);
  if (!decodedWelcome || decodedWelcome.wireformat !== wireformats.mls_welcome) throw new Error("MLS_WELCOME_DECODE_FAILED");
  let lastError;
  for (const candidate of candidatePackages) {
    try {
      const state = await joinGroup({
        context,
        welcome: decodedWelcome.welcome,
        keyPackage: decodeKeyPackage(candidate.publicPackage),
        privateKeys: decodePrivateKeyPackage(candidate.privatePackage),
      });
      return {
        state,
        consumedPackageHash: candidate.packageHash,
        publicStateHash: await stateHash(state),
        ...stateMetadata(state),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw Object.assign(new Error("MLS_WELCOME_NO_MATCHING_KEY_PACKAGE"), { cause: lastError });
}

export async function processCommitMessage({ state, commitBytes, resolveDevice }) {
  const context = await createMlsContext(resolveDevice);
  const decoded = decode(mlsMessageDecoder, commitBytes);
  if (!decoded || ![wireformats.mls_private_message, wireformats.mls_public_message].includes(decoded.wireformat)) {
    throw new Error("MLS_COMMIT_DECODE_FAILED");
  }
  const result = await processMessage({ context, state, message: decoded });
  try {
    if (result.kind !== "newState") throw new Error("MLS_EXPECTED_COMMIT");
    return { state: result.newState, publicStateHash: await stateHash(result.newState), ...stateMetadata(result.newState) };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export async function encryptApplicationMessage({ state, content, authenticatedData, resolveDevice }) {
  const context = await createMlsContext(resolveDevice);
  const payload = textEncoder.encode(JSON.stringify(content));
  const aad = textEncoder.encode(JSON.stringify(authenticatedData || {}));
  const result = await createApplicationMessage({ context, state, message: payload, authenticatedData: aad });
  try {
    const encoded = encode(mlsMessageEncoder, result.message);
    return {
      state: result.newState,
      message: encoded,
      authenticatedDataHash: await sha256Hex(aad),
      publicStateHash: await stateHash(result.newState),
      ...stateMetadata(result.newState),
    };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export async function decryptApplicationMessage({ state, messageBytes, resolveDevice }) {
  const context = await createMlsContext(resolveDevice);
  const decoded = decode(mlsMessageDecoder, messageBytes);
  if (!decoded || decoded.wireformat !== wireformats.mls_private_message) throw new Error("MLS_APPLICATION_MESSAGE_DECODE_FAILED");
  const result = await processMessage({ context, state, message: decoded });
  try {
    if (result.kind !== "applicationMessage") throw new Error("MLS_EXPECTED_APPLICATION_MESSAGE");
    const content = JSON.parse(textDecoder.decode(result.message));
    const authenticatedData = JSON.parse(textDecoder.decode(result.aad) || "{}");
    return {
      state: result.newState,
      content,
      authenticatedData,
      senderLeafIndex: result.senderLeafIndex,
      publicStateHash: await stateHash(result.newState),
      ...stateMetadata(result.newState),
    };
  } finally {
    result.consumed.forEach(zeroOutUintArray);
  }
}

function zeroOutUintArray(value) {
  zeroOutUint8Array(value);
}

export function encodeKeyPackageMessage(publicPackage) {
  return encode(mlsMessageEncoder, {
    keyPackage: decodeKeyPackage(publicPackage),
    wireformat: wireformats.mls_key_package,
    version: protocolVersions.mls10,
  });
}
