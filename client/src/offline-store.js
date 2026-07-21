const DATABASE = "nexora-offline-v3";
const VERSION = 1;
const STORE = "records";

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function operation(mode, callback) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = callback(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

function scoped(type, userId, id = "") {
  return `${location.origin}:${type}:${userId || "anonymous"}:${id}`;
}

export async function cacheBootstrap(value) {
  if (!value?.me?.id || !value?.server?.id) return;
  const record = { key: scoped("bootstrap", value.me.id, value.server.id), value, updatedAt: new Date().toISOString() };
  await operation("readwrite", (store) => store.put(record));
  await operation("readwrite", (store) => store.put({ key: scoped("last-bootstrap", "local"), value: record.key, updatedAt: record.updatedAt }));
}

export async function readLastBootstrap() {
  const pointer = await operation("readonly", (store) => store.get(scoped("last-bootstrap", "local"))).catch(() => null);
  if (!pointer?.value) return null;
  const record = await operation("readonly", (store) => store.get(pointer.value)).catch(() => null);
  return record?.value ?? null;
}

export async function cacheMessages(userId, conversationId, messages) {
  if (!userId || !conversationId || !Array.isArray(messages)) return;
  await operation("readwrite", (store) => store.put({ key: scoped("messages", userId, conversationId), value: messages.slice(-500), updatedAt: new Date().toISOString() }));
}

export async function readCachedMessages(userId, conversationId) {
  const record = await operation("readonly", (store) => store.get(scoped("messages", userId, conversationId))).catch(() => null);
  return Array.isArray(record?.value) ? record.value : [];
}

export function syncSequenceKey(serverId, userId) {
  return `nexora:sync:${serverId}:${userId}`;
}
