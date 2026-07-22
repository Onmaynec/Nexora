import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const requiredIds = ["main", "capabilities", "architecture", "platforms", "documentation", "limitations"];
const requiredFiles = ["styles.css", "app.js", "assets/favicon.svg", "assets/og-cover.svg", "robots.txt"];

for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing required section #${id}`);
}
for (const file of requiredFiles) {
  const info = await stat(path.join(root, file));
  if (!info.isFile() || info.size === 0) throw new Error(`Missing or empty file: ${file}`);
}
if (!html.includes("https://github.com/Onmaynec/Nexora")) throw new Error("Repository link is missing");
if (!html.includes("MIT")) throw new Error("License section is missing");
if (/<script[^>]+src=["']https?:/i.test(html) || /<link[^>]+href=["']https?:/i.test(html)) {
  throw new Error("External runtime assets are not allowed");
}
console.log("Nexora website validation passed.");
