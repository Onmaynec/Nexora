export class ApiError extends Error {
  constructor(message, status, code, details = {}, requestId = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId || details?.requestId || null;
  }
}

export const CLIENT_VERSION = "3.5.0";
const DEVICE_ID_KEY = "nexora:device-id";
const RESUMABLE_THRESHOLD = 256 * 1024;

function safeStorage(name) {
  try {
    const storage = globalThis?.[name];
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") return storage;
  } catch {}
  return null;
}

function createDeviceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

const localStore = safeStorage("localStorage");
const sessionStore = safeStorage("sessionStorage");
const userAgent = String(globalThis.navigator?.userAgent || "");
export const DEVICE_ID = localStore?.getItem(DEVICE_ID_KEY) || createDeviceId();
try { localStore?.setItem(DEVICE_ID_KEY, DEVICE_ID); } catch {}
const DEVICE_NAME = /Electron/i.test(userAgent) ? "Nexora Client" : "Nexora Web";
const DEVICE_PLATFORM = /Android/i.test(userAgent) ? "android" : /Electron|Windows/i.test(userAgent) ? "windows" : "web";
let csrfToken = sessionStore?.getItem("nexora:csrf") || "";
const recoveryRequests = new Map();
const WELCOME_CLAIM_MIN_INTERVAL_MS = 2_000;
const WELCOME_REQUEST_MIN_INTERVAL_MS = 8_000;

export function setCsrfToken(value) {
  csrfToken = String(value || "");
  try {
    if (csrfToken) sessionStore?.setItem("nexora:csrf", csrfToken);
    else sessionStore?.removeItem("nexora:csrf");
  } catch {}
}

export function clearCsrfToken() {
  setCsrfToken("");
  recoveryRequests.clear();
}

function recoveryPolicy(path, method) {
  const value = String(path || "");
  if (String(method || "GET").toUpperCase() !== "POST") return null;
  if (/^\/api\/v4\/trust\/conversations\/[^/]+\/welcome\/claim(?:\?|$)/.test(value)) {
    return { key: value.split("?")[0], intervalMs: WELCOME_CLAIM_MIN_INTERVAL_MS, empty: { ok: true, welcome: null, deferred: true } };
  }
  if (/^\/api\/v4\/trust\/conversations\/[^/]+\/welcome\/request(?:\?|$)/.test(value)) {
    return { key: value.split("?")[0], intervalMs: WELCOME_REQUEST_MIN_INTERVAL_MS, empty: { ok: true, requested: false, deferred: true } };
  }
  return null;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body instanceof FormData || options.body instanceof Blob ? {} : { "Content-Type": "application/json" }),
      "X-Nexora-Client-Version": CLIENT_VERSION,
      "X-Nexora-Device-ID": DEVICE_ID,
      "X-Nexora-Device-Name": DEVICE_NAME,
      "X-Nexora-Platform": DEVICE_PLATFORM,
      ...(!["GET", "HEAD"].includes(String(options.method || "GET").toUpperCase()) && csrfToken ? { "X-Nexora-CSRF": csrfToken } : {}),
      ...(options.headers ?? {}),
    },
  });
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : null;
  if (body?.csrfToken) setCsrfToken(body.csrfToken);
  if (!response.ok) {
    const retryAfter = Math.max(0, Number(response.headers.get("retry-after")) || Number(body?.details?.retryAfter) || 0);
    throw new ApiError(body?.message ?? body?.error ?? `Ошибка ${response.status}`, response.status, body?.code, {
      ...(body?.details || {}),
      ...(retryAfter ? { retryAfter } : {}),
      ...(body?.requestId ? { requestId: body.requestId } : {}),
    }, body?.requestId || response.headers.get("x-request-id"));
  }
  return body;
}

export async function api(path, options = {}) {
  const policy = recoveryPolicy(path, options.method);
  if (!policy) return request(path, options);

  const now = Date.now();
  const current = recoveryRequests.get(policy.key);
  if (current?.promise) return current.promise;
  if (current?.nextAt > now) return policy.empty;

  const promise = request(path, options)
    .then((value) => {
      recoveryRequests.set(policy.key, { nextAt: Date.now() + policy.intervalMs, promise: null });
      return value;
    })
    .catch((error) => {
      const retryAfterMs = error.code === "RATE_LIMITED"
        ? Math.max(policy.intervalMs, Number(error.details?.retryAfter || 0) * 1_000)
        : policy.intervalMs;
      recoveryRequests.set(policy.key, { nextAt: Date.now() + retryAfterMs, promise: null });
      if (error.code === "RATE_LIMITED") return { ...policy.empty, rateLimited: true, retryAfter: Math.ceil(retryAfterMs / 1_000) };
      throw error;
    });
  recoveryRequests.set(policy.key, { nextAt: now + policy.intervalMs, promise });
  return promise;
}

export function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export function patch(path, body) {
  return api(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
}

export function remove(path, body) {
  return api(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256File(file) {
  if (!globalThis.crypto?.subtle) return null;
  return hex(await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
}

function uploadIdempotencyKey(value) {
  if (value && /^[A-Za-z0-9_.:-]{8,160}$/.test(String(value))) return String(value);
  return globalThis.crypto?.randomUUID?.() ?? `upload-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

async function cancelResumable(conversationId, sessionId) {
  if (!sessionId) return;
  await api(`/api/conversations/${encodeURIComponent(conversationId)}/uploads/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch((error) => {
    if (!["RESOURCE_NOT_FOUND", "STATE_CONFLICT"].includes(error.code)) console.debug("Resumable upload cancel deferred", error);
  });
}

async function resumableUpload(conversationId, file, kind, duration, caption, options) {
  const idempotencyKey = uploadIdempotencyKey(options.uploadId);
  let sessionId = null;
  try {
    const fileHash = await sha256File(file);
    const init = await api(`/api/conversations/${encodeURIComponent(conversationId)}/uploads/init`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
        kind,
        sha256: fileHash,
      }),
      signal: options.signal,
    });
    const upload = init.upload;
    sessionId = upload.id;
    const chunkBytes = Math.max(64 * 1024, Number(init.chunkBytes) || 1024 * 1024);
    let offset = Math.max(0, Number(upload.confirmedOffset) || 0);
    if (offset > file.size) throw new ApiError("Сервер подтвердил недопустимый offset.", 409, "UPLOAD_OFFSET_MISMATCH", { confirmedOffset: offset });
    options.onProgress?.(Math.min(100, Math.round(offset / file.size * 100)), offset, file.size);

    while (offset < file.size) {
      if (options.signal?.aborted) throw Object.assign(new Error("Загрузка отменена."), { code: "UPLOAD_ABORTED" });
      const chunk = file.slice(offset, Math.min(file.size, offset + chunkBytes));
      let result;
      try {
        result = await api(`/api/conversations/${encodeURIComponent(conversationId)}/uploads/${encodeURIComponent(sessionId)}/chunks`, {
          method: "PUT",
          body: chunk,
          signal: options.signal,
          headers: {
            "Content-Type": "application/octet-stream",
            "Upload-Offset": String(offset),
          },
        });
      } catch (error) {
        if (error.code === "UPLOAD_OFFSET_MISMATCH" && Number.isSafeInteger(Number(error.details?.confirmedOffset))) {
          const confirmed = Number(error.details.confirmedOffset);
          if (confirmed >= 0 && confirmed <= file.size && confirmed !== offset) {
            offset = confirmed;
            options.onProgress?.(Math.min(100, Math.round(offset / file.size * 100)), offset, file.size);
            continue;
          }
        }
        throw error;
      }
      const confirmed = Number(result.confirmedOffset);
      if (!Number.isSafeInteger(confirmed) || confirmed <= offset || confirmed > file.size) {
        throw new ApiError("Сервер не подтвердил корректный offset.", 409, "UPLOAD_OFFSET_MISMATCH", { confirmedOffset: confirmed });
      }
      offset = confirmed;
      options.onProgress?.(Math.min(100, Math.round(offset / file.size * 100)), offset, file.size);
    }

    return api(`/api/conversations/${encodeURIComponent(conversationId)}/uploads/${encodeURIComponent(sessionId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ caption, duration, waveform: options.waveform || [] }),
      signal: options.signal,
    });
  } catch (error) {
    const aborted = error.name === "AbortError" || error.code === "UPLOAD_ABORTED" || options.signal?.aborted;
    if (aborted) {
      await cancelResumable(conversationId, sessionId);
      error.code = "UPLOAD_ABORTED";
    } else {
      error.uploadId = idempotencyKey;
      error.uploadSessionId = sessionId;
    }
    throw error;
  }
}

function directUpload(conversationId, file, kind, duration, caption, options) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  body.append("duration", String(duration));
  body.append("caption", caption);
  if (Array.isArray(options.waveform) && options.waveform.length) body.append("waveform", options.waveform.join(","));

  return new Promise((resolve, reject) => {
    const requestValue = new XMLHttpRequest();
    requestValue.open("POST", `/api/conversations/${encodeURIComponent(conversationId)}/upload`);
    requestValue.withCredentials = true;
    requestValue.setRequestHeader("X-Nexora-Client-Version", CLIENT_VERSION);
    requestValue.setRequestHeader("X-Nexora-Device-ID", DEVICE_ID);
    requestValue.setRequestHeader("X-Nexora-Device-Name", DEVICE_NAME);
    requestValue.setRequestHeader("X-Nexora-Platform", DEVICE_PLATFORM);
    if (csrfToken) requestValue.setRequestHeader("X-Nexora-CSRF", csrfToken);
    requestValue.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)), event.loaded, event.total);
    };
    requestValue.onerror = () => reject(new ApiError("Соединение прервано во время загрузки.", 0, "UPLOAD_NETWORK_ERROR"));
    requestValue.onabort = () => reject(new ApiError("Загрузка отменена.", 0, "UPLOAD_ABORTED"));
    requestValue.onload = () => {
      let result = null;
      try { result = JSON.parse(requestValue.responseText || "null"); } catch {}
      if (result?.csrfToken) setCsrfToken(result.csrfToken);
      if (requestValue.status < 200 || requestValue.status >= 300) {
        reject(new ApiError(result?.message || result?.error || `Ошибка ${requestValue.status}`, requestValue.status, result?.code, result?.details, result?.requestId));
        return;
      }
      options.onProgress?.(100, file.size, file.size);
      resolve(result);
    };
    if (options.signal) {
      if (options.signal.aborted) return requestValue.abort();
      options.signal.addEventListener("abort", () => requestValue.abort(), { once: true });
    }
    requestValue.send(body);
  });
}

export function uploadFile(conversationId, file, kind, duration = 0, caption = "", options = {}) {
  if (file.size >= RESUMABLE_THRESHOLD && globalThis.crypto?.subtle) {
    return resumableUpload(conversationId, file, kind, duration, caption, options);
  }
  return directUpload(conversationId, file, kind, duration, caption, options);
}

export function uploadAvatar(file) {
  const body = new FormData();
  body.append("avatar", file);
  return api("/api/users/me/avatar", { method: "POST", body });
}
