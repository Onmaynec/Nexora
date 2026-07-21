"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const roots = ["server", "cloud", "packages", "electron", "scripts", "test"];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const value = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(value);
    else if (/\.(?:c?js)$/.test(entry.name)) files.push(value);
  }
}
roots.filter((root) => fs.existsSync(root)).forEach(walk);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax OK: ${files.length} Node files`);
