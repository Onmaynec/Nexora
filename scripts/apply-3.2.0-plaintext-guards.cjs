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

update("server/create-server.cjs", (source) => {
  let next = replaceRequired(
    source,
    `    maintenance,\n    uploadsDir,`,
    `    maintenance,\n    conversationUsesMls,\n    uploadsDir,`,
    "pass MLS guard to v3 features",
  );
  next = replaceRequired(
    next,
    `      if (!source || !canAccessConversation(state, sourceConversation, user.id) || !canAccessConversation(state, targetConversation, user.id)) {\n        return acknowledge({ ok: false, error: "Пересылка недоступна." });\n      }\n      const postingKind`,
    `      if (!source || !canAccessConversation(state, sourceConversation, user.id) || !canAccessConversation(state, targetConversation, user.id)) {\n        return acknowledge({ ok: false, error: "Пересылка недоступна." });\n      }\n      if (conversationUsesMls(targetConversation.id)) {\n        return acknowledge({ ok: false, code: "E2EE_FORWARD_REQUIRED", error: "Пересылка в MLS-диалог должна быть зашифрована на клиенте." });\n      }\n      const postingKind`,
    "block legacy forward into MLS",
  );
  return next;
});

update("server/v3-features.cjs", (source) => {
  let next = replaceRequired(
    source,
    `    app, store, io, authRequired, serverAdminRequired, createTextMessage, emitMessage,\n    roomPostingError, maintenance, uploadsDir, incomingDir, maxFileBytes, secretService, log = () => {},`,
    `    app, store, io, authRequired, serverAdminRequired, createTextMessage, emitMessage,\n    roomPostingError, maintenance, conversationUsesMls = () => false, uploadsDir, incomingDir, maxFileBytes, secretService, log = () => {},`,
    "destructure MLS guard",
  );
  next = replaceRequired(
    next,
    `.filter((item) => item.userId === request.nexora.user.id && canAccessConversation(state, findConversation(state, item.conversationId), item.userId))`,
    `.filter((item) => item.userId === request.nexora.user.id && !conversationUsesMls(item.conversationId) && canAccessConversation(state, findConversation(state, item.conversationId), item.userId))`,
    "hide legacy drafts for MLS",
  );
  next = replaceRequired(
    next,
    `    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");\n    if (!text) return fail(response, 400, "Пустой черновик следует удалить.", "DRAFT_EMPTY");`,
    `    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");\n    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Черновик MLS хранится только в зашифрованном локальном хранилище.", "E2EE_DRAFT_LOCAL_ONLY");\n    if (!text) return fail(response, 400, "Пустой черновик следует удалить.", "DRAFT_EMPTY");`,
    "block server draft for MLS",
  );
  next = replaceRequired(
    next,
    `    if (!text || !canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат или сообщение недоступны.", "FORBIDDEN");\n    if (!Number.isFinite(scheduledAt)`,
    `    if (!text || !canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат или сообщение недоступны.", "FORBIDDEN");\n    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Отложенная plaintext-отправка недоступна в MLS-диалоге.", "E2EE_SCHEDULE_UNSUPPORTED");\n    if (!Number.isFinite(scheduledAt)`,
    "block scheduled plaintext for MLS",
  );
  next = replaceRequired(
    next,
    `    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");\n    if (question.length < 2`,
    `    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");\n    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Опросы требуют отдельного E2EE-формата и пока недоступны в MLS-диалоге.", "E2EE_POLL_UNSUPPORTED");\n    if (question.length < 2`,
    "block polls for MLS",
  );
  next = replaceRequired(
    next,
    `    if (!conversation || conversation.roomId !== request.nexoraBot.bot.roomId) return fail(response, 403, "Бот ограничен своей комнатой.", "BOT_ROOM_SCOPE");\n    try {`,
    `    if (!conversation || conversation.roomId !== request.nexoraBot.bot.roomId) return fail(response, 403, "Бот ограничен своей комнатой.", "BOT_ROOM_SCOPE");\n    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Бот не имеет доверенного MLS-устройства и не может отправлять plaintext.", "E2EE_BOT_UNSUPPORTED");\n    try {`,
    "block bot plaintext for MLS",
  );
  next = replaceRequired(
    next,
    `    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");\n    if (!Number.isSafeInteger(size)`,
    `    if (!canAccessConversation(state, conversation, request.nexora.user.id)) return fail(response, 403, "Чат недоступен.", "FORBIDDEN");\n    if (conversationUsesMls(conversation.id)) return fail(response, 409, "Вложения в MLS-диалоге должны быть зашифрованы на клиенте.", "E2EE_ATTACHMENT_REQUIRED");\n    if (!Number.isSafeInteger(size)`,
    "block resumable upload creation for MLS",
  );
  next = replaceRequired(
    next,
    `    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id && item.status === "uploading"));\n    const index = Number(request.params.index);`,
    `    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id && item.status === "uploading"));\n    if (upload && conversationUsesMls(upload.conversationId)) return fail(response, 409, "Загрузка отменена: диалог переведён на MLS E2EE.", "E2EE_ATTACHMENT_REQUIRED");\n    const index = Number(request.params.index);`,
    "block resumable upload chunks after MLS activation",
  );
  next = replaceRequired(
    next,
    `    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id && item.status === "uploading"));\n    if (!upload || upload.receivedChunks.length !== upload.totalChunks`,
    `    const upload = store.read((state) => state.uploadSessions.find((item) => item.id === request.params.id && item.userId === request.nexora.user.id && item.status === "uploading"));\n    if (upload && conversationUsesMls(upload.conversationId)) {\n      await fs.rm(path.join(incomingDir, upload.tempName), { force: true });\n      await store.mutate((state) => { const current = state.uploadSessions.find((item) => item.id === upload.id); if (current) current.status = "cancelled"; });\n      return fail(response, 409, "Загрузка отменена: диалог переведён на MLS E2EE.", "E2EE_ATTACHMENT_REQUIRED");\n    }\n    if (!upload || upload.receivedChunks.length !== upload.totalChunks`,
    "block resumable upload completion after MLS activation",
  );
  return next;
});

console.log("3.2.0 plaintext guards applied");
