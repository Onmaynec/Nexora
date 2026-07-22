"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Trust configuration is committed before Workspace child passive effects can read encrypted drafts", () => {
  const appSource = read("client/src/App.jsx");
  assert.match(appSource, /import \{[^}]*useLayoutEffect[^}]*\} from "react";/);
  assert.match(
    appSource,
    /useLayoutEffect\(\(\) => \{\s*const serverId = bootstrap\?\.server\?\.id;\s*if \(!me\?\.id \|\| !serverId \|\| me\.mustChangePassword\) return undefined;\s*configureTrust\(\{ serverId, user: me \}\);\s*return undefined;\s*\}, \[bootstrap\?\.server\?\.id, me\?\.id, me\?\.mustChangePassword\]\);/,
    "App must configure Trust in a layout effect before Workspace passive effects run",
  );
});

test("encrypted draft reads are safe during the pre-configuration lifecycle window", () => {
  const trustSource = read("client/src/crypto/trust-client.js");
  assert.match(
    trustSource,
    /export function loadE2eeDraft\(conversationId\) \{\s*if \(!trustConfigured\(\)\) return Promise\.resolve\(""\);\s*const \{ serverId, userId \} = current\(\);\s*return loadEncryptedDraft\(serverId, userId, conversationId\);\s*\}/,
    "A child draft effect must not synchronously throw TRUST_NOT_CONFIGURED before the parent Trust lifecycle is committed",
  );
});

test("Trust initialization remains explicit and does not hide platform or registration failures", () => {
  const appSource = read("client/src/App.jsx");
  assert.match(appSource, /ensureTrustDevice\(\)[\s\S]*setTrustState\(\{ status: "error", device: null, error: error\.code \|\| error\.message \}\)/);
  const trustSource = read("client/src/crypto/trust-client.js");
  assert.match(trustSource, /if \(!crypto\?\.subtle \|\| !globalThis\.indexedDB\) throw Object\.assign/);
  assert.match(trustSource, /TRUST_PLATFORM_UNSUPPORTED/);
});
