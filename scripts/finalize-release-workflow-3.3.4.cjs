"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github/workflows/release.yml");
const before = fs.readFileSync(workflowPath, "utf8");
const oldMarker = '$notes = "RELEASE_NOTES_$version.md"';
const newMarker = '$notes = "docs/releases/$version/RELEASE_NOTES.md"';

if (!before.includes(oldMarker)) {
  throw new Error(`Expected release notes marker is missing: ${oldMarker}`);
}
if (before.includes(newMarker)) {
  throw new Error("Canonical release notes path already exists; refusing duplicate transformation.");
}

const after = before.replace(oldMarker, newMarker);
if ((after.match(/docs\/releases\/\$version\/RELEASE_NOTES\.md/g) || []).length !== 1) {
  throw new Error("Canonical notes path must occur exactly once.");
}
fs.writeFileSync(workflowPath, after, "utf8");
fs.rmSync(__filename, { force: true });
console.log("Release workflow now publishes canonical versioned notes.");
