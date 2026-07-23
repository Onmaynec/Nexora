"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const testDirectory = path.join(root, "test");
const testFiles = fs.readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.cjs") && name !== "performance.test.cjs")
  .sort()
  .map((name) => path.join("test", name));

if (testFiles.length === 0) {
  console.error("No unit test files were found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.stack || result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
