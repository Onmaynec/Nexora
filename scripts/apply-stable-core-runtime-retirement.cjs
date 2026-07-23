"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function file(relative) { return path.join(root, relative); }
function read(relative) { return fs.readFileSync(file(relative), "utf8"); }
function write(relative, value) { fs.writeFileSync(file(relative), value); }
function remove(relative) { fs.rmSync(file(relative), { recursive: true, force: true }); }

function replaceExact(relative, before, after) {
  let source = read(relative);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${relative}: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
  write(relative, source);
}

replaceExact("client/src/components/Workspace.jsx", 'import { loadE2eeDraft } from "../crypto/trust-client";\n', "");
replaceExact(
  "client/src/components/Workspace.jsx",
  '<LegacySecureHistoryPane key={activeConversation.id} conversation={activeConversation} onDetails={() => setDetailsOpen((value) => !value)} showToast={showToast} />',
  '<LegacySecureHistoryPane key={activeConversation.id} conversation={activeConversation} serverId={bootstrap.server?.id} userId={me.id} onDetails={() => setDetailsOpen((value) => !value)} showToast={showToast} />',
);

const packageFile = JSON.parse(read("package.json"));
delete packageFile.dependencies?.["ts-mls"];
write("package.json", `${JSON.stringify(packageFile, null, 2)}\n`);

for (const relative of [
  "client/src/components/SecureMessagePane.jsx",
  "client/src/components/SecureVoicePlayer.jsx",
  "client/src/crypto/e2ee-media.js",
  "client/src/crypto/mls-engine.js",
  "client/src/crypto/mls-recovery.mjs",
  "client/src/crypto/trust-client.js",
  "client/src/crypto/trust-device-management.js",
  "client/src/crypto/trust-store.js",
  "server/e2ee-attachments.cjs",
  "server/mls-transport.cjs",
  "server/trust-core.cjs",
  "server/trust-recovery-routes.cjs",
  "server/trust-routes.cjs",
  "server/trust-socket.cjs",
  "test/mls-interoperability.test.cjs",
  "test/mls-recovery.test.cjs",
  "test/trust-clock.test.cjs",
  "test/trust-core.test.cjs",
  "test/trust-recovery.test.cjs"
]) remove(relative);

console.log("Executable Trust/MLS runtime and ts-mls dependency removed");
