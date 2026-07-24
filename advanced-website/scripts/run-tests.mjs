import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const testRoot = path.join(appRoot, "test");
const files = fs.readdirSync(testRoot)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => path.join("advanced-website", "test", name));

if (!files.length) {
  console.error("No advanced documentation tests were found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: path.resolve(appRoot, ".."),
  env: process.env,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error) {
  console.error(result.error.stack || result.error.message);
  process.exit(1);
}

const output = `${result.stdout || ""}${result.stderr || ""}`;
if (result.status === 0) {
  const summary = output.split(/\r?\n/).filter((line) => /^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line));
  console.log(`Advanced documentation contracts passed across ${files.length} files.`);
  if (summary.length) console.log(summary.join("\n"));
  process.exit(0);
}

const lines = output.split(/\r?\n/);
const selected = new Set();
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index].trimStart();
  if (/^(?:not ok\b|# Subtest:)|AssertionError|ERR_[A-Z_]+|\bError:|\blocation:|\bfailureType:|\bexpected:|\bactual:|\boperator:|^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line)) {
    const before = line.startsWith("not ok") ? 2 : 0;
    const after = line.startsWith("not ok") ? 18 : 2;
    for (let cursor = Math.max(0, index - before); cursor <= Math.min(lines.length - 1, index + after); cursor += 1) selected.add(cursor);
  }
}

console.error(`Advanced documentation contracts failed across ${files.length} files. Concise diagnostics:`);
console.error(selected.size
  ? [...selected].sort((left, right) => left - right).map((index) => lines[index]).join("\n")
  : lines.slice(-200).join("\n"));
process.exit(result.status ?? 1);
