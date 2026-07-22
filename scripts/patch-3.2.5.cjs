"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const mode = process.argv[2];
if (!["prepare", "apply"].includes(mode)) {
  throw new Error("Usage: node scripts/patch-3.2.5.cjs <prepare|apply>");
}

const partsDirectory = path.join(__dirname, ".patch-3.2.5");
const encoded = fs.readdirSync(partsDirectory)
  .filter((name) => name.endsWith(".txt"))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDirectory, name), "utf8").trim())
  .join("");
const payload = JSON.parse(zlib.brotliDecompressSync(Buffer.from(encoded, "base64")).toString("utf8"));

for (const [index, source] of payload[mode].entries()) {
  const file = path.join(__dirname, `.patch-3.2.5-${mode}-${index}.cjs`);
  try {
    fs.writeFileSync(file, source, "utf8");
    delete require.cache[require.resolve(file)];
    require(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}
