"use strict";

const crypto = require("node:crypto");
const { canAccessConversation, roomRole } = require("./model.cjs");

function appendEvent(state, {
  type,
  actorId = null,
  userIds = [],
  conversationId = null,
  roomId = null,
  global = false,
  payload = {},
  createdAt = new Date().toISOString(),
}) {
  const sequence = Math.max(0, Number(state.meta.lastEventSequence) || 0) + 1;
  state.meta.lastEventSequence = sequence;
  const event = {
    id: crypto.randomUUID(),
    sequence,
    type: String(type || "unknown").slice(0, 80),
    actorId,
    userIds: [...new Set((userIds || []).filter(Boolean))],
    conversationId,
    roomId,
    global: Boolean(global),
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    createdAt,
  };
  state.events.push(event);
  return event;
}

function eventVisibleTo(state, event, userId) {
  if (event.userIds?.includes(userId)) return true;
  if (event.conversationId) return canAccessConversation(
    state,
    state.conversations.find((conversation) => conversation.id === event.conversationId),
    userId,
  );
  if (event.roomId) return Boolean(roomRole(state, event.roomId, userId));
  return Boolean(event.global);
}

function addNotification(state, userId, type, payload = {}, createdAt = new Date().toISOString()) {
  if (!state.users.some((user) => user.id === userId && !user.disabledAt)) return null;
  const event = {
    id: crypto.randomUUID(),
    userId,
    type: String(type || "system").slice(0, 60),
    readAt: null,
    createdAt,
    ...payload,
  };
  state.notificationEvents.push(event);
  return event;
}

function mentionedUsers(state, text, participantIds) {
  const usernames = new Set(
    [...String(text || "").matchAll(/(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_-]{2,24})/giu)]
      .map((match) => match[2].toLocaleLowerCase("ru")),
  );
  return state.users.filter((user) => participantIds.includes(user.id) && usernames.has(user.username.toLocaleLowerCase("ru")));
}

module.exports = { addNotification, appendEvent, eventVisibleTo, mentionedUsers };
