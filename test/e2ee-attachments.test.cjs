"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const request = require("supertest");
const { claimE2eeAttachment } = require("../server/e2ee-attachments.cjs");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (["post", "put", "patch", "delete"].includes(property)) {
        return (...args) => {
          const builder = target[property](...args).set("X-Nexora-Client-Version", "3.2.0");
          const token = csrf();
          return token ? builder.set("X-Nexora-CSRF", token) : builder;
        };
      }
      if (typeof target[property] === "function") return (...args) => target[property](...args).set("X-Nexora-Client-Version", "3.2.0");
      return target[property];
    },
  });
}

function activateMlsGroup(instance, conversationId) {
  const now = new Date().toISOString();
  instance.store.db.prepare(`INSERT INTO mls_groups(
    id,conversation_id,group_id,ciphersuite,epoch,status,creator_device_id,public_state_hash,created_at,updated_at
  ) VALUES(?,?,?,?,?,'active',?,?,?,?)`).run(
    crypto.randomUUID(), conversationId, crypto.randomBytes(24).toString("base64url"), 1, 0,
    crypto.randomUUID(), crypto.createHash("sha256").update(conversationId).digest("hex"), now, now,
  );
}

async function encryptedFixture(plaintext = Buffer.from("secret attachment bytes")) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    plaintext,
    ciphertext,
    sha256: crypto.createHash("sha256").update(ciphertext).digest("hex"),
  };
}

test("opaque E2EE attachment API validates, stores and deletes ciphertext without plaintext metadata", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-e2ee-attachment-"));
  const instance = await createNexoraServer({ dataDir: directory, clientDir: path.join(__dirname, "..", "client", "dist"), tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true });
  await instance.listen();
  context.after(async () => { await instance.close(); await fs.rm(directory, { recursive: true, force: true }); });

  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({ displayName: "Attachment Guard", username: `attachment_${crypto.randomBytes(4).toString("hex")}`, password: "AttachmentGuard123!" }).expect(201);
  csrf = registered.body.csrfToken;
  const userId = registered.body.user.id;
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  assert.ok(general?.conversationId);
  activateMlsGroup(instance, general.conversationId);

  function uploadAttachment(attachmentId, fixture) {
    return agent.post(`/api/v4/e2ee/conversations/${general.conversationId}/attachments`)
      .set("Content-Type", "application/octet-stream")
      .set("X-Nexora-Attachment-ID", attachmentId)
      .set("X-Nexora-Ciphertext-SHA256", fixture.sha256)
      .set("X-Nexora-Plaintext-Size", String(fixture.plaintext.length))
      .send(fixture.ciphertext);
  }

  const attachmentId = crypto.randomUUID();
  const fixture = await encryptedFixture();
  const created = await uploadAttachment(attachmentId, fixture).expect(201);
  assert.equal(created.body.attachment.id, attachmentId);
  assert.equal(created.body.attachment.size, fixture.ciphertext.length);
  assert.equal(created.body.attachment.plaintextSize, fixture.plaintext.length);
  assert.equal(created.body.attachment.ciphertextSha256, fixture.sha256);

  const duplicate = await uploadAttachment(attachmentId, fixture).expect(200);
  assert.equal(duplicate.body.duplicate, true);

  const file = instance.store.read((state) => state.files.find((item) => item.id === attachmentId));
  assert.equal(file.kind, "encrypted");
  assert.equal(file.mimeType, "application/octet-stream");
  assert.equal(file.pendingE2ee, true);
  assert.equal(file.originalName, `e2ee-${attachmentId}.bin`);
  assert.equal(JSON.stringify(file).includes("secret attachment bytes"), false);
  assert.equal(JSON.stringify(file).includes("AttachmentGuard123"), false);

  await agent.get(`/api/files/${attachmentId}`).expect(404);
  const messageId = crypto.randomUUID();
  await instance.store.mutate((state) => {
    claimE2eeAttachment(state, { attachmentId, conversationId: general.conversationId, uploaderId: userId, messageId });
    state.messages.push({
      id: messageId,
      conversationId: general.conversationId,
      senderId: userId,
      clientId: crypto.randomUUID(),
      type: "encrypted",
      encryptedContentType: "attachment",
      text: "",
      fileId: attachmentId,
      replyToId: null,
      threadRootId: null,
      forwardedFromId: null,
      forwardedSnapshot: null,
      silent: false,
      mentions: [],
      pendingApproval: false,
      mlsEnvelope: { ciphertext: Buffer.alloc(32).toString("base64"), messageHash: crypto.randomBytes(32).toString("hex") },
      createdAt: new Date().toISOString(),
      updatedAt: null,
      deletedAt: null,
      pinnedAt: null,
      pinnedBy: null,
    });
  });

  const downloaded = await agent.get(`/api/files/${attachmentId}`).expect(200);
  assert.deepEqual(downloaded.body, fixture.ciphertext);
  assert.notDeepEqual(downloaded.body, fixture.plaintext);
  await agent.delete(`/api/v4/e2ee/attachments/${attachmentId}`).expect(409);

  const badId = crypto.randomUUID();
  const badHash = await agent.post(`/api/v4/e2ee/conversations/${general.conversationId}/attachments`)
    .set("Content-Type", "application/octet-stream")
    .set("X-Nexora-Attachment-ID", badId)
    .set("X-Nexora-Ciphertext-SHA256", "0".repeat(64))
    .set("X-Nexora-Plaintext-Size", String(fixture.plaintext.length))
    .send(fixture.ciphertext)
    .expect(409);
  assert.equal(badHash.body.code, "E2EE_ATTACHMENT_HASH_MISMATCH");
  assert.equal(instance.store.read((state) => state.files.some((item) => item.id === badId)), false);

  const pendingId = crypto.randomUUID();
  const pendingFixture = await encryptedFixture(Buffer.from("pending ciphertext"));
  await uploadAttachment(pendingId, pendingFixture).expect(201);
  await agent.delete(`/api/v4/e2ee/attachments/${pendingId}`).expect(200);
  assert.equal(instance.store.read((state) => state.files.some((item) => item.id === pendingId)), false);
  await agent.get(`/api/files/${pendingId}`).expect(404);
});

test("claimE2eeAttachment is one-time and scope-bound", () => {
  const attachmentId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const state = { files: [{
    id: attachmentId, conversationId, uploaderId: userId, kind: "encrypted", pendingE2ee: true,
    claimedAt: null, messageId: null, expiresAt: new Date(Date.now() + 60_000).toISOString(), deletedAt: null,
  }] };
  const claimed = claimE2eeAttachment(state, { attachmentId, conversationId, uploaderId: userId, messageId: crypto.randomUUID() });
  assert.equal(claimed.pendingE2ee, false);
  assert.ok(claimed.claimedAt);
  assert.throws(() => claimE2eeAttachment(state, { attachmentId, conversationId, uploaderId: userId, messageId: crypto.randomUUID() }), (error) => error.code === "E2EE_ATTACHMENT_ALREADY_CLAIMED");
});

test("encrypted room media is fail-closed when any media class is disabled", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-e2ee-policy-"));
  const instance = await createNexoraServer({ dataDir: directory, clientDir: path.join(__dirname, "..", "client", "dist"), tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true });
  await instance.listen();
  context.after(async () => { await instance.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({ displayName: "Policy Guard", username: `policy_${crypto.randomBytes(4).toString("hex")}`, password: "PolicyGuardPass123!" }).expect(201);
  csrf = registered.body.csrfToken;
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  activateMlsGroup(instance, general.conversationId);
  await agent.patch(`/api/rooms/${general.id}`).send({ allowVoice: false }).expect(200);
  const fixture = await encryptedFixture(Buffer.from("policy"));
  const blocked = await agent.post(`/api/v4/e2ee/conversations/${general.conversationId}/attachments`)
    .set("Content-Type", "application/octet-stream")
    .set("X-Nexora-Attachment-ID", crypto.randomUUID())
    .set("X-Nexora-Ciphertext-SHA256", fixture.sha256)
    .set("X-Nexora-Plaintext-Size", String(fixture.plaintext.length))
    .send(fixture.ciphertext)
    .expect(403);
  assert.equal(blocked.body.code, "E2EE_MEDIA_POLICY_RESTRICTED");
});
