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
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: false,
});

if (result.error) {
  console.error(result.error.stack || result.error.message);
  process.exit(1);
}

const output = `${result.stdout || ""}${result.stderr || ""}`;
if (result.status === 0) {
  const summary = output.split(/\r?\n/).filter((line) => /^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line));
  console.log(`Unit suite passed across ${testFiles.length} files.`);
  if (summary.length) console.log(summary.join("\n"));
  process.exit(0);
}

const lines = output.split(/\r?\n/);
const selected = new Set();
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^(?:not ok\b|# Subtest:)|AssertionError|ERR_[A-Z_]+|\bError:|\blocation:|\bfailureType:|\bexpected:|\bactual:|\boperator:|^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line.trimStart())) {
    const before = /^not ok\b/.test(line.trimStart()) ? 2 : 0;
    const after = /^not ok\b/.test(line.trimStart()) ? 18 : 2;
    for (let cursor = Math.max(0, index - before); cursor <= Math.min(lines.length - 1, index + after); cursor += 1) {
      selected.add(cursor);
    }
  }
}

console.error(`Unit suite failed across ${testFiles.length} files. Concise diagnostics:`);
if (selected.size) {
  console.error([...selected].sort((left, right) => left - right).map((index) => lines[index]).join("\n"));
} else {
  console.error(lines.slice(-240).join("\n"));
}
process.exit(result.status ?? 1);
