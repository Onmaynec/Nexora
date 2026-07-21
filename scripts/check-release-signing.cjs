"use strict";

const required = [
  ["CSC_LINK", "путь, URL или base64 PKCS#12-сертификата подписи"],
  ["CSC_KEY_PASSWORD", "пароль сертификата подписи"],
];

const missing = required.filter(([name]) => !String(process.env[name] || "").trim());
if (missing.length) {
  console.error("Стабильный Windows-релиз остановлен: не заданы обязательные секреты подписи.");
  for (const [name, description] of missing) console.error(`- ${name}: ${description}`);
  console.error("Для тестовой неподписанной сборки используйте npm run dist:windows.");
  process.exitCode = 1;
} else {
  for (const name of ["NEXORA_CLIENT_UPDATE_URL", "NEXORA_SERVER_UPDATE_URL"]) {
    if (process.env[name] && !/^https:\/\//i.test(process.env[name])) {
      console.error(`${name} должен начинаться с https://`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log("Release signing configuration OK; Client updates use signed GitHub Releases metadata");
}
