"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const checkOnly = process.argv.includes("--check");
const packageFile = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
const version = String(packageJson.version || "");
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!match) throw new Error(`package.json version is not valid SemVer: ${version}`);
const [, major, minor, patch] = match.map(Number);
const androidVersionCode = major * 10_000 + minor * 100 + patch;
const changed = [];

function update(relativePath, transform) {
  const file = path.join(root, relativePath);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) return;
  changed.push(relativePath);
  if (!checkOnly) fs.writeFileSync(file, after, "utf8");
}

update("package-lock.json", (source) => {
  const lock = JSON.parse(source);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  return `${JSON.stringify(lock, null, 2)}\n`;
});

update("android/app/build.gradle.kts", (source) => source
  .replace(/versionCode\s*=\s*\d+/, `versionCode = ${androidVersionCode}`)
  .replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${version}"`));

update("test/server.test.cjs", (source) => source
  .replace(
    /assert\.equal\(response\.body\.version,\s*"[^"]+"\);/,
    'assert.equal(response.body.version, require("../package.json").version);',
  ));

update("test/build-config.test.cjs", (source) => source
  .replace(/test\("релиз [^"]+ собирает/, `test("релиз ${version} собирает`)
  .replace(
    /assert\.equal\(packageJson\.version,\s*"[^"]+"\);/,
    'assert.equal(packageJson.version, require("../package-lock.json").version);',
  ));

if (checkOnly && changed.length) {
  console.error(`Release metadata is not synchronized with ${version}: ${changed.join(", ")}`);
  process.exit(1);
}
console.log(changed.length ? `${checkOnly ? "Unsynchronized" : "Synchronized"}: ${changed.join(", ")}` : `Release metadata ${version} is synchronized.`);
