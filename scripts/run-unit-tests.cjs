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

for (const file of testFiles) {
  const result = spawnSync(process.execPath, ["--test", file], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 || result.error) {
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    const diagnostic = combined
      .split(/\r?\n/)
      .filter((line) => /not ok|assert|error|expected|actual|failure|ERR_|at .+\(.+\)|testCodeFailure/i.test(line))
      .slice(-80)
      .join("\n");
    console.error(`DIAGNOSTIC UNIT FAILURE: ${file}`);
    console.error(diagnostic || combined.split(/\r?\n/).slice(-40).join("\n"));
    if (result.error) console.error(result.error.stack || result.error.message);
    process.exit(result.status ?? 1);
  }
}

console.log(`DIAGNOSTIC UNIT PASS: ${testFiles.length} files`);
