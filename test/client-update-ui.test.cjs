"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../client/src/components/SettingsPage.jsx"), "utf8");

test("Client update card exposes progress, terminal state and retry feedback", () => {
  assert.match(source, /async function checkClientUpdates\(\)/);
  assert.match(source, /status: "checking"/);
  assert.match(source, /status: "error", error: message/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /updateBusy \|\| update\?\.status === "checking" \|\| update\?\.status === "downloading"/);
  assert.match(source, /Повторить проверку/);
  assert.doesNotMatch(source, /checkForUpdates\(\)\.then\(setUpdate\)/);
});
