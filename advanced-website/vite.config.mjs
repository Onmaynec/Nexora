import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

export default defineConfig({
  root: here,
  base: "/Nexora/advanced/",
  plugins: [react()],
  define: {
    __NEXORA_VERSION__: JSON.stringify(packageJson.version),
    __NEXORA_REPOSITORY__: JSON.stringify("Onmaynec/Nexora"),
  },
  build: {
    outDir: path.join(repoRoot, "website", "advanced"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
});
