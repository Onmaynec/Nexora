"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getConfig, validateConfiguration } = require("app-builder-lib/out/util/config/config.js");

const configFiles = ["electron-builder.client.yml", "electron-builder.server.yml"];

function verifyReleaseIcons() {
  const ico = fs.readFileSync(path.resolve("build/icon.ico"));
  const png = fs.readFileSync(path.resolve("build/icon.png"));
  if (ico.length < 6 || !ico.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00])) || ico.readUInt16LE(4) < 1) {
    throw new Error("build/icon.ico не является корректным ICO-контейнером");
  }
  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || png.readUInt32BE(16) < 256 || png.readUInt32BE(20) < 256) {
    throw new Error("build/icon.png должен быть корректным PNG размером не менее 256×256");
  }
  console.log(`Release icons OK: ICO ${ico.readUInt16LE(4)} images, PNG ${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);
}

function configuredFilePatterns(config) {
  return (Array.isArray(config.files) ? config.files : [])
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.from === "string") return entry.from;
      return "";
    })
    .map((entry) => entry.replaceAll("\\", "/").replace(/^\.\//, ""));
}

function verifyServerRuntimePayload(configFile, config) {
  if (configFile !== "electron-builder.server.yml") return;

  const patterns = configuredFilePatterns(config);
  if (!patterns.includes("shared/**/*")) {
    throw new Error("electron-builder.server.yml должен включать shared/**/*: server runtime импортирует ../shared/pulse-catalog.cjs");
  }

  const catalogPath = path.resolve("shared/pulse-catalog.cjs");
  if (!fs.existsSync(catalogPath)) {
    throw new Error("Отсутствует обязательный runtime-модуль shared/pulse-catalog.cjs");
  }

  const catalog = require(catalogPath);
  if (typeof catalog.catalogItem !== "function" || typeof catalog.publicCatalog !== "function") {
    throw new Error("shared/pulse-catalog.cjs не экспортирует обязательный Pulse catalog contract");
  }

  console.log("Nexora Server runtime payload OK: shared/**/* and Pulse catalog are packaged.");
}

(async () => {
  for (const configFile of configFiles) {
    const config = await getConfig(process.cwd(), path.resolve(configFile));
    await validateConfiguration(config, process.cwd());
    verifyServerRuntimePayload(configFile, config);
    console.log(`Electron Builder config OK: ${configFile}`);
  }
  verifyReleaseIcons();
})().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
