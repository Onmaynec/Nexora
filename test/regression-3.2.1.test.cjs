"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { PulseCloudClient } = require("../server/pulse-cloud-client.cjs");

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

test("authenticated client requests bootstrap before a Trust device exists", () => {
  const appSource = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");
  assert.match(
    appSource,
    /useEffect\(\(\) => \{\s*if \(authState !== "authenticated" \|\| !me\?\.id \|\| me\.mustChangePassword \|\| bootstrap\) return undefined;\s*refresh\(\);\s*return undefined;\s*\}, \[authState, bootstrap, me\?\.id, me\?\.mustChangePassword, refresh\]\);/,
    "App must load /api/bootstrap immediately after authentication instead of waiting for Trust initialization",
  );
});
