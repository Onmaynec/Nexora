"use strict";

const fs = require("node:fs");
const path = require("node:path");

// One-shot materializer; CI removes this file after applying and verifying the test-only patch.
const root = path.resolve(__dirname, "..");
const file = path.join(root, "test/server.test.cjs");
const source = fs.readFileSync(file, "utf8");

const before = `before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-test-"));
  instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });`;

const after = `before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-test-"));
  const clientDirectory = path.join(directory, "client-dist");
  await fs.mkdir(clientDirectory, { recursive: true });
  await fs.writeFile(
    path.join(clientDirectory, "index.html"),
    '<!doctype html><html lang="ru"><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>',
    "utf8",
  );
  await fs.writeFile(
    path.join(clientDirectory, "nexora-icon.png"),
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2l5sAAAAASUVORK5CYII=", "base64"),
  );
  instance = await createNexoraServer({
    dataDir: directory,
    clientDir: clientDirectory,
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });`;

if (source.includes(after)) {
  console.log("server.test.cjs already uses the hermetic Client fixture.");
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error("Expected server test setup block was not found.");
}

fs.writeFileSync(file, source.replace(before, after), "utf8");
console.log("Patched server.test.cjs to use a hermetic Client fixture.");
