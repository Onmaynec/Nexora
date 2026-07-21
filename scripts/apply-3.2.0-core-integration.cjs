"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function update(file, transform) {
  const target = path.join(root, file);
  const before = fs.readFileSync(target, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${file}: patch made no changes`);
  fs.writeFileSync(target, after, "utf8");
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

update("client/src/crypto/trust-client.js", (source) => {
  let next = replaceRequired(source, "  joinFromWelcome,\n  memberDirectory,\n  processCommitMessage,", "  joinFromWelcome,\n  processCommitMessage,", "remove incorrect memberDirectory import");
  next = replaceRequired(next, "} from \"./mls-engine\";\nimport {", "} from \"./mls-engine\";\nimport { memberDirectory } from \"./mls-members\";\nimport {", "add mls-members import");
  next = replaceRequired(
    next,
    "const claimed = await trustApi(`/users/${encodeURIComponent(userId)}/key-packages/claim`, {",
    "const claimed = await trustApi(`/users/${encodeURIComponent(userId)}/devices/${encodeURIComponent(target.id)}/key-packages/claim`, {",
    "targeted KeyPackage endpoint",
  );
  next = next.replaceAll("remote.protocolGroupId", "remote.groupId");
  next = replaceRequired(
    next,
    `function serializeConversationOperation(conversationId, operation) {\n  const previous = conversationQueues.get(conversationId) || Promise.resolve();\n  const next = previous.catch(() => {}).then(operation);\n  conversationQueues.set(conversationId, next.finally(() => {\n    if (conversationQueues.get(conversationId) === next) conversationQueues.delete(conversationId);\n  }));\n  return next;\n}`,
    `function serializeConversationOperation(conversationId, operation) {\n  const previous = conversationQueues.get(conversationId) || Promise.resolve();\n  const next = previous.catch(() => {}).then(operation);\n  const tracked = next.finally(() => {\n    if (conversationQueues.get(conversationId) === tracked) conversationQueues.delete(conversationId);\n  });\n  conversationQueues.set(conversationId, tracked);\n  return next;\n}`,
    "conversation operation queue cleanup",
  );
  return next;
});

update("server/trust-routes.cjs", (source) => replaceRequired(
  source,
  `emitConversation(conversation.id, "mls.commit", {\n      groupId: group.id,`,
  `emitConversation(conversation.id, "mls.commit", {\n      conversationId: conversation.id,\n      groupId: group.id,`,
  "commit broadcast conversation scope",
));

update("server/model.cjs", (source) => {
  let next = replaceRequired(
    source,
    `text: message.deletedAt ? "Сообщение удалено" : message.text,\n    type: message.type,`,
    `text: message.deletedAt ? "Сообщение удалено" : message.type === "encrypted" ? "Защищённое сообщение" : message.text,\n    type: message.type,`,
    "encrypted reply preview",
  );
  next = replaceRequired(
    next,
    `text: deleted ? "" : attachmentExpired ? "Срок хранения вложения истёк" : message.text,\n    file: deleted || attachmentExpired ? null : fileView(file),`,
    `text: deleted ? "" : attachmentExpired ? "Срок хранения вложения истёк" : message.type === "encrypted" ? "" : message.text,\n    encryption: !deleted && message.type === "encrypted" && message.mlsEnvelope ? {\n      groupRecordId: message.mlsEnvelope.groupRecordId,\n      protocolGroupId: message.mlsEnvelope.protocolGroupId,\n      epoch: Number(message.mlsEnvelope.epoch),\n      senderDeviceId: message.mlsEnvelope.senderDeviceId,\n      ciphertext: message.mlsEnvelope.ciphertext,\n      messageHash: message.mlsEnvelope.messageHash,\n      authenticatedDataHash: message.mlsEnvelope.authenticatedDataHash ?? null,\n      generation: message.mlsEnvelope.generation ?? null,\n    } : null,\n    file: deleted || attachmentExpired ? null : fileView(file),`,
    "encrypted message envelope serialization",
  );
  next = replaceRequired(
    next,
    `canEdit: message.senderId === viewerId && !deleted && !attachmentExpired && message.type === "text" && !message.pendingApproval,`,
    `canEdit: message.senderId === viewerId && !deleted && !attachmentExpired && ["text", "encrypted"].includes(message.type) && !message.pendingApproval,`,
    "encrypted message edit permission",
  );
  return next;
});

update("server/create-server.cjs", (source) => {
  let next = replaceRequired(
    source,
    `  let v3Features = null;\n\n  function notificationAllowed`,
    `  let v3Features = null;\n\n  function conversationUsesMls(conversationId) {\n    try {\n      return Boolean(store.db?.prepare("SELECT 1 FROM mls_groups WHERE conversation_id=? AND status='active'").get(String(conversationId)));\n    } catch {\n      return false;\n    }\n  }\n\n  function notificationAllowed`,
    "MLS conversation detector",
  );
  next = replaceRequired(
    next,
    `    const text = cleanText(rawText);\n    if (!text) throw Object.assign(new Error("Сообщение пустое."), { code: "MESSAGE_EMPTY" });\n    const safeClientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(clientId ?? "")) ? String(clientId) : null;`,
    `    const normalizedConversationId = cleanLine(conversationId, 64);\n    if (conversationUsesMls(normalizedConversationId)) {\n      throw Object.assign(new Error("Диалог защищён MLS. Используйте E2EE transport."), { code: "E2EE_REQUIRED", status: 409 });\n    }\n    const text = cleanText(rawText);\n    if (!text) throw Object.assign(new Error("Сообщение пустое."), { code: "MESSAGE_EMPTY" });\n    const safeClientId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(clientId ?? "")) ? String(clientId) : null;`,
    "block legacy plaintext send",
  );
  next = replaceRequired(next, "const conversation = findConversation(state, cleanLine(conversationId, 64));", "const conversation = findConversation(state, normalizedConversationId);", "reuse normalized conversation ID");
  next = replaceRequired(
    next,
    `    const kind = request.query.kind === "voice" ? "voice" : "file";\n    const posting = roomPostingError(state, conversation, viewerId, kind);`,
    `    const kind = request.query.kind === "voice" ? "voice" : "file";\n    if (conversationUsesMls(conversation.id)) {\n      return response.status(409).json({ ok: false, allowed: false, code: "E2EE_ATTACHMENT_REQUIRED", message: "Вложения в MLS-диалоге должны быть зашифрованы на клиенте." });\n    }\n    const posting = roomPostingError(state, conversation, viewerId, kind);`,
    "block plaintext upload capacity",
  );
  next = replaceRequired(
    next,
    `    if (conversation.type === "dm" && isBlockedEither(state, viewerId, dmPeer(state, conversation, viewerId)?.id)) {`,
    `    if (conversationUsesMls(conversation.id)) {\n      await fs.unlink(request.file.path).catch(() => {});\n      return apiError(response, 409, "Вложения в MLS-диалоге должны быть зашифрованы на клиенте.", "E2EE_ATTACHMENT_REQUIRED");\n    }\n    if (conversation.type === "dm" && isBlockedEither(state, viewerId, dmPeer(state, conversation, viewerId)?.id)) {`,
    "block plaintext upload",
  );
  return next;
});

console.log("3.2.0 core integration patch applied");
