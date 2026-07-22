"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "server", "store.cjs");
let source = fs.readFileSync(file, "utf8");
const before = `    this.queue = operation;\n    return operation;`;
const after = `    this.queue = operation.catch(() => {});\n    return operation;`;
const first = source.indexOf(before);
if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
  throw new Error("Expected exactly one SqliteStore mutation queue assignment.");
}
source = source.replace(before, after);
fs.writeFileSync(file, source, "utf8");
