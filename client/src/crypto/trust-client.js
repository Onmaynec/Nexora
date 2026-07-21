import { api } from "../api";
import {
  addMembers,
  createCredential,
  createInitialGroup,
  decryptApplicationMessage,
  deserializeState,
  encryptApplicationMessage,
  fromBase64,
  generateDeviceKeyPackage,
  generateDeviceSignatureKeys,
  joinFromWelcome,
  processCommitMessage,
  serializeState,
  sha256Hex,
  stateMetadata,
  toBase64,
} from "./mls-engine";
import { memberDirectory } from "./mls-members";
import {
  cleanupKeyPackages,
  deleteGroupState,
  deleteKeyPackage,
  listKeyPackages,
  loadDecryptedContent,
  loadDevice,
  loadEncryptedDraft,
  loadGroupState,
  saveDecryptedContent,
  saveDevice,
  saveEncryptedDraft,
  saveGroupState,
  saveKeyPackage,
} from "./trust-store";

const textEncoder = new TextEncoder();
const DEVICE_KEY_PACKAGE_TARGET = 8;
const deviceDirectory = new Map();
const conversationQueues = new Map();
let configuration = null;
let devicePromise = null;
let refillPromise = null;

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function current() {
  if (!configuration?.serverId || !configuration?.userId) throw new Error("TRUST_NOT_CONFIGURED");
  return configuration;
}

function trustHeaders(deviceId = null) {
  return deviceId ? { "X-Nexora-Device-ID": deviceId } : {};
}

async function trustApi(path, { method = "GET", body, deviceId = null } = {}) {
  return api(`/api/v4/trust${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: trustHeaders(deviceId),
  });
}

function platformDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Browser";
  const shell = navigator.userAgent.includes("Electron") ? "Nexora Desktop" : "Nexora Web";
  return `${shell} · ${platform}`.slice(0, 80);
}

async function hardenIdentityKeyPair(keyPair) {
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  try {
    const privateKey = await crypto.subtle.importKey("pkcs8", privateBytes, { name: "Ed25519" }, false, ["sign"]);
    return { publicKey, privateKey };
  } finally {
    privateBytes.fill(0);
  }
}

function proofBytes(purpose, values) {
  return textEncoder.encode(`NEXORA-TRUST-V1\n${purpose}\n${canonical(values)}`);
}

async function signProof(identityPrivateKey, purpose, values) {
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, identityPrivateKey, proofBytes(purpose, values));
  return toBase64(new Uint8Array(signature));
}

async function fingerprintFor({ userId, identityKey, signatureKey, credential }) {
  return sha256Hex(canonical({ userId: String(userId), identityKey, signatureKey, credential }));
}

function cacheDevice(device) {
  if (device?.userId && device?.id) deviceDirectory.set(`${device.userId}:${device.id}`, device);
  return device;
}

export function configureTrust({ serverId, user }) {
  const next = { serverId: String(serverId || ""), userId: String(user?.id || ""), user };
  const changed = !configuration || configuration.serverId !== next.serverId || configuration.userId !== next.userId;
  configuration = next;
  if (changed) {
    devicePromise = null;
    refillPromise = null;
    deviceDirectory.clear();
    conversationQueues.clear();
  }
}

export function trustConfigured() {
  return Boolean(configuration?.serverId && configuration?.userId);
}

export async function resolveTrustedDevice(userId, deviceId) {
  const key = `${userId}:${deviceId}`;
  if (deviceDirectory.has(key)) return deviceDirectory.get(key);
  const own = await loadDevice(current().serverId, current().userId);
  if (own?.id === deviceId && own?.userId === userId) return cacheDevice(own);
  const result = await trustApi(`/users/${encodeURIComponent(userId)}/devices`);
  for (const device of result.devices || []) cacheDevice(device);
  return deviceDirectory.get(key) || null;
}

async function createLocalDevice() {
  const { serverId, userId } = current();
  if (!crypto?.subtle || !globalThis.indexedDB) throw Object.assign(new Error("Этот клиент не поддерживает защищённое хранилище MLS."), { code: "TRUST_PLATFORM_UNSUPPORTED" });
  const id = crypto.randomUUID();
  let identityPair;
  try {
    identityPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  } catch (error) {
    throw Object.assign(new Error("Ed25519 недоступен в этом клиенте."), { code: "TRUST_ED25519_UNAVAILABLE", cause: error });
  }
  const hardenedIdentity = await hardenIdentityKeyPair(identityPair);
  identityPair = { publicKey: identityPair.publicKey, privateKey: hardenedIdentity.privateKey };
  const signaturePair = await generateDeviceSignatureKeys();
  const identityKey = toBase64(hardenedIdentity.publicKey);
  const signatureKey = toBase64(signaturePair.publicKey);
  const credential = toBase64(createCredential(userId, id).identity);
  const fingerprint = await fingerprintFor({ userId, identityKey, signatureKey, credential });
  const context = { deviceId: id, fingerprint };
  const challenge = (await trustApi("/challenges", { method: "POST", body: { purpose: "register_device", context } })).challenge;
  const signedValues = {
    challengeId: challenge.id,
    nonce: challenge.nonce,
    userId,
    purpose: "register_device",
    targetDeviceId: null,
    context,
  };
  const proofSignature = await signProof(identityPair.privateKey, "register_device", signedValues);
  const result = await trustApi("/devices", {
    method: "POST",
    body: {
      challengeId: challenge.id,
      deviceId: id,
      displayName: platformDeviceName(),
      identityKey,
      signatureKey,
      credential,
      capabilities: ["mls-rfc9420", "ciphersuite-1", "sealed-indexeddb-state"],
      proofSignature,
    },
  });
  return saveDevice(serverId, userId, {
    ...result.device,
    userId,
    identityPrivateKey: identityPair.privateKey,
    identityPublicKey: identityKey,
    signaturePrivateKey: signaturePair.signKey,
    signaturePublicKey: signatureKey,
    credential,
  });
}

export async function ensureTrustDevice() {
  if (devicePromise) return devicePromise;
  devicePromise = (async () => {
    const { serverId, userId } = current();
    let device = await loadDevice(serverId, userId);
    if (!device) device = await createLocalDevice();
    else {
      const remote = (await trustApi("/devices")).devices?.find((item) => item.id === device.id);
      if (!remote || remote.status !== "active") {
        throw Object.assign(new Error("Локальный ключ устройства отозван. Создайте новое доверенное устройство."), { code: "TRUST_DEVICE_REVOKED" });
      }
      device = await saveDevice(serverId, userId, { ...device, ...remote, identityPrivateKey: device.identityPrivateKey, signaturePrivateKey: device.signaturePrivateKey });
    }
    cacheDevice(device);
    if (device.trustState === "verified") await replenishKeyPackages(device);
    return device;
  })().catch((error) => {
    devicePromise = null;
    throw error;
  });
  return devicePromise;
}

export async function replenishKeyPackages(device = null) {
  if (refillPromise) return refillPromise;
  refillPromise = (async () => {
    const { serverId, userId } = current();
    const activeDevice = device || await ensureTrustDevice();
    if (activeDevice.trustState !== "verified") return [];
    await cleanupKeyPackages(serverId, userId);
    let packages = await listKeyPackages(serverId, userId);
    const signatureKeyPair = { signKey: activeDevice.signaturePrivateKey, publicKey: fromBase64(activeDevice.signatureKey) };
    while (packages.length < DEVICE_KEY_PACKAGE_TARGET) {
      const generated = await generateDeviceKeyPackage({ userId, deviceId: activeDevice.id, signatureKeyPair, lifetimeDays: 14 });
      await saveKeyPackage(serverId, userId, generated);
      packages.push(generated);
    }
    const pending = packages.filter((item) => !item.serverPackageId);
    if (pending.length) {
      const uploaded = await trustApi("/key-packages", {
        method: "POST",
        deviceId: activeDevice.id,
        body: { packages: pending.map((item) => ({ ciphersuite: 1, keyPackage: toBase64(item.publicPackage), expiresAt: item.expiresAt })) },
      });
      const byHash = new Map((uploaded.packages || []).map((item) => [item.packageHash, item]));
      for (const item of pending) {
        const remote = byHash.get(item.packageHash);
        await saveKeyPackage(serverId, userId, { ...item, serverPackageId: remote?.id || item.serverPackageId || null });
      }
    }
    return listKeyPackages(serverId, userId);
  })().finally(() => { refillPromise = null; });
  return refillPromise;
}

async function loadLocalGroup(conversationId) {
  const { serverId, userId } = current();
  const record = await loadGroupState(serverId, userId, conversationId);
  if (!record) return null;
  return { ...record, state: deserializeState(record.stateBytes, resolveTrustedDevice) };
}

async function persistGroup(conversationId, groupRecordId, state, publicStateHash) {
  const { serverId, userId } = current();
  const metadata = stateMetadata(state);
  await saveGroupState(serverId, userId, conversationId, serializeState(state), {
    groupRecordId,
    protocolGroupId: metadata.protocolGroupId,
    epoch: metadata.epoch,
    publicStateHash,
  });
  return { conversationId, groupRecordId, state, publicStateHash, ...metadata };
}

async function claimWelcome(device, conversationId) {
  const { serverId, userId } = current();
  const result = await trustApi(`/conversations/${encodeURIComponent(conversationId)}/welcome/claim`, { method: "POST", deviceId: device.id, body: {} });
  if (!result.welcome) return null;
  const packages = await listKeyPackages(serverId, userId);
  const joined = await joinFromWelcome({
    welcomeBytes: fromBase64(result.welcome.welcome),
    candidatePackages: packages,
    resolveDevice: resolveTrustedDevice,
  });
  await deleteKeyPackage(serverId, userId, joined.consumedPackageHash);
  await persistGroup(result.welcome.conversationId, result.welcome.groupRecordId, joined.state, joined.publicStateHash);
  await replenishKeyPackages(device);
  return loadLocalGroup(result.welcome.conversationId);
}

function participantIds(conversation) {
  return [...new Set([
    current().userId,
    conversation?.peer?.id,
    ...(conversation?.members || []).map((item) => item?.id || item?.userId),
  ].map((item) => String(item || "")).filter(Boolean))];
}

async function syncMissedCommits(local, remote, device) {
  if (!local || local.epoch >= remote.epoch) return local;
  const result = await trustApi(`/groups/${encodeURIComponent(remote.id)}/commits?after=${local.epoch}`, { deviceId: device.id });
  let state = local.state;
  let publicStateHash = local.publicStateHash;
  for (const item of result.commits || []) {
    const processed = await processCommitMessage({ state, commitBytes: fromBase64(item.commit), resolveDevice: resolveTrustedDevice });
    state = processed.state;
    publicStateHash = processed.publicStateHash;
    if (processed.epoch !== Number(item.epoch)) throw Object.assign(new Error("MLS commit epoch mismatch."), { code: "MLS_EPOCH_CONFLICT" });
  }
  if (Number(state.groupContext.epoch) !== Number(remote.epoch)) throw Object.assign(new Error("Не удалось восстановить актуальную MLS epoch."), { code: "MLS_COMMIT_GAP" });
  return persistGroup(remote.conversationId, remote.id, state, publicStateHash);
}

async function addMissingDevices(conversation, local, remote, device) {
  if (!local || local.epoch !== remote.epoch) return local;
  const known = new Set((remote.members || []).filter((item) => item.status === "active").map((item) => item.deviceId));
  const additions = [];
  const claimedPackages = [];
  for (const userId of participantIds(conversation)) {
    const devices = (await trustApi(`/users/${encodeURIComponent(userId)}/devices`)).devices || [];
    for (const target of devices.filter((item) => item.status === "active" && item.trustState === "verified" && !known.has(item.id))) {
      const claimed = await trustApi(`/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(target.id)}/key-packages/claim`, {
        method: "POST",
        deviceId: device.id,
        body: { targetDeviceId: target.id },
      });
      if (!claimed.keyPackage || claimed.keyPackage.deviceId !== target.id) throw Object.assign(new Error("Сервер вернул KeyPackage другого устройства."), { code: "MLS_KEY_PACKAGE_SCOPE_INVALID" });
      additions.push({ userId, deviceId: target.id, leafIndex: 0 });
      claimedPackages.push(fromBase64(claimed.keyPackage.keyPackage));
      known.add(target.id);
    }
  }
  if (!additions.length) return local;
  const created = await addMembers({ state: local.state, encodedKeyPackages: claimedPackages, resolveDevice: resolveTrustedDevice });
  const directory = memberDirectory(created.state);
  const finalized = additions.map((item) => ({ ...item, leafIndex: directory.get(`${item.userId}:${item.deviceId}`)?.leafIndex ?? item.leafIndex }));
  const commitHash = await sha256Hex(created.commit);
  const proofValues = {
    groupRecordId: remote.id,
    actorDeviceId: device.id,
    previousEpoch: local.epoch,
    epoch: created.epoch,
    commitHash,
    publicStateHash: created.publicStateHash,
    addedDevices: finalized,
    removedDeviceIds: [],
  };
  const proofSignature = await signProof(device.identityPrivateKey, "mls_commit", proofValues);
  await trustApi(`/groups/${encodeURIComponent(remote.id)}/commits`, {
    method: "POST",
    deviceId: device.id,
    body: {
      conversationId: conversation.id,
      previousEpoch: local.epoch,
      epoch: created.epoch,
      commit: toBase64(created.commit),
      publicStateHash: created.publicStateHash,
      addedDevices: finalized,
      removedDeviceIds: [],
      welcomes: finalized.map((item) => ({ targetDeviceId: item.deviceId, welcome: toBase64(created.welcome) })),
      proofSignature,
    },
  });
  return persistGroup(conversation.id, remote.id, created.state, created.publicStateHash);
}

async function ensureConversationGroupInternal(conversation) {
  const device = await ensureTrustDevice();
  if (device.trustState !== "verified") throw Object.assign(new Error("Подтвердите это устройство перед использованием E2EE."), { code: "TRUST_DEVICE_UNVERIFIED" });
  await claimWelcome(device, conversation.id).catch((error) => {
    if (!["MLS_WELCOME_NO_MATCHING_KEY_PACKAGE", "MLS_WELCOME_RACE"].includes(error.code || error.message)) throw error;
  });
  let local = await loadLocalGroup(conversation.id);
  let remote = (await trustApi(`/conversations/${encodeURIComponent(conversation.id)}/group`, { deviceId: device.id })).group;

  if (!remote) {
    if (local) {
      await deleteGroupState(current().serverId, current().userId, conversation.id);
      local = null;
    }
    const groupId = crypto.getRandomValues(new Uint8Array(32));
    const signatureKeyPair = { signKey: device.signaturePrivateKey, publicKey: fromBase64(device.signatureKey) };
    const initial = await createInitialGroup({
      userId: current().userId,
      deviceId: device.id,
      signatureKeyPair,
      groupId,
      resolveDevice: resolveTrustedDevice,
    });
    const created = await trustApi(`/conversations/${encodeURIComponent(conversation.id)}/group`, {
      method: "POST",
      deviceId: device.id,
      body: { ciphersuite: 1, groupId: toBase64(groupId), publicStateHash: initial.publicStateHash, leafIndex: 0 },
    });
    remote = created.group;
    if (remote.groupId && remote.groupId !== initial.protocolGroupId) {
      const joined = await claimWelcome(device, conversation.id);
      if (!joined) throw Object.assign(new Error("MLS group создан другим устройством; ожидается Welcome."), { code: "MLS_WELCOME_PENDING" });
      local = joined;
    } else {
      local = await persistGroup(conversation.id, remote.id, initial.state, initial.publicStateHash);
    }
  } else if (!local) {
    const joined = await claimWelcome(device, conversation.id);
    local = joined || await loadLocalGroup(conversation.id);
    if (!local) {
      const member = (remote.members || []).find((item) => item.deviceId === device.id && item.status === "active");
      throw Object.assign(new Error(member ? "Локальное MLS-состояние утрачено. Отзовите это устройство и подключите новое." : "Устройство ожидает MLS Welcome от активного участника."), { code: member ? "MLS_STATE_LOST" : "MLS_WELCOME_PENDING" });
    }
  }

  local = await syncMissedCommits(local, remote, device);
  remote = (await trustApi(`/conversations/${encodeURIComponent(conversation.id)}/group`, { deviceId: device.id })).group;
  local = await addMissingDevices(conversation, local, remote, device);
  return { device, local, remote: (await trustApi(`/conversations/${encodeURIComponent(conversation.id)}/group`, { deviceId: device.id })).group };
}

function serializeConversationOperation(conversationId, operation) {
  const previous = conversationQueues.get(conversationId) || Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  const tracked = next.finally(() => {
    if (conversationQueues.get(conversationId) === tracked) conversationQueues.delete(conversationId);
  });
  conversationQueues.set(conversationId, tracked);
  return next;
}

export function ensureConversationGroup(conversation) {
  return serializeConversationOperation(conversation.id, () => ensureConversationGroupInternal(conversation));
}

export async function prepareEncryptedText({ conversation, text, replyToId = null, threadRootId = null, silent = false, clientId = crypto.randomUUID() }) {
  return serializeConversationOperation(conversation.id, async () => {
    const { device, local, remote } = await ensureConversationGroupInternal(conversation);
    const createdAt = new Date().toISOString();
    const content = { version: 1, type: "text", text: String(text), replyToId, threadRootId };
    const authenticatedData = {
      version: 1,
      conversationId: conversation.id,
      clientId,
      senderUserId: current().userId,
      senderDeviceId: device.id,
      createdAt,
    };
    const encrypted = await encryptApplicationMessage({
      state: local.state,
      content,
      authenticatedData,
      resolveDevice: resolveTrustedDevice,
    });
    const messageHash = await sha256Hex(encrypted.message);
    await persistGroup(conversation.id, remote.id, encrypted.state, encrypted.publicStateHash);
    await saveDecryptedContent(current().serverId, current().userId, messageHash, content);
    return {
      id: clientId,
      kind: "mls-message",
      conversationId: conversation.id,
      createdAt,
      state: "queued",
      attempts: 0,
      nextAttemptAt: createdAt,
      payload: {
        conversationId: conversation.id,
        clientId,
        deviceId: device.id,
        groupRecordId: remote.id,
        epoch: encrypted.epoch,
        generation: null,
        contentType: "text",
        message: toBase64(encrypted.message),
        authenticatedDataHash: encrypted.authenticatedDataHash,
        silent: Boolean(silent),
      },
    };
  });
}

export async function prepareEncryptedEdit({ conversation, messageId, text }) {
  return serializeConversationOperation(conversation.id, async () => {
    const { device, local, remote } = await ensureConversationGroupInternal(conversation);
    const createdAt = new Date().toISOString();
    const content = { version: 1, type: "text", operation: "edit", messageId: String(messageId), text: String(text) };
    const authenticatedData = {
      version: 1,
      operation: "edit",
      targetMessageId: String(messageId),
      conversationId: conversation.id,
      senderUserId: current().userId,
      senderDeviceId: device.id,
      createdAt,
    };
    const encrypted = await encryptApplicationMessage({
      state: local.state,
      content,
      authenticatedData,
      resolveDevice: resolveTrustedDevice,
    });
    const messageHash = await sha256Hex(encrypted.message);
    await persistGroup(conversation.id, remote.id, encrypted.state, encrypted.publicStateHash);
    await saveDecryptedContent(current().serverId, current().userId, messageHash, content);
    return {
      conversationId: conversation.id,
      messageId: String(messageId),
      deviceId: device.id,
      groupRecordId: remote.id,
      epoch: encrypted.epoch,
      generation: null,
      contentType: "text",
      message: toBase64(encrypted.message),
      authenticatedDataHash: encrypted.authenticatedDataHash,
    };
  });
}

export async function processCommitEvent(event) {
  if (!event?.groupId || !Number.isFinite(Number(event.epoch))) return false;
  const group = await loadLocalGroup(event.conversationId);
  if (!group || group.groupRecordId !== event.groupId || group.epoch >= Number(event.epoch)) return false;
  return serializeConversationOperation(event.conversationId, async () => {
    const currentGroup = await loadLocalGroup(event.conversationId);
    if (!currentGroup || currentGroup.epoch >= Number(event.epoch)) return false;
    const processed = await processCommitMessage({ state: currentGroup.state, commitBytes: fromBase64(event.commit), resolveDevice: resolveTrustedDevice });
    await persistGroup(event.conversationId, event.groupId, processed.state, processed.publicStateHash);
    return true;
  });
}

export async function decryptServerMessage(message) {
  if (message?.type !== "encrypted" || !message?.encryption?.ciphertext) return message;
  const envelope = message.encryption;
  const cached = await loadDecryptedContent(current().serverId, current().userId, envelope.messageHash);
  if (cached) return { ...message, type: cached.type || "text", text: cached.text || "", replyToId: cached.replyToId || null, threadRootId: cached.threadRootId || null, e2ee: true, encryptedContentType: cached.type || "text" };
  return serializeConversationOperation(message.conversationId, async () => {
    const secondCached = await loadDecryptedContent(current().serverId, current().userId, envelope.messageHash);
    if (secondCached) return { ...message, type: secondCached.type || "text", text: secondCached.text || "", e2ee: true };
    const local = await loadLocalGroup(message.conversationId);
    if (!local) return { ...message, type: "encrypted", text: "Не удалось получить ключ этой MLS epoch.", decryptionError: "MLS_STATE_UNAVAILABLE", e2ee: true };
    try {
      const decrypted = await decryptApplicationMessage({ state: local.state, messageBytes: fromBase64(envelope.ciphertext), resolveDevice: resolveTrustedDevice });
      if (decrypted.authenticatedData?.conversationId !== message.conversationId
        || decrypted.authenticatedData?.senderUserId !== message.sender?.id
        || decrypted.authenticatedData?.senderDeviceId !== envelope.senderDeviceId) {
        throw Object.assign(new Error("MLS authenticated data не соответствует серверному envelope."), { code: "MLS_AAD_SCOPE_INVALID" });
      }
      await persistGroup(message.conversationId, envelope.groupRecordId, decrypted.state, decrypted.publicStateHash);
      await saveDecryptedContent(current().serverId, current().userId, envelope.messageHash, decrypted.content);
      return {
        ...message,
        type: decrypted.content.type || "text",
        text: decrypted.content.text || "",
        replyToId: decrypted.content.replyToId || null,
        threadRootId: decrypted.content.threadRootId || null,
        e2ee: true,
        encryptedContentType: decrypted.content.type || "text",
      };
    } catch (error) {
      return { ...message, type: "encrypted", text: "Защищённое сообщение не удалось расшифровать.", decryptionError: error.code || error.message, e2ee: true };
    }
  });
}

export async function decryptServerMessages(messages) {
  const results = [];
  for (const message of messages || []) results.push(await decryptServerMessage(message));
  return results;
}

export function redactDecryptedForCache(messages) {
  return (messages || []).map((message) => message?.e2ee ? { ...message, type: "encrypted", text: "", replyToId: null, threadRootId: null } : message);
}

export function saveE2eeDraft(conversationId, text) {
  return saveEncryptedDraft(current().serverId, current().userId, conversationId, text);
}

export function loadE2eeDraft(conversationId) {
  return loadEncryptedDraft(current().serverId, current().userId, conversationId);
}

export async function trustStatus() {
  const device = await ensureTrustDevice();
  const remote = await trustApi("/status");
  return { device, trust: remote.trust };
}
