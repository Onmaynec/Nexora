"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { buildSpdx, normalizeLicense, packageNameFromLocation } = require("../scripts/generate-spdx-sbom.cjs");

const root = path.resolve(__dirname, "..");

test("SPDX fallback creates a valid production dependency document", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const document = buildSpdx({
    packageJson,
    packageLock,
    createdAt: "2026-07-23T00:00:00.000Z",
  });

  assert.equal(document.spdxVersion, "SPDX-2.3");
  assert.equal(document.dataLicense, "CC0-1.0");
  assert.match(document.documentNamespace, new RegExp(`releases/tag/v${packageJson.version.replaceAll(".", "\\.")}/spdx/[a-f0-9]{64}$`));
  assert.ok(document.packages.some((item) => item.name === packageJson.name && item.versionInfo === packageJson.version));
  assert.ok(document.packages.some((item) => item.name === "express"));
  assert.equal(document.packages.some((item) => item.name === "vite"), false);
  assert.ok(document.relationships.some((item) => item.relationshipType === "DESCRIBES"));
  assert.ok(document.relationships.some((item) => item.relationshipType === "DEPENDS_ON"));
  assert.ok(document.packages.every((item) => item.filesAnalyzed === false && item.SPDXID.startsWith("SPDXRef-Package-")));
});

test("SPDX helpers normalize package paths and license metadata", () => {
  assert.equal(packageNameFromLocation("node_modules/@scope/example", null), "@scope/example");
  assert.equal(packageNameFromLocation("node_modules/a/node_modules/b", null), "b");
  assert.equal(normalizeLicense({ type: "MIT" }), "MIT");
  assert.equal(normalizeLicense(["MIT", "Apache-2.0"]), "MIT OR Apache-2.0");
  assert.equal(normalizeLicense(null), "NOASSERTION");
});
