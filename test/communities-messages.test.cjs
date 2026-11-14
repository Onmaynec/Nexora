"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

function account(server) {
  let csrf = "";
  const agent = request.agent(server);
  const apply = (method, url, body) => {
    let call = agent[method](url)
      .set("X-Nexora-Client-Version", "3.6.0")
      .set("X-Nexora-Device-ID", "community-messages-test-01")
      .set("X-Nexora-Device-Name", "Community messages test")
      .set("X-Nexora-Platform", "web");
    if (["post", "patch", "put", "delete"].includes(method) && csrf) call = call.set("X-Nexora-CSRF", csrf);
    return body === undefined ? call : call.send(body);
  };
  return {
    register: async (label) => {
      const created = await apply("post", "/api/auth/register", {
        username: label.toLowerCase() + "_" + crypto.randomBytes(3).toString("hex"),
        displayName: label,
        password: "CommunitiesTest123!",
      }).expect(201);
      csrf = created.body.csrfToken;
      return created.body.user;
    },
    get: (url) => apply("get", url),
    post: (url, body) => apply("post", url, body),
    patch: (url, body) => apply("patch", url, body),
    put: (url, body) => apply("put", url, body),
    remove: (url) => apply("delete", url),
  };
}
const nonce = () => crypto.randomUUID();

test("Communities messages enforce scoped read/write, announcements, idempotency, moderation and cursor safety", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-message-tests-"));
  let server = null;
  try {
    const clientDir = path.join(directory, "client-dist");
    await fs.mkdir(clientDir);
    await fs.writeFile(path.join(clientDir, "index.html"), "<!doctype html><html><body>Test</body></html>");
    server = await createNexoraServer({
      dataDir: directory, clientDir, tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true,
      experimentalCommunities: true,
      pushTokenKey: "community-messages-test-push-secret-length-ok",
      turnSecret: "community-messages-test-turn-secret-length-ok",
    });
    await server.listen();
    assert.equal(server.status().communities.channelMessages, true);
    assert.equal(server.status().schemaVersion, 10);
    const owner = account(server.app), guest = account(server.app), moderator = account(server.app), stranger = account(server.app);
    const [ownerUser, guestUser, modUser] = await Promise.all([
      owner.register("MessagesOwner"), guest.register("MessagesGuest"), moderator.register("MessagesModerator"),
      stranger.register("MessagesStranger"),
    ]);
    const created = await owner.post("/api/v3/communities", { name: "Message Test" }).expect(201);
    const communityId = created.body.community.id;
    const root = "/api/v3/communities/" + communityId;
    const channel = async (name, kind = "text", isPrivate = false) => {
      const r = await owner.post(root + "/channels", { name, kind, isPrivate }).expect(201);
      return root + "/channels/" + r.body.channel.id + "/messages";
    };
    const publicPath = await channel("general");
    const privatePath = await channel("private", "text", true);
    const announcements = await channel("news", "announcement");
    const message = (actor, target, body) => actor.post(target, { body, clientNonce: nonce() });

    await stranger.get(publicPath).expect(404);
    await stranger.post(publicPath, { body: "injected", clientNonce: nonce() }).expect(404);
    await guest.get(publicPath).expect(404);

    const invite = await owner.post(root + "/invites", { maxUses: 3, expiresInHours: 2 }).expect(201);
    await guest.post("/api/v3/communities/join", { code: invite.body.code }).expect(200);
    await moderator.post("/api/v3/communities/join", { code: invite.body.code }).expect(200);
    await guest.get(privatePath).expect(404);
    await guest.post(privatePath, { body: "hidden", clientNonce: nonce() }).expect(404);
    await guest.post(announcements, { body: "not allowed", clientNonce: nonce() }).expect(403);
    const announcement = await message(owner, announcements, "Scheduled maintenance").expect(201);
    assert.equal((await guest.get(announcements).expect(200)).body.messages[0].id, announcement.body.message.id);

    const idempotency = nonce();
    const body = "Message with <b>literal markup</b>";
    const saved = await guest.post(publicPath, { body, clientNonce: idempotency }).expect(201);
    const repeated = await guest.post(publicPath, { body, clientNonce: idempotency }).expect(200);
    assert.equal(repeated.body.message.id, saved.body.message.id);
    assert.equal(saved.body.message.body, body);
    await guest.post(publicPath, { body: "different", clientNonce: idempotency }).expect(409);
    await guest.post(publicPath, { body: "", clientNonce: nonce() }).expect(400);
    await guest.post(publicPath, { body: "valid", clientNonce: "bad-nonce" }).expect(400);
    assert.equal((await owner.get(publicPath).expect(200)).body.messages.length, 1);

    const role = await owner.post(root + "/roles", {
      name: "Private reader", permissions: ["channel.view_private"],
    }).expect(201);
    await owner.put(root + "/members/" + guestUser.id + "/roles/" + role.body.role.id, {}).expect(200);
    await guest.get(privatePath).expect(200);
    const hidden = await message(guest, privatePath, "Only approved viewers").expect(201);
    await stranger.get(privatePath).expect(404);
    await owner.remove(root + "/members/" + guestUser.id + "/roles/" + role.body.role.id).expect(200);
    await guest.get(privatePath).expect(404);
    await guest.remove(privatePath + "/" + hidden.body.message.id).expect(404);

    const guestDeleted = await guest.remove(publicPath + "/" + saved.body.message.id).expect(200);
    assert.equal(guestDeleted.body.ok, true);
    const deleted = (await guest.get(publicPath).expect(200)).body.messages[0];
    assert.ok(deleted.deletedAt);
    assert.equal(deleted.body, "");
    await guest.remove(publicPath + "/" + saved.body.message.id).expect(409);

    const ownerPost = await message(owner, publicPath, "Do not delete owners").expect(201);
    await owner.patch(root + "/members/" + modUser.id + "/role", { role: "moderator" }).expect(200);
    await moderator.remove(publicPath + "/" + ownerPost.body.message.id).expect(403);
    await owner.remove(publicPath + "/" + ownerPost.body.message.id).expect(200);

    // Cursor ordering must be stable even when all timestamps are equal.
    const paged = await channel("paging");
    const ids = new Set();
    for (let index = 0; index < 6; index += 1) {
      const result = await message(moderator, paged, "Message " + index).expect(201);
      ids.add(result.body.message.id);
    }
    const channelId = paged.split("/").at(-2);
    server.store.db.prepare("UPDATE community_channel_messages SET created_at=? WHERE community_id=? AND channel_id=?")
      .run("2025-01-01T00:00:00.000Z", communityId, channelId);
    const seen = new Set();
    let before = null;
    for (let index = 0; index < 8; index += 1) {
      const result = await moderator.get(paged).query({ limit: 2, ...(before ? { before } : {}) }).expect(200);
      for (const item of result.body.messages) {
        assert.equal(seen.has(item.id), false, "message cursor duplicate");
        seen.add(item.id);
      }
      before = result.body.nextCursor;
      if (!before) break;
    }
    assert.deepEqual(seen, ids);
    assert.equal(before, null);
    const corrupted = Buffer.from(JSON.stringify({ createdAt: {}, id: [] })).toString("base64url");
    await moderator.get(paged).query({ before: corrupted }).expect(400);
    await moderator.get(paged).query({ limit: 101 }).expect(400);

    // Immediate membership revocation must also revoke message access.
    await owner.post(root + "/bans/" + guestUser.id, { reason: "Test ban" }).expect(200);
    await guest.get(publicPath).expect(404);
    await guest.post(publicPath, { body: "again", clientNonce: nonce() }).expect(404);
    assert.equal(server.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value, "10");
    assert.ok((await owner.get(root + "/audit").expect(200)).body.entries.some((x) => x.action === "message.deleted"));
    assert.equal(ownerUser.id, created.body.community.ownerId);
  } finally {
    if (server) await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
