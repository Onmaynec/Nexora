const DATABASE_NAME = "nexora-trust-v1";
const DATABASE_VERSION = 1;
const KEY_STORE = "keys";
const RECORD_STORE = "records";
const DEVICE_KEY_ID = "device-state-key";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requestResult(request) {
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

export async function openTrustDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) throw Object.assign(new Error("IndexedDB недоступен."), { code: "TRUST_STORAGE_UNAVAILABLE" });
  const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE);
    if (!database.objectStoreNames.contains(RECORD_STORE)) database.createObjectStore(RECORD_STORE);
  };
  return requestResult(request);
}

export async function encryptJson(key, name, value, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw Object.assign(new Error("Web Crypto недоступен."), { code: "TRUST_CRYPTO_UNAVAILABLE" });
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(String(name)), tagLength: 128 },
    key,
    plaintext,
  );
  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  };
}

export async function decryptJson(key, name, envelope, cryptoImpl = globalThis.crypto) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== "AES-GCM") {
    throw Object.assign(new Error("Версия encrypted Trust state не поддерживается."), { code: "TRUST_STATE_VERSION_UNSUPPORTED" });
  }
  try {
    const plaintext = await cryptoImpl.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(envelope.iv),
        additionalData: encoder.encode(String(name)),
        tagLength: 128,
      },
      key,
      new Uint8Array(envelope.ciphertext),
    );
    return JSON.parse(decoder.decode(plaintext));
  } catch (error) {
    throw Object.assign(new Error("Encrypted Trust state повреждён или относится к другому устройству."), {
      code: "TRUST_STATE_DECRYPT_FAILED",
      cause: error,
    });
  }
}

export async function getOrCreateDeviceKey(database, cryptoImpl = globalThis.crypto) {
  let transaction = database.transaction(KEY_STORE, "readonly");
  let key = await requestResult(transaction.objectStore(KEY_STORE).get(DEVICE_KEY_ID));
  await transactionDone(transaction);
  if (key) return key;

  key = await cryptoImpl.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  transaction = database.transaction(KEY_STORE, "readwrite");
  transaction.objectStore(KEY_STORE).put(key, DEVICE_KEY_ID);
  await transactionDone(transaction);
  return key;
}

export async function writeTrustRecord(name, value, options = {}) {
  const database = options.database || await openTrustDatabase(options.indexedDB);
  try {
    const key = await getOrCreateDeviceKey(database, options.crypto || globalThis.crypto);
    const envelope = await encryptJson(key, name, value, options.crypto || globalThis.crypto);
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    transaction.objectStore(RECORD_STORE).put(envelope, String(name));
    await transactionDone(transaction);
    return envelope.updatedAt;
  } finally {
    if (!options.database) database.close();
  }
}

export async function readTrustRecord(name, options = {}) {
  const database = options.database || await openTrustDatabase(options.indexedDB);
  try {
    const transaction = database.transaction(RECORD_STORE, "readonly");
    const envelope = await requestResult(transaction.objectStore(RECORD_STORE).get(String(name)));
    await transactionDone(transaction);
    if (!envelope) return null;
    const key = await getOrCreateDeviceKey(database, options.crypto || globalThis.crypto);
    return decryptJson(key, name, envelope, options.crypto || globalThis.crypto);
  } finally {
    if (!options.database) database.close();
  }
}

export async function removeTrustRecord(name, options = {}) {
  const database = options.database || await openTrustDatabase(options.indexedDB);
  try {
    const transaction = database.transaction(RECORD_STORE, "readwrite");
    transaction.objectStore(RECORD_STORE).delete(String(name));
    await transactionDone(transaction);
  } finally {
    if (!options.database) database.close();
  }
}

export async function resetTrustState(options = {}) {
  const database = options.database || await openTrustDatabase(options.indexedDB);
  try {
    const transaction = database.transaction([KEY_STORE, RECORD_STORE], "readwrite");
    transaction.objectStore(KEY_STORE).clear();
    transaction.objectStore(RECORD_STORE).clear();
    await transactionDone(transaction);
  } finally {
    if (!options.database) database.close();
  }
}

export const TRUST_STORAGE = Object.freeze({
  database: DATABASE_NAME,
  version: DATABASE_VERSION,
  keyStore: KEY_STORE,
  recordStore: RECORD_STORE,
});
