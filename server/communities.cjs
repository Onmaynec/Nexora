"use strict";

const crypto = require("node:crypto");
const { mountCommunityChannelMessages } = require("./community-channel-messages.cjs");
const { mountCommunityHub } = require("./community-hub.cjs");

const PERMISSIONS = new Set([
  "channel.create", "channel.order", "channel.view_private", "channel.announce", "events.manage",
  "invites.create", "members.moderate", "reports.manage", "roles.manage",
]);
const ID = /^[A-Za-z0-9_.:-]{8,160}$/;
const PER_MINUTE = 60_000;

class CommunityError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function fail(code, status) { throw new CommunityError(code, status); }
function input(value, max = 80) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validId(value) { if (typeof value !== "string" || !ID.test(value)) fail("VALIDATION_FAILED"); return value; }
function name(value, max = 80) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max) fail("VALIDATION_FAILED");
  return value.trim();
}
function bounded(value, max) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail("VALIDATION_FAILED");
  return value;
}
function now() { return new Date().toISOString(); }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function installTables(db) {
  // Private experimental tables: the schema version and existing room data remain untouched.
  db.exec([
    "CREATE TABLE IF NOT EXISTS communities (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS community_members (community_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','moderator','member')), joined_at TEXT NOT NULL, PRIMARY KEY(community_id,user_id))",
    "CREATE INDEX IF NOT EXISTS community_members_user ON community_members(user_id,community_id)",
    "CREATE TABLE IF NOT EXISTS community_categories (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS community_categories_parent ON community_categories(community_id,position,id)",
    "CREATE TABLE IF NOT EXISTS community_channels (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, category_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('text','announcement')), is_private INTEGER NOT NULL CHECK(is_private IN (0,1)), position INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS community_channels_parent ON community_channels(community_id,position,id)",
    "CREATE TABLE IF NOT EXISTS community_roles (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, name TEXT NOT NULL, permissions TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS community_role_assignments (community_id TEXT NOT NULL, role_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(community_id,role_id,user_id))",
    "CREATE INDEX IF NOT EXISTS community_role_assignments_lookup ON community_role_assignments(community_id,user_id)",
    "CREATE TABLE IF NOT EXISTS community_invites (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 100), uses INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, revoked_at TEXT, created_by TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS community_bans (community_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL, by_user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(community_id,user_id))",
    "CREATE TABLE IF NOT EXISTS community_reports (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, reporter_id TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','resolved','rejected')), created_at TEXT NOT NULL, handled_by TEXT)",
    "CREATE INDEX IF NOT EXISTS community_reports_lookup ON community_reports(community_id,created_at)",
    "CREATE TABLE IF NOT EXISTS community_audit (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS community_audit_scope ON community_audit(community_id,created_at)",
  ].join(";\n") + ";");
}

function withTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function member(db, communityId, userId) {
  return db.prepare("SELECT role FROM community_members WHERE community_id=? AND user_id=?").get(communityId, userId);
}
function community(db, communityId) {
  const row = db.prepare("SELECT * FROM communities WHERE id=?").get(validId(communityId));
  if (!row) fail("RESOURCE_NOT_FOUND", 404);
  return row;
}
function access(db, communityId, userId) {
  const result = community(db, communityId);
  const m = member(db, communityId, userId);
  if (!m) fail("RESOURCE_NOT_FOUND", 404);
  return { community: result, role: m.role };
}
function permissions(db, communityId, userId, role) {
  if (role === "owner") return new Set(PERMISSIONS);
  const out = new Set(role === "moderator" ? [
    "channel.create", "channel.order", "channel.view_private", "channel.announce", "events.manage",
    "invites.create", "members.moderate", "reports.manage",
  ] : []);
  const records = db.prepare("SELECT r.permissions FROM community_roles r JOIN community_role_assignments a ON a.role_id=r.id AND a.community_id=r.community_id WHERE a.community_id=? AND a.user_id=?").all(communityId, userId);
  for (const record of records) {
    try {
      for (const key of JSON.parse(record.permissions)) if (PERMISSIONS.has(key) && key !== "roles.manage" && key !== "members.moderate") out.add(key);
    } catch { fail("POLICY_CORRUPT", 500); }
  }
  return out;
}
function requirePermission(db, id, userId, permission) {
  const scope = access(db, id, userId);
  if (!permissions(db, id, userId, scope.role).has(permission)) fail("FORBIDDEN", 403);
  return scope;
}
function audit(db, id, actorId, action, targetId = null) {
  db.prepare("INSERT INTO community_audit VALUES (?,?,?,?,?,?)").run(crypto.randomUUID(), id, actorId, action, targetId, now());
}
function visibleChannels(db, id, userId, role) {
  const seePrivate = permissions(db, id, userId, role).has("channel.view_private");
  return db.prepare("SELECT id,category_id AS categoryId,name,kind,is_private AS isPrivate,position FROM community_channels WHERE community_id=? ORDER BY position,id")
    .all(id).filter((item) => seePrivate || !item.isPrivate)
    .map((item) => ({ ...item, isPrivate: Boolean(item.isPrivate) }));
}
function view(db, id, userId) {
  const scope = access(db, id, userId);
  const allowed = permissions(db, id, userId, scope.role);
  const channels = visibleChannels(db, id, userId, scope.role);
  const categories = db.prepare("SELECT id,name,position FROM community_categories WHERE community_id=? ORDER BY position,id").all(id)
    .filter((category) => allowed.has("channel.view_private") || channels.some((channel) => channel.categoryId === category.id));
  return {
    id, name: scope.community.name, description: scope.community.description,
    revision: scope.community.revision, ownerId: scope.community.owner_id,
    viewerRole: scope.role,
    permissions: [...allowed].sort(), categories, channels,
    memberCount: db.prepare("SELECT COUNT(*) AS count FROM community_members WHERE community_id=?").get(id).count,
  };
}
function errorResponse(response, error) {
  const status = error instanceof CommunityError ? error.status : 500;
  const code = error instanceof CommunityError ? error.code : "INTERNAL_ERROR";
  response.status(status).json({
    code, message: status === 500 ? "Не удалось выполнить операцию." : "Операция недоступна или запрос некорректен.",
    requestId: response.req?.connectRequestId || response.req?.pulseRequestId || response.req?.nexoraRequestId || null, details: {},
  });
}
function mountCommunities({ app, store, io, authRequired, log = () => {} }) {
  if (!app || !store?.db || !authRequired) throw new Error("Communities requires app, store and authentication");
  const db = store.db;
  installTables(db);
  app.use("/api/v3/communities", (_request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    next();
  });
  const limits = new Map();
  function guarded(handler, mutates = false) {
    return [authRequired, async (request, response) => {
      const userId = request.pulseAuth?.user?.id || request.nexora?.user?.id;
      if (!userId) return errorResponse(response, new CommunityError("AUTH_REQUIRED", 401));
      const key = userId + ":" + (mutates ? "write" : "read");
      const timestamp = Date.now();
      const previous = limits.get(key);
      const bucket = !previous || timestamp - previous.start >= PER_MINUTE ? { start: timestamp, hits: 0 } : previous;
      bucket.hits += 1;
      limits.set(key, bucket);
      if (limits.size > 5000) for (const [k, v] of limits) if (timestamp - v.start >= PER_MINUTE) limits.delete(k);
      if (bucket.hits > (mutates ? 60 : 180)) {
        response.setHeader("Retry-After", String(Math.max(1, Math.ceil((PER_MINUTE - (timestamp - bucket.start)) / 1000))));
        return errorResponse(response, new CommunityError("RATE_LIMITED", 429));
      }
      try {
        const result = await handler(request, userId);
        if (result) response.status(result.status || 200).json(result.body);
        else response.status(204).end();
      } catch (error) {
        if (!(error instanceof CommunityError)) log("Communities request failed", "error");
        errorResponse(response, error);
      }
    }];
  }
  const ok = (body, status = 200) => ({ status, body: { ok: true, ...body } });

  app.get("/api/v3/communities", ...guarded((request, userId) => {
    const limit = request.query.limit == null ? 50 : Number(request.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("VALIDATION_FAILED");
    const cursorParam = request.query.cursor;
    let cursor = null;
    if (cursorParam != null && cursorParam !== "") {
      if (typeof cursorParam !== "string" || cursorParam.length > 512) fail("VALIDATION_FAILED");
      try { cursor = JSON.parse(Buffer.from(cursorParam, "base64url").toString("utf8")); }
      catch { fail("VALIDATION_FAILED"); }
      if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)
          || typeof cursor.createdAt !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(cursor.createdAt)
          || !Number.isFinite(Date.parse(cursor.createdAt))
          || typeof cursor.id !== "string" || !ID.test(cursor.id)) fail("VALIDATION_FAILED");
    }
    const whereCursor = cursor ? " AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))" : "";
    const params = cursor ? [userId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1] : [userId, limit + 1];
    const rows = db.prepare(`SELECT c.id,c.name,c.description,m.role AS viewerRole,c.created_at AS createdAt
      FROM communities c JOIN community_members m ON m.community_id=c.id
      WHERE m.user_id=?${whereCursor} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`).all(...params);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return ok({
      communities: page.map(({ createdAt, ...item }) => item),
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url")
        : null,
    });
  }));

  app.post("/api/v3/communities", ...guarded((request, userId) => {
    const label = name(request.body?.name);
    const description = input(request.body?.description, 500);
    const id = crypto.randomUUID();
    withTransaction(db, () => {
      db.prepare("INSERT INTO communities (id,owner_id,name,description,created_at) VALUES (?,?,?,?,?)").run(id, userId, label, description, now());
      db.prepare("INSERT INTO community_members VALUES (?,?,?,?)").run(id, userId, "owner", now());
      audit(db, id, userId, "community.created");
    });
    return ok({ community: view(db, id, userId) }, 201);
  }, true));

  app.get("/api/v3/communities/:communityId", ...guarded((request, userId) => ok({ community: view(db, request.params.communityId, userId) })));

  app.post("/api/v3/communities/:communityId/categories", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const label = name(request.body?.name);
    const result = withTransaction(db, () => {
      requirePermission(db, id, userId, "channel.create");
      if (db.prepare("SELECT COUNT(*) AS n FROM community_categories WHERE community_id=?").get(id).n >= 100) fail("RESOURCE_LIMIT", 409);
      const categoryId = crypto.randomUUID();
      const position = db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS p FROM community_categories WHERE community_id=?").get(id).p;
      db.prepare("INSERT INTO community_categories VALUES (?,?,?,?)").run(categoryId, id, label, position);
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db, id, userId, "category.created", categoryId);
      return { id: categoryId, name: label, position };
    });
    return ok({ category: result }, 201);
  }, true));

  app.post("/api/v3/communities/:communityId/channels", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const label = name(request.body?.name);
    const kind = request.body?.kind || "text";
    if (!["text", "announcement"].includes(kind)) fail("VALIDATION_FAILED");
    if (request.body?.isPrivate != null && typeof request.body.isPrivate !== "boolean") fail("VALIDATION_FAILED");
    const categoryId = request.body?.categoryId == null ? null : validId(request.body.categoryId);
    const result = withTransaction(db, () => {
      requirePermission(db, id, userId, "channel.create");
      if (categoryId && !db.prepare("SELECT 1 FROM community_categories WHERE id=? AND community_id=?").get(categoryId, id)) fail("RESOURCE_NOT_FOUND", 404);
      if (db.prepare("SELECT COUNT(*) AS n FROM community_channels WHERE community_id=?").get(id).n >= 500) fail("RESOURCE_LIMIT", 409);
      const channelId = crypto.randomUUID();
      const position = db.prepare("SELECT COALESCE(MAX(position),-1)+1 AS p FROM community_channels WHERE community_id=?").get(id).p;
      const isPrivate = request.body?.isPrivate ? 1 : 0;
      db.prepare("INSERT INTO community_channels VALUES (?,?,?,?,?,?,?)").run(channelId, id, categoryId, label, kind, isPrivate, position);
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db, id, userId, "channel.created", channelId);
      return { id: channelId, categoryId, name: label, kind, isPrivate: Boolean(isPrivate), position };
    });
    return ok({ channel: result }, 201);
  }, true));


  app.patch("/api/v3/communities/:communityId/categories/order", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const revision = bounded(request.body?.expectedRevision, Number.MAX_SAFE_INTEGER);
    const order = request.body?.ids;
    if (!Array.isArray(order) || order.length > 100 || !order.every((value) => typeof value === "string" && ID.test(value)) || new Set(order).size !== order.length) fail("VALIDATION_FAILED");
    const next = withTransaction(db, () => {
      const scope = requirePermission(db,id,userId,"channel.order");
      if (scope.community.revision !== revision) fail("STATE_CONFLICT",409);
      const all = db.prepare("SELECT id FROM community_categories WHERE community_id=? ORDER BY position,id").all(id).map((row) => row.id);
      const seePrivate = permissions(db,id,userId,scope.role).has("channel.view_private");
      const visible = seePrivate ? all : all.filter((categoryId) => Boolean(db.prepare(
        "SELECT 1 FROM community_channels WHERE community_id=? AND category_id=? AND is_private=0 LIMIT 1"
      ).get(id,categoryId)));
      if (visible.length !== order.length || visible.some((categoryId) => !order.includes(categoryId))) fail("VALIDATION_FAILED");
      const allowed = new Set(visible);
      let indexVisible = 0;
      const merged = all.map((categoryId) => allowed.has(categoryId) ? order[indexVisible++] : categoryId);
      const update = db.prepare("UPDATE community_categories SET position=? WHERE id=? AND community_id=?");
      merged.forEach((categoryId,index) => update.run(index,categoryId,id));
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db,id,userId,"categories.reordered");
      return scope.community.revision + 1;
    });
    return ok({ revision: next });
  }, true));

  app.patch("/api/v3/communities/:communityId/categories/:categoryId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), categoryId = validId(request.params.categoryId);
    const label = name(request.body?.name);
    withTransaction(db, () => {
      requirePermission(db,id,userId,"channel.create");
      const result = db.prepare("UPDATE community_categories SET name=? WHERE id=? AND community_id=?").run(label,categoryId,id);
      if (result.changes !== 1) fail("RESOURCE_NOT_FOUND",404);
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db,id,userId,"category.updated",categoryId);
    });
    return ok({});
  }, true));

  app.delete("/api/v3/communities/:communityId/categories/:categoryId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), categoryId = validId(request.params.categoryId);
    withTransaction(db, () => {
      requirePermission(db,id,userId,"channel.create");
      if (db.prepare("SELECT 1 FROM community_channels WHERE community_id=? AND category_id=? LIMIT 1").get(id,categoryId)) fail("CATEGORY_NOT_EMPTY",409);
      const result = db.prepare("DELETE FROM community_categories WHERE id=? AND community_id=?").run(categoryId,id);
      if (result.changes !== 1) fail("RESOURCE_NOT_FOUND",404);
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db,id,userId,"category.deleted",categoryId);
    });
    return ok({});
  }, true));

  app.patch("/api/v3/communities/:communityId/channels/order", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const revision = bounded(request.body?.expectedRevision, Number.MAX_SAFE_INTEGER);
    const order = request.body?.ids;
    if (!Array.isArray(order) || order.length > 500 || !order.every((value) => typeof value === "string" && ID.test(value)) || new Set(order).size !== order.length) fail("VALIDATION_FAILED");
    const next = withTransaction(db, () => {
      const scope = requirePermission(db, id, userId, "channel.order");
      if (scope.community.revision !== revision) fail("STATE_CONFLICT", 409);
      const all = db.prepare("SELECT id,is_private AS isPrivate FROM community_channels WHERE community_id=? ORDER BY position,id").all(id);
      const seePrivate = permissions(db,id,userId,scope.role).has("channel.view_private");
      const visible = all.filter((row) => seePrivate || !row.isPrivate).map((row) => row.id);
      if (visible.length !== order.length || visible.some((channelId) => !order.includes(channelId))) fail("VALIDATION_FAILED");
      const allowed = new Set(visible);
      let indexVisible = 0;
      const merged = all.map((row) => allowed.has(row.id) ? order[indexVisible++] : row.id);
      const update = db.prepare("UPDATE community_channels SET position=? WHERE id=? AND community_id=?");
      merged.forEach((channelId,index) => update.run(index,channelId,id));
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db, id, userId, "channels.reordered");
      return scope.community.revision + 1;
    });
    return ok({ revision: next });
  }, true));

  app.patch("/api/v3/communities/:communityId/channels/:channelId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), channelId = validId(request.params.channelId);
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
        Object.keys(body).some((key) => !["name","kind","isPrivate","categoryId"].includes(key))) fail("VALIDATION_FAILED");
    const label = body.name === undefined ? undefined : name(body.name);
    const kind = body.kind;
    if (kind !== undefined && !["text","announcement"].includes(kind)) fail("VALIDATION_FAILED");
    if (body.isPrivate !== undefined && typeof body.isPrivate !== "boolean") fail("VALIDATION_FAILED");
    const categoryId = body.categoryId === undefined ? undefined : body.categoryId == null ? null : validId(body.categoryId);
    withTransaction(db, () => {
      const scope = requirePermission(db,id,userId,"channel.create");
      const existing = db.prepare("SELECT * FROM community_channels WHERE id=? AND community_id=?").get(channelId,id);
      if (!existing || (existing.is_private && !permissions(db,id,userId,scope.role).has("channel.view_private"))) fail("RESOURCE_NOT_FOUND",404);
      if (categoryId && !db.prepare("SELECT 1 FROM community_categories WHERE id=? AND community_id=?").get(categoryId,id)) fail("RESOURCE_NOT_FOUND",404);
      db.prepare("UPDATE community_channels SET name=?,kind=?,is_private=?,category_id=? WHERE id=? AND community_id=?").run(
        label ?? existing.name,kind ?? existing.kind,body.isPrivate === undefined ? existing.is_private : Number(body.isPrivate),
        categoryId === undefined ? existing.category_id : categoryId,channelId,id);
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db,id,userId,"channel.updated",channelId);
    });
    return ok({});
  }, true));

  app.delete("/api/v3/communities/:communityId/channels/:channelId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), channelId = validId(request.params.channelId);
    withTransaction(db, () => {
      const scope = requirePermission(db,id,userId,"channel.create");
      const existing = db.prepare("SELECT is_private FROM community_channels WHERE id=? AND community_id=?").get(channelId,id);
      if (!existing || (existing.is_private && !permissions(db,id,userId,scope.role).has("channel.view_private"))) fail("RESOURCE_NOT_FOUND",404);
      db.prepare("DELETE FROM community_channel_messages WHERE community_id=? AND channel_id=?").run(id,channelId);
      db.prepare("DELETE FROM community_channels WHERE id=? AND community_id=?").run(channelId,id);
      db.prepare("UPDATE communities SET revision=revision+1 WHERE id=?").run(id);
      audit(db,id,userId,"channel.deleted",channelId);
    });
    return ok({});
  }, true));

  app.get("/api/v3/communities/:communityId/channels/:channelId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const scope = access(db, id, userId);
    const c = db.prepare("SELECT id,category_id AS categoryId,name,kind,is_private AS isPrivate,position FROM community_channels WHERE id=? AND community_id=?").get(validId(request.params.channelId), id);
    if (!c || (c.isPrivate && !permissions(db, id, userId, scope.role).has("channel.view_private"))) fail("RESOURCE_NOT_FOUND", 404);
    return ok({ channel: { ...c, isPrivate: Boolean(c.isPrivate) } });
  }));

  app.get("/api/v3/communities/:communityId/members", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    requirePermission(db, id, userId, "members.moderate");
    const limit = request.query.limit == null ? 50 : Number(request.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("VALIDATION_FAILED");
    let cursor = null;
    if (request.query.cursor != null && request.query.cursor !== "") {
      if (typeof request.query.cursor !== "string" || request.query.cursor.length > 512) fail("VALIDATION_FAILED");
      try { cursor = JSON.parse(Buffer.from(request.query.cursor, "base64url").toString("utf8")); }
      catch { fail("VALIDATION_FAILED"); }
      if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)
          || typeof cursor.joinedAt !== "string"
          || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(cursor.joinedAt)
          || !Number.isFinite(Date.parse(cursor.joinedAt))
          || typeof cursor.userId !== "string" || !ID.test(cursor.userId)) fail("VALIDATION_FAILED");
    }
    const clause = cursor ? " AND (joined_at > ? OR (joined_at = ? AND user_id > ?))" : "";
    const params = cursor ? [id, cursor.joinedAt, cursor.joinedAt, cursor.userId, limit + 1] : [id, limit + 1];
    const rows = db.prepare(`SELECT user_id AS userId,role,joined_at AS joinedAt FROM community_members
      WHERE community_id=?${clause} ORDER BY joined_at,user_id LIMIT ?`).all(...params);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return ok({
      members: page,
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ joinedAt: last.joinedAt, userId: last.userId })).toString("base64url")
        : null,
    });
  }));

  app.get("/api/v3/communities/:communityId/roles", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    requirePermission(db,id,userId,"roles.manage");
    const roles = db.prepare("SELECT id,name,permissions FROM community_roles WHERE community_id=? ORDER BY name LIMIT 30").all(id)
      .map((row) => ({ ...row, permissions: JSON.parse(row.permissions) }));
    return ok({ roles });
  }));

  app.get("/api/v3/communities/:communityId/invites", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    requirePermission(db,id,userId,"invites.create");
    const invites = db.prepare("SELECT id,max_uses AS maxUses,uses,expires_at AS expiresAt,revoked_at AS revokedAt FROM community_invites WHERE community_id=? ORDER BY expires_at DESC LIMIT 100").all(id);
    return ok({ invites });
  }));

  app.post("/api/v3/communities/:communityId/roles", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const label = name(request.body?.name);
    const entries = request.body?.permissions;
    if (!Array.isArray(entries) || entries.length > 9 || new Set(entries).size !== entries.length || !entries.every((p) => PERMISSIONS.has(p) && p !== "roles.manage" && p !== "members.moderate")) fail("VALIDATION_FAILED");
    const roleId = withTransaction(db, () => {
      const scope = requirePermission(db, id, userId, "roles.manage");
      if (scope.role !== "owner") fail("FORBIDDEN", 403);
      if (db.prepare("SELECT COUNT(*) AS n FROM community_roles WHERE community_id=?").get(id).n >= 30) fail("RESOURCE_LIMIT", 409);
      const next = crypto.randomUUID();
      db.prepare("INSERT INTO community_roles VALUES (?,?,?,?)").run(next, id, label, JSON.stringify(entries));
      audit(db, id, userId, "role.created", next);
      return next;
    });
    return ok({ role: { id: roleId, name: label, permissions: entries } }, 201);
  }, true));

  app.put("/api/v3/communities/:communityId/members/:userId/roles/:roleId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), target = validId(request.params.userId), roleId = validId(request.params.roleId);
    withTransaction(db, () => {
      const scope = requirePermission(db, id, userId, "roles.manage");
      if (scope.role !== "owner") fail("FORBIDDEN", 403);
      if (!member(db, id, target) || !db.prepare("SELECT 1 FROM community_roles WHERE id=? AND community_id=?").get(roleId,id)) fail("RESOURCE_NOT_FOUND", 404);
      db.prepare("INSERT OR IGNORE INTO community_role_assignments VALUES (?,?,?)").run(id, roleId, target);
      audit(db, id, userId, "role.assigned", target);
    });
    return ok({});
  }, true));

  app.post("/api/v3/communities/:communityId/invites", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    const maxUses = bounded(request.body?.maxUses, 100);
    const hours = bounded(request.body?.expiresInHours, 720);
    if (!maxUses || !hours) fail("VALIDATION_FAILED");
    const secret = crypto.randomBytes(32).toString("base64url");
    const inviteId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + hours * 3600_000).toISOString();
    withTransaction(db, () => {
      requirePermission(db, id, userId, "invites.create");
      db.prepare("INSERT INTO community_invites (id,community_id,code_hash,max_uses,expires_at,created_by) VALUES (?,?,?,?,?,?)")
        .run(inviteId, id, hash(secret), maxUses, expiresAt, userId);
      audit(db, id, userId, "invite.created");
    });
    return ok({ inviteId, code: secret, maxUses, expiresAt }, 201);
  }, true));

  app.delete("/api/v3/communities/:communityId/invites/:inviteId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), inviteId = validId(request.params.inviteId);
    withTransaction(db, () => {
      requirePermission(db,id,userId,"invites.create");
      const result = db.prepare("UPDATE community_invites SET revoked_at=? WHERE community_id=? AND id=? AND revoked_at IS NULL")
        .run(now(),id,inviteId);
      if (result.changes !== 1) fail("RESOURCE_NOT_FOUND",404);
      audit(db,id,userId,"invite.revoked",inviteId);
    });
    return ok({});
  }, true));

  app.post("/api/v3/communities/join", ...guarded((request, userId) => {
    const code = request.body?.code;
    if (typeof code !== "string" || code.length < 30 || code.length > 100) fail("VALIDATION_FAILED");
    const result = withTransaction(db, () => {
      const invite = db.prepare("SELECT * FROM community_invites WHERE code_hash=?").get(hash(code));
      if (!invite || invite.revoked_at || Date.parse(invite.expires_at) <= Date.now()) fail("RESOURCE_NOT_FOUND", 404);
      community(db, invite.community_id);
      if (db.prepare("SELECT 1 FROM community_bans WHERE community_id=? AND user_id=?").get(invite.community_id, userId)) fail("FORBIDDEN", 403);
      if (member(db, invite.community_id, userId)) return { id: invite.community_id, alreadyMember: true };
      if (invite.uses >= invite.max_uses) fail("INVITE_EXHAUSTED", 409);
      if (db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE community_id=?").get(invite.community_id).n >= 10000) fail("RESOURCE_LIMIT", 409);
      db.prepare("INSERT INTO community_members VALUES (?,?,?,?)").run(invite.community_id, userId, "member", now());
      db.prepare("UPDATE community_invites SET uses=uses+1 WHERE id=?").run(invite.id);
      audit(db, invite.community_id, userId, "member.joined");
      return { id: invite.community_id, alreadyMember: false };
    });
    return ok({ communityId: result.id, alreadyMember: result.alreadyMember });
  }, true));

  app.patch("/api/v3/communities/:communityId/members/:userId/role", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), target = validId(request.params.userId);
    const role = request.body?.role;
    if (!["moderator", "member"].includes(role)) fail("VALIDATION_FAILED");
    withTransaction(db, () => {
      const scope = access(db,id,userId);
      if (scope.role !== "owner" || scope.community.owner_id !== userId || scope.community.owner_id === target) fail("FORBIDDEN",403);
      const result = db.prepare("UPDATE community_members SET role=? WHERE community_id=? AND user_id=?").run(role,id,target);
      if (result.changes !== 1) fail("RESOURCE_NOT_FOUND",404);
      audit(db,id,userId,"member.role_changed",target);
    });
    return ok({});
  }, true));


  app.delete("/api/v3/communities/:communityId/members/:userId/roles/:roleId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), target = validId(request.params.userId), roleId = validId(request.params.roleId);
    withTransaction(db, () => {
      const scope = requirePermission(db,id,userId,"roles.manage");
      if (scope.role !== "owner") fail("FORBIDDEN",403);
      const result = db.prepare("DELETE FROM community_role_assignments WHERE community_id=? AND user_id=? AND role_id=?").run(id,target,roleId);
      if (result.changes !== 1) fail("RESOURCE_NOT_FOUND",404);
      audit(db,id,userId,"role.revoked",target);
    });
    return ok({});
  }, true));

  app.post("/api/v3/communities/:communityId/leave", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    withTransaction(db, () => {
      const scope = access(db,id,userId);
      if (scope.role === "owner") fail("OWNER_REQUIRED",409);
      db.prepare("DELETE FROM community_members WHERE community_id=? AND user_id=?").run(id,userId);
      db.prepare("DELETE FROM community_role_assignments WHERE community_id=? AND user_id=?").run(id,userId);
      audit(db,id,userId,"member.left",userId);
    });
    io?.to("user:" + userId).emit("data:refresh");
    return ok({});
  }, true));

  app.get("/api/v3/communities/:communityId/audit", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    requirePermission(db,id,userId,"reports.manage");
    return ok({ entries: db.prepare("SELECT actor_id AS actorId,action,target_id AS targetId,created_at AS createdAt FROM community_audit WHERE community_id=? ORDER BY created_at DESC,id DESC LIMIT 100").all(id) });
  }));

  app.post("/api/v3/communities/:communityId/transfer", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), target = validId(request.body?.userId);
    withTransaction(db, () => {
      const scope = access(db, id, userId);
      if (scope.role !== "owner" || scope.community.owner_id !== userId) fail("FORBIDDEN", 403);
      if (target === userId || !member(db, id, target)) fail("VALIDATION_FAILED");
      db.prepare("UPDATE community_members SET role='member' WHERE community_id=? AND user_id=? AND role='owner'").run(id,userId);
      db.prepare("UPDATE community_members SET role='owner' WHERE community_id=? AND user_id=?").run(id,target);
      db.prepare("UPDATE communities SET owner_id=? WHERE id=?").run(target,id);
      audit(db, id, userId, "owner.transferred", target);
    });
    return ok({});
  }, true));

  app.post("/api/v3/communities/:communityId/bans/:userId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), target = validId(request.params.userId);
    const reason = name(request.body?.reason, 240);
    withTransaction(db, () => {
      const scope = requirePermission(db, id, userId, "members.moderate");
      const targetMember = member(db, id, target);
      if (target === scope.community.owner_id || target === userId || targetMember?.role === "owner" || (scope.role !== "owner" && targetMember?.role === "moderator")) fail("FORBIDDEN", 403);
      db.prepare("INSERT INTO community_bans VALUES (?,?,?,?,?) ON CONFLICT(community_id,user_id) DO UPDATE SET reason=excluded.reason,by_user_id=excluded.by_user_id,created_at=excluded.created_at").run(id,target,reason,userId,now());
      db.prepare("DELETE FROM community_members WHERE community_id=? AND user_id=?").run(id,target);
      db.prepare("DELETE FROM community_role_assignments WHERE community_id=? AND user_id=?").run(id,target);
      audit(db, id, userId, "member.banned", target);
    });
    // Only an identity-scoped refresh; never broadcast private community payloads.
    io?.to("user:" + target).emit("data:refresh");
    return ok({});
  }, true));

  app.post("/api/v3/communities/:communityId/reports", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), target = validId(request.body?.userId);
    const reason = name(request.body?.reason, 500);
    const reportId = withTransaction(db, () => {
      access(db, id, userId);
      if (!member(db, id, target) || target === userId) fail("VALIDATION_FAILED");
      const next = crypto.randomUUID();
      db.prepare("INSERT INTO community_reports VALUES (?,?,?,?,?,?,?,?)").run(next,id,userId,target,reason,"open",now(),null);
      audit(db,id,userId,"report.created");
      return next;
    });
    return ok({ reportId }, 201);
  }, true));

  app.get("/api/v3/communities/:communityId/reports", ...guarded((request, userId) => {
    const id = validId(request.params.communityId);
    requirePermission(db,id,userId,"reports.manage");
    const reports = db.prepare("SELECT id,reporter_id AS reporterId,target_id AS targetId,reason,state,created_at AS createdAt FROM community_reports WHERE community_id=? ORDER BY created_at DESC LIMIT 100").all(id);
    return ok({ reports });
  }));

  app.patch("/api/v3/communities/:communityId/reports/:reportId", ...guarded((request, userId) => {
    const id = validId(request.params.communityId), reportId = validId(request.params.reportId);
    const state = request.body?.state;
    if (!["resolved","rejected"].includes(state)) fail("VALIDATION_FAILED");
    withTransaction(db, () => {
      requirePermission(db,id,userId,"reports.manage");
      const report = db.prepare("SELECT id,state FROM community_reports WHERE id=? AND community_id=?").get(reportId,id);
      if (!report) fail("RESOURCE_NOT_FOUND",404);
      if (report.state !== "open") fail("STATE_CONFLICT",409);
      db.prepare("UPDATE community_reports SET state=?,handled_by=? WHERE id=? AND community_id=?").run(state,userId,reportId,id);
      audit(db,id,userId,"report." + state,reportId);
    });
    return ok({});
  }, true));

  const hubRoutes = mountCommunityHub({ app, db, guarded, ok, fail, validId, access, permissions, withTransaction, audit, io });
  const messageRoutes = mountCommunityChannelMessages({
    app, db, guarded, ok, fail, validId, access, permissions, withTransaction, audit,
  });
  return {
    status: () => ({ enabled: true, experimental: true, schema: "isolated-communities-tables", published: false, channelMessages: true, ...hubRoutes.status() }),
    close: () => { limits.clear(); messageRoutes.close(); },
  };
}

module.exports = { PERMISSIONS, CommunityError, installTables, withTransaction, mountCommunities };
