"use strict";

const crypto = require("node:crypto");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");

const DEFAULT_SERVER_PORT = 3443;
const HEALTH_RESPONSE_LIMIT = 256 * 1024;

function connectionError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isAllowedHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (!net.isIPv4(host)) return false;
  const octets = host.split(".").map(Number);
  return octets[0] === 26
    || octets[0] === 10
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}

function isAllowedNexoraUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && isAllowedHost(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeFingerprint(value) {
  return String(value || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
}

function displayFingerprint(value) {
  const normalized = normalizeFingerprint(value);
  if (normalized.length !== 64) return "";
  return normalized.toUpperCase().match(/.{2}/g).join(":");
}

function certificateFingerprint(certificate = {}) {
  for (const data of [certificate.data, certificate.raw]) {
    if (!data) continue;
    try {
      const fingerprint = displayFingerprint(new crypto.X509Certificate(data).fingerprint256);
      if (fingerprint) return fingerprint;
    } catch {}
  }
  for (const value of [certificate.fingerprint256, certificate.fingerprint]) {
    const fingerprint = displayFingerprint(value);
    if (fingerprint) return fingerprint;
  }
  return "";
}

function normalizeServerUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) throw connectionError("Введите адрес, который показан в Nexora Server.", "ADDRESS_REQUIRED");
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw connectionError("Адрес не распознан. Пример: https://26.4.1.76:3443", "ADDRESS_INVALID");
  }
  if (parsed.protocol !== "https:") throw connectionError("Nexora Client подключается только по HTTPS.", "HTTPS_REQUIRED");
  if (parsed.username || parsed.password) throw connectionError("Логин и пароль не должны находиться в адресе сервера.", "ADDRESS_CREDENTIALS");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw connectionError("Введите только адрес и порт, без пути. Пример: https://26.4.1.76:3443", "ADDRESS_PATH");

  const authority = candidate.replace(/^https:\/\//i, "").split(/[/?#]/, 1)[0];
  const match = authority.match(/^([^:]+)(?::(\d{1,5}))?$/);
  if (!match) throw connectionError("Поддерживается полный IPv4-адрес сервера с портом 3443.", "ADDRESS_INVALID");
  const rawHostname = match[1].toLowerCase();
  if (rawHostname !== "localhost" && !net.isIPv4(rawHostname)) {
    throw connectionError("Введите полный IPv4-адрес. Например: https://26.4.1.76:3443", "IPV4_INCOMPLETE");
  }
  if (!isAllowedHost(rawHostname)) {
    throw connectionError("Разрешены только адреса Radmin VPN и локальной сети.", "ADDRESS_NOT_LOCAL");
  }
  const port = Number(match[2] || DEFAULT_SERVER_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw connectionError("Порт сервера должен быть числом от 1 до 65535.", "PORT_INVALID");
  return `https://${rawHostname}:${port}`;
}

function matchesPinnedCertificate(servers, { url = "", hostname = "", certificate } = {}) {
  const presented = normalizeFingerprint(certificateFingerprint(certificate));
  if (presented.length !== 64) return false;
  let targetOrigin = "";
  let targetHostname = String(hostname || "").toLowerCase();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !isAllowedHost(parsed.hostname)) return false;
      targetOrigin = parsed.origin;
      targetHostname = parsed.hostname.toLowerCase();
    } catch {
      return false;
    }
  }
  if (!isAllowedHost(targetHostname)) return false;
  return (servers || []).some((server) => {
    try {
      const saved = new URL(normalizeServerUrl(server.url));
      const sameTarget = targetOrigin ? saved.origin === targetOrigin : saved.hostname.toLowerCase() === targetHostname;
      return sameTarget && normalizeFingerprint(server.fingerprint) === presented;
    } catch {
      return false;
    }
  });
}

function networkErrorMessage(error, url) {
  const address = (() => { try { return new URL(url).host; } catch { return url; } })();
  const code = String(error?.code || "");
  if (code === "ECONNREFUSED") return `Сервер ${address} отклонил подключение. Проверьте, что Nexora Server запущен и порт 3443 разрешён брандмауэром.`;
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) return `Сервер ${address} не ответил. Проверьте Radmin VPN, адрес и брандмауэр Windows.`;
  if (["EHOSTUNREACH", "ENETUNREACH"].includes(code)) return `Нет маршрута до ${address}. Устройства должны находиться в одной сети Radmin VPN.`;
  if (code === "ENOTFOUND") return "Адрес сервера не найден. Используйте полный IPv4-адрес из окна Nexora Server.";
  if (["ECONNRESET", "EPIPE"].includes(code)) return "Сервер разорвал соединение во время проверки. Перезапустите Nexora Server и попробуйте снова.";
  return `Не удалось проверить сервер ${address}: ${error?.message || "неизвестная ошибка"}`;
}

function loadErrorMessage(code, description, url) {
  const address = (() => { try { return new URL(url).host; } catch { return "сервер"; } })();
  if (code === -202 || /CERT_AUTHORITY_INVALID/i.test(description || "")) {
    return `Не удалось применить доверие к сертификату ${address}. Удалите сохранённую запись и подключитесь заново, сверив SHA-256. Для браузера отдельно установите корневой .crt.`;
  }
  if (code === -200 || /CERT_COMMON_NAME_INVALID/i.test(description || "")) {
    return `Сертификат не выпущен для адреса ${address}. Перезапустите Nexora Server после подключения Radmin VPN.`;
  }
  if (code === -102 || /CONNECTION_REFUSED/i.test(description || "")) return `Сервер ${address} не принимает соединение. Проверьте запуск сервера и порт 3443.`;
  if ([-105, -109].includes(code)) return `Адрес ${address} недоступен. Скопируйте его заново из Nexora Server.`;
  if ([-7, -118].includes(code)) return `Истекло время подключения к ${address}. Проверьте Radmin VPN и брандмауэр Windows.`;
  return `Сервер ${address} недоступен: ${description || "ошибка соединения"} (${code})`;
}

function inspectNexoraServer(value, { clientVersion = "0.0.0", timeoutMs = 8_000 } = {}) {
  const url = normalizeServerUrl(value);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, result) => {
      if (settled) return;
      settled = true;
      handler(result);
    };
    const request = https.get(`${url}/api/health`, {
      rejectUnauthorized: false,
      timeout: timeoutMs,
      headers: { "X-Nexora-Client-Version": clientVersion },
    }, (response) => {
      const peer = response.socket.getPeerCertificate(true);
      const fingerprint = certificateFingerprint(peer);
      const hostname = new URL(url).hostname;
      const identityError = tls.checkServerIdentity(hostname, peer);
      if (identityError) {
        response.resume();
        finish(reject, connectionError(`Сертификат не содержит адрес ${hostname}. Перезапустите Nexora Server после подключения Radmin VPN.`, "CERT_HOST_MISMATCH"));
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > HEALTH_RESPONSE_LIMIT) request.destroy(connectionError("Ответ сервера слишком большой.", "HEALTH_TOO_LARGE"));
      });
      response.on("end", () => {
        try {
          const health = JSON.parse(body);
          if (response.statusCode !== 200 || health.service !== "nexora" || !health.serverId) throw connectionError("По этому адресу работает не Nexora Server.", "NOT_NEXORA");
          if (!fingerprint || normalizeFingerprint(fingerprint) !== normalizeFingerprint(health.fingerprint)) throw connectionError("Отпечаток TLS-сертификата не совпадает с ответом сервера.", "FINGERPRINT_MISMATCH");
          finish(resolve, { url, id: health.serverId, version: health.version, fingerprint, compatibility: health.compatibility });
        } catch (error) {
          finish(reject, error?.code ? error : connectionError("Сервер вернул повреждённый health-ответ.", "HEALTH_INVALID"));
        }
      });
    });
    request.once("timeout", () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    request.once("error", (error) => finish(reject, connectionError(networkErrorMessage(error, url), error?.code || "NETWORK_ERROR")));
  });
}

module.exports = {
  DEFAULT_SERVER_PORT,
  certificateFingerprint,
  displayFingerprint,
  inspectNexoraServer,
  isAllowedHost,
  isAllowedNexoraUrl,
  loadErrorMessage,
  matchesPinnedCertificate,
  networkErrorMessage,
  normalizeFingerprint,
  normalizeServerUrl,
};
