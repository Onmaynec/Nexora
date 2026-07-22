export class ApiError extends Error {
  constructor(message, status, code, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const CLIENT_VERSION = "3.3.0";
let csrfToken = sessionStorage.getItem("nexora:csrf") || "";
const recoveryRequests = new Map();
const WELCOME_CLAIM_MIN_INTERVAL_MS = 2_000;
const WELCOME_REQUEST_MIN_INTERVAL_MS = 8_000;

export function setCsrfToken(value) {
  csrfToken = String(value || "");
  if (csrfToken) sessionStorage.setItem("nexora:csrf", csrfToken);
  else sessionStorage.removeItem("nexora:csrf");
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
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      "X-Nexora-Client-Version": CLIENT_VERSION,
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
    });
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

async function resumableUpload(conversationId, file, kind, caption, options) {
  let upload;
  try {
    upload = options.uploadId
      ? (await api(`/api/uploads/${encodeURIComponent(options.uploadId)}`)).upload
      : (await post(`/api/conversations/${encodeURIComponent(conversationId)}/uploads`, { name: file.name, size: file.size, mimeType: file.type || "application/octet-stream", kind })).upload;
    const received = new Set(upload.receivedChunks || []);
    let completedBytes = [...received].reduce((sum, index) => sum + Math.min(upload.chunkSize, file.size - index * upload.chunkSize), 0);
    for (let index = 0; index < upload.totalChunks; index += 1) {
      if (received.has(index)) continue;
      if (options.signal?.aborted) throw Object.assign(new Error("Загрузка отменена."), { code: "UPLOAD_ABORTED" });
      const chunk = file.slice(index * upload.chunkSize, Math.min(file.size, (index + 1) * upload.chunkSize));
      const digest = await crypto.subtle.digest("SHA-256", await chunk.arrayBuffer());
      const checksum = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
      const response = await fetch(`/api/uploads/${encodeURIComponent(upload.id)}/chunks/${index}`, {
        method: "PUT", credentials: "include", body: chunk, signal: options.signal,
        headers: { "Content-Type": "application/octet-stream", "X-Nexora-Client-Version": CLIENT_VERSION, "X-Chunk-SHA256": checksum, ...(csrfToken ? { "X-Nexora-CSRF": csrfToken } : {}) },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(result.message || result.error || `Ошибка ${response.status}`, response.status, result.code, result.details);
      completedBytes += chunk.size;
      options.onProgress?.(Math.min(100, Math.round(completedBytes / file.size * 100)), completedBytes, file.size);
    }
    return post(`/api/uploads/${encodeURIComponent(upload.id)}/complete`, { caption });
  } catch (error) {
    if (upload?.id) error.uploadId = upload.id;
    if (error.name === "AbortError") error.code = "UPLOAD_ABORTED";
    throw error;
  }
}

export function uploadFile(conversationId, file, kind, duration = 0, caption = "", options = {}) {
  if (file.size > 2 * 1024 * 1024 && kind !== "voice" && globalThis.crypto?.subtle) return resumableUpload(conversationId, file, kind, caption, options);
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
        reject(new ApiError(result?.message || result?.error || `Ошибка ${requestValue.status}`, requestValue.status, result?.code, result?.details));
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

export function uploadAvatar(file) {
  const body = new FormData();
  body.append("avatar", file);
  return api("/api/users/me/avatar", { method: "POST", body });
}
