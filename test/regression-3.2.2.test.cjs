"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Stable Core client connects ordinary chats without Trust bootstrap", () => {
  const appSource = read("client/src/App.jsx");
  assert.doesNotMatch(appSource, /configureTrust|ensureTrustDevice|trustState|trust-client/);
  assert.match(appSource, /socket\.auth = \{ clientVersion: CLIENT_VERSION \}/);
  assert.match(appSource, /socket\.connect\(\)/);
  assert.match(appSource, /session\.revoked/);
});

test("Workspace routes legacy MLS conversations to an immutable viewer", () => {
  const workspace = read("client/src/components/Workspace.jsx");
  assert.doesNotMatch(workspace, /SecureMessagePane|loadE2eeDraft|trustState/);
  assert.match(workspace, /activeConversation\.legacySecure/);
  assert.match(workspace, /LegacySecureHistoryPane/);
  assert.match(workspace, /MessagePane/);
});

test("legacy local storage adapter is read-only and never creates wrapping keys", () => {
  const adapter = read("client/src/legacy/legacy-trust-store.js");
  assert.match(adapter, /indexedDB\.open\(DB_NAME\)/);
  assert.match(adapter, /transaction\(MESSAGE_STORE, "readonly"\)/);
  assert.match(adapter, /transaction\(META_STORE, "readonly"\)/);
  assert.doesNotMatch(adapter, /generateKey|put\(|add\(|readwrite/);
});

test("retired MLS outbox entries are archived terminally and never sent as plaintext", () => {
  const outbox = read("client/src/outbox.js");
  assert.match(outbox, /entry\?\.kind === "mls-message"/);
  assert.match(outbox, /state: "retired"/);
  assert.match(outbox, /error: "LEGACY_READ_ONLY"/);
  assert.doesNotMatch(outbox, /mls:message/);
});
