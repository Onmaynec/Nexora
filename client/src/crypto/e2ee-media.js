import { api, CLIENT_VERSION } from "../api";

const MAX_PLAINTEXT_BYTES = 25 * 1024 * 1024;
const VALID_KINDS = new Set(["file", "image", "voice"]);
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

export function attachmentAad({ conversationId, attachmentId, kind }) {
  return encoder.encode(`NEXORA-E2EE-ATTACHMENT-V1\n${String(conversationId)}\n${String(attachmentId)}\n${normalizeKind(kind)}`);
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptAndUploadAttachment({ conversationId, file, kind = "file", duration = null, waveform = [] }) {
  if (!conversationId) throw Object.assign(new Error("Не выбран E2EE-диалог."), { code: "E2EE_CONVERSATION_REQUIRED" });
  if (!(file instanceof Blob)) throw Object.assign(new Error("Файл недоступен для шифрования."), { code: "E2EE_ATTACHMENT_INVALID" });
  if (!file.size || file.size > MAX_PLAINTEXT_BYTES) {
    throw Object.assign(new Error("Размер E2EE attachment должен быть от 1 байта до 25 МБ."), { code: "E2EE_ATTACHMENT_SIZE_INVALID" });
  }
  const normalizedKind = normalizeKind(kind);
  const attachmentId = crypto.randomUUID();
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = attachmentAad({ conversationId, attachmentId, kind: normalizedKind });
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  try {
    const plaintextSha256 = await sha256Hex(plaintext);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, plaintext));
    const ciphertextSha256 = await sha256Hex(encrypted);
    const result = await api(`/api/v4/e2ee/conversations/${encodeURIComponent(conversationId)}/attachments`, {
      method: "POST",
      body: encrypted,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Nexora-Attachment-ID": attachmentId,
        "X-Nexora-Ciphertext-SHA256": ciphertextSha256,
        "X-Nexora-Plaintext-Size": String(plaintext.byteLength),
      },
    });
    if (result.attachment?.id !== attachmentId || result.attachment?.ciphertextSha256 !== ciphertextSha256) {
      await api(`/api/v4/e2ee/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }).catch(() => {});
      throw Object.assign(new Error("Сервер вернул другой E2EE attachment."), { code: "E2EE_ATTACHMENT_SCOPE_INVALID" });
    }
    return {
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
    };
  } finally {
    plaintext.fill(0);
    rawKey.fill(0);
  }
}

export function cancelEncryptedAttachment(attachmentId) {
  return api(`/api/v4/e2ee/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
}

export async function decryptDownloadedAttachment({ conversationId, attachment, serverFile }) {
  if (!attachment || attachment.version !== 1 || attachment.algorithm !== "AES-256-GCM") {
    throw Object.assign(new Error("Неизвестный формат E2EE attachment."), { code: "E2EE_ATTACHMENT_FORMAT_INVALID" });
  }
  if (!serverFile?.id || serverFile.id !== attachment.id || !serverFile.url) {
    throw Object.assign(new Error("E2EE attachment не соответствует server envelope."), { code: "E2EE_ATTACHMENT_SCOPE_INVALID" });
  }
  const response = await fetch(serverFile.url, {
    credentials: "include",
    headers: { "X-Nexora-Client-Version": CLIENT_VERSION },
  });
  if (!response.ok) throw Object.assign(new Error("Не удалось загрузить E2EE ciphertext."), { code: "E2EE_ATTACHMENT_DOWNLOAD_FAILED", status: response.status });
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  if (ciphertext.byteLength !== Number(attachment.ciphertextSize)
    || ciphertext.byteLength !== Number(serverFile.size)
    || await sha256Hex(ciphertext) !== attachment.ciphertextSha256) {
    throw Object.assign(new Error("E2EE ciphertext повреждён или подменён."), { code: "E2EE_ATTACHMENT_CIPHERTEXT_INVALID" });
  }
  const rawKey = fromBase64(attachment.key);
  const iv = fromBase64(attachment.iv);
  if (rawKey.byteLength !== 32 || iv.byteLength !== 12) throw Object.assign(new Error("E2EE attachment key material недействителен."), { code: "E2EE_ATTACHMENT_KEY_INVALID" });
  try {
    const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv,
      additionalData: attachmentAad({ conversationId, attachmentId: attachment.id, kind: attachment.kind }),
      tagLength: 128,
    }, key, ciphertext));
    if (plaintext.byteLength !== Number(attachment.plaintextSize) || await sha256Hex(plaintext) !== attachment.plaintextSha256) {
      plaintext.fill(0);
      throw Object.assign(new Error("Расшифрованный E2EE attachment не прошёл проверку целостности."), { code: "E2EE_ATTACHMENT_PLAINTEXT_INVALID" });
    }
    return {
      blob: new Blob([plaintext], { type: cleanMime(attachment.mimeType) }),
      name: cleanName(attachment.name),
      mimeType: cleanMime(attachment.mimeType),
      kind: normalizeKind(attachment.kind),
      duration: attachment.duration || null,
      waveform: normalizeWaveform(attachment.waveform),
    };
  } finally {
    rawKey.fill(0);
    iv.fill(0);
  }
}
