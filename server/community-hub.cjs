"use strict";

const crypto = require("node:crypto");

const MAX_RULES_LENGTH = 3000;
const MAX_EVENTS = 200;
const MAX_JOIN_REQUESTS = 1000;
const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/;

function mountCommunityHub({ app, db, guarded, ok, fail, validId, access, permissions, withTransaction, audit, io }) {
  db.exec([
    "CREATE TABLE IF NOT EXISTS community_hub_settings (community_id TEXT PRIMARY KEY, rules_text TEXT NOT NULL DEFAULT '', rules_version INTEGER NOT NULL DEFAULT 0, discoverable INTEGER NOT NULL DEFAULT 0 CHECK(discoverable IN (0,1)), updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS community_rule_acceptance (community_id TEXT NOT NULL, user_id TEXT NOT NULL, version INTEGER NOT NULL, accepted_at TEXT NOT NULL, PRIMARY KEY(community_id,user_id))",
    "CREATE TABLE IF NOT EXISTS community_join_requests (community_id TEXT NOT NULL, user_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','approved','rejected')), created_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, PRIMARY KEY(community_id,user_id))",
    "CREATE INDEX IF NOT EXISTS community_join_queue ON community_join_requests(community_id,state,created_at,user_id)",
    "CREATE TABLE IF NOT EXISTS community_events (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('scheduled','cancelled')), created_by TEXT NOT NULL, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS community_events_timeline ON community_events(community_id,starts_at,id)",
    "CREATE TABLE IF NOT EXISTS community_event_rsvps (event_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('going','interested','declined')), updated_at TEXT NOT NULL, PRIMARY KEY(event_id,user_id))",
  ].join(";\n") + ";");

  function now() { return new Date().toISOString(); }
  function text(value, max) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail("VALIDATION_FAILED");
    return value.trim();
  }
  function pageLimit(request, max = 50) {
    const limit = request.query.limit == null ? 20 : Number(request.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) fail("VALIDATION_FAILED");
    return limit;
  }
  function parseCursor(raw, field) {
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string" || raw.length > 512) fail("VALIDATION_FAILED");
    let value;
    try { value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); }
    catch { fail("VALIDATION_FAILED"); }
    if (!value || typeof value !== "object" || Array.isArray(value)
      || typeof value[field] !== "string" || !ISO.test(value[field])
      || !Number.isFinite(Date.parse(value[field]))
      || typeof value.id !== "string" || !/^[A-Za-z0-9_.:-]{8,160}$/.test(value.id)) fail("VALIDATION_FAILED");
    return value;
  }
  function encodeCursor(value, field) {
    return Buffer.from(JSON.stringify({ [field]: value[field], id: value.id })).toString("base64url");
  }
  function settings(id) {
    return db.prepare("SELECT rules_text AS rulesText,rules_version AS rulesVersion,discoverable FROM community_hub_settings WHERE community_id=?").get(id)
      || { rulesText: "", rulesVersion: 0, discoverable: 0 };
  }
  function isMember(id, userId) {
    return Boolean(db.prepare("SELECT 1 FROM community_members WHERE community_id=? AND user_id=?").get(id, userId));
  }
  function isBanned(id, userId) {
    return Boolean(db.prepare("SELECT 1 FROM community_bans WHERE community_id=? AND user_id=?").get(id, userId));
  }
  function manager(id, userId, permission) {
    const scope = access(db, id, userId);
    if (!permissions(db, id, userId, scope.role).has(permission)) fail("FORBIDDEN", 403);
    return scope;
  }
  function canReview(id, userId) {
    return Boolean(permissions(db, id, userId, access(db, id, userId).role).has("members.moderate"));
  }
  function eventView(row) {
    return {
      id: row.id, title: row.title, description: row.description,
      startsAt: row.startsAt, endsAt: row.endsAt, status: row.status,
      goingCount: row.goingCount, interestedCount: row.interestedCount,
      myRsvp: row.myRsvp || null,
    };
  }

  // Public discovery: only opt-in communities, no member list, private channels or invite secrets.
  app.get("/api/v3/communities/discovery/search", ...guarded((request, userId) => {
    const limit = pageLimit(request, 30);
    const q = request.query.q == null ? "" : request.query.q;
    if (typeof q !== "string" || q.length > 80) fail("VALIDATION_FAILED");
    const cursor = parseCursor(request.query.cursor, "createdAt");
    const escaped = q.trim().replace(/[!%_]/g, (char) => "!" + char);
    const cursorSql = cursor ? " AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))" : "";
    const params = [userId, userId, "%" + escaped + "%", "%" + escaped + "%"];
    if (cursor) params.push(cursor.createdAt, cursor.createdAt, cursor.id);
    params.push(limit + 1);
    const rows = db.prepare("SELECT c.id,c.name,c.description,c.created_at AS createdAt,"
      + "(SELECT COUNT(*) FROM community_members mm WHERE mm.community_id=c.id) AS memberCount "
      + "FROM communities c JOIN community_hub_settings hs ON hs.community_id=c.id "
      + "LEFT JOIN community_members m ON m.community_id=c.id AND m.user_id=? "
      + "LEFT JOIN community_bans b ON b.community_id=c.id AND b.user_id=? "
      + "WHERE hs.discoverable=1 AND m.user_id IS NULL AND b.user_id IS NULL "
      + "AND (c.name LIKE ? ESCAPE '!' OR c.description LIKE ? ESCAPE '!')"
      + cursorSql + " ORDER BY c.created_at DESC,c.id DESC LIMIT ?").all(...params);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return ok({
      communities: items.map(({ createdAt, ...item }) => item),
      nextCursor: rows.length > limit && last ? encodeCursor(last, "createdAt") : null,
    });
  }));

  app.get("/api/v3/communities/:communityId/hub", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const scope = access(db, id, userId);
    const value = settings(id);
    const accepted = db.prepare("SELECT version FROM community_rule_acceptance WHERE community_id=? AND user_id=?").get(id, userId);
    return ok({
      hub: {
        rulesText: value.rulesText,
        rulesVersion: value.rulesVersion,
        discoverable: Boolean(value.discoverable),
        acceptedVersion: accepted?.version || 0,
        requiresAcceptance: scope.role !== "owner" && Boolean(value.rulesText) && (accepted?.version || 0) < value.rulesVersion,
        canEdit: scope.community.owner_id === userId,
      },
    });
  }));

  app.patch("/api/v3/communities/:communityId/hub", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)
        || !Object.keys(body).length || Object.keys(body).some((key) => !["rulesText", "discoverable"].includes(key)))
      fail("VALIDATION_FAILED");
    if (body.rulesText !== undefined && (typeof body.rulesText !== "string" || body.rulesText.trim().length > MAX_RULES_LENGTH))
      fail("VALIDATION_FAILED");
    if (body.discoverable !== undefined && typeof body.discoverable !== "boolean") fail("VALIDATION_FAILED");
    return withTransaction(db, () => {
      const scope = access(db, id, userId);
      if (scope.community.owner_id !== userId) fail("FORBIDDEN", 403);
      const previous = settings(id);
      const rulesText = body.rulesText === undefined ? previous.rulesText : body.rulesText.trim();
      const discoverable = body.discoverable === undefined ? previous.discoverable : Number(body.discoverable);
      const rulesVersion = previous.rulesVersion + Number(rulesText !== previous.rulesText);
      db.prepare("INSERT INTO community_hub_settings VALUES (?,?,?,?,?) "
        + "ON CONFLICT(community_id) DO UPDATE SET rules_text=excluded.rules_text,rules_version=excluded.rules_version,discoverable=excluded.discoverable,updated_at=excluded.updated_at")
        .run(id, rulesText, rulesVersion, discoverable, now());
      audit(db, id, userId, "hub.settings_updated");
      return ok({ hub: { rulesText, rulesVersion, discoverable: Boolean(discoverable) } });
    });
  }, true));

  app.post("/api/v3/communities/:communityId/hub/rules/accept", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const version = request.body?.version;
    if (!Number.isSafeInteger(version) || version < 1) fail("VALIDATION_FAILED");
    return withTransaction(db, () => {
      access(db, id, userId);
      const current = settings(id);
      if (!current.rulesText || current.rulesVersion !== version) fail("STATE_CONFLICT", 409);
      db.prepare("INSERT INTO community_rule_acceptance VALUES (?,?,?,?) "
        + "ON CONFLICT(community_id,user_id) DO UPDATE SET version=excluded.version,accepted_at=excluded.accepted_at")
        .run(id, userId, current.rulesVersion, now());
      return ok({ acceptedVersion: current.rulesVersion });
    });
  }, true));

  app.post("/api/v3/communities/:communityId/hub/join-requests", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    return withTransaction(db, () => {
      const target = db.prepare("SELECT c.id,hs.discoverable FROM communities c "
        + "JOIN community_hub_settings hs ON hs.community_id=c.id WHERE c.id=?").get(id);
      if (!target || !target.discoverable || isBanned(id, userId)) fail("RESOURCE_NOT_FOUND", 404);
      if (isMember(id, userId)) fail("STATE_CONFLICT", 409);
      const old = db.prepare("SELECT state,created_at AS createdAt FROM community_join_requests WHERE community_id=? AND user_id=?")
        .get(id, userId);
      if (old?.state === "open") return ok({ state: "open", existing: true });
      if (old && Date.now() - Date.parse(old.createdAt) < 24 * 3600_000) fail("RATE_LIMITED", 429);
      if (db.prepare("SELECT COUNT(*) AS n FROM community_join_requests WHERE community_id=? AND state='open'").get(id).n >= MAX_JOIN_REQUESTS)
        fail("RESOURCE_LIMIT", 409);
      db.prepare("INSERT INTO community_join_requests (community_id,user_id,state,created_at) VALUES (?,?,'open',?) "
        + "ON CONFLICT(community_id,user_id) DO UPDATE SET state='open',created_at=excluded.created_at,reviewed_by=NULL,reviewed_at=NULL")
        .run(id, userId, now());
      audit(db, id, userId, "join.requested");
      return ok({ state: "open", existing: false }, 201);
    });
  }, true));

  app.get("/api/v3/communities/:communityId/hub/join-requests", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    manager(id, userId, "members.moderate");
    const limit = pageLimit(request);
    const cursor = parseCursor(request.query.cursor, "createdAt");
    const extra = cursor ? " AND (created_at > ? OR (created_at = ? AND user_id > ?))" : "";
    const args = cursor ? [id, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1] : [id, limit + 1];
    const rows = db.prepare("SELECT user_id AS id,created_at AS createdAt FROM community_join_requests "
      + "WHERE community_id=? AND state='open'" + extra + " ORDER BY created_at,user_id LIMIT ?").all(...args);
    const items = rows.slice(0, limit), last = items.at(-1);
    return ok({
      requests: items.map(({ id: userId, createdAt }) => ({ userId, createdAt })),
      nextCursor: rows.length > limit && last ? encodeCursor(last, "createdAt") : null,
    });
  }));

  app.patch("/api/v3/communities/:communityId/hub/join-requests/:userId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), targetId = validId(request.params.userId);
    const decision = request.body?.decision;
    if (!["approve", "reject"].includes(decision)) fail("VALIDATION_FAILED");
    withTransaction(db, () => {
      manager(id, userId, "members.moderate");
      const pending = db.prepare("SELECT state FROM community_join_requests WHERE community_id=? AND user_id=?").get(id, targetId);
      if (!pending || pending.state !== "open") fail("STATE_CONFLICT", 409);
      if (isBanned(id, targetId)) fail("FORBIDDEN", 403);
      if (decision === "approve") {
        if (isMember(id, targetId)) fail("STATE_CONFLICT", 409);
        const members = db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE community_id=?").get(id).n;
        if (members >= 10000) fail("RESOURCE_LIMIT", 409);
        db.prepare("INSERT INTO community_members VALUES (?,?,?,?)").run(id, targetId, "member", now());
      }
      db.prepare("UPDATE community_join_requests SET state=?,reviewed_by=?,reviewed_at=? WHERE community_id=? AND user_id=?")
        .run(decision === "approve" ? "approved" : "rejected", userId, now(), id, targetId);
      audit(db, id, userId, decision === "approve" ? "join.approved" : "join.rejected", targetId);
    });
    io?.to("user:" + targetId).emit("data:refresh");
    return ok({});
  }, true));

  const eventsPath = "/api/v3/communities/:communityId/hub/events";
  app.get(eventsPath, ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    access(db, id, userId);
    const mode = request.query.mode == null ? "upcoming" : request.query.mode;
    if (!["upcoming", "past"].includes(mode)) fail("VALIDATION_FAILED");
    const limit = pageLimit(request);
    const cursor = parseCursor(request.query.cursor, "startsAt");
    const dir = mode === "upcoming" ? ">" : "<";
    const order = mode === "upcoming" ? "ASC" : "DESC";
    const timeSql = mode === "upcoming" ? "ends_at>=?" : "ends_at<?";
    const extra = cursor ? " AND (starts_at " + dir + " ? OR (starts_at = ? AND id " + dir + " ?))" : "";
    const args = [userId, id, now()];
    if (cursor) args.push(cursor.startsAt, cursor.startsAt, cursor.id);
    args.push(limit + 1);
    const rows = db.prepare("SELECT e.id,e.title,e.description,e.starts_at AS startsAt,e.ends_at AS endsAt,e.status,"
      + "(SELECT COUNT(*) FROM community_event_rsvps x WHERE x.event_id=e.id AND x.status='going') AS goingCount,"
      + "(SELECT COUNT(*) FROM community_event_rsvps x WHERE x.event_id=e.id AND x.status='interested') AS interestedCount,"
      + "r.status AS myRsvp FROM community_events e "
      + "LEFT JOIN community_event_rsvps r ON r.event_id=e.id AND r.user_id=? "
      + "WHERE e.community_id=? AND e." + timeSql + extra
      + " ORDER BY e.starts_at " + order + ",e.id " + order + " LIMIT ?").all(...args);
    const items = rows.slice(0, limit), last = items.at(-1);
    return ok({
      events: items.map(eventView),
      nextCursor: rows.length > limit && last ? encodeCursor(last, "startsAt") : null,
    });
  }));

  app.post(eventsPath, ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const title = text(request.body?.title, 120);
    const description = request.body?.description == null ? "" : request.body.description;
    if (typeof description !== "string" || description.trim().length > 1000) fail("VALIDATION_FAILED");
    const startsAt = request.body?.startsAt, endsAt = request.body?.endsAt;
    if (typeof startsAt !== "string" || !ISO.test(startsAt)
      || typeof endsAt !== "string" || !ISO.test(endsAt)) fail("VALIDATION_FAILED");
    const start = Date.parse(startsAt), end = Date.parse(endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() + 60_000
      || start > Date.now() + 366 * 86400_000 || end <= start || end - start > 24 * 3600_000) fail("VALIDATION_FAILED");
    const eventId = withTransaction(db, () => {
      manager(id, userId, "events.manage");
      const active = db.prepare("SELECT COUNT(*) AS n FROM community_events WHERE community_id=? AND status='scheduled' AND ends_at>=?")
        .get(id, now()).n;
      if (active >= MAX_EVENTS) fail("RESOURCE_LIMIT", 409);
      const eventId = crypto.randomUUID();
      db.prepare("INSERT INTO community_events VALUES (?,?,?,?,?,?,?,?,?)")
        .run(eventId, id, title, description.trim(), startsAt, endsAt, "scheduled", userId, now());
      audit(db, id, userId, "event.created", eventId);
      return eventId;
    });
    return ok({ eventId }, 201);
  }, true));

  app.patch(eventsPath + "/:eventId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), eventId = validId(request.params.eventId);
    if (request.body?.status !== "cancelled") fail("VALIDATION_FAILED");
    withTransaction(db, () => {
      manager(id, userId, "events.manage");
      const result = db.prepare("UPDATE community_events SET status='cancelled' "
        + "WHERE id=? AND community_id=? AND status='scheduled'").run(eventId, id);
      if (result.changes !== 1) fail("STATE_CONFLICT", 409);
      audit(db, id, userId, "event.cancelled", eventId);
    });
    return ok({});
  }, true));

  app.put(eventsPath + "/:eventId/rsvp", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), eventId = validId(request.params.eventId);
    const status = request.body?.status;
    if (!["going", "interested", "declined"].includes(status)) fail("VALIDATION_FAILED");
    withTransaction(db, () => {
      access(db, id, userId);
      const event = db.prepare("SELECT status,ends_at AS endsAt FROM community_events WHERE community_id=? AND id=?")
        .get(id, eventId);
      if (!event) fail("RESOURCE_NOT_FOUND", 404);
      if (event.status !== "scheduled" || Date.parse(event.endsAt) < Date.now()) fail("STATE_CONFLICT", 409);
      db.prepare("INSERT INTO community_event_rsvps VALUES (?,?,?,?) "
        + "ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at")
        .run(eventId, userId, status, now());
    });
    return ok({ status });
  }, true));

  return { status: () => ({ discovery: true, rules: true, joinRequests: true, events: true }) };
}

module.exports = { mountCommunityHub };
