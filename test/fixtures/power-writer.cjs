"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { SqliteStore } = require("../../server/store.cjs");

async function main() {
  const databaseFile = path.resolve(process.argv[2]);
  const store = new SqliteStore(databaseFile, { legacyJsonPath: path.join(path.dirname(databaseFile), "nexora.json") });
  await store.init();
  process.stdout.write("READY\n");
  await new Promise((resolve) => setImmediate(resolve));
  await store.mutate((state) => {
    const conversationId = state.conversations[0].id;
    const senderId = state.users[0].id;
    const createdAt = new Date().toISOString();
    for (let index = 0; index < 20_000; index += 1) {
      state.messages.push({
        id: crypto.randomUUID(),
        conversationId,
        senderId,
        clientId: `power-${process.pid}-${index}`,
        type: "text",
        text: `power-cut-${index}`,
        createdAt,
        updatedAt: null,
        deletedAt: null,
        pinnedAt: null,
        pinnedBy: null,
      });
    }
  });
  process.stdout.write("COMMITTED\n");
  await store.close();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
