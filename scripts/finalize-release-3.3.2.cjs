"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function replaceRemaining(relativePath, before, after) {
  const file = path.join(root, relativePath);
  const source = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, source.split(before).join(after), "utf8");
}

replaceRemaining("docs/README.md", "Current through 3.3.1", "Current through 3.3.2");
replaceRemaining("docs/README.md", "current 3.3.1 behavior", "current 3.3.2 behavior");
replaceRemaining("docs/README.md", "current security boundary inherited unchanged by 3.3.1", "current security boundary inherited unchanged by 3.3.2");
replaceRemaining("docs/README.md", "security boundary inherited unchanged by 3.3.1", "security boundary inherited unchanged by 3.3.2");
replaceRemaining("docs/README.md", "[Release Verification 3.3.1](../RELEASE_VERIFICATION_3.3.1.md)", "[Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md)");

console.log("Finalized repeated 3.3.2 documentation status markers.");
