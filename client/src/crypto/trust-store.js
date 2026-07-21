const DB_NAME = "nexora-trust-core";
const DB_VERSION = 2;
const STORES = Object.freeze({
  meta: "meta",
  devices: "devices",
  packages: "keyPackages",
  groups: "groups",
  messages: "messages",
  drafts: "drafts",
});

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

let databasePromise;

export function openTrustDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("TRUST_STORAGE_UNAVAILABLE"));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORES.meta)) database.createObjectStore(STORES.meta, { keyPath: "key" });
      if (!database.objectStoreNames.contains(STORES.devices)) database.createObjectStore(STORES.devices, { keyPath: "key" });
      for (const name of [STORES.packages, STORES.groups, STORES.messages, STORES.drafts]) {
        if (database.objectStoreNames.contains(name)) continue;
        const store = database.createObjectStore(name, { keyPath: "key" });
        store.createIndex("scope", "scope", { unique: false });
        if ([STORES.packages, STORES.messages].includes(name)) store.createIndex("expiresAt", "expiresAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("TRUST_STORAGE_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("TRUST_STORAGE_BLOCKED"));
  });
  return databasePromise;
}

function scopeKey(serverId, userId) {
  if (!serverId || !userId) throw new Error("TRUST_SCOPE_REQUIRED");
  return `${String(serverId)}:${String(userId)}`;
}

function recordKey(scope, id) {
  return `${scope}:${String(id)}`;
}

function bytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function utf8(value) {
  return new TextEncoder().encode(String(value));
}

async function getOrCreateWrappingKey(database, scope) {
  const keyName = `wrapping:${scope}`;
  const read = database.transaction(STORES.meta, "readonly");
  const existing = await requestPromise(read.objectStore(STORES.meta).get(keyName));
  await transactionDone(read);
  if (existing?.cryptoKey) return existing.cryptoKey;
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const write = database.transaction(STORES.meta, "readwrite");
  write.objectStore(STORES.meta).put({ key: keyName, cryptoKey, createdAt: new Date().toISOString() });
  await transactionDone(write);
  return cryptoKey;
}

async function seal(database, scope, value, aad) {
  const key = await getOrCreateWrappingKey(database, scope);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad), tagLength: 128 }, key, bytes(value));
  return { version: 1, iv, ciphertext: new Uint8Array(ciphertext) };
}

async function unseal(database, scope, value, aad) {
  if (!value || value.version !== 1) throw new Error("TRUST_STORAGE_FORMAT_INVALID");
  const key = await getOrCreateWrappingKey(database, scope);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv, additionalData: utf8(aad), tagLength: 128 }, key, value.ciphertext);
  return new Uint8Array(plaintext);
}

export async function loadDevice(serverId, userId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const transaction = database.transaction(STORES.devices, "readonly");
  const value = await requestPromise(transaction.objectStore(STORES.devices).get(scope));
  await transactionDone(transaction);
  if (!value) return null;
  const result = { ...value, key: undefined };
  if (value.signaturePrivateKeySealed) {
    result.signaturePrivateKey = await unseal(database, scope, value.signaturePrivateKeySealed, `${scope}:device-signature-key`);
  }
  delete result.signaturePrivateKeySealed;
  return result;
}

export async function saveDevice(serverId, userId, device) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const record = { ...structuredClone(device), key: scope, scope, updatedAt: new Date().toISOString() };
  if (device.signaturePrivateKey) {
    record.signaturePrivateKeySealed = await seal(database, scope, device.signaturePrivateKey, `${scope}:device-signature-key`);
    delete record.signaturePrivateKey;
  }
  const transaction = database.transaction(STORES.devices, "readwrite");
  transaction.objectStore(STORES.devices).put(record);
  await transactionDone(transaction);
  return loadDevice(serverId, userId);
}

export async function saveKeyPackage(serverId, userId, item) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, item.packageHash);
  const privatePackage = await seal(database, scope, item.privatePackage, `${key}:private`);
  const publicPackage = await seal(database, scope, item.publicPackage, `${key}:public`);
  const transaction = database.transaction(STORES.packages, "readwrite");
  transaction.objectStore(STORES.packages).put({
    key, scope, packageHash: item.packageHash, serverPackageId: item.serverPackageId || null,
    publicPackage, privatePackage, createdAt: item.createdAt || new Date().toISOString(), expiresAt: item.expiresAt,
  });
  await transactionDone(transaction);
}

export async function listKeyPackages(serverId, userId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const transaction = database.transaction(STORES.packages, "readonly");
  const rows = await requestPromise(transaction.objectStore(STORES.packages).index("scope").getAll(IDBKeyRange.only(scope)));
  await transactionDone(transaction);
  const now = Date.now();
  const results = [];
  for (const row of rows) {
    if (Date.parse(row.expiresAt) <= now) continue;
    try {
      results.push({
        packageHash: row.packageHash,
        serverPackageId: row.serverPackageId,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        publicPackage: await unseal(database, scope, row.publicPackage, `${row.key}:public`),
        privatePackage: await unseal(database, scope, row.privatePackage, `${row.key}:private`),
      });
    } catch {
      // Corrupt encrypted state is ignored and removed by cleanup.
    }
  }
  return results.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function deleteKeyPackage(serverId, userId, packageHash) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const transaction = database.transaction(STORES.packages, "readwrite");
  transaction.objectStore(STORES.packages).delete(recordKey(scope, packageHash));
  await transactionDone(transaction);
}

export async function cleanupKeyPackages(serverId, userId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const transaction = database.transaction(STORES.packages, "readwrite");
  const store = transaction.objectStore(STORES.packages);
  const rows = await requestPromise(store.index("scope").getAll(IDBKeyRange.only(scope)));
  const now = Date.now();
  for (const row of rows) if (Date.parse(row.expiresAt) <= now) store.delete(row.key);
  await transactionDone(transaction);
}

export async function saveGroupState(serverId, userId, conversationId, stateBytes, metadata = {}) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, conversationId);
  const sealed = await seal(database, scope, stateBytes, `${key}:state`);
  const transaction = database.transaction(STORES.groups, "readwrite");
  transaction.objectStore(STORES.groups).put({
    key, scope, conversationId: String(conversationId), sealed,
    groupRecordId: metadata.groupRecordId || null, protocolGroupId: metadata.protocolGroupId || null,
    epoch: Number(metadata.epoch || 0), publicStateHash: metadata.publicStateHash || null,
    createdAt: metadata.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  await transactionDone(transaction);
}

export async function loadGroupState(serverId, userId, conversationId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, conversationId);
  const transaction = database.transaction(STORES.groups, "readonly");
  const row = await requestPromise(transaction.objectStore(STORES.groups).get(key));
  await transactionDone(transaction);
  if (!row) return null;
  return {
    conversationId: row.conversationId,
    groupRecordId: row.groupRecordId,
    protocolGroupId: row.protocolGroupId,
    epoch: Number(row.epoch || 0),
    publicStateHash: row.publicStateHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stateBytes: await unseal(database, scope, row.sealed, `${key}:state`),
  };
}

export async function deleteGroupState(serverId, userId, conversationId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const transaction = database.transaction(STORES.groups, "readwrite");
  transaction.objectStore(STORES.groups).delete(recordKey(scope, conversationId));
  await transactionDone(transaction);
}

export async function saveDecryptedContent(serverId, userId, messageHash, content, expiresAt = null) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, messageHash);
  const sealed = await seal(database, scope, utf8(JSON.stringify(content)), `${key}:content`);
  const transaction = database.transaction(STORES.messages, "readwrite");
  transaction.objectStore(STORES.messages).put({
    key, scope, messageHash: String(messageHash), sealed,
    createdAt: new Date().toISOString(), expiresAt: expiresAt || new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString(),
  });
  await transactionDone(transaction);
}

export async function loadDecryptedContent(serverId, userId, messageHash) {
  if (!messageHash) return null;
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, messageHash);
  const transaction = database.transaction(STORES.messages, "readonly");
  const row = await requestPromise(transaction.objectStore(STORES.messages).get(key));
  await transactionDone(transaction);
  if (!row || Date.parse(row.expiresAt) <= Date.now()) return null;
  try { return JSON.parse(new TextDecoder().decode(await unseal(database, scope, row.sealed, `${key}:content`))); }
  catch { return null; }
}

export async function saveEncryptedDraft(serverId, userId, conversationId, text) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, conversationId);
  const transaction = database.transaction(STORES.drafts, "readwrite");
  if (!text) {
    transaction.objectStore(STORES.drafts).delete(key);
  } else {
    const sealed = await seal(database, scope, utf8(String(text)), `${key}:draft`);
    transaction.objectStore(STORES.drafts).put({ key, scope, conversationId: String(conversationId), sealed, updatedAt: new Date().toISOString() });
  }
  await transactionDone(transaction);
}

export async function loadEncryptedDraft(serverId, userId, conversationId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const key = recordKey(scope, conversationId);
  const transaction = database.transaction(STORES.drafts, "readonly");
  const row = await requestPromise(transaction.objectStore(STORES.drafts).get(key));
  await transactionDone(transaction);
  if (!row) return "";
  try { return new TextDecoder().decode(await unseal(database, scope, row.sealed, `${key}:draft`)); }
  catch { return ""; }
}

export async function clearTrustScope(serverId, userId) {
  const database = await openTrustDatabase();
  const scope = scopeKey(serverId, userId);
  const names = Object.values(STORES);
  const transaction = database.transaction(names, "readwrite");
  transaction.objectStore(STORES.meta).delete(`wrapping:${scope}`);
  transaction.objectStore(STORES.devices).delete(scope);
  for (const name of [STORES.packages, STORES.groups, STORES.messages, STORES.drafts]) {
    const store = transaction.objectStore(name);
    const rows = await requestPromise(store.index("scope").getAllKeys(IDBKeyRange.only(scope)));
    for (const key of rows) store.delete(key);
  }
  await transactionDone(transaction);
}
