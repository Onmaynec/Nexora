"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "website", "site-fixes.css");
const before = fs.readFileSync(file, "utf8");
const unsafe = `  .stage-orbit,
  .floating-signal,
  .call-pulse,
  [data-tilt] {
    animation: none !important;
    transform: none !important;
  }`;
const safe = `  .stage-orbit,
  .floating-signal,
  .call-pulse,
  [data-tilt] {
    animation-play-state: paused !important;
    transform: none !important;
  }`;
const occurrences = before.split(unsafe).length - 1;
if (occurrences !== 1) throw new Error(`Expected one reduced-motion block, found ${occurrences}.`);
fs.writeFileSync(file, before.replace(unsafe, safe), "utf8");
console.log("Applied targeted reduced-motion behavior without globally disabling animations.");
