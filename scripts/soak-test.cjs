"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

const minutes = Math.max(0.02, Number(process.env.NEXORA_SOAK_MINUTES) || 60);
const intervalMs = Math.max(250, Number(process.env.NEXORA_SOAK_INTERVAL_MS) || 5_000);

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-soak-"));
  const instance = await createNexoraServer({ dataDir: directory, tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true });
  await instance.listen();
  const deadline = Date.now() + minutes * 60_000;
  let cycles = 0;
  try {
    await instance.store.mutate((state) => {
      const createdAt = new Date().toISOString();
      state.users.push({ id: "soak-user", username: "soak", displayName: "Soak", status: "", avatarFileId: null, notificationSound: "none", passwordSalt: "x", passwordHash: "x", role: "server_admin", createdAt, disabledAt: null, mustChangePassword: false });
      const room = { id: "soak-room", name: "Soak", slug: "soak", privacy: "private", ownerId: "soak-user", inviteCode: null, joinPolicy: "invite", readOnly: false, slowModeSeconds: 0, allowFiles: true, allowImages: true, allowVoice: true, createdAt };
      state.rooms.push(room);
      state.roomMembers.push({ roomId: room.id, userId: "soak-user", role: "owner", joinedAt: createdAt });
      state.conversations.push({ id: "soak-conversation", type: "room", roomId: room.id, userIds: [], createdAt });
    });
    while (Date.now() < deadline) {
      await instance.store.mutate((state) => state.messages.push({ id: crypto.randomUUID(), conversationId: "soak-conversation", senderId: "soak-user", clientId: crypto.randomUUID(), type: "text", text: `soak cycle ${cycles}`, createdAt: new Date().toISOString(), updatedAt: null, deletedAt: null, pinnedAt: null, pinnedBy: null }));
      if (cycles % 12 === 0) await instance.createBackup();
      if (!instance.store.integrityCheck().ok) throw new Error("SQLite integrity check failed");
      if (instance.status().schemaVersion !== 9) throw new Error(`Unexpected schema version: ${instance.status().schemaVersion}`);
      cycles += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
    }
    console.log(`SOAK OK: ${minutes} min, ${cycles} cycles, schema=${instance.status().schemaVersion}, integrity=${instance.store.integrityCheck().details}`);
  } finally {
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
