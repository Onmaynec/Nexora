"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function update(file, transform) {
  const target = path.join(root, file);
  const before = fs.readFileSync(target, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${file}: patch made no changes`);
  fs.writeFileSync(target, after, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

update("client/src/crypto/trust-client.js", (source) => {
  let next = replaceRequired(
    source,
    `async function claimWelcome(device) {\n  const { serverId, userId } = current();\n  const result = await trustApi("/welcomes/claim", { method: "POST", deviceId: device.id, body: {} });`,
    `async function claimWelcome(device, conversationId) {\n  const { serverId, userId } = current();\n  const result = await trustApi(\`/conversations/\${encodeURIComponent(conversationId)}/welcome/claim\`, { method: "POST", deviceId: device.id, body: {} });`,
    "conversation-scoped Welcome claim",
  );
  next = next.replaceAll("claimWelcome(device)", "claimWelcome(device, conversation.id)");
  return next;
});

console.log("3.2.0 Welcome routing patch applied");
