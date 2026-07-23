"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function safeId(value) {
  return `SPDXRef-Package-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 20)}`;
}

function packageNameFromLocation(location, fallback) {
  if (!location) return fallback;
  const marker = "node_modules/";
  const index = location.lastIndexOf(marker);
  return index >= 0 ? location.slice(index + marker.length) : fallback;
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && value.length) return value.map(normalizeLicense).filter((item) => item !== "NOASSERTION").join(" OR ") || "NOASSERTION";
  if (value && typeof value === "object" && typeof value.type === "string") return value.type.trim() || "NOASSERTION";
  return "NOASSERTION";
}

function buildSpdx({ packageJson, packageLock, repository = "Onmaynec/Nexora", createdAt = new Date().toISOString() }) {
  if (!packageJson?.name || !packageJson?.version) throw new Error("package.json must contain name and version");
  if (!packageLock || typeof packageLock !== "object") throw new Error("package-lock.json is invalid");

  const entries = Object.entries(packageLock.packages || {}).map(([location, metadata]) => ({ location, metadata: metadata || {} }));
  if (!entries.some((entry) => entry.location === "")) entries.unshift({ location: "", metadata: packageJson });

  const packages = [];
  const byLocation = new Map();
  const seen = new Set();
  for (const { location, metadata } of entries.sort((a, b) => a.location.localeCompare(b.location))) {
    if (metadata.dev === true || metadata.optional === true && metadata.dev === true) continue;
    const name = metadata.name || packageNameFromLocation(location, location ? null : packageJson.name);
    const version = metadata.version || (location ? null : packageJson.version);
    if (!name || !version) continue;
    const key = `${name}@${version}`;
    let spdxId = safeId(`${location || "."}:${key}`);
    if (seen.has(spdxId)) spdxId = safeId(`${location || "."}:${key}:${packages.length}`);
    seen.add(spdxId);
    const item = {
      SPDXID: spdxId,
      name,
      versionInfo: String(version),
      downloadLocation: typeof metadata.resolved === "string" && metadata.resolved ? metadata.resolved : "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: normalizeLicense(metadata.license),
      copyrightText: "NOASSERTION",
    };
    if (typeof metadata.integrity === "string" && metadata.integrity.startsWith("sha512-")) {
      try {
        item.checksums = [{ algorithm: "SHA512", checksumValue: Buffer.from(metadata.integrity.slice(7), "base64").toString("hex") }];
      } catch {}
    }
    packages.push(item);
    byLocation.set(location, { item, metadata });
  }

  const root = byLocation.get("")?.item || packages.find((item) => item.name === packageJson.name && item.versionInfo === packageJson.version);
  if (!root) throw new Error("Root package is missing from generated SBOM");

  const relationships = [{ spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: root.SPDXID }];
  const rootDependencies = { ...(packageJson.dependencies || {}), ...(packageJson.optionalDependencies || {}) };
  for (const dependencyName of Object.keys(rootDependencies).sort()) {
    const dependency = byLocation.get(`node_modules/${dependencyName}`)?.item;
    if (dependency) relationships.push({ spdxElementId: root.SPDXID, relationshipType: "DEPENDS_ON", relatedSpdxElement: dependency.SPDXID });
  }

  const lockDigest = crypto.createHash("sha256").update(JSON.stringify(packageLock)).digest("hex");
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${packageJson.name}-${packageJson.version}`,
    documentNamespace: `https://github.com/${repository}/releases/tag/v${packageJson.version}/spdx/${lockDigest}`,
    creationInfo: {
      created: createdAt,
      creators: ["Tool: Nexora SPDX fallback generator"],
      licenseListVersion: "3.26",
    },
    documentDescribes: [root.SPDXID],
    packages,
    relationships,
  };
}

function main(argv = process.argv.slice(2)) {
  const root = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const document = buildSpdx({ packageJson, packageLock });
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const output = argv[0];
  if (output) {
    const destination = path.resolve(root, output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, serialized, "utf8");
    process.stdout.write(`${destination}\n`);
  } else {
    process.stdout.write(serialized);
  }
}

if (require.main === module) main();

module.exports = { buildSpdx, normalizeLicense, packageNameFromLocation, safeId };
