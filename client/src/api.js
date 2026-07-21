export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const CLIENT_VERSION = "2.0.0";
let csrfToken = sessionStorage.getItem("nexora:csrf") || "";

export function setCsrfToken(value) {
  csrfToken = String(value || "");
  if (csrfToken) sessionStorage.setItem("nexora:csrf", csrfToken);
  else sessionStorage.removeItem("nexora:csrf");
}

export function clearCsrfToken() {
  setCsrfToken("");
}

export async function api(path, options = {}) {
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
  if (!response.ok) throw new ApiError(body?.error ?? `Ошибка ${response.status}`, response.status, body?.code);
  return body;
}

export function post(path, body) {
  return api(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export function patch(path, body) {
  return api(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
}

export function remove(path) {
  return api(path, { method: "DELETE" });
}

export function uploadFile(conversationId, file, kind, duration = 0, caption = "", options = {}) {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  body.append("duration", String(duration));
  body.append("caption", caption);
  if (Array.isArray(options.waveform) && options.waveform.length) body.append("waveform", options.waveform.join(","));

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/conversations/${encodeURIComponent(conversationId)}/upload`);
    request.withCredentials = true;
    request.setRequestHeader("X-Nexora-Client-Version", CLIENT_VERSION);
    if (csrfToken) request.setRequestHeader("X-Nexora-CSRF", csrfToken);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)), event.loaded, event.total);
    };
    request.onerror = () => reject(new ApiError("Соединение прервано во время загрузки.", 0, "UPLOAD_NETWORK_ERROR"));
    request.onabort = () => reject(new ApiError("Загрузка отменена.", 0, "UPLOAD_ABORTED"));
    request.onload = () => {
      let result = null;
      try { result = JSON.parse(request.responseText || "null"); } catch {}
      if (result?.csrfToken) setCsrfToken(result.csrfToken);
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(result?.error || `Ошибка ${request.status}`, request.status, result?.code));
        return;
      }
      options.onProgress?.(100, file.size, file.size);
      resolve(result);
    };
    if (options.signal) {
      if (options.signal.aborted) return request.abort();
      options.signal.addEventListener("abort", () => request.abort(), { once: true });
    }
    request.send(body);
  });
}

export function uploadAvatar(file) {
  const body = new FormData();
  body.append("avatar", file);
  return api("/api/users/me/avatar", { method: "POST", body });
}
