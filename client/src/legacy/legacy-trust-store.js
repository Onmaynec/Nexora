const DB_NAME = "nexora-trust-core";
const META_STORE = "meta";
const MESSAGE_STORE = "messages";

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("LEGACY_STORAGE_READ_FAILED"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("LEGACY_STORAGE_TRANSACTION_ABORTED"));
    transaction.onerror = () => reject(transaction.error || new Error("LEGACY_STORAGE_TRANSACTION_FAILED"));
  });
}

function scopeKey(serverId, userId) {
  if (!serverId || !userId) return null;
  return `${String(serverId)}:${String(userId)}`;
}

function recordKey(scope, messageHash) {
  return `${scope}:${String(messageHash)}`;
}

function utf8(value) {
  return new TextEncoder().encode(String(value));
}

async function openExistingDatabase() {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) return null;
  if (typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases().catch(() => []);
    if (!databases.some((database) => database.name === DB_NAME)) return null;
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    let created = false;
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        resolve(null);
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => {
      if (created || request.error?.name === "AbortError") resolve(null);
      else reject(request.error || new Error("LEGACY_STORAGE_OPEN_FAILED"));
    };
    request.onblocked = () => reject(new Error("LEGACY_STORAGE_BLOCKED"));
  });
}

async function wrappingKey(database, scope) {
  if (!database.objectStoreNames.contains(META_STORE)) return null;
  const transaction = database.transaction(META_STORE, "readonly");
  const record = await requestPromise(transaction.objectStore(META_STORE).get(`wrapping:${scope}`));
  await transactionDone(transaction);
  return record?.cryptoKey || null;
}

async function unseal(key, value, aad) {
  if (!key || !value || value.version !== 1) return null;
  try {
    const plaintext = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: value.iv,
      additionalData: utf8(aad),
      tagLength: 128,
    }, key, value.ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

export async function loadLegacyDecryptedContent(serverId, userId, messageHash) {
  if (!messageHash) return null;
  const scope = scopeKey(serverId, userId);
  if (!scope) return null;
  const database = await openExistingDatabase();
  if (!database) return null;
  try {
    if (!database.objectStoreNames.contains(MESSAGE_STORE)) return null;
    const key = recordKey(scope, messageHash);
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const row = await requestPromise(transaction.objectStore(MESSAGE_STORE).get(key));
    await transactionDone(transaction);
    if (!row || (row.expiresAt && Date.parse(row.expiresAt) <= Date.now())) return null;
    return unseal(await wrappingKey(database, scope), row.sealed, `${key}:content`);
  } finally {
    database.close();
  }
}

export async function loadLegacyDecryptedContents(serverId, userId, messages) {
  const entries = await Promise.all((messages || []).map(async (message) => [
    message.id,
    await loadLegacyDecryptedContent(serverId, userId, message.messageHash),
  ]));
  return Object.fromEntries(entries.filter(([, content]) => content != null));
}
