"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const request = require("supertest");
const { appendEvent } = require("../server/events.cjs");
const {
  encryptSecret,
  normalizePushSubscription,
  notificationAllowed,
  parseTokenKey,
  safeFilename,
  sniffMime,
} = require("../server/mobile-continuity.cjs");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (typeof target[property] !== "function") return target[property];
      return (...args) => {
        const builder = target[property](...args)
          .set("X-Nexora-Client-Version", "3.5.0")
          .set("X-Nexora-Device-ID", "mobile-continuity-test-device")
          .set("X-Nexora-Device-Name", "Mobile Continuity Test")
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("event replay retention remains monotonic and bounded", () => {
  const state = {
    meta: { lastEventSequence: 0 },
    settings: { eventRetentionLimit: 1_000 },
    events: [],
  };
  for (let index = 0; index < 1_025; index += 1) appendEvent(state, { type: "test.event", global: true, payload: { index } });
  assert.equal(state.meta.lastEventSequence, 1_025);
  assert.equal(state.events.length, 1_000);
  assert.equal(state.events[0].sequence, 26);
  assert.equal(state.meta.firstRetainedEventSequence, 26);
  assert.equal(state.events.at(-1).version, 1);
  assert.equal(state.events.at(-1).scope, "global");
});

test("notification policy is enforced before dispatch", () => {
  const state = {
    users: [{ id: "u1", notificationMode: "mentions", quietHoursStart: "", quietHoursEnd: "" }],
    conversationSettings: [{ userId: "u1", conversationId: "c1", muted: false, notificationMode: "mentions" }],
  };
  assert.equal(notificationAllowed(state, "u1", "c1"), false);
  assert.equal(notificationAllowed(state, "u1", "c1", { mention: true }), true);
  state.conversationSettings[0].muted = true;
  assert.equal(notificationAllowed(state, "u1", "c1", { mention: true }), false);
  state.conversationSettings[0].muted = false;
  state.users[0].quietHoursStart = "00:00";
  state.users[0].quietHoursEnd = "23:59";
  assert.equal(notificationAllowed(state, "u1", "c1", { mention: true, date: new Date("2026-07-24T12:00:00") }), false);
});

test("push tokens are validated and encrypted without plaintext", () => {
  const auth = { user: { id: "u1" }, session: { id: "s1", deviceId: "device-12345678" } };
  const normalized = normalizePushSubscription({
    provider: "fcm",
    token: "provider-token-that-must-never-be-stored-as-plaintext",
    installationId: "installation-12345678",
  }, auth, "server-12345678");
  assert.equal(normalized.previewPolicy, "generic");
  const key = parseTokenKey("a sufficiently long test-only encryption key value");
  assert.equal(key.length, 32);
  const encrypted = encryptSecret(normalized.token, key);
  assert.ok(encrypted.length > normalized.token.length / 2);
  assert.equal(encrypted.includes(normalized.token), false);
  assert.throws(() => normalizePushSubscription({ provider: "unknown", token: "1234567890123456", installationId: "installation-12345678" }, auth, "server"), /provider/i);
});

test("filename and MIME guards reject executable disguises", () => {
  assert.equal(safeFilename("../../dangerous?.txt"), "_.._dangerous_.txt");
  assert.equal(sniffMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "image/png"), "application/x-executable");
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "application/octet-stream"), "image/png");
});

test("schema 9 API keeps push secrets private and resumes uploads from confirmed offset", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-mobile-continuity-"));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pushTokenKey: "mobile-continuity-test-key-that-is-long-enough",
  });
  context.after(async () => {
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const status = await instance.listen();
  assert.equal(status.schemaVersion, 9);
  assert.equal(status.mobileContinuity.tokenPlaintextStored, false);
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({
    displayName: "Mobile Continuity",
    username: `mobile_${crypto.randomBytes(4).toString("hex")}`,
    password: "MobileContinuity123!",
  }).expect(201);
  csrf = registered.body.csrfToken;
  const userId = registered.body.user.id;
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const conversationId = bootstrap.body.rooms.find((room) => room.slug === "general").conversationId;

  const providerToken = "fcm-provider-token-that-must-remain-encrypted-1234567890";
  const push = await agent.post("/api/v3/devices/push-subscriptions")
    .set("Idempotency-Key", "push-registration-12345678")
    .send({ provider: "fcm", token: providerToken, installationId: "installation-12345678" })
    .expect(201);
  assert.equal(push.body.subscription.previewPolicy, "generic");
  assert.equal(JSON.stringify(push.body).includes(providerToken), false);
  const pushRow = instance.store.db.prepare("SELECT * FROM mobile_push_subscriptions WHERE id=?").get(push.body.subscription.id);
  assert.equal(pushRow.user_id, userId);
  assert.equal(pushRow.token_ciphertext.includes(providerToken), false);
  assert.equal(pushRow.token_hash, sha256(providerToken));

  const duplicatePush = await agent.post("/api/v3/devices/push-subscriptions")
    .set("Idempotency-Key", "push-registration-12345678")
    .send({ provider: "fcm", token: providerToken, installationId: "installation-12345678" })
    .expect(200);
  assert.equal(duplicatePush.body.duplicate, true);

  const payload = Buffer.from("resumable upload body");
  const uploadHash = sha256(payload);
  const initialized = await agent.post(`/api/conversations/${conversationId}/uploads/init`)
    .set("Idempotency-Key", "upload-contract-12345678")
    .send({ name: "continuity.txt", mimeType: "text/plain", kind: "file", size: payload.length, sha256: uploadHash })
    .expect(201);
  const uploadId = initialized.body.upload.id;
  assert.equal(initialized.body.upload.confirmedOffset, 0);

  const mismatch = await agent.put(`/api/conversations/${conversationId}/uploads/${uploadId}/chunks`)
    .set("Content-Type", "application/octet-stream")
    .set("Upload-Offset", "1")
    .send(payload)
    .expect(409);
  assert.equal(mismatch.body.code, "UPLOAD_OFFSET_MISMATCH");
  assert.equal(mismatch.body.details.confirmedOffset, 0);

  const chunk = await agent.put(`/api/conversations/${conversationId}/uploads/${uploadId}/chunks`)
    .set("Content-Type", "application/octet-stream")
    .set("Upload-Offset", "0")
    .send(payload)
    .expect(200);
  assert.equal(chunk.body.confirmedOffset, payload.length);

  const duplicateChunk = await agent.put(`/api/conversations/${conversationId}/uploads/${uploadId}/chunks`)
    .set("Content-Type", "application/octet-stream")
    .set("Upload-Offset", "0")
    .send(payload)
    .expect(200);
  assert.equal(duplicateChunk.body.duplicate, true);
  assert.equal(duplicateChunk.body.confirmedOffset, payload.length);

  const completed = await agent.post(`/api/conversations/${conversationId}/uploads/${uploadId}/complete`)
    .send({ caption: "resumed", duration: 0, waveform: [] })
    .expect(201);
  assert.equal(completed.body.sha256, uploadHash);
  assert.equal(completed.body.message.file.name, "continuity.txt");
  assert.equal(completed.body.message.file.size, payload.length);

  const duplicateComplete = await agent.post(`/api/conversations/${conversationId}/uploads/${uploadId}/complete`)
    .send({})
    .expect(200);
  assert.equal(duplicateComplete.body.duplicate, true);
  assert.equal(duplicateComplete.body.message.id, completed.body.message.id);

  const diagnostics = await agent.get("/api/v3/sync/diagnostics").expect(200);
  assert.equal(diagnostics.body.diagnostics.contentIncluded, false);
  assert.equal(JSON.stringify(diagnostics.body).includes(providerToken), false);
  assert.equal(diagnostics.body.diagnostics.serverId, status.serverId);

  await agent.delete(`/api/v3/devices/push-subscriptions/${push.body.subscription.id}`).expect(200);
  const revoked = instance.store.db.prepare("SELECT revoked_at FROM mobile_push_subscriptions WHERE id=?").get(push.body.subscription.id);
  assert.ok(revoked.revoked_at);
});

test("resumable upload fails closed on hash mismatch and removes temporary bytes", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-mobile-hash-"));
  const instance = await createNexoraServer({
    dataDir: directory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
    pushTokenKey: "mobile-continuity-test-key-that-is-long-enough",
  });
  context.after(async () => {
    await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await instance.listen();
  let csrf = "";
  const agent = browserAgent(request.agent(instance.app), () => csrf);
  const registered = await agent.post("/api/auth/register").send({ displayName: "Hash Guard", username: `hash_${crypto.randomBytes(4).toString("hex")}`, password: "HashGuard123!" }).expect(201);
  csrf = registered.body.csrfToken;
  const bootstrap = await agent.get("/api/bootstrap").expect(200);
  const conversationId = bootstrap.body.rooms.find((room) => room.slug === "general").conversationId;
  const payload = Buffer.from("hash mismatch");
  const initialized = await agent.post(`/api/conversations/${conversationId}/uploads/init`)
    .set("Idempotency-Key", "upload-hash-mismatch-1234")
    .send({ name: "hash.txt", mimeType: "text/plain", kind: "file", size: payload.length, sha256: "0".repeat(64) })
    .expect(201);
  const uploadId = initialized.body.upload.id;
  await agent.put(`/api/conversations/${conversationId}/uploads/${uploadId}/chunks`)
    .set("Content-Type", "application/octet-stream")
    .set("Upload-Offset", "0")
    .send(payload)
    .expect(200);
  const failed = await agent.post(`/api/conversations/${conversationId}/uploads/${uploadId}/complete`).send({}).expect(422);
  assert.equal(failed.body.code, "VALIDATION_FAILED");
  const row = instance.store.db.prepare("SELECT status,temp_name FROM mobile_upload_sessions WHERE id=?").get(uploadId);
  assert.equal(row.status, "failed");
  await assert.rejects(fs.stat(path.join(directory, "resumable-uploads", row.temp_name)), (error) => error.code === "ENOENT");
});
