"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { PulseCloudClient } = require("../server/pulse-cloud-client.cjs");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

const root = path.resolve(__dirname, "..");

test("Pulse status remains readable after the local SQLite repository closes during shutdown", () => {
  const closedStoreError = Object.assign(new Error("SQLite store закрыт."), {
    code: "PULSE_LOCAL_STORE_UNAVAILABLE",
  });
  const client = new PulseCloudClient({
    mode: "sandbox",
    serverId: "server-1",
    repository: {
      keyRegistry() {
        throw closedStoreError;
      },
    },
  });

  assert.doesNotThrow(() => client.status());
  assert.equal(client.status().keyCount, 0);
});

test("unexpected repository failures are not hidden by Pulse status", () => {
  const client = new PulseCloudClient({
    mode: "sandbox",
    serverId: "server-1",
    repository: {
      keyRegistry() {
        throw Object.assign(new Error("corrupt"), { code: "SQLITE_CORRUPT" });
      },
    },
  });
  assert.throws(() => client.status(), (error) => error.code === "SQLITE_CORRUPT");
});

test("authenticated client requests bootstrap before a Trust device exists", () => {
  const appSource = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");
  assert.match(
    appSource,
    /useEffect\(\(\) => \{\s*if \(authState !== "authenticated" \|\| !me\?\.id \|\| me\.mustChangePassword \|\| bootstrap\) return undefined;\s*refresh\(\);\s*return undefined;\s*\}, \[authState, bootstrap, me\?\.id, me\?\.mustChangePassword, refresh\]\);/,
    "App must load /api/bootstrap immediately after authentication instead of waiting for Trust initialization",
  );
});

test("schema 8 status remains readable after server close", async () => {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), "nexora-shutdown-regression-"));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(root, "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pulseMode: "sandbox",
  });
  try {
    await instance.listen();
    await instance.close();
    const status = instance.status();
    assert.equal(status.running, false);
    assert.equal(status.schemaVersion, 8);
    assert.equal(status.pulseV3.keyCount, 0);
  } finally {
    await instance.close().catch(() => {});
    await fsPromises.rm(directory, { recursive: true, force: true });
  }
});
