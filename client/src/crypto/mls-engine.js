import {
  acceptAll,
  createApplicationMessage,
  createCommit,
  createGroup,
  decodeGroupState,
  decodeMlsMessage,
  defaultCapabilities,
  defaultKeyPackageEqualityConfig,
  defaultKeyRetentionConfig,
  defaultLifetimeConfig,
  defaultPaddingConfig,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  generateKeyPackageWithKey,
  getCiphersuiteFromName,
  getCiphersuiteImpl,
  joinGroup,
  processMessage,
  zeroOutUint8Array,
} from "ts-mls";
import { decodeKeyPackage as decodeKeyPackageTls, encodeKeyPackage } from "ts-mls/keyPackage.js";

export const MLS_CIPHERSUITE_NAME = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";
export const MLS_CIPHERSUITE_ID = 1;
export const MLS_BASIC_CREDENTIAL_TYPE = "basic";

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
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(text);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : textEncoder.encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function constantTimeEqual(first, second) {
  const a = first instanceof Uint8Array ? first : new Uint8Array(first);
  const b = second instanceof Uint8Array ? second : new Uint8Array(second);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function decodeExact(decoder, value, code) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const decoded = decoder(bytes, 0);
  if (!decoded || decoded[1] !== bytes.length) throw new Error(code);
  return decoded[0];
}

function parseCredential(credential) {
  if (!credential || credential.credentialType !== MLS_BASIC_CREDENTIAL_TYPE) return null;
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
    credentialType: MLS_BASIC_CREDENTIAL_TYPE,
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
  };
}

function createClientConfig(resolveDevice) {
  return {
    keyRetentionConfig: defaultKeyRetentionConfig,
    lifetimeConfig: defaultLifetimeConfig,
    keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
    paddingConfig: defaultPaddingConfig,
    authService: createAuthenticationService(resolveDevice),
  };
}

function withClientConfig(state, resolveDevice) {
  return { ...state, clientConfig: createClientConfig(resolveDevice) };
}

export async function getImplementation() {
  implementationPromise ||= getCiphersuiteImpl(getCiphersuiteFromName(MLS_CIPHERSUITE_NAME));
  return implementationPromise;
}

export async function createMlsContext(resolveDevice) {
  return { cipherSuite: await getImplementation(), clientConfig: createClientConfig(resolveDevice) };
}

export async function generateDeviceSignatureKeys() {
  const pair = await (await getImplementation()).signature.keygen();
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

function encodePrivateKeyPackage(value) {
  return textEncoder.encode(JSON.stringify({
    version: 1,
    initPrivateKey: toBase64(value.initPrivateKey),
    hpkePrivateKey: toBase64(value.hpkePrivateKey),
    signaturePrivateKey: toBase64(value.signaturePrivateKey),
  }));
}

export function decodePrivateKeyPackage(value) {
  try {
    const decoded = JSON.parse(textDecoder.decode(value));
    if (decoded?.version !== 1) throw new Error("version");
    return {
      initPrivateKey: fromBase64(decoded.initPrivateKey),
      hpkePrivateKey: fromBase64(decoded.hpkePrivateKey),
      signaturePrivateKey: fromBase64(decoded.signaturePrivateKey),
    };
  } catch {
    throw new Error("MLS_PRIVATE_KEY_PACKAGE_DECODE_FAILED");
  }
}

export async function generateDeviceKeyPackage({ userId, deviceId, signatureKeyPair, lifetimeDays = 14 }) {
  const implementation = await getImplementation();
  const generated = await generateKeyPackageWithKey(
    createCredential(userId, deviceId),
    defaultCapabilities(),
    packageLifetime(lifetimeDays),
    [],
    signatureKeyPair,
    implementation,
    [],
  );
  const publicPackage = encodeKeyPackage(generated.publicPackage);
  const privatePackage = encodePrivateKeyPackage(generated.privatePackage);
  return {
    publicPackage,
    privatePackage,
    packageHash: await sha256Hex(publicPackage),
    expiresAt: new Date(Date.now() + Math.max(1, Math.min(30, Number(lifetimeDays) || 14)) * 24 * 60 * 60_000).toISOString(),
  };
}

export function decodeKeyPackage(publicBytes) {
  return decodeExact(decodeKeyPackageTls, publicBytes, "MLS_KEY_PACKAGE_DECODE_FAILED");
}

export function serializeState(state) {
  return encodeGroupState(state);
}

export function deserializeState(value, resolveDevice) {
  const state = decodeExact(decodeGroupState, value, "MLS_STATE_DECODE_FAILED");
  return withClientConfig(state, resolveDevice);
}

export async function stateHash(state) {
  return sha256Hex(canonical({
    version: state.groupContext.version,
    cipherSuite: state.groupContext.cipherSuite,
    groupId: toBase64(state.groupContext.groupId),
    epoch: state.groupContext.epoch.toString(),
    treeHash: toBase64(state.groupContext.treeHash),
    confirmedTranscriptHash: toBase64(state.groupContext.confirmedTranscriptHash),
  }));
}

export function stateMetadata(state) {
  return {
    protocolGroupId: toBase64(state.groupContext.groupId),
    epoch: Number(state.groupContext.epoch),
    ciphersuite: MLS_CIPHERSUITE_ID,
  };
}

export async function createInitialGroup({ userId, deviceId, signatureKeyPair, groupId, resolveDevice }) {
  const { cipherSuite, clientConfig } = await createMlsContext(resolveDevice);
  const own = await generateKeyPackageWithKey(
    createCredential(userId, deviceId),
    defaultCapabilities(),
    packageLifetime(30),
    [],
    signatureKeyPair,
    cipherSuite,
    [],
  );
  const state = await createGroup(
    groupId instanceof Uint8Array ? groupId : fromBase64(groupId),
    own.publicPackage,
    own.privatePackage,
    [],
    cipherSuite,
    clientConfig,
  );
  return { state, publicStateHash: await stateHash(state), ...stateMetadata(state) };
}

export async function addMembers({ state, encodedKeyPackages, resolveDevice }) {
  if (!encodedKeyPackages.length) return null;
  const { cipherSuite } = await createMlsContext(resolveDevice);
  const configuredState = withClientConfig(state, resolveDevice);
  const extraProposals = encodedKeyPackages.map((bytes) => ({
    proposalType: "add",
    add: { keyPackage: decodeKeyPackage(bytes) },
  }));
  const result = await createCommit(
    { state: configuredState, cipherSuite, pskIndex: emptyPskIndex },
    { extraProposals, ratchetTreeExtension: true },
  );
  try {
    if (!result.welcome) throw new Error("MLS_WELCOME_MISSING");
    return {
      state: result.newState,
      commit: encodeMlsMessage(result.commit),
      welcome: encodeMlsMessage({ version: "mls10", wireformat: "mls_welcome", welcome: result.welcome }),
      publicStateHash: await stateHash(result.newState),
      ...stateMetadata(result.newState),
    };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export async function joinFromWelcome({ welcomeBytes, candidatePackages, resolveDevice }) {
  const { cipherSuite, clientConfig } = await createMlsContext(resolveDevice);
  const decodedWelcome = decodeExact(decodeMlsMessage, welcomeBytes, "MLS_WELCOME_DECODE_FAILED");
  if (decodedWelcome.wireformat !== "mls_welcome") throw new Error("MLS_WELCOME_DECODE_FAILED");
  let lastError;
  for (const candidate of candidatePackages) {
    try {
      const state = await joinGroup(
        decodedWelcome.welcome,
        decodeKeyPackage(candidate.publicPackage),
        decodePrivateKeyPackage(candidate.privatePackage),
        emptyPskIndex,
        cipherSuite,
        undefined,
        undefined,
        clientConfig,
      );
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
  const { cipherSuite } = await createMlsContext(resolveDevice);
  const decoded = decodeExact(decodeMlsMessage, commitBytes, "MLS_COMMIT_DECODE_FAILED");
  if (!["mls_private_message", "mls_public_message"].includes(decoded.wireformat)) throw new Error("MLS_COMMIT_DECODE_FAILED");
  const result = await processMessage(decoded, withClientConfig(state, resolveDevice), emptyPskIndex, acceptAll, cipherSuite);
  try {
    if (result.kind !== "newState") throw new Error("MLS_EXPECTED_COMMIT");
    return { state: result.newState, publicStateHash: await stateHash(result.newState), ...stateMetadata(result.newState) };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export async function encryptApplicationMessage({ state, content, authenticatedData, resolveDevice }) {
  const { cipherSuite } = await createMlsContext(resolveDevice);
  const payload = textEncoder.encode(JSON.stringify(content));
  const aad = textEncoder.encode(JSON.stringify(authenticatedData || {}));
  const result = await createApplicationMessage(withClientConfig(state, resolveDevice), payload, cipherSuite, aad);
  try {
    const message = encodeMlsMessage({
      version: "mls10",
      wireformat: "mls_private_message",
      privateMessage: result.privateMessage,
    });
    return {
      state: result.newState,
      message,
      authenticatedDataHash: await sha256Hex(aad),
      publicStateHash: await stateHash(result.newState),
      ...stateMetadata(result.newState),
    };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export async function decryptApplicationMessage({ state, messageBytes, resolveDevice }) {
  const { cipherSuite } = await createMlsContext(resolveDevice);
  const decoded = decodeExact(decodeMlsMessage, messageBytes, "MLS_APPLICATION_MESSAGE_DECODE_FAILED");
  if (decoded.wireformat !== "mls_private_message") throw new Error("MLS_APPLICATION_MESSAGE_DECODE_FAILED");
  const authenticatedData = JSON.parse(textDecoder.decode(decoded.privateMessage.authenticatedData) || "{}");
  const result = await processMessage(decoded, withClientConfig(state, resolveDevice), emptyPskIndex, acceptAll, cipherSuite);
  try {
    if (result.kind !== "applicationMessage") throw new Error("MLS_EXPECTED_APPLICATION_MESSAGE");
    return {
      state: result.newState,
      content: JSON.parse(textDecoder.decode(result.message)),
      authenticatedData,
      senderLeafIndex: null,
      publicStateHash: await stateHash(result.newState),
      ...stateMetadata(result.newState),
    };
  } finally {
    result.consumed.forEach(zeroOutUint8Array);
  }
}

export function encodeKeyPackageMessage(publicPackage) {
  return encodeMlsMessage({
    version: "mls10",
    wireformat: "mls_key_package",
    keyPackage: decodeKeyPackage(publicPackage),
  });
}
