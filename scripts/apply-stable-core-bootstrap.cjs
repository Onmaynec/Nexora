"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "server", "create-server.cjs");
let source = fs.readFileSync(file, "utf8");

function replaceExact(before, after) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`server/create-server.cjs: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
  "      conversations: conversationList(state, viewerId, online),",
  "      conversations: conversationList(state, viewerId, online).map((conversation) => ({ ...conversation, legacySecure: conversationUsesMls(conversation.id) })),",
);
replaceExact(
  'throw Object.assign(new Error("Диалог защищён MLS. Используйте E2EE transport."), { code: "LEGACY_READ_ONLY", status: 409 });',
  'throw Object.assign(new Error("Legacy secure history доступна только для чтения."), { code: "LEGACY_READ_ONLY", status: 410 });',
);

fs.writeFileSync(file, source);
console.log("Stable Core legacy bootstrap applied");
