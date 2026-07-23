"use strict";

const fs = require("node:fs");
const path = require("node:path");

// This one-shot helper is removed by CI after the current documentation pass.
const file = path.resolve(__dirname, "..", "CONTRIBUTING.md");
const source = fs.readFileSync(file, "utf8");
const before = "| Repository version | `3.3.1` |";
const after = "| Repository version | `3.3.2` |";
if (!source.includes(before)) throw new Error("CONTRIBUTING.md current version marker was not found");
fs.writeFileSync(file, source.replace(before, after), "utf8");
console.log("Synchronized CONTRIBUTING.md with Nexora 3.3.2.");
