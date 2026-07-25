"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "apply-connect-finalization.cjs");
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
const start = lines.findIndex((line) => line.includes("source = replaceExactly(source, `  for (const relativePath of temporaryPaths)"));
if (start < 0) throw new Error("Obsolete temporaryPaths finalization anchor was not found.");
const end = lines.findIndex((line, index) => index > start && line.trim() === "return source;");
if (end < 0) throw new Error("Finalization return anchor was not found.");
const repaired = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
fs.writeFileSync(file, repaired.endsWith("\n") ? repaired : `${repaired}\n`, "utf8");
console.log("Removed obsolete temporaryPaths finalization anchor.");
