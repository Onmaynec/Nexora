import { api, CLIENT_VERSION } from "../api";

const MAX_PLAINTEXT_BYTES = 25 * 1024 * 1024;
const VALID_KINDS = new Set(["file", "image", "voice"]);
const ATTACHMENT_CONTENT_PREFIX = "NEXORA-E2EE-ATTACHMENT-V1:";
const encoder = new TextEncoder();

function toBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cleanName(value) {
  return String(value || "attachment")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "attachment";
}

function cleanMime(value) {
  const mime = String(value || "application/octet-stream").trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ? mime.slice(0, 120) : "application/octet-stream";
}

function cleanCaption(value) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 500);
}

function normalizeKind(value) {
  return VALID_KINDS.has(value) ? value : "file";
}

function normalizeWaveform(value) {
  return (Array.isArray(value) ? value : [])
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 96)
    .map((item) => Math.max(0, Math.min(100, Math.round(item))));
}

function validatedDescriptor(value) {
  if (!value || value.version !== 1 || value.algorithm !== "AES-256-GCM" || !/^[0-9a-f-]{36}$/i.test(String(value.id || ""))) return null;
  if (!/^[A-Za-z0-9+/=]{40,48}$/.test(String(value.key || "")) || !/^[A-Za-z0-9+/=]{16,24}$/.test(String(value.iv || ""))) return null;
  if (!/^[a-f0-9]{64}$/.test(String(value.plaintextSha256 || "")) || !/^[a-f0-9]{64}$/.test(String(value.ciphertextSha256 || ""))) return null;
  const plaintextSize = Number(value.plaintextSize);
  const ciphertextSize = Number(value.ciphertextSize);
  if (!Number.isSafeInteger(plaintextSize) || plaintextSize < 1 || plaintextSize > MAX_PLAINTEXT_BYTES || ciphertextSize !== plaintextSize + 16) return null;
  return {
    version: 1,
    id: String(value.id).toLowerCase(),
    algorithm: "AES-256-GCM",
    key: String(value.key),
    iv: String(value.iv),
    name: cleanName(value.name),
    mimeType: cleanMime(value.mimeType),
    kind: normalizeKind(value.kind),
    plaintextSize,
    ciphertextSize,
    plaintextSha256: String(value.plaintextSha256),
    ciphertextSha256: String(value.ciphertextSha256),
    duration: normalizeKind(value.kind) === "voice" && Number.isFinite(Number(value.duration)) ? Math.max(1, Math.min(300, Math.round(Number(value.duration)))) : null,
    waveform: normalizeKind(value.kind) === "voice" ? normalizeWaveform(value.waveform) : [],
  };
}

function requestError(xhr) {
  let body = xhr.response;
  if (!body && xhr.responseText) {
    try { body = JSON.parse(xhr.responseText); } catch { body = null; }
  }
  const error = new Error(body?.message || body?.error || `Ошибка ${xhr.status || 0}`);
  error.status = xhr.status || 0;
  error.code = body?.code || "E2EE_ATTACHMENT_UPLOAD_FAILED";
  error.details = body?.details || {};
  return error;
}

function uploadCiphertext(url, bytes, headers, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => {
      xhr.abort();
      const error = Object.assign(new Error("Загрузка E2EE attachment отменена."), { code: "E2EE_ATTACHMENT_UPLOAD_CANCELLED" });
      finish(reject, error);
    };
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.setRequestHeader("X-Nexora-Client-Version", CLIENT_VERSION);
    const csrf = sessionStorage.getItem("nexora:csrf");
    if (csrf) xhr.setRequestHeader("X-Nexora-CSRF", csrf);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, String(value));
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({ phase: "uploading", loaded: event.loaded, total: event.total, progress: event.total ? event.loaded / event.total : 0 });
    };
    xhr.onerror = () => finish(reject, Object.assign(new Error("Сеть недоступна во время E2EE upload."), { code: "E2EE_ATTACHMENT_UPLOAD_NETWORK" }));
    xhr.onabort = abort;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish(resolve, xhr.response);
      else finish(reject, requestError(xhr));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(bytes);
  });
}

export function attachmentAad({ conversationId, attachmentId, kind }) {
  return encoder.encode(`NEXORA-E2EE-ATTACHMENT-V1\n${String(conversationId)}\n${String(attachmentId)}\n${normalizeKind(kind)}`);
}

export function encodeAttachmentContent(attachment, caption = "") {
  const descriptor = validatedDescriptor(attachment);
  if (!descriptor) throw Object.assign(new Error("E2EE attachment descriptor недействителен."), { code: "E2EE_ATTACHMENT_FORMAT_INVALID" });
  return `${ATTACHMENT_CONTENT_PREFIX}${JSON.stringify({ attachment: descriptor, caption: cleanCaption(caption) })}`;
}

export function decodeAttachmentContent(message) {
  if (message?.file?.kind !== "encrypted" || typeof message?.text !== "string" || !message.text.startsWith(ATTACHMENT_CONTENT_PREFIX)) return message;
  try {
    const parsed = JSON.parse(message.text.slice(ATTACHMENT_CONTENT_PREFIX.length));
    const attachment = validatedDescriptor(parsed?.attachment);
    if (!attachment || attachment.id !== message.file.id || attachment.ciphertextSha256 !== message.file.ciphertextSha256
      || attachment.ciphertextSize !== Number(message.file.size)) {
      throw Object.assign(new Error("E2EE attachment descriptor не соответствует server envelope."), { code: "E2EE_ATTACHMENT_SCOPE_INVALID" });
    }
    return {
      ...message,
      type: attachment.kind,
      text: cleanCaption(parsed.caption),
      attachment,
      encryptedContentType: "attachment",
      canEdit: false,
      e2ee: true,
    };
  } catch (error) {
    return {
      ...message,
      type: "encrypted",
      text: "Защищённое вложение не прошло проверку descriptor.",
      attachment: null,
      canEdit: false,
      decryptionError: error.code || "E2EE_ATTACHMENT_FORMAT_INVALID",
      e2ee: true,
    };
  }
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptAndUploadAttachment({ conversationId, file, kind = "file", duration = null, waveform = [], signal, onProgress }) {
  if (!conversationId) throw Object.assign(new Error("Не выбран E2EE-диалог."), { code: "E2EE_CONVERSATION_REQUIRED" });
  if (!(file instanceof Blob)) throw Object.assign(new Error("Файл недоступен для шифрования."), { code: "E2EE_ATTACHMENT_INVALID" });
  if (!file.size || file.size > MAX_PLAINTEXT_BYTES) {
    throw Object.assign(new Error("Размер E2EE attachment должен быть от 1 байта до 25 МБ."), { code: "E2EE_ATTACHMENT_SIZE_INVALID" });
  }
  const normalizedKind = normalizeKind(kind);
  const attachmentId = crypto.randomUUID();
  onProgress?.({ phase: "reading", loaded: 0, total: file.size, progress: 0 });
  const plaintext = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw Object.assign(new Error("Загрузка E2EE attachment отменена."), { code: "E2EE_ATTACHMENT_UPLOAD_CANCELLED" });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = attachmentAad({ conversationId, attachmentId, kind: normalizedKind });
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  try {
    onProgress?.({ phase: "encrypting", loaded: plaintext.byteLength, total: plaintext.byteLength, progress: 0.1 });
    const plaintextSha256 = await sha256Hex(plaintext);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, plaintext));
    const ciphertextSha256 = await sha256Hex(encrypted);
    onProgress?.({ phase: "uploading", loaded: 0, total: encrypted.byteLength, progress: 0 });
    const result = await uploadCiphertext(`/api/v4/e2ee/conversations/${encodeURIComponent(conversationId)}/attachments`, encrypted, {
      "Content-Type": "application/octet-stream",
      "X-Nexora-Attachment-ID": attachmentId,
      "X-Nexora-Ciphertext-SHA256": ciphertextSha256,
      "X-Nexora-Plaintext-Size": String(plaintext.byteLength),
    }, { signal, onProgress });
    onProgress?.({ phase: "verifying", loaded: encrypted.byteLength, total: encrypted.byteLength, progress: 1 });
    if (result.attachment?.id !== attachmentId || result.attachment?.ciphertextSha256 !== ciphertextSha256) {
      await api(`/api/v4/e2ee/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }).catch(() => {});
      throw Object.assign(new Error("Сервер вернул другой E2EE attachment."), { code: "E2EE_ATTACHMENT_SCOPE_INVALID" });
    }
    return validatedDescriptor({
      version: 1,
      id: attachmentId,
      algorithm: "AES-256-GCM",
      key: toBase64(rawKey),
      iv: toBase64(iv),
      name: cleanName(file.name),
      mimeType: cleanMime(file.type),
      kind: normalizedKind,
      plaintextSize: plaintext.byteLength,
      ciphertextSize: encrypted.byteLength,
      plaintextSha256,
      ciphertextSha256,
      duration: normalizedKind === "voice" && Number.isFinite(Number(duration)) ? Math.max(1, Math.min(300, Math.round(Number(duration)))) : null,
      waveform: normalizedKind === "voice" ? normalizeWaveform(waveform) : [],
    });
  } finally {
    plaintext.fill(0);
    rawKey.fill(0);
  }
}

export function cancelEncryptedAttachment(attachmentId) {
  return api(`/api/v4/e2ee/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
}

export async function decryptDownloadedAttachment({ conversationId, attachment, serverFile }) {
  const descriptor = validatedDescriptor(attachment);
  if (!descriptor) throw Object.assign(new Error("Неизвестный формат E2EE attachment."), { code: "E2EE_ATTACHMENT_FORMAT_INVALID" });
  if (!serverFile?.id || serverFile.id !== descriptor.id || !serverFile.url || serverFile.ciphertextSha256 !== descriptor.ciphertextSha256) {
    throw Object.assign(new Error("E2EE attachment не соответствует server envelope."), { code: "E2EE_ATTACHMENT_SCOPE_INVALID" });
  }
  const response = await fetch(serverFile.url, {
    credentials: "include",
    headers: { "X-Nexora-Client-Version": CLIENT_VERSION },
  });
  if (!response.ok) throw Object.assign(new Error("Не удалось загрузить E2EE ciphertext."), { code: "E2EE_ATTACHMENT_DOWNLOAD_FAILED", status: response.status });
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  if (ciphertext.byteLength !== descriptor.ciphertextSize
    || ciphertext.byteLength !== Number(serverFile.size)
    || await sha256Hex(ciphertext) !== descriptor.ciphertextSha256) {
    throw Object.assign(new Error("E2EE ciphertext повреждён или подменён."), { code: "E2EE_ATTACHMENT_CIPHERTEXT_INVALID" });
  }
  const rawKey = fromBase64(descriptor.key);
  const iv = fromBase64(descriptor.iv);
  if (rawKey.byteLength !== 32 || iv.byteLength !== 12) throw Object.assign(new Error("E2EE attachment key material недействителен."), { code: "E2EE_ATTACHMENT_KEY_INVALID" });
  try {
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv,
      additionalData: attachmentAad({ conversationId, attachmentId: descriptor.id, kind: descriptor.kind }),
      tagLength: 128,
    }, key, ciphertext));
    if (plaintext.byteLength !== descriptor.plaintextSize || await sha256Hex(plaintext) !== descriptor.plaintextSha256) {
      plaintext.fill(0);
      throw Object.assign(new Error("Расшифрованный E2EE attachment не прошёл проверку целостности."), { code: "E2EE_ATTACHMENT_PLAINTEXT_INVALID" });
    }
    return {
      blob: new Blob([plaintext], { type: descriptor.mimeType }),
      name: descriptor.name,
      mimeType: descriptor.mimeType,
      kind: descriptor.kind,
      duration: descriptor.duration,
      waveform: descriptor.waveform,
    };
  } finally {
    rawKey.fill(0);
    iv.fill(0);
  }
}
