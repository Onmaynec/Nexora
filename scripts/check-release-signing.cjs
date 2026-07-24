"use strict";

const required = [
  ["CSC_LINK", "путь, URL или base64 PKCS#12-сертификата подписи"],
  ["CSC_KEY_PASSWORD", "пароль сертификата подписи"],
  ["NEXORA_WINDOWS_SIGNER_SUBJECT", "ожидаемый Authenticode certificate subject"],
  ["NEXORA_WINDOWS_SIGNER_THUMBPRINT", "ожидаемый SHA-1 thumbprint сертификата без пробелов"],
];

const missing = required.filter(([name]) => !String(process.env[name] || "").trim());
if (missing.length) {
  console.error("Стабильный Windows-релиз остановлен: не задана полная signing policy.");
  for (const [name, description] of missing) console.error(`- ${name}: ${description}`);
  console.error("Неподписанная сборка допустима только как явно маркированный UNSIGNED-TEST prerelease без updater metadata.");
  process.exitCode = 1;
} else {
  const thumbprint = String(process.env.NEXORA_WINDOWS_SIGNER_THUMBPRINT).replace(/\s+/g, "").toUpperCase();
  if (!/^[A-F0-9]{40}$/.test(thumbprint)) {
    console.error("NEXORA_WINDOWS_SIGNER_THUMBPRINT должен содержать 40 hex-символов SHA-1 thumbprint.");
    process.exitCode = 1;
  }
  if (String(process.env.NEXORA_WINDOWS_SIGNER_SUBJECT).length > 300) {
    console.error("NEXORA_WINDOWS_SIGNER_SUBJECT превышает безопасный лимит.");
    process.exitCode = 1;
  }
  for (const name of ["NEXORA_CLIENT_UPDATE_URL", "NEXORA_SERVER_UPDATE_URL"]) {
    if (process.env[name] && !/^https:\/\//i.test(process.env[name])) {
      console.error(`${name} должен начинаться с https://`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log("Release signing policy OK: credentials, expected subject and thumbprint are configured.");
}
