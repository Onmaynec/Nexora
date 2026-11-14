"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const request = require("supertest");
const { createNexoraServer } = require("../server/create-server-v31.cjs");

function account(app) {
  const agent = request.agent(app);
  let csrf = "";
  function call(method, url, body) {
    let req = agent[method](url)
      .set("X-Nexora-Client-Version", "3.6.0")
      .set("X-Nexora-Device-ID", "community-content-test-01")
      .set("X-Nexora-Device-Name", "Communities Hub integration")
      .set("X-Nexora-Platform", "web");
    if (method !== "get" && csrf) req = req.set("X-Nexora-CSRF", csrf);
    return body === undefined ? req : req.send(body);
  }
  return {
    register: async (label) => {
      const result = await call("post", "/api/auth/register", {
        username: label.toLowerCase() + "_" + crypto.randomBytes(3).toString("hex"),
        displayName: label, password: "CommunitiesTest123!",
      }).expect(201);
      csrf = result.body.csrfToken;
      return result.body.user;
    },
    get: (url) => call("get", url),
    post: (url, body) => call("post", url, body),
    patch: (url, body) => call("patch", url, body),
    put: (url, body) => call("put", url, body),
  };
}

test("Community hub enforces owner-managed rules, scoped discovery, join queue, events and RSVP", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-hub-test-"));
  let server;
  try {
    const clientDir = path.join(directory, "client-dist");
    await fs.mkdir(clientDir);
    await fs.writeFile(path.join(clientDir, "index.html"), "<!doctype html><html><body>Test</body></html>");
    server = await createNexoraServer({
      dataDir: directory, clientDir, tls: false, redirect: false, port: 0, host: "127.0.0.1", quiet: true,
      experimentalCommunities: true, pushTokenKey: "community-hub-test-push-secret-length-ok",
      turnSecret: "community-hub-test-turn-secret-length-ok",
    });
    await server.listen();
    const owner = account(server.app);
    const guest = account(server.app);
    const candidate = account(server.app);
    const outsider = account(server.app);
    const [ownerUser, guestUser, candidateUser] = await Promise.all([
      owner.register("HubOwner"), guest.register("HubGuest"), candidate.register("HubCandidate"), outsider.register("HubOutsider"),
    ]);

    const created = await owner.post("/api/v3/communities", { name: "Community Events Hub", description: "Public demo" }).expect(201);
    const id = created.body.community.id, prefix = "/api/v3/communities/" + id;
    const hub = prefix + "/hub";
    const channel = await owner.post(prefix + "/channels", { name: "General", kind: "text" }).expect(201);
    const messages = prefix + "/channels/" + channel.body.channel.id + "/messages";
    assert.equal(server.status().communities.events, true);
    assert.equal(server.status().schemaVersion, 10);
    await outsider.get(hub).expect(404);

    // Discoverability is an explicit owner opt-in; member and banned identities remain private.
    const initial = await candidate.get("/api/v3/communities/discovery/search").expect(200);
    assert.equal(initial.body.communities.some((entry) => entry.id === id), false);
    await guest.patch(hub, { discoverable: true }).expect(404);
    await owner.patch(hub, { rulesText: "Be respectful and kind.", discoverable: true }).expect(200);
    const publicResults = await candidate.get("/api/v3/communities/discovery/search?q=Community").expect(200);
    assert.equal(publicResults.body.communities.some((entry) => entry.id === id), true);
    assert.equal(JSON.stringify(publicResults.body).includes("rulesText"), false);
    await candidate.get("/api/v3/communities/discovery/search").query({ limit: 31 }).expect(400);

    // Moderator approval is required: applicants cannot self-join, bypass bans or read channels.
    const queued = await candidate.post(hub + "/join-requests", {}).expect(201);
    assert.equal(queued.body.state, "open");
    assert.equal((await candidate.post(hub + "/join-requests", {}).expect(200)).body.existing, true);
    await candidate.get(messages).expect(404);
    await candidate.get(hub + "/events").expect(404);
    await guest.get(hub + "/join-requests").expect(404);
    const queue = (await owner.get(hub + "/join-requests").expect(200)).body;
    assert.equal(queue.requests[0].userId, candidateUser.id);
    await owner.patch(hub + "/join-requests/" + candidateUser.id, { decision: "approve" }).expect(200);
    await owner.patch(hub + "/join-requests/" + candidateUser.id, { decision: "approve" }).expect(409);
    assert.equal((await candidate.get(prefix).expect(200)).body.community.viewerRole, "member");
    assert.equal((await candidate.get("/api/v3/communities/discovery/search").expect(200)).body.communities.some((entry) => entry.id === id), false);

    const invite = await owner.post(prefix + "/invites", { maxUses: 1, expiresInHours: 1 }).expect(201);
    await guest.post("/api/v3/communities/join", { code: invite.body.code }).expect(200);
    const current = (await guest.get(hub).expect(200)).body.hub;
    assert.equal(current.rulesVersion, 1);
    assert.equal(current.requiresAcceptance, true);
    await guest.post(messages, { body: "Cannot bypass the rules", clientNonce: crypto.randomUUID() }).expect(403);
    await guest.post(hub + "/rules/accept", { version: 999 }).expect(409);
    await guest.post(hub + "/rules/accept", { version: current.rulesVersion }).expect(200);
    assert.equal((await guest.get(hub).expect(200)).body.hub.requiresAcceptance, false);
    await guest.post(messages, { body: "I agree", clientNonce: crypto.randomUUID() }).expect(201);
    await owner.patch(hub, { rulesText: "New rules, no harassment." }).expect(200);
    assert.equal((await guest.get(hub).expect(200)).body.hub.requiresAcceptance, true);
    await guest.post(messages, { body: "Stale rules", clientNonce: crypto.randomUUID() }).expect(403);
    await guest.post(hub + "/rules/accept", { version: 2 }).expect(200);
    await guest.post(messages, { body: "New rules accepted", clientNonce: crypto.randomUUID() }).expect(201);

    // Calendar content: role boundaries, valid windows, stable cursor order and RSVP counts.
    const eventsUrl = hub + "/events";
    const start = new Date(Date.now() + 3 * 86400_000).toISOString();
    const end = new Date(Date.now() + 3 * 86400_000 + 3600_000).toISOString();
    const payload = { title: "Community Meetup", description: "Join the meetup.", startsAt: start, endsAt: end };
    await guest.post(eventsUrl, payload).expect(403);
    await owner.post(eventsUrl, { ...payload, endsAt: start }).expect(400);
    const event = await owner.post(eventsUrl, payload).expect(201);
    await guest.put(eventsUrl + "/" + event.body.eventId + "/rsvp", { status: "going" }).expect(200);
    await candidate.put(eventsUrl + "/" + event.body.eventId + "/rsvp", { status: "interested" }).expect(200);
    const calendar = (await guest.get(eventsUrl).expect(200)).body;
    assert.equal(calendar.events[0].goingCount, 1);
    assert.equal(calendar.events[0].interestedCount, 1);
    assert.equal(calendar.events[0].myRsvp, "going");

    const customRole = await owner.post(prefix + "/roles", {
      name: "Event Organizer", permissions: ["events.manage"],
    }).expect(201);
    await owner.put(prefix + "/members/" + guestUser.id + "/roles/" + customRole.body.role.id, {}).expect(200);
    const additional = await guest.post(eventsUrl, { ...payload, title: "Second event" }).expect(201);
    const allIds = new Set([event.body.eventId, additional.body.eventId]);
    for (let index = 0; index < 4; index += 1) {
      const r = await owner.post(eventsUrl, { ...payload, title: "Cursor event " + index }).expect(201);
      allIds.add(r.body.eventId);
    }
    const seen = new Set();
    let cursor = null;
    for (let i = 0; i < 8; i += 1) {
      const page = await candidate.get(eventsUrl).query({ limit: 2, ...(cursor ? { cursor } : {}) }).expect(200);
      for (const value of page.body.events) {
        assert.equal(seen.has(value.id), false, "duplicate in event keyset cursor");
        seen.add(value.id);
      }
      cursor = page.body.nextCursor;
      if (!cursor) break;
    }
    assert.deepEqual(seen, allIds);
    const badCursor = Buffer.from(JSON.stringify({ startsAt: {}, id: [] })).toString("base64url");
    await guest.get(eventsUrl).query({ cursor: badCursor }).expect(400);

    await guest.patch(eventsUrl + "/" + event.body.eventId, { status: "cancelled" }).expect(200);
    await candidate.put(eventsUrl + "/" + event.body.eventId + "/rsvp", { status: "going" }).expect(409);

    await owner.patch(hub, { discoverable: false }).expect(200);
    assert.equal((await outsider.get("/api/v3/communities/discovery/search").expect(200)).body.communities.some((entry) => entry.id === id), false);
    await outsider.post(hub + "/join-requests", {}).expect(404);
    assert.equal(server.store.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get().value, "10");
    assert.ok((await owner.get(prefix + "/audit").expect(200)).body.entries.some((entry) => entry.action === "event.created"));
    assert.equal(created.body.community.ownerId, ownerUser.id);
  } finally {
    if (server) await server.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
