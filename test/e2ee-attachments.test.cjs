"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const request = require("supertest");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args)
          .set("X-Nexora-Client-Version", "3.4.0")
          .set("X-Nexora-Device-ID", "legacy-history-test-device")
          .set("X-Nexora-Device-Name", "Legacy history test")
          .set("X-Nexora-Platform", "web");
        if (["post", "put", "patch", "delete"].includes(property)) {
          const token = csrf();
          if (token) builder.set("X-Nexora-CSRF", token);
        }
        return builder;
      };
    },
  });
}

function installLegacyHistory(instance, { conversationId, senderId }) {
  const now = new Date().toISOString();
  const groupRecordId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const ciphertext = crypto.randomBytes(96).toString("base64");
  instance.store.db.prepare(`INSERT INTO mls_groups(
    id,conversation_id,group_id,ciphersuite,epoch,status,creator_device_id,public_state_hash,created_at,updated_at
  ) VALUES(?,?,?,?,?,'active',?,?,?,?)`).run(
    groupRecordId,
    conversationId,
    crypto.randomBytes(24).toString("base64url"),
    1,
    7,
    crypto.randomUUID(),
    crypto.randomBytes(32).toString("hex"),
    now,
    now,
  );
  return instance.store.mutate((state) => {
    state.messages.push({
      id: messageId,
      conversationId,
      senderId,
      clientId: crypto.randomUUID(),
      type: "encrypted",
      encryptedContentType: "attachment",
      text: "plaintext-must-never-be-exported",
      fileId: null,
      replyToId: null,
      threadRootId: null,
      forwardedFromId: null,
      forwardedSnapshot: null,
      silent: false,
      mentions: [],
      pendingApproval: false,
      mlsEnvelope: {
        groupRecordId,
        epoch: 7,
        generation: 3,
        ciphertext,
        messageHash: crypto.createHash("sha256").update(ciphertext).digest("hex"),
      },
      createdAt: now,
      updatedAt: null,
      deletedAt: null,
      pinnedAt: null,
      pinnedBy: null,
    });
    return { groupRecordId, messageId, ciphertext };
  });
}

test("legacy encrypted attachments are immutable and ciphertext remains exportable without plaintext", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-legacy-history-"));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });
  await instance.listen();
  context.after(async () => {
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({
    displayName: "Legacy History",
    username: `legacy_${crypto.randomBytes(4).toString("hex")}`,
    password: "LegacyHistoryPass123!",
  }).expect(201);
  csrf = registered.body.csrfToken;
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  assert.ok(general?.conversationId);
  const legacy = await installLegacyHistory(instance, {
    conversationId: general.conversationId,
    senderId: registered.body.user.id,
  });

  const beforeFiles = instance.store.read((state) => state.files.length);
  const incomingDir = path.join(directory, "uploads", ".incoming");
  const beforeIncoming = (await fs.readdir(incomingDir)).sort();
  const blocked = await agent.post(`/api/v4/e2ee/conversations/${general.conversationId}/attachments`)
    .set("Content-Type", "application/octet-stream")
    .set("X-Nexora-Attachment-ID", crypto.randomUUID())
    .set("X-Nexora-Ciphertext-SHA256", "0".repeat(64))
    .send(crypto.randomBytes(64))
    .expect(410);
  assert.equal(blocked.body.code, "LEGACY_READ_ONLY");
  assert.match(blocked.body.requestId, /^[A-Za-z0-9_.:-]{8,128}$/);
  assert.equal(instance.store.read((state) => state.files.length), beforeFiles);
  assert.deepEqual((await fs.readdir(incomingDir)).sort(), beforeIncoming);

  const conversations = await agent.get("/api/v3/legacy-secure/conversations").expect(200);
  const conversation = conversations.body.conversations.find((item) => item.conversationId === general.conversationId);
  assert.equal(conversation.readOnly, true);
  assert.equal(conversation.state, "exportable");
  assert.equal(conversation.messageCount, 1);

  const messages = await agent.get(`/api/v3/legacy-secure/conversations/${general.conversationId}/messages`).expect(200);
  assert.equal(messages.body.messages.length, 1);
  assert.equal(messages.body.messages[0].ciphertext, legacy.ciphertext);
  assert.equal(messages.body.messages[0].readOnly, true);
  assert.equal(Object.hasOwn(messages.body.messages[0], "text"), false);

  const exported = await agent.post(`/api/v3/legacy-secure/conversations/${general.conversationId}/export`).send({}).expect(200);
  assert.equal(exported.body.export.serverDecrypted, false);
  assert.equal(exported.body.export.messages[0].ciphertext, legacy.ciphertext);
  assert.equal(JSON.stringify(exported.body).includes("plaintext-must-never-be-exported"), false);
});
