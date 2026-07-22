"use strict";

const path = require("node:path");
const { publicUser } = require("./security.cjs");

function findUser(state, userId) {
  return state.users.find((user) => user.id === userId && !user.disabledAt) ?? null;
}

function findConversation(state, conversationId) {
  return state.conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

function roomRole(state, roomId, userId) {
  return state.roomMembers.find((member) => member.roomId === roomId && member.userId === userId)?.role ?? null;
}

function isRoomBanned(state, roomId, userId) {
  const now = Date.now();
  return state.roomBans?.some((ban) => ban.roomId === roomId && ban.userId === userId && (!ban.expiresAt || Date.parse(ban.expiresAt) > now)) ?? false;
}

function roomPermission(state, roomId, userId, permission) {
  const user = findUser(state, userId);
  if (user?.role === "server_admin") return true;
  const member = state.roomMembers.find((item) => item.roomId === roomId && item.userId === userId);
  if (!member) return false;
  if (member.role === "owner") return true;
  const moderatorDefaults = new Set([
    "room.view", "room.send_messages", "room.upload_files", "room.send_voice", "room.pin_messages",
    "room.manage_members", "room.delete_messages", "room.manage_reports", "room.mention_everyone",
  ]);
  const memberDefaults = new Set(["room.view", "room.send_messages", "room.upload_files", "room.send_voice"]);
  const defaults = member.role === "moderator" ? moderatorDefaults : memberDefaults;
  if (defaults.has(permission)) return true;
  return (member.customRoleIds ?? []).some((roleId) => {
    const role = state.customRoles?.find((candidate) => candidate.id === roleId && candidate.roomId === roomId);
    return role?.permissions?.includes(permission);
  });
}

function isBlockedEither(state, firstUserId, secondUserId) {
  return state.blocks.some(
    (block) =>
      (block.blockerId === firstUserId && block.blockedId === secondUserId) ||
      (block.blockerId === secondUserId && block.blockedId === firstUserId),
  );
}

function areContacts(state, firstUserId, secondUserId) {
  return state.contacts.some(
    (contact) =>
      (contact.userAId === firstUserId && contact.userBId === secondUserId) ||
      (contact.userAId === secondUserId && contact.userBId === firstUserId),
  );
}

function canAccessConversation(state, conversation, userId) {
  if (!conversation) return false;
  if (conversation.type === "dm") return conversation.userIds.includes(userId);
  return Boolean(roomRole(state, conversation.roomId, userId));
}

function canModerateConversation(state, conversation, userId) {
  const user = findUser(state, userId);
  if (user?.role === "server_admin") return true;
  if (conversation?.type !== "room") return false;
  return ["owner", "moderator"].includes(roomRole(state, conversation.roomId, userId));
}

function dmPeer(state, conversation, userId) {
  if (conversation?.type !== "dm") return null;
  const peerId = conversation.userIds.find((id) => id !== userId) ?? userId;
  return findUser(state, peerId);
}

function readAt(state, conversationId, userId) {
  return state.reads.find((read) => read.conversationId === conversationId && read.userId === userId)?.lastReadAt ?? null;
}

function conversationSetting(state, conversationId, userId) {
  return state.conversationSettings?.find(
    (setting) => setting.conversationId === conversationId && setting.userId === userId,
  ) ?? { muted: false, pinned: false, archived: false, folder: "all" };
}

function fileView(file) {
  if (!file || file.deletedAt) return null;
  const encrypted = file.kind === "encrypted";
  return {
    id: file.id,
    name: encrypted ? "Защищённое вложение" : file.originalName,
    mimeType: encrypted ? "application/octet-stream" : file.mimeType,
    size: file.size,
    kind: file.kind,
    ciphertextSha256: encrypted ? file.ciphertextSha256 : null,
    duration: encrypted ? null : file.duration ?? null,
    waveform: encrypted ? [] : Array.isArray(file.waveform) ? file.waveform.slice(0, 96) : [],
    url: `/api/files/${file.id}`,
    thumbnailUrl: file.kind === "image" ? `/api/files/${file.id}?thumbnail=1` : null,
    createdAt: file.createdAt,
  };
}

function messagePreview(state, message) {
  if (!message) return null;
  const sender = findUser(state, message.senderId);
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: sender?.displayName ?? "Удалённый пользователь",
    text: message.deletedAt ? "Сообщение удалено" : message.type === "encrypted" ? "Защищённое сообщение" : message.text,
    type: message.type,
    deletedAt: message.deletedAt ?? null,
  };
}

function serializeMessage(state, message, viewerId) {
  const sender = findUser(state, message.senderId);
  const conversation = findConversation(state, message.conversationId);
  const reactions = state.reactions.filter((reaction) => reaction.messageId === message.id);
  const grouped = new Map();
  for (const reaction of reactions) {
    const group = grouped.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, reactedByMe: false };
    group.count += 1;
    if (reaction.userId === viewerId) group.reactedByMe = true;
    grouped.set(reaction.emoji, group);
  }

  const readCount = state.reads.filter(
    (read) =>
      read.conversationId === message.conversationId &&
      read.userId !== message.senderId &&
      Date.parse(read.lastReadAt) >= Date.parse(message.createdAt),
  ).length;

  const reply = message.replyToId
    ? messagePreview(state, state.messages.find((candidate) => candidate.id === message.replyToId))
    : null;
  const file = message.fileId ? state.files.find((candidate) => candidate.id === message.fileId && !candidate.deletedAt) : null;
  const deleted = Boolean(message.deletedAt);
  const attachmentExpired = Boolean(message.attachmentExpiredAt && !deleted);
  const listened = state.voiceListens?.filter((item) => item.messageId === message.id) ?? [];
  const poll = message.pollId ? state.polls?.find((item) => item.id === message.pollId) : null;
  const pollVotes = poll ? state.pollVotes?.filter((vote) => vote.pollId === poll.id) ?? [] : [];
  const pollView = poll ? {
    id: poll.id,
    question: poll.question,
    multiple: Boolean(poll.multiple),
    anonymous: Boolean(poll.anonymous),
    closedAt: poll.closedAt ?? null,
    totalVoters: new Set(pollVotes.map((vote) => vote.userId)).size,
    options: poll.options.map((option) => ({
      id: option.id,
      text: option.text,
      votes: pollVotes.filter((vote) => vote.optionId === option.id).length,
      selectedByMe: pollVotes.some((vote) => vote.optionId === option.id && vote.userId === viewerId),
    })),
  } : null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    sender: sender ? publicUser(sender) : { id: message.senderId, username: "deleted", displayName: "Удалённый пользователь" },
    type: deleted ? "deleted" : attachmentExpired ? "expired" : message.type,
    text: deleted ? "" : attachmentExpired ? "Срок хранения вложения истёк" : message.type === "encrypted" ? "" : message.text,
    encryption: !deleted && message.type === "encrypted" && message.mlsEnvelope ? {
      groupRecordId: message.mlsEnvelope.groupRecordId,
      protocolGroupId: message.mlsEnvelope.protocolGroupId,
      epoch: Number(message.mlsEnvelope.epoch),
      senderDeviceId: message.mlsEnvelope.senderDeviceId,
      ciphertext: message.mlsEnvelope.ciphertext,
      messageHash: message.mlsEnvelope.messageHash,
      authenticatedDataHash: message.mlsEnvelope.authenticatedDataHash ?? null,
      generation: message.mlsEnvelope.generation ?? null,
    } : null,
    file: deleted || attachmentExpired ? null : fileView(file),
    reply,
    forwarded: message.forwardedSnapshot ?? null,
    poll: deleted ? null : pollView,
    reactions: [...grouped.values()],
    createdAt: message.createdAt,
    updatedAt: message.updatedAt ?? null,
    deletedAt: message.deletedAt ?? null,
    pinnedAt: message.pinnedAt ?? null,
    silent: Boolean(message.silent),
    mentions: Array.isArray(message.mentions) ? message.mentions : [],
    threadRootId: message.threadRootId ?? null,
    editCount: state.messageEdits?.filter((edit) => edit.messageId === message.id).length ?? 0,
    pendingApproval: Boolean(message.pendingApproval),
    bookmarkedByMe: state.messageBookmarks?.some((item) => item.messageId === message.id && item.userId === viewerId) ?? false,
    clientId: message.senderId === viewerId ? message.clientId ?? null : null,
    readCount,
    listenedByMe: listened.some((item) => item.userId === viewerId),
    listenedCount: listened.length,
    isOwn: message.senderId === viewerId,
    canEdit: message.senderId === viewerId && !deleted && !attachmentExpired && ["text", "encrypted"].includes(message.type) && !message.fileId && !message.pendingApproval,
    canDelete: (message.senderId === viewerId || (conversation?.type === "room" && roomPermission(state, conversation.roomId, viewerId, "room.delete_messages"))) && !deleted,
    canPin: conversation?.type === "room" && roomPermission(state, conversation.roomId, viewerId, "room.pin_messages") && !deleted,
  };
}

function serializeConversation(state, conversation, viewerId, onlineUserIds = new Set()) {
  const viewerCanModerate = canModerateConversation(state, conversation, viewerId)
    || (conversation.type === "room" && (roomPermission(state, conversation.roomId, viewerId, "room.delete_messages") || roomPermission(state, conversation.roomId, viewerId, "room.manage_reports")));
  const messages = state.messages
    .filter((message) => message.conversationId === conversation.id && (!message.pendingApproval || viewerCanModerate || message.senderId === viewerId))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const lastMessage = messages.at(-1) ?? null;
  const viewerReadAt = readAt(state, conversation.id, viewerId);
  const unreadCount = messages.filter(
    (message) =>
      message.senderId !== viewerId &&
      !message.deletedAt &&
      (!viewerReadAt || Date.parse(message.createdAt) > Date.parse(viewerReadAt)),
  ).length;
  const firstUnreadMessageId = messages.find(
    (message) => message.senderId !== viewerId && !message.deletedAt && (!viewerReadAt || Date.parse(message.createdAt) > Date.parse(viewerReadAt)),
  )?.id ?? null;
  const notificationSettings = conversationSetting(state, conversation.id, viewerId);

  if (conversation.type === "dm") {
    const peer = dmPeer(state, conversation, viewerId);
    if (!peer) return null;
    const isSavedMessages = conversation.userIds.length === 1 && conversation.userIds[0] === viewerId;
    return {
      id: conversation.id,
      type: "dm",
      title: isSavedMessages ? "Сохранённые сообщения" : peer.displayName,
      subtitle: isSavedMessages ? "Личное облако этого сервера" : `@${peer.username}`,
      peer: publicUser(peer),
      isSavedMessages,
      isContact: areContacts(state, viewerId, peer.id),
      online: onlineUserIds.has(peer.id),
      unreadCount,
      viewerReadAt,
      firstUnreadMessageId,
      notificationSettings: {
        muted: Boolean(notificationSettings.muted),
        pinned: Boolean(notificationSettings.pinned),
        archived: Boolean(notificationSettings.archived),
        folder: notificationSettings.folder ?? "all",
        background: notificationSettings.background ?? "default",
        compact: Boolean(notificationSettings.compact),
        mode: notificationSettings.notificationMode ?? "all",
      },
      lastMessage: lastMessage ? serializeMessage(state, lastMessage, viewerId) : null,
      updatedAt: lastMessage?.createdAt ?? conversation.createdAt,
      members: conversation.userIds.map((id) => publicUser(findUser(state, id))).filter(Boolean),
      pinned: messages
        .filter((message) => message.pinnedAt && !message.deletedAt)
        .sort((a, b) => Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt))
        .map((message) => serializeMessage(state, message, viewerId)),
    };
  }

  const room = state.rooms.find((candidate) => candidate.id === conversation.roomId);
  if (!room) return null;
  const members = state.roomMembers
    .filter((member) => member.roomId === room.id)
    .map((member) => ({
      ...publicUser(findUser(state, member.userId)),
      roomRole: member.role,
      customRoleIds: member.customRoleIds ?? [],
      restrictedUntil: member.restrictedUntil ?? null,
      online: onlineUserIds.has(member.userId),
    }))
    .filter((member) => member.id);
  const builtInModerator = canModerateConversation(state, conversation, viewerId);
  const canManage = findUser(state, viewerId)?.role === "server_admin" || roomRole(state, room.id, viewerId) === "owner";
  const canManageMembers = roomPermission(state, room.id, viewerId, "room.manage_members");
  const canManageReports = roomPermission(state, room.id, viewerId, "room.manage_reports");
  const canDeleteMessages = roomPermission(state, room.id, viewerId, "room.delete_messages");
  const canPinMessages = roomPermission(state, room.id, viewerId, "room.pin_messages");
  const canModerate = builtInModerator || canManageMembers || canManageReports || canDeleteMessages || canPinMessages;
  const inviteVisible = canManage;
  const bannedMembers = canManageMembers ? (state.roomBans ?? [])
    .filter((ban) => ban.roomId === room.id)
    .map((ban) => ({ ...ban, user: publicUser(findUser(state, ban.userId)), actor: publicUser(findUser(state, ban.byUserId)) }))
    .filter((ban) => ban.user) : [];
  const joinRequests = canManageMembers ? (state.roomJoinRequests ?? [])
    .filter((request) => request.roomId === room.id && request.status === "pending")
    .map((request) => ({ ...request, user: publicUser(findUser(state, request.userId)) }))
    .filter((request) => request.user) : [];
  const auditLog = builtInModerator ? (state.roomAuditLog ?? [])
    .filter((entry) => entry.roomId === room.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100)
    .map((entry) => ({ ...entry, actor: publicUser(findUser(state, entry.actorId)), target: publicUser(findUser(state, entry.targetUserId)) })) : [];
  const activeInvites = canManage ? (state.roomInvites ?? [])
    .filter((invite) => invite.roomId === room.id && !invite.revokedAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  const reports = canManageReports ? (state.roomReports ?? [])
    .filter((report) => report.roomId === room.id && report.status === "pending")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  const appeals = canManageReports ? (state.moderationAppeals ?? [])
    .filter((appeal) => appeal.roomId === room.id && appeal.status === "pending")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((appeal) => ({ ...appeal, user: publicUser(findUser(state, appeal.userId)) })) : [];
  const customRoles = canManage ? (state.customRoles ?? []).filter((role) => role.roomId === room.id) : [];
  const category = state.roomCategories?.find((item) => item.id === room.categoryId && item.roomId === room.id) ?? null;

  return {
    id: conversation.id,
    type: "room",
    roomId: room.id,
    title: room.name,
    subtitle: room.privacy === "private" ? "Приватная комната" : "Публичная комната",
    privacy: room.privacy,
    description: room.description ?? "",
    rules: room.rules ?? "",
    category,
    ownerId: room.ownerId,
    inviteCode: inviteVisible ? room.inviteCode : null,
    inviteExpiresAt: inviteVisible ? room.inviteExpiresAt ?? null : null,
    inviteMaxUses: inviteVisible ? Number(room.inviteMaxUses || 0) : null,
    inviteUseCount: inviteVisible ? Number(room.inviteUseCount || 0) : null,
    viewerRole: roomRole(state, room.id, viewerId),
    permissions: {
      canModerate,
      canManage,
      canConfigure: builtInModerator,
      canManageMembers,
      canManageReports,
      canDeleteMessages,
      canPinMessages,
      canBypassPosting: builtInModerator,
      readOnly: Boolean(room.readOnly),
      slowModeSeconds: Number(room.slowModeSeconds || 0),
      allowFiles: room.allowFiles !== false,
      allowImages: room.allowImages !== false,
      allowVoice: room.allowVoice !== false,
      announcementOnly: Boolean(room.announcementOnly),
      preapproveMessages: Boolean(room.preapproveMessages),
      joinPolicy: room.joinPolicy ?? (room.privacy === "private" ? "invite" : "open"),
    },
    activeInvites,
    reports,
    appeals,
    customRoles,
    bannedMembers,
    joinRequests,
    auditLog,
    unreadCount,
    viewerReadAt,
    firstUnreadMessageId,
    notificationSettings: {
      muted: Boolean(notificationSettings.muted),
      pinned: Boolean(notificationSettings.pinned),
      archived: Boolean(notificationSettings.archived),
      folder: notificationSettings.folder ?? "all",
      background: notificationSettings.background ?? "default",
      compact: Boolean(notificationSettings.compact),
      mode: notificationSettings.notificationMode ?? "all",
    },
    lastMessage: lastMessage ? serializeMessage(state, lastMessage, viewerId) : null,
    updatedAt: lastMessage?.createdAt ?? conversation.createdAt,
    members,
    pinned: messages
      .filter((message) => message.pinnedAt && !message.deletedAt)
      .sort((a, b) => Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt))
      .map((message) => serializeMessage(state, message, viewerId)),
  };
}

function conversationList(state, viewerId, onlineUserIds = new Set()) {
  return state.conversations
    .filter((conversation) => canAccessConversation(state, conversation, viewerId))
    .map((conversation) => serializeConversation(state, conversation, viewerId, onlineUserIds))
    .filter(Boolean)
    .sort((a, b) => {
      const pinned = Number(Boolean(b.notificationSettings?.pinned)) - Number(Boolean(a.notificationSettings?.pinned));
      return pinned || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

function roomView(state, room, viewerId, onlineUserIds = new Set()) {
  const conversation = state.conversations.find((candidate) => candidate.roomId === room.id);
  const membership = state.roomMembers.find((member) => member.roomId === room.id && member.userId === viewerId);
  const owner = findUser(state, room.ownerId);
  return {
    id: room.id,
    conversationId: conversation?.id ?? null,
    name: room.name,
    slug: room.slug,
    privacy: room.privacy,
    description: room.description ?? "",
    rules: room.rules ?? "",
    categoryId: room.categoryId ?? null,
    owner: publicUser(owner),
    memberCount: state.roomMembers.filter((member) => member.roomId === room.id).length,
    joined: Boolean(membership),
    viewerRole: membership?.role ?? null,
    inviteCode: membership?.role === "owner" || findUser(state, viewerId)?.role === "server_admin" ? room.inviteCode : null,
    joinPolicy: room.joinPolicy ?? (room.privacy === "private" ? "invite" : "open"),
    joinRequestStatus: state.roomJoinRequests?.find((request) => request.roomId === room.id && request.userId === viewerId && request.status === "pending")?.status ?? null,
    banned: isRoomBanned(state, room.id, viewerId),
    onlineCount: state.roomMembers.filter((member) => member.roomId === room.id && onlineUserIds.has(member.userId)).length,
    createdAt: room.createdAt,
  };
}

function contactState(state, viewerId, onlineUserIds = new Set()) {
  const contacts = state.contacts
    .filter((contact) => contact.userAId === viewerId || contact.userBId === viewerId)
    .map((contact) => {
      const userId = contact.userAId === viewerId ? contact.userBId : contact.userAId;
      const user = findUser(state, userId);
      const conversation = state.conversations.find(
        (candidate) => candidate.type === "dm" && candidate.userIds.includes(viewerId) && candidate.userIds.includes(userId),
      );
      return user ? { ...publicUser(user), online: onlineUserIds.has(user.id), conversationId: conversation?.id ?? null } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));

  const requests = state.contactRequests
    .filter((request) => request.status === "pending" && (request.fromUserId === viewerId || request.toUserId === viewerId))
    .map((request) => ({
      id: request.id,
      direction: request.toUserId === viewerId ? "incoming" : "outgoing",
      user: publicUser(findUser(state, request.toUserId === viewerId ? request.fromUserId : request.toUserId)),
      createdAt: request.createdAt,
    }))
    .filter((request) => request.user);

  return { contacts, requests };
}

function accessibleFiles(state, viewerId) {
  return state.files
    .filter((file) => !file.deletedAt && file.kind !== "avatar" && state.messages.some(
      (message) => message.fileId === file.id && !message.deletedAt && canAccessConversation(state, findConversation(state, message.conversationId), viewerId),
    ))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((file) => ({
      ...fileView(file),
      conversationId: state.messages.find(
        (message) => message.fileId === file.id && !message.deletedAt && canAccessConversation(state, findConversation(state, message.conversationId), viewerId),
      )?.conversationId ?? file.conversationId,
      uploader: publicUser(findUser(state, file.uploaderId)),
    }));
}

function safeDownloadName(name) {
  return path.basename(String(name || "file")).replace(/[\r\n"]/g, "_");
}

module.exports = {
  accessibleFiles,
  areContacts,
  canAccessConversation,
  canModerateConversation,
  contactState,
  conversationSetting,
  conversationList,
  dmPeer,
  fileView,
  findConversation,
  findUser,
  isBlockedEither,
  isRoomBanned,
  readAt,
  roomRole,
  roomPermission,
  roomView,
  safeDownloadName,
  serializeConversation,
  serializeMessage,
};
