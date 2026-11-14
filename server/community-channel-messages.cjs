"use strict";

const crypto = require("node:crypto");

const MESSAGE_MAX_LENGTH = 4000;
const MESSAGES_PER_MINUTE = 12;

function mountCommunityChannelMessages({ app, db, guarded, ok, fail, validId, access, permissions, withTransaction, audit }) {
  // Isolated experimental storage. Production schema-10 migrations and legacy rooms are unchanged.
  db.exec([
    "CREATE TABLE IF NOT EXISTS community_channel_messages (id TEXT PRIMARY KEY, community_id TEXT NOT NULL, channel_id TEXT NOT NULL, author_id TEXT NOT NULL, client_nonce TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT, UNIQUE(community_id,channel_id,author_id,client_nonce))",
    "CREATE INDEX IF NOT EXISTS community_message_timeline ON community_channel_messages(community_id,channel_id,created_at DESC,id DESC)",
  ].join(";\n") + ";");

  const sendBuckets = new Map();
  const prefix = "/api/v3/communities/:communityId/channels/:channelId/messages";

  function channelScope(communityId, channelId, userId) {
    const scope = access(db, communityId, userId);
    const channel = db.prepare("SELECT id,kind,is_private AS isPrivate FROM community_channels WHERE community_id=? AND id=?")
      .get(communityId, channelId);
    if (!channel || (channel.isPrivate && !permissions(db, communityId, userId, scope.role).has("channel.view_private"))) {
      fail("RESOURCE_NOT_FOUND", 404);
    }
    return { ...scope, channel };
  }

  function messageView(row) {
    return {
      id: row.id,
      authorId: row.authorId,
      body: row.deletedAt ? "" : row.body,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt || null,
    };
  }

  function rateLimit(communityId, userId) {
    const stamp = Date.now();
    const key = communityId + ":" + userId;
    const previous = sendBuckets.get(key);
    const state = !previous || stamp - previous.started >= 60000 ? { started: stamp, count: 0 } : previous;
    if (state.count >= MESSAGES_PER_MINUTE) fail("RATE_LIMITED", 429);
    state.count += 1;
    sendBuckets.set(key, state);
    if (sendBuckets.size > 3000) {
      for (const [entry, value] of sendBuckets) {
        if (stamp - value.started >= 60000) sendBuckets.delete(entry);
      }
    }
  }

  app.get(prefix, ...guarded((request, userId) => {
    const communityId = validId(request.params.communityId);
    const channelId = validId(request.params.channelId);
    channelScope(communityId, channelId, userId);
    const limit = request.query.limit == null ? 50 : Number(request.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("VALIDATION_FAILED");
    let cursor = null;
    if (request.query.before != null && request.query.before !== "") {
      if (typeof request.query.before !== "string" || request.query.before.length > 512) fail("VALIDATION_FAILED");
      try { cursor = JSON.parse(Buffer.from(request.query.before, "base64url").toString("utf8")); }
      catch { fail("VALIDATION_FAILED"); }
      if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)
          || typeof cursor.createdAt !== "string"
          || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(cursor.createdAt)
          || !Number.isFinite(Date.parse(cursor.createdAt))
          || typeof cursor.id !== "string" || !/^[a-f0-9-]{36}$/i.test(cursor.id)) fail("VALIDATION_FAILED");
    }
    const clause = cursor ? " AND (created_at < ? OR (created_at = ? AND id < ?))" : "";
    const args = cursor
      ? [communityId, channelId, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1]
      : [communityId, channelId, limit + 1];
    const rows = db.prepare(`SELECT id,author_id AS authorId,body,created_at AS createdAt,deleted_at AS deletedAt
      FROM community_channel_messages WHERE community_id=? AND channel_id=?${clause}
      ORDER BY created_at DESC,id DESC LIMIT ?`).all(...args);
    const page = rows.slice(0, limit);
    const oldest = page.at(-1);
    return ok({
      messages: page.map(messageView),
      nextCursor: rows.length > limit && oldest
        ? Buffer.from(JSON.stringify({ createdAt: oldest.createdAt, id: oldest.id })).toString("base64url")
        : null,
    });
  }));

  app.post(prefix, ...guarded((request, userId) => {
    const communityId = validId(request.params.communityId);
    const channelId = validId(request.params.channelId);
    const body = request.body?.body;
    const nonce = request.body?.clientNonce;
    if (typeof body !== "string" || !body.trim() || body.trim().length > MESSAGE_MAX_LENGTH
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body)
        || typeof nonce !== "string" || !/^[a-f0-9-]{36}$/i.test(nonce)) fail("VALIDATION_FAILED");
    const trimmed = body.trim();
    const saved = withTransaction(db, () => {
      const scope = channelScope(communityId, channelId, userId);
      if (scope.channel.kind === "announcement"
          && !permissions(db, communityId, userId, scope.role).has("channel.announce")) fail("FORBIDDEN", 403);
      const previous = db.prepare(`SELECT id,author_id AS authorId,body,created_at AS createdAt,deleted_at AS deletedAt
        FROM community_channel_messages WHERE community_id=? AND channel_id=? AND author_id=? AND client_nonce=?`)
        .get(communityId, channelId, userId, nonce);
      if (previous) {
        if (previous.body !== trimmed || previous.deletedAt) fail("STATE_CONFLICT", 409);
        return { message: messageView(previous), existing: true };
      }
      if (db.prepare("SELECT COUNT(*) AS n FROM community_channel_messages WHERE community_id=? AND channel_id=?")
        .get(communityId, channelId).n >= 50000) fail("RESOURCE_LIMIT", 409);
      rateLimit(communityId, userId);
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(`INSERT INTO community_channel_messages
        (id,community_id,channel_id,author_id,client_nonce,body,created_at)
        VALUES (?,?,?,?,?,?,?)`).run(id, communityId, channelId, userId, nonce, trimmed, createdAt);
      return { message: { id, authorId: userId, body: trimmed, createdAt, deletedAt: null }, existing: false };
    });
    // Clients refresh only after a scoped GET. No unrestricted Socket.IO fanout of private content.
    return ok({ message: saved.message }, saved.existing ? 200 : 201);
  }, true));

  app.delete(prefix + "/:messageId", ...guarded((request, userId) => {
    const communityId = validId(request.params.communityId);
    const channelId = validId(request.params.channelId);
    const messageId = validId(request.params.messageId);
    withTransaction(db, () => {
      const scope = channelScope(communityId, channelId, userId);
      const item = db.prepare(`SELECT author_id AS authorId,deleted_at AS deletedAt
        FROM community_channel_messages WHERE id=? AND community_id=? AND channel_id=?`)
        .get(messageId, communityId, channelId);
      if (!item) fail("RESOURCE_NOT_FOUND", 404);
      if (item.deletedAt) fail("STATE_CONFLICT", 409);
      if (item.authorId !== userId) {
        if (!permissions(db, communityId, userId, scope.role).has("members.moderate")) fail("FORBIDDEN", 403);
        const target = db.prepare("SELECT role FROM community_members WHERE community_id=? AND user_id=?")
          .get(communityId, item.authorId);
        if (item.authorId === scope.community.owner_id
            || (scope.role !== "owner" && target?.role === "moderator")) fail("FORBIDDEN", 403);
      }
      db.prepare("UPDATE community_channel_messages SET body='',deleted_at=? WHERE id=?")
        .run(new Date().toISOString(), messageId);
      audit(db, communityId, userId, "message.deleted", messageId);
    });
    return ok({});
  }, true));

  return { close: () => sendBuckets.clear() };
}

module.exports = { mountCommunityChannelMessages, MESSAGE_MAX_LENGTH, MESSAGES_PER_MINUTE };
