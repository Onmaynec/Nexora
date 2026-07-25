"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function appendOnce(relativePath, marker, addition) {
  const file = path.join(root, relativePath);
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(marker)) throw new Error(`${relativePath} already contains ${marker}`);
  fs.writeFileSync(file, `${source.trimEnd()}\n\n${addition.trim()}\n`, "utf8");
}

appendOnce(
  "docs/releases/3.6.0/RELEASE_NOTES.md",
  "## Planned signed release assets",
  `## Planned signed release assets

Stable publication is signed-only and, after every blocker is closed, must include signed Windows Client/Server installers, both blockmaps, \`latest.yml\`, \`server.yml\`, the signed Android APK, PWA/source archives, SPDX SBOM, signature evidence, runtime release evidence and \`SHA256SUMS.txt\`.

The release workflow creates an immutable annotated \`v3.6.0\`, publishes the assets once, re-downloads them into a clean directory and verifies every checksum and signer identity. No unsigned stable fallback or partial updater metadata is permitted.`,
);

appendOnce(
  "website/site-fixes.css",
  "@media (prefers-reduced-motion: reduce)",
  `@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  .stage-orbit,
  .floating-signal,
  .call-pulse,
  [data-tilt] {
    animation: none !important;
    transform: none !important;
  }
}`,
);

console.log("Applied Connect release asset notes and reduced-motion fallback.");
