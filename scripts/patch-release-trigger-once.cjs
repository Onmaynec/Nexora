"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "release.yml");
const source = fs.readFileSync(workflowPath, "utf8");
const before = "startsWith(github.event.workflow_run.head_commit.message, 'release:'))";
const after = "startsWith(github.event.workflow_run.head_commit.message, 'release: Nexora '))";

if (!source.includes(before)) {
  if (source.includes(after)) {
    console.log("Release trigger is already restricted.");
    process.exit(0);
  }
  throw new Error("Expected release trigger expression was not found");
}

fs.writeFileSync(workflowPath, source.replace(before, after), "utf8");
console.log("Restricted automatic release trigger to canonical Nexora release commits.");
