"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(__dirname, "..", "server", "model.cjs");
let source = fs.readFileSync(file, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one ${label} fragment.`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`function accessibleFiles(state, viewerId) {
  return state.files.filter((file) => !file.deletedAt && file.kind !== "avatar" && canAccessConversation(state, findConversation(state, file.conversationId), viewerId));
}

function safeDownloadName(value) {
  return path.basename(String(value || "file")).replace(/[\\r\\n"\\\\]/g, "_").slice(0, 180) || "file";
}`,
`function accessibleFiles(state, viewerId) {
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
  return path.basename(String(name || "file")).replace(/[\\r\\n"]/g, "_");
}`,
"accessibleFiles/safeDownloadName",
);

replaceOnce(
`  canModerateConversation,
  contactState,
  conversationList,`,
`  canModerateConversation,
  contactState,
  conversationSetting,
  conversationList,`,
"conversationSetting export",
);

replaceOnce(
`  isBlockedEither,
  isRoomBanned,
  roomPermission,
  roomRole,`,
`  isBlockedEither,
  isRoomBanned,
  readAt,
  roomRole,
  roomPermission,`,
"readAt export",
);

fs.writeFileSync(file, source, "utf8");
