"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "check-release-consistency.cjs");
const source = fs.readFileSync(file, "utf8");
const before = "    `docs/releases/${version}/RELEASE_NOTES.md`,";
const after = "    \"docs/releases/$version/RELEASE_NOTES.md\",";
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Expected one dynamic release notes marker, found ${count}`);
fs.writeFileSync(file, source.replace(before, after), "utf8");
console.log("Release consistency now validates the canonical dynamic release-notes path.");
