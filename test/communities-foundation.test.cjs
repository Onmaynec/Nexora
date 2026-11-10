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
      .set("X-Nexora-Device-ID", "communities-test-device-01")
      .set("X-Nexora-Device-Name", "Communities Test")
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

test("experimental Communities enforces hierarchy, role, invite, moderation and ownership invariants", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-communities-"));
  let instance = null;
  try {
    const clientDir = path.join(directory, "client-dist");
    await fs.mkdir(clientDir);
    await fs.writeFile(path.join(clientDir, "index.html"), "<!doctype html><html><body>Test</body></html>");
    instance = await createNexoraServer({
      dataDir: directory,
      clientDir,
      tls: false,
      redirect: false,
      port: 0,
      host: "127.0.0.1",
      quiet: true,
      experimentalCommunities: true,
      pushTokenKey: "communities-test-push-secret-length-ok",
      turnSecret: "communities-test-turn-secret-length-ok",
    });
    await instance.listen();
    assert.equal(instance.status().schemaVersion, 10);
    assert.equal(instance.status().communities.experimental, true);
    const owner = account(instance.app), bob = account(instance.app), carol = account(instance.app);
    const [aliceUser, bobUser, carolUser] = await Promise.all([
      owner.register("CommunityAlice"), bob.register("CommunityBob"), carol.register("CommunityCarol"),
    ]);

    const anonymous = await request(instance.app).get("/api/v3/communities");
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, "AUTH_REQUIRED");

    const created = await owner.post("/api/v3/communities", { name: "Product Team", description: "Private work and public chat" }).expect(201);
    assert.match(created.headers["cache-control"], /no-store/);
    const id = created.body.community.id;
    assert.equal(created.body.community.ownerId, aliceUser.id);
    assert.equal(created.body.community.viewerRole, "owner");
    assert.equal(created.body.community.memberCount, 1);
    assert.equal((await bob.get("/api/v3/communities")).body.communities.length, 0);
    await bob.get("/api/v3/communities/" + id).expect(404);
    await bob.post("/api/v3/communities/" + id + "/categories", { name: "Secret" }).expect(404);

    const category = await owner.post("/api/v3/communities/" + id + "/categories", { name: "Operations" }).expect(201);
    const hiddenCategory = await owner.post("/api/v3/communities/" + id + "/categories", { name: "Owner planning" }).expect(201);
    await owner.patch("/api/v3/communities/" + id + "/categories/" + category.body.category.id, { name: "Operations HQ" }).expect(200);
    const publicChannel = await owner.post("/api/v3/communities/" + id + "/channels", {
      name: "General", kind: "text", categoryId: category.body.category.id, isPrivate: false,
    }).expect(201);
    const privateChannel = await owner.post("/api/v3/communities/" + id + "/channels", {
      name: "Executive", kind: "announcement", categoryId: hiddenCategory.body.category.id, isPrivate: true,
    }).expect(201);
    const categoryRevision = (await owner.get("/api/v3/communities/" + id)).body.community.revision;
    await owner.patch("/api/v3/communities/" + id + "/categories/order", {
      ids: [hiddenCategory.body.category.id, category.body.category.id], expectedRevision: categoryRevision,
    }).expect(200);
    await owner.patch("/api/v3/communities/" + id + "/categories/order", {
      ids: [category.body.category.id, hiddenCategory.body.category.id], expectedRevision: categoryRevision,
    }).expect(409);
    const privateId = privateChannel.body.channel.id;
    await owner.remove("/api/v3/communities/" + id + "/categories/" + hiddenCategory.body.category.id).expect(409);

    const oneUse = await owner.post("/api/v3/communities/" + id + "/invites", { maxUses: 1, expiresInHours: 2 }).expect(201);
    assert.equal(oneUse.body.code.length > 30, true);
    const attempts = await Promise.all([
      bob.post("/api/v3/communities/join", { code: oneUse.body.code }),
      carol.post("/api/v3/communities/join", { code: oneUse.body.code }),
    ]);
    assert.deepEqual(attempts.map((value) => value.status).sort(), [200, 409]);
    const winner = attempts[0].status === 200 ? bob : carol;
    const winnerId = attempts[0].status === 200 ? bobUser.id : carolUser.id;
    const loser = attempts[0].status === 200 ? carol : bob;
    const loserId = attempts[0].status === 200 ? carolUser.id : bobUser.id;
    const repeated = await winner.post("/api/v3/communities/join", { code: oneUse.body.code }).expect(200);
    assert.equal(repeated.body.alreadyMember, true);

    const publicView = await winner.get("/api/v3/communities/" + id).expect(200);
    assert.equal(publicView.body.community.channels.length, 1);
    assert.equal(publicView.body.community.channels[0].id, publicChannel.body.channel.id);
    assert.equal(publicView.body.community.categories.length, 1);
    assert.equal(publicView.body.community.categories[0].id, category.body.category.id);
    await winner.get("/api/v3/communities/" + id + "/channels/" + privateId).expect(404);
    await winner.post("/api/v3/communities/" + id + "/channels", { name: "Illegal" }).expect(403);
    await loser.get("/api/v3/communities/" + id).expect(404);

    const role = await owner.post("/api/v3/communities/" + id + "/roles", {
      name: "Private reader", permissions: ["channel.view_private"],
    }).expect(201);
    await owner.put("/api/v3/communities/" + id + "/members/" + winnerId + "/roles/" + role.body.role.id, {}).expect(200);
    const privateView = await winner.get("/api/v3/communities/" + id + "/channels/" + privateId).expect(200);
    assert.equal(privateView.body.channel.name, "Executive");
    const readableCategories = (await winner.get("/api/v3/communities/" + id)).body.community.categories;
    assert.equal(readableCategories.some((item) => item.id === hiddenCategory.body.category.id), true);
    assert.equal((await owner.get("/api/v3/communities/" + id + "/roles").expect(200)).body.roles.length, 1);
    await winner.get("/api/v3/communities/" + id + "/roles").expect(403);
    await winner.post("/api/v3/communities/" + id + "/roles", {
      name: "Owner override", permissions: ["roles.manage"],
    }).expect(400);

    const revision = (await owner.get("/api/v3/communities/" + id)).body.community.revision;
    const order = [privateId, publicChannel.body.channel.id];
    await owner.patch("/api/v3/communities/" + id + "/channels/order", { ids: order, expectedRevision: revision }).expect(200);
    await owner.patch("/api/v3/communities/" + id + "/channels/order", { ids: order, expectedRevision: revision }).expect(409);
    assert.deepEqual((await owner.get("/api/v3/communities/" + id)).body.community.channels.map((item) => item.id), order);
    await owner.patch("/api/v3/communities/" + id + "/channels/" + privateId, { name: "Leadership" }).expect(200);
    assert.equal((await owner.get("/api/v3/communities/" + id + "/channels/" + privateId).expect(200)).body.channel.name, "Leadership");
    await owner.remove("/api/v3/communities/" + id + "/channels/" + publicChannel.body.channel.id).expect(200);
    assert.equal((await owner.get("/api/v3/communities/" + id)).body.community.channels.length, 1);

    const secondInvite = await owner.post("/api/v3/communities/" + id + "/invites", { maxUses: 2, expiresInHours: 1 }).expect(201);
    await loser.post("/api/v3/communities/join", { code: secondInvite.body.code }).expect(200);
    const report = await loser.post("/api/v3/communities/" + id + "/reports", { userId: winnerId, reason: "Repeated spam" }).expect(201);
    await loser.get("/api/v3/communities/" + id + "/reports").expect(403);
    await owner.patch("/api/v3/communities/" + id + "/members/" + winnerId + "/role", { role: "moderator" }).expect(200);
    const memberList = (await owner.get("/api/v3/communities/" + id + "/members").expect(200)).body.members;
    assert.equal(memberList.some((item) => item.userId === winnerId && item.role === "moderator"), true);
    assert.equal((await winner.get("/api/v3/communities/" + id + "/reports").expect(200)).body.reports.length, 1);
    await winner.patch("/api/v3/communities/" + id + "/reports/" + report.body.reportId, { state: "resolved" }).expect(200);
    await winner.patch("/api/v3/communities/" + id + "/reports/" + report.body.reportId, { state: "rejected" }).expect(409);
    assert.ok((await winner.get("/api/v3/communities/" + id + "/audit").expect(200)).body.entries.some((e) => e.action === "report.resolved"));
    await loser.get("/api/v3/communities/" + id + "/audit").expect(403);
    await winner.post("/api/v3/communities/" + id + "/bans/" + aliceUser.id, { reason: "Owner protected" }).expect(403);
    await winner.post("/api/v3/communities/" + id + "/bans/" + loserId, { reason: "Repeated spam" }).expect(200);
    await loser.get("/api/v3/communities/" + id).expect(404);
    await loser.post("/api/v3/communities/join", { code: secondInvite.body.code }).expect(403);
    const revokable = await owner.post("/api/v3/communities/" + id + "/invites", { maxUses: 2, expiresInHours: 1 }).expect(201);
    const revokableList = (await owner.get("/api/v3/communities/" + id + "/invites").expect(200)).body.invites;
    const pending = revokableList.find((item) => item.uses === 0 && !item.revokedAt);
    assert.ok(pending);
    await owner.post("/api/v3/communities/" + id + "/reports", { userId: aliceUser.id, reason: "Self report" }).expect(400);
    await owner.remove("/api/v3/communities/" + id + "/invites/" + revokable.body.inviteId).expect(200);
    await loser.post("/api/v3/communities/join", { code: revokable.body.code }).expect(404);
    const revokedList = (await owner.get("/api/v3/communities/" + id + "/invites").expect(200)).body.invites;
    assert.ok(revokedList.some((item) => item.id === revokable.body.inviteId && item.revokedAt));

    await winner.post("/api/v3/communities/" + id + "/transfer", { userId: winnerId }).expect(403);
    await owner.post("/api/v3/communities/" + id + "/transfer", { userId: winnerId }).expect(200);
    const counts = instance.store.db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE community_id=? AND role='owner'").get(id);
    assert.equal(counts.n, 1);
    assert.equal((await winner.get("/api/v3/communities/" + id)).body.community.ownerId, winnerId);
    await owner.post("/api/v3/communities/" + id + "/roles", { name: "Denied", permissions: [] }).expect(403);
    await owner.post("/api/v3/communities/" + id + "/leave", {}).expect(200);
    await owner.get("/api/v3/communities/" + id).expect(404);
    await winner.post("/api/v3/communities/" + id + "/leave", {}).expect(409);
    assert.equal(instance.store.db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE community_id=? AND role='owner'").get(id).n, 1);
    const consumed = instance.store.db.prepare("SELECT uses,max_uses FROM community_invites WHERE code_hash=?").get(
      crypto.createHash("sha256").update(oneUse.body.code).digest("hex"),
    );
    assert.deepEqual({ uses: consumed.uses, maxUses: consumed.max_uses }, { uses: 1, maxUses: 1 });
    assert.equal(instance.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value, "10");
  } finally {
    if (instance) await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
