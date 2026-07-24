const DATABASE = "nexora-offline-v3";
const VERSION = 2;
const STORE = "records";
const ACTIVE_SERVER_PREFIX = "nexora:active-server:";

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
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error("IndexedDB transaction aborted")); };
  });
}

function cleanScopePart(value, fallback) {
  const candidate = String(value || "").trim();
  return candidate ? encodeURIComponent(candidate.slice(0, 200)) : fallback;
}

function activeServerId(userId) {
  try {
    return localStorage.getItem(`${ACTIVE_SERVER_PREFIX}${String(userId || "anonymous")}`) || location.origin;
  } catch {
    return location.origin;
  }
}

export function setActiveProfileScope(serverId, userId) {
  if (!serverId || !userId) return;
  try {
    localStorage.setItem(`${ACTIVE_SERVER_PREFIX}${String(userId)}`, String(serverId));
  } catch {}
}

export function clearActiveProfileScope(userId) {
  if (!userId) return;
  try { localStorage.removeItem(`${ACTIVE_SERVER_PREFIX}${String(userId)}`); } catch {}
}

export function profileScope(serverId, userId) {
  return {
    origin: location.origin,
    serverId: String(serverId || activeServerId(userId)),
    userId: String(userId || "anonymous"),
  };
}

function scoped(type, scope, id = "") {
  const value = scope || profileScope(null, null);
  return [
    "nexora",
    cleanScopePart(value.origin || location.origin, "origin"),
    cleanScopePart(value.serverId, "server"),
    cleanScopePart(value.userId, "anonymous"),
    cleanScopePart(type, "record"),
    cleanScopePart(id, "default"),
  ].join(":");
}

function bootstrapPointerKey() {
  return `nexora:${cleanScopePart(location.origin, "origin")}:last-bootstrap`;
}

export async function cacheBootstrap(value) {
  if (!value?.me?.id || !value?.server?.id) return;
  const scope = profileScope(value.server.id, value.me.id);
  setActiveProfileScope(scope.serverId, scope.userId);
  const record = { key: scoped("bootstrap", scope, value.server.id), scope, value, updatedAt: new Date().toISOString() };
  await operation("readwrite", (store) => store.put(record));
  await operation("readwrite", (store) => store.put({
    key: bootstrapPointerKey(),
    value: { key: record.key, serverId: scope.serverId, userId: scope.userId },
    updatedAt: record.updatedAt,
  }));
}

export async function readLastBootstrap(expected = {}) {
  const pointer = await operation("readonly", (store) => store.get(bootstrapPointerKey())).catch(() => null);
  const reference = pointer?.value;
  if (!reference?.key) return null;
  if (expected.serverId && String(expected.serverId) !== String(reference.serverId)) return null;
  if (expected.userId && String(expected.userId) !== String(reference.userId)) return null;
  const record = await operation("readonly", (store) => store.get(reference.key)).catch(() => null);
  if (!record?.value?.me?.id || !record?.value?.server?.id) return null;
  if (record.value.me.id !== reference.userId || record.value.server.id !== reference.serverId) return null;
  setActiveProfileScope(reference.serverId, reference.userId);
  return record.value;
}

export async function cacheMessages(userId, conversationId, messages, serverId) {
  if (!userId || !conversationId || !Array.isArray(messages)) return;
  const scope = profileScope(serverId, userId);
  await operation("readwrite", (store) => store.put({
    key: scoped("messages", scope, conversationId),
    scope,
    value: messages.slice(-500),
    updatedAt: new Date().toISOString(),
  }));
}

export async function readCachedMessages(userId, conversationId, serverId) {
  const scope = profileScope(serverId, userId);
  const record = await operation("readonly", (store) => store.get(scoped("messages", scope, conversationId))).catch(() => null);
  return Array.isArray(record?.value) ? record.value : [];
}

export function syncSequenceKey(serverId, userId) {
  return scoped("sync-sequence", profileScope(serverId, userId));
}

export async function readSyncSequence(serverId, userId, fallback = 0) {
  const scope = profileScope(serverId, userId);
  const record = await operation("readonly", (store) => store.get(scoped("sync-sequence", scope))).catch(() => null);
  return Math.max(0, Number(record?.value ?? fallback) || 0);
}

export async function writeSyncSequence(serverId, userId, sequence) {
  const scope = profileScope(serverId, userId);
  const value = Math.max(0, Number(sequence) || 0);
  await operation("readwrite", (store) => store.put({
    key: scoped("sync-sequence", scope),
    scope,
    value,
    updatedAt: new Date().toISOString(),
  }));
  return value;
}

export async function cacheDraft(serverId, userId, conversationId, draft) {
  if (!serverId || !userId || !conversationId) return;
  const scope = profileScope(serverId, userId);
  const key = scoped("draft", scope, conversationId);
  if (!draft) {
    await operation("readwrite", (store) => store.delete(key));
    return;
  }
  await operation("readwrite", (store) => store.put({ key, scope, value: draft, updatedAt: new Date().toISOString() }));
}

export async function readDraft(serverId, userId, conversationId) {
  const scope = profileScope(serverId, userId);
  const record = await operation("readonly", (store) => store.get(scoped("draft", scope, conversationId))).catch(() => null);
  return record?.value ?? null;
}

export async function clearProfileCache(serverId, userId, { includeBootstrap = true } = {}) {
  const scope = profileScope(serverId, userId);
  const database = await openDatabase();
  if (!database) return 0;
  return new Promise((resolve, reject) => {
    let removed = 0;
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const record = current.value;
      const sameScope = record?.scope?.serverId === scope.serverId && record?.scope?.userId === scope.userId;
      const allowed = includeBootstrap || !String(record?.key || "").includes(":bootstrap:");
      if (sameScope && allowed) { current.delete(); removed += 1; }
      current.continue();
    };
    cursor.onerror = () => reject(cursor.error);
    transaction.oncomplete = () => { database.close(); resolve(removed); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function localSyncDiagnostics(serverId, userId) {
  const scope = profileScope(serverId, userId);
  const sequence = await readSyncSequence(serverId, userId, 0);
  const database = await openDatabase();
  if (!database) return { sequence, cacheRecords: 0, approximateBytes: 0 };
  return new Promise((resolve, reject) => {
    let cacheRecords = 0;
    let approximateBytes = 0;
    const transaction = database.transaction(STORE, "readonly");
    const cursor = transaction.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      const record = current.value;
      if (record?.scope?.serverId === scope.serverId && record?.scope?.userId === scope.userId) {
        cacheRecords += 1;
        approximateBytes += new Blob([JSON.stringify(record)]).size;
      }
      current.continue();
    };
    cursor.onerror = () => reject(cursor.error);
    transaction.oncomplete = () => { database.close(); resolve({ sequence, cacheRecords, approximateBytes }); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
