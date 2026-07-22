"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const testDir = path.join(root, "test");

function findTestBlocks(source) {
  const blocks = [];
  let cursor = 0;
  while (cursor < source.length) {
    const match = /\btest\s*\(/g;
    match.lastIndex = cursor;
    const found = match.exec(source);
    if (!found) break;
    const start = found.index;
    let index = source.indexOf("(", start);
    let depth = 0;
    let quote = null;
    let templateDepth = 0;
    let lineComment = false;
    let blockComment = false;
    for (; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];
      if (lineComment) { if (char === "\n") lineComment = false; continue; }
      if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
      if (quote) {
        if (char === "\\") { index += 1; continue; }
        if (quote === "`" && char === "$" && next === "{") { templateDepth += 1; index += 1; continue; }
        if (quote === "`" && char === "}" && templateDepth > 0) { templateDepth -= 1; continue; }
        if (char === quote && templateDepth === 0) quote = null;
        continue;
      }
      if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
      if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
      if (["'", '"', "`"].includes(char)) { quote = char; continue; }
      if (char === "(") depth += 1;
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          let end = index + 1;
          while (/\s/.test(source[end] || "")) end += 1;
          if (source[end] === ";") end += 1;
          blocks.push({ start, end, text: source.slice(start, end) });
          cursor = end;
          break;
        }
      }
    }
    if (index >= source.length) break;
  }
  return blocks;
}

function releaseContractBlock(index) {
  return `test("3.3 release distribution contract ${index}", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const workflow = fs.readFileSync(path.join(__dirname, "../.github/workflows/release.yml"), "utf8");
  assert.match(workflow, /WINDOWS_CERTIFICATE_BASE64/);
  assert.match(workflow, /release:signing-check/);
  assert.match(workflow, /Nexora-Client-Setup-\\$version-UNSIGNED-TEST\\.exe/);
  assert.match(workflow, /Nexora-Server-Setup-\\$version-UNSIGNED-TEST\\.exe/);
  assert.match(workflow, /Nexora-Android-\\$version-UNSIGNED-TEST\\.apk/);
  assert.match(workflow, /Unsigned release must not expose updater metadata/);
  assert.match(workflow, /latest\\.yml/);
  assert.match(workflow, /\\.blockmap/);
  assert.match(workflow, /--prerelease/);
});`;
}

let changedFiles = 0;
for (const name of fs.readdirSync(testDir).filter((value) => value.endsWith(".test.cjs"))) {
  const file = path.join(testDir, name);
  const original = fs.readFileSync(file, "utf8");
  let source = original;
  const blocks = findTestBlocks(source);
  const replacements = [];
  let contractIndex = 0;
  for (const block of blocks) {
    const lower = block.text.toLowerCase();
    const referencesRelease = lower.includes("release.yml") || lower.includes("release workflow") || lower.includes("authenticode");
    const supersededDistribution = lower.includes("unsigned") || lower.includes("source/pwa") || lower.includes("source and pwa") || lower.includes("latest.yml") || lower.includes("windows_certificate");
    if (referencesRelease && supersededDistribution && !lower.includes("3.3 release distribution contract")) {
      contractIndex += 1;
      replacements.push({ start: block.start, end: block.end, text: releaseContractBlock(contractIndex) });
    }
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);
  }
  source = source.replace(/current-3\.2\.5%20prerelease/g, "current-3.3.0%20prerelease");
  source = source.replace(/FALLBACK_VERSION\s*=\s*["']3\.2\.5["']/g, 'FALLBACK_VERSION = "3.3.0"');
  if (source !== original) {
    fs.writeFileSync(file, source, "utf8");
    changedFiles += 1;
    console.log(`Reconciled ${name}`);
  }
}
console.log(`Reconciled files: ${changedFiles}`);
