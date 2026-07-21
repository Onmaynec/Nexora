"use strict";

const path = require("node:path");
const { createNexoraServer } = require("./create-server.cjs");

function boolEnv(value, fallback) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

async function main() {
  const instance = await createNexoraServer({
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? (boolEnv(process.env.NEXORA_TLS, true) ? 3443 : 3000)),
    redirectPort: Number(process.env.HTTP_PORT ?? 3080),
    tls: boolEnv(process.env.NEXORA_TLS, true),
    redirect: boolEnv(process.env.NEXORA_HTTP_REDIRECT, true),
    dataDir: process.env.NEXORA_DATA_DIR ? path.resolve(process.env.NEXORA_DATA_DIR) : path.join(process.cwd(), "data"),
    development: process.env.NODE_ENV !== "production",
  });

  const status = await instance.listen();
  console.log("\nNexora Server готов.");
  console.log(`Локально: ${status.localUrl}`);
  for (const item of status.addresses) console.log(`${item.isRadmin ? "Radmin VPN" : "Сеть"}: ${item.url}`);
  if (status.tls) {
    console.log(`\nКорневой сертификат для тестеров: ${status.caCertificate}`);
    console.log("Его нужно добавить в доверенные корневые центры Windows перед использованием микрофона в браузере.");
  }
  if (status.stats.firstAccountPending) console.log("\nПервый зарегистрированный аккаунт получит права администратора сервера.");

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await instance.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  console.error("Nexora Server не запустился:", error);
  process.exit(1);
});
