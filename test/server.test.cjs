"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const request = require("supertest");
const { io: createSocket } = require("socket.io-client");
const { createNexoraServer } = require("../server/create-server.cjs");
const { totp } = require("../server/totp.cjs");

let instance;
let directory;
let baseUrl;
let adminAgent;
let userAgent;
let admin;
let user;
let adminCookie;
let userCookie;
let dmConversationId;
let dmMessageId;
let generalConversationId;
let adminCsrf = "";
let userCsrf = "";
let privateRoomId;
let privateConversationId;
let voiceMessageId;

function cookieFrom(response) {
  return response.headers["set-cookie"][0].split(";")[0];
}

function browserAgent(agent, csrf) {
  return new Proxy(agent, {
    get(target, property) {
      if (["post", "put", "patch", "delete"].includes(property)) {
        return (...args) => {
          const requestBuilder = target[property](...args)
            .set("X-Nexora-Client-Version", "3.0.0");
          const token = csrf();
          return token ? requestBuilder.set("X-Nexora-CSRF", token) : requestBuilder;
        };
      }
      if (typeof target[property] === "function") {
        return (...args) => target[property](...args).set("X-Nexora-Client-Version", "3.0.0");
      }
      return target[property];
    },
  });
}

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-test-"));
  const clientDirectory = path.join(directory, "client-dist");
  await fs.mkdir(clientDirectory, { recursive: true });
  await fs.writeFile(
    path.join(clientDirectory, "index.html"),
    '<!doctype html><html lang="ru"><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>',
    "utf8",
  );
  await fs.writeFile(
    path.join(clientDirectory, "nexora-icon.png"),
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2l5sAAAAASUVORK5CYII=", "base64"),
  );
  instance = await createNexoraServer({
    dataDir: directory,
    clientDir: clientDirectory,
    tls: false,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });
  const status = await instance.listen();
  baseUrl = `http://127.0.0.1:${status.port}`;
  adminAgent = browserAgent(request.agent(instance.app), () => adminCsrf);
  userAgent = browserAgent(request.agent(instance.app), () => userCsrf);
});

after(async () => {
  await instance.close();
  await fs.rm(directory, { recursive: true, force: true });
});

test("health-check отвечает", async () => {
  const response = await request(instance.app).get("/api/health").expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.version, require("../package.json").version);
  assert.equal(response.body.compatibility.apiVersion, 3);
  assert.equal(response.body.compatibility.maxClientMajor, 3);
  assert.ok(response.body.serverId);
  assert.equal(response.body.tls, false);
  const incompatible = await request(instance.app).get("/api/health").set("X-Nexora-Client-Version", "1.0.2").expect(426);
  assert.equal(incompatible.body.code, "CLIENT_VERSION_INCOMPATIBLE");
});

test("раздаёт собранный React-клиент с защитными заголовками", async () => {
  const response = await request(instance.app).get("/").expect(200);
  assert.match(response.text, /id="root"/);
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
  await request(instance.app).get("/nexora-icon.png").expect(200).expect("Content-Type", /image\/png/);
});

test("создаёт постоянные аккаунты и назначает первого администратора", async () => {
  const first = await adminAgent.post("/api/auth/register").send({ displayName: "Алекс", username: "alex", password: "StrongPass123!" }).expect(201);
  const second = await userAgent.post("/api/auth/register").send({ displayName: "Мира", username: "mira", password: "StrongPass456!" }).expect(201);
  admin = first.body.user;
  user = second.body.user;
  adminCsrf = first.body.csrfToken;
  userCsrf = second.body.csrfToken;
  adminCookie = cookieFrom(first);
  userCookie = cookieFrom(second);
  assert.equal(admin.role, "server_admin");
  assert.equal(user.role, "user");

  const duplicate = await request(instance.app).post("/api/auth/register").send({ displayName: "Другая Мира", username: "mira", password: "AnotherPass123!" }).expect(409);
  assert.equal(duplicate.body.code, "USERNAME_EXISTS");
});

test("оба пользователя автоматически входят в общую комнату", async () => {
  const first = await adminAgent.get("/api/bootstrap").expect(200);
  const second = await userAgent.get("/api/bootstrap").expect(200);
  assert.ok(first.body.rooms.some((room) => room.slug === "general" && room.joined));
  assert.ok(second.body.rooms.some((room) => room.slug === "general" && room.joined));
  assert.ok(first.body.conversations.some((conversation) => conversation.isSavedMessages));
  assert.ok(second.body.conversations.some((conversation) => conversation.isSavedMessages));
});

test("заявка в контакты создаёт личный чат после принятия", async () => {
  const search = await adminAgent.get("/api/users/search?q=mira").expect(200);
  assert.equal(search.body.users[0].id, user.id);
  await adminAgent.post("/api/contacts/requests").send({ userId: user.id }).expect(201);
  const userBootstrap = await userAgent.get("/api/bootstrap").expect(200);
  const incoming = userBootstrap.body.contactRequests.find((item) => item.direction === "incoming");
  assert.ok(incoming);
  const accepted = await userAgent.post(`/api/contacts/requests/${incoming.id}/accept`).send({}).expect(200);
  dmConversationId = accepted.body.conversationId;
  assert.ok(dmConversationId);
  const adminBootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  assert.ok(adminBootstrap.body.contacts.some((contact) => contact.id === user.id));
});

test("личные сообщения, реакции, прочтение и редактирование работают в real-time", async () => {
  const adminSocket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: adminCookie } });
  const userSocket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: userCookie } });
  await Promise.all([once(adminSocket, "connect"), once(userSocket, "connect")]);

  const incoming = once(userSocket, "message:new");
  const sent = await emitAck(adminSocket, "message:send", { conversationId: dmConversationId, text: "Привет, Nexora!" });
  assert.equal(sent.ok, true);
  const message = await incoming;
  dmMessageId = message.id;
  assert.equal(message.text, "Привет, Nexora!");
  assert.equal(message.sender.username, "alex");

  const reactionUpdate = once(adminSocket, "message:updated");
  const reacted = await emitAck(userSocket, "message:react", { messageId: message.id, emoji: "🔥" });
  assert.equal(reacted.ok, true);
  const afterReaction = await reactionUpdate;
  assert.equal(afterReaction.reactions[0].emoji, "🔥");
  assert.equal(afterReaction.reactions[0].count, 1);

  const readEvent = once(adminSocket, "conversation:read");
  await emitAck(userSocket, "conversation:read", { conversationId: dmConversationId });
  const read = await readEvent;
  assert.equal(read.userId, user.id);

  const editedEvent = once(userSocket, "message:updated");
  const edited = await emitAck(adminSocket, "message:edit", { messageId: message.id, text: "Привет, Мира!" });
  assert.equal(edited.ok, true);
  assert.equal((await editedEvent).text, "Привет, Мира!");

  adminSocket.disconnect();
  userSocket.disconnect();
});

test("приватная комната принимает участника по коду", async () => {
  const created = await adminAgent.post("/api/rooms").send({ name: "Secret Lab", privacy: "private" }).expect(201);
  privateRoomId = created.body.room.id;
  privateConversationId = created.body.room.conversationId;
  assert.equal(created.body.room.privacy, "private");
  assert.ok(created.body.room.inviteCode);
  const joined = await userAgent.post("/api/rooms/join-by-code").send({ code: created.body.room.inviteCode }).expect(200);
  assert.equal(joined.body.conversationId, created.body.room.conversationId);
});

test("загружает файл до 25 МБ и создаёт сообщение", async () => {
  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  generalConversationId = general.conversationId;
  const uploaded = await adminAgent
    .post(`/api/conversations/${general.conversationId}/upload`)
    .field("kind", "file")
    .attach("file", Buffer.from("hello nexora"), { filename: "note.txt", contentType: "text/plain" })
    .expect(201);
  assert.equal(uploaded.body.message.type, "file");
  assert.equal(uploaded.body.message.file.name, "note.txt");
  await adminAgent.get(uploaded.body.message.file.url).expect(200, "hello nexora");
});

test("загружает голосовое сообщение с длительностью и отдаёт аудио", async () => {
  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  const audio = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("nexora voice fixture")]);
  const uploaded = await adminAgent
    .post(`/api/conversations/${general.conversationId}/upload`)
    .field("kind", "voice")
    .field("duration", "17")
    .field("waveform", "12,35,72,18")
    .attach("file", audio, { filename: "voice.webm", contentType: "audio/webm" })
    .expect(201);
  assert.equal(uploaded.body.message.type, "voice");
  assert.equal(uploaded.body.message.file.kind, "voice");
  assert.equal(uploaded.body.message.file.duration, 17);
  assert.deepEqual(uploaded.body.message.file.waveform, [12, 35, 72, 18]);
  voiceMessageId = uploaded.body.message.id;
  await adminAgent.get(uploaded.body.message.file.url).expect("Content-Type", /audio\/webm/).expect(200, audio);
  await userAgent.post(`/api/messages/${voiceMessageId}/listened`).send({}).expect(200);
  const history = await userAgent.get(`/api/conversations/${general.conversationId}/messages`).expect(200);
  assert.equal(history.body.messages.find((message) => message.id === voiceMessageId).listenedByMe, true);
});

test("владелец управляет ролями, заявками, банами, режимами комнаты и приглашением", async () => {
  let novaCsrf = "";
  const nova = browserAgent(request.agent(instance.app), () => novaCsrf);
  const registered = await nova.post("/api/auth/register").send({ displayName: "Нова", username: "nova", password: "NovaStrongPass123!" }).expect(201);
  novaCsrf = registered.body.csrfToken;
  const novaUser = registered.body.user;

  const project = await adminAgent.post("/api/rooms").send({ name: "Project Gate", privacy: "public" }).expect(201);
  const roomId = project.body.room.id;
  await adminAgent.patch(`/api/rooms/${roomId}`).send({ joinPolicy: "request" }).expect(200);
  const requested = await nova.post(`/api/rooms/${roomId}/join`).send({}).expect(202);
  assert.equal(requested.body.pending, true);
  let adminBootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  let roomConversation = adminBootstrap.body.conversations.find((item) => item.roomId === roomId);
  const joinRequest = roomConversation.joinRequests.find((item) => item.user.id === novaUser.id);
  assert.ok(joinRequest);
  await adminAgent.patch(`/api/rooms/${roomId}/join-requests/${joinRequest.id}`).send({ decision: "accept" }).expect(200);
  await adminAgent.patch(`/api/rooms/${roomId}/members/${novaUser.id}/role`).send({ role: "moderator" }).expect(200);
  adminBootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  roomConversation = adminBootstrap.body.conversations.find((item) => item.roomId === roomId);
  assert.equal(roomConversation.members.find((item) => item.id === novaUser.id).roomRole, "moderator");

  await adminAgent.post(`/api/rooms/${roomId}/transfer`).send({ userId: novaUser.id }).expect(200);
  await adminAgent.post(`/api/rooms/${roomId}/transfer`).send({ userId: admin.id }).expect(200);
  await adminAgent.delete(`/api/rooms/${roomId}/members/${novaUser.id}`).expect(200);
  await adminAgent.post(`/api/rooms/${roomId}/bans/${novaUser.id}`).send({ reason: "integration test" }).expect(201);
  await nova.post(`/api/rooms/${roomId}/join`).send({}).expect(403);
  const appeal = await nova.post(`/api/rooms/${roomId}/appeals`).send({ reason: "Прошу пересмотреть тестовую блокировку" }).expect(201);
  adminBootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  roomConversation = adminBootstrap.body.conversations.find((item) => item.roomId === roomId);
  assert.ok(roomConversation.appeals.some((item) => item.id === appeal.body.appeal.id));
  await adminAgent.patch(`/api/rooms/${roomId}/appeals/${appeal.body.appeal.id}`).send({ status: "accepted", resolution: "Проверено" }).expect(200);
  const secondRequest = await nova.post(`/api/rooms/${roomId}/join`).send({}).expect(202);
  await adminAgent.patch(`/api/rooms/${roomId}/join-requests/${secondRequest.body.requestId}`).send({ decision: "reject" }).expect(200);

  const invite = await adminAgent.post(`/api/rooms/${privateRoomId}/invite`).send({ action: "rotate", expiresInHours: 1, maxUses: 2 }).expect(200);
  assert.ok(invite.body.inviteCode);
  assert.equal(invite.body.inviteMaxUses, 2);
  assert.ok(Date.parse(invite.body.inviteExpiresAt) > Date.now());

  await adminAgent.patch(`/api/rooms/${privateRoomId}`).send({ readOnly: true, allowFiles: false, allowVoice: false, slowModeSeconds: 0, joinPolicy: "invite" }).expect(200);
  const roomSocket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: userCookie } });
  await once(roomSocket, "connect");
  const deniedText = await emitAck(roomSocket, "message:send", { conversationId: privateConversationId, text: "read only" });
  assert.equal(deniedText.ok, false);
  assert.match(deniedText.error, /только чтение/i);
  await userAgent.post(`/api/conversations/${privateConversationId}/upload`).field("kind", "file").attach("file", Buffer.from("x"), { filename: "x.txt", contentType: "text/plain" }).expect(403);
  await userAgent.post(`/api/conversations/${privateConversationId}/upload`).field("kind", "voice").attach("file", Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), { filename: "x.webm", contentType: "audio/webm" }).expect(403);

  await adminAgent.patch(`/api/rooms/${privateRoomId}`).send({ readOnly: false, allowFiles: true, allowVoice: true, slowModeSeconds: 30 }).expect(200);
  const firstSlow = await emitAck(roomSocket, "message:send", { conversationId: privateConversationId, text: "первое в slow mode" });
  const secondSlow = await emitAck(roomSocket, "message:send", { conversationId: privateConversationId, text: "слишком быстро" });
  assert.equal(firstSlow.ok, true);
  assert.equal(secondSlow.ok, false);
  assert.match(secondSlow.error, /медленн/i);
  roomSocket.disconnect();
  await adminAgent.patch(`/api/rooms/${privateRoomId}`).send({ slowModeSeconds: 0 }).expect(200);

  adminBootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  roomConversation = adminBootstrap.body.conversations.find((item) => item.roomId === roomId);
  assert.ok(roomConversation.auditLog.some((entry) => entry.action === "moderator.assigned"));
  assert.ok(roomConversation.auditLog.some((entry) => entry.action === "member.banned"));
  const projectHistory = await adminAgent.get(`/api/conversations/${project.body.room.conversationId}/messages`).expect(200);
  assert.ok(projectHistory.body.messages.some((message) => message.type === "system"));
});

test("профиль поддерживает статус, аватар и выбор звука", async () => {
  const updated = await adminAgent.patch("/api/users/me").send({
    displayName: "Алекс 0.3",
    status: "Тестирую надёжность",
    notificationSound: "chime",
  }).expect(200);
  assert.equal(updated.body.user.status, "Тестирую надёжность");

  const avatar = await adminAgent.post("/api/users/me/avatar")
    .attach("avatar", Buffer.from("fake png payload"), { filename: "avatar.png", contentType: "image/png" })
    .expect(201);
  assert.match(avatar.body.user.avatarUrl, /^\/api\/avatars\//);
  const avatarResponse = await adminAgent.get(avatar.body.user.avatarUrl).expect(200);
  assert.equal(avatarResponse.body.toString(), "fake png payload");

  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  assert.equal(bootstrap.body.preferences.notificationSound, "chime");
  const publicProfile = await userAgent.get(`/api/users/${admin.id}/profile`).expect(200);
  assert.equal(publicProfile.body.user.id, admin.id);
  assert.equal(publicProfile.body.user.status, "Тестирую надёжность");
  assert.equal(publicProfile.body.relationship.contact, true);
  assert.ok(publicProfile.body.relationship.sharedRooms.some((room) => room.name === "Общий"));
});

test("API v3 синхронизирует события, уведомления и отложенные сообщения", async () => {
  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  assert.equal(bootstrap.body.sync.apiVersion, 3);
  assert.equal(bootstrap.body.capabilities.offlineSync, true);
  assert.equal(bootstrap.body.capabilities.android, true);

  const preferences = await userAgent.patch("/api/users/me/preferences").send({
    notificationMode: "mentions",
    quietHoursStart: "22:30",
    quietHoursEnd: "07:15",
  }).expect(200);
  assert.equal(preferences.body.preferences.notificationMode, "mentions");

  const draft = await adminAgent.put(`/api/v3/drafts/${generalConversationId}`).send({ text: "Черновик между устройствами" }).expect(200);
  assert.equal(draft.body.draft.text, "Черновик между устройствами");
  assert.ok((await adminAgent.get("/api/bootstrap").expect(200)).body.drafts.some((item) => item.conversationId === generalConversationId));
  await adminAgent.delete(`/api/v3/drafts/${generalConversationId}`).expect(200);

  const scheduled = await adminAgent.post("/api/messages/scheduled").send({
    conversationId: generalConversationId,
    text: "Отложенное сообщение",
    silent: true,
    scheduledAt: new Date(Date.now() + 60_000).toISOString(),
  }).expect(201);
  assert.equal(scheduled.body.scheduledMessage.status, "pending");
  await adminAgent.delete(`/api/messages/scheduled/${scheduled.body.scheduledMessage.id}`).expect(200);

  const socket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: adminCookie }, auth: { clientVersion: "3.0.0" } });
  await once(socket, "connect");
  const sent = await emitAck(socket, "message:send", { conversationId: generalConversationId, text: "Проверка @mira" });
  socket.disconnect();
  assert.equal(sent.ok, true);
  assert.equal(sent.message.silent, false);

  const notifications = await userAgent.get("/api/notifications?unreadOnly=1").expect(200);
  assert.ok(notifications.body.notifications.some((item) => item.type === "message.mention" && item.messageId === sent.message.id));
  await userAgent.patch("/api/notifications/read").send({ all: true }).expect(200);
  assert.equal((await userAgent.get("/api/notifications?unreadOnly=1").expect(200)).body.unreadCount, 0);

  const sync = await adminAgent.get("/api/v3/sync?after=0&limit=500").expect(200);
  assert.equal(sync.body.apiVersion, 3);
  assert.ok(sync.body.latestSequence > 0);
  assert.ok(sync.body.events.some((event) => event.type === "message.created"));
  const reset = await adminAgent.get(`/api/v3/sync?after=${sync.body.latestSequence + 100}`).expect(200);
  assert.equal(reset.body.resyncRequired, true);
});

test("опросы, история правок и scoped bot API работают в рамках комнаты", async () => {
  const created = await adminAgent.post(`/api/conversations/${generalConversationId}/polls`).send({
    question: "Какой режим тестируем?",
    options: ["Offline", "Online"],
    multiple: false,
  }).expect(201);
  const poll = created.body.message.poll;
  assert.equal(poll.options.length, 2);
  const vote = await userAgent.post(`/api/polls/${poll.id}/votes`).send({ optionIds: [poll.options[0].id] }).expect(200);
  assert.equal(vote.body.message.poll.options[0].votes, 1);
  assert.equal(vote.body.message.poll.options[0].selectedByMe, true);
  await adminAgent.post(`/api/polls/${poll.id}/close`).send({}).expect(200);

  const edits = await adminAgent.get(`/api/messages/${dmMessageId}/edits`).expect(200);
  assert.ok(edits.body.edits.some((edit) => edit.previousText === "Привет, Nexora!"));

  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  const general = bootstrap.body.rooms.find((room) => room.slug === "general");
  const reportRole = await adminAgent.post(`/api/rooms/${general.id}/roles`).send({ name: "Report reviewer", permissions: ["room.manage_reports"] }).expect(201);
  await adminAgent.patch(`/api/rooms/${general.id}/members/${user.id}/custom-roles`).send({ roleIds: [reportRole.body.role.id] }).expect(200);
  const userGeneral = (await userAgent.get("/api/bootstrap").expect(200)).body.conversations.find((item) => item.roomId === general.id);
  assert.equal(userGeneral.permissions.canManageReports, true);
  const reportTarget = (await userAgent.get(`/api/conversations/${generalConversationId}/messages`).expect(200)).body.messages.find((message) => !message.isOwn && message.type !== "deleted");
  const report = await userAgent.post(`/api/messages/${reportTarget.id}/report`).send({ reason: "Проверка scoped роли модерации" }).expect(201);
  await userAgent.patch(`/api/rooms/${general.id}/reports/${report.body.report.id}`).send({ status: "resolved" }).expect(200);

  const bot = await adminAgent.post(`/api/rooms/${general.id}/bots`).send({ displayName: "Build Bot", username: "build_bot" }).expect(201);
  const token = await adminAgent.post(`/api/bots/${bot.body.bot.id}/tokens`).send({ name: "CI", scopes: ["messages:write"] }).expect(201);
  assert.match(token.body.token.value, /^nxa_/);
  await request(instance.app).get("/api/v3/bot/me").set("Authorization", `Bearer ${token.body.token.value}`).expect(200);
  const botMessage = await request(instance.app).post("/api/v3/bot/messages")
    .set("Authorization", `Bearer ${token.body.token.value}`)
    .set("X-Nexora-Client-Version", "3.0.0")
    .send({ conversationId: generalConversationId, text: "Сборка завершена" }).expect(201);
  assert.equal(botMessage.body.message.sender.isBot, true);
  await request(instance.app).post("/api/v3/bot/messages")
    .set("Authorization", `Bearer ${token.body.token.value}`)
    .send({ conversationId: dmConversationId, text: "Нельзя читать другой scope" }).expect(403);
  const integrations = await adminAgent.get(`/api/rooms/${general.id}/integrations`).expect(200);
  const listedToken = integrations.body.bots.find((item) => item.id === bot.body.bot.id).tokens.find((item) => item.id === token.body.token.id);
  assert.equal(listedToken.tokenHash, undefined);
  await adminAgent.delete(`/api/bots/${bot.body.bot.id}/tokens/${token.body.token.id}`).expect(200);
  await request(instance.app).get("/api/v3/bot/me").set("Authorization", `Bearer ${token.body.token.value}`).expect(401);
});

test("возобновляемая загрузка проверяет части и реальный тип медиа", async () => {
  const payload = Buffer.alloc(1024 * 1024 + 19, 0x4e);
  const opened = await adminAgent.post(`/api/conversations/${generalConversationId}/uploads`).send({
    name: "large.bin", size: payload.length, mimeType: "application/octet-stream", kind: "file",
  }).expect(201);
  const upload = opened.body.upload;
  assert.equal(upload.totalChunks, 2);
  for (let index = 0; index < upload.totalChunks; index += 1) {
    const chunk = payload.subarray(index * upload.chunkSize, Math.min(payload.length, (index + 1) * upload.chunkSize));
    const hash = crypto.createHash("sha256").update(chunk).digest("hex");
    await adminAgent.put(`/api/uploads/${upload.id}/chunks/${index}`)
      .set("Content-Type", "application/octet-stream").set("X-Chunk-SHA256", hash).send(chunk).expect(200);
  }
  const resumed = await adminAgent.get(`/api/uploads/${upload.id}`).expect(200);
  assert.deepEqual(resumed.body.upload.receivedChunks.sort(), [0, 1]);
  const completed = await adminAgent.post(`/api/uploads/${upload.id}/complete`).send({ caption: "resumable" }).expect(201);
  assert.equal(completed.body.message.file.size, payload.length);

  const spoofed = await adminAgent.post(`/api/conversations/${generalConversationId}/uploads`).send({
    name: "fake.png", size: 4, mimeType: "image/png", kind: "image",
  }).expect(201);
  await adminAgent.put(`/api/uploads/${spoofed.body.upload.id}/chunks/0`)
    .set("Content-Type", "application/octet-stream").send(Buffer.from("nope")).expect(400);
  const spoofHash = crypto.createHash("sha256").update(Buffer.from("nope")).digest("hex");
  await adminAgent.put(`/api/uploads/${spoofed.body.upload.id}/chunks/0`)
    .set("Content-Type", "application/octet-stream").set("X-Chunk-SHA256", spoofHash).send(Buffer.from("nope")).expect(200);
  const rejected = await adminAgent.post(`/api/uploads/${spoofed.body.upload.id}/complete`).send({}).expect(415);
  assert.equal(rejected.body.code, "FILE_TYPE_MISMATCH");
  await adminAgent.delete(`/api/uploads/${spoofed.body.upload.id}`).expect(200);
});

test("TOTP требует второй фактор и хранит secret только в зашифрованном виде", async () => {
  let csrf = "";
  const raw = request.agent(instance.app);
  const protectedAgent = browserAgent(raw, () => csrf);
  const registered = await protectedAgent.post("/api/auth/register").send({
    displayName: "Тотп Тестер", username: "totp-tester", password: "TotpStrongPass123!",
  }).expect(201);
  csrf = registered.body.csrfToken;
  const setup = await protectedAgent.post("/api/users/me/totp/setup").send({}).expect(200);
  const enabled = await protectedAgent.post("/api/users/me/totp/enable").send({ code: totp(setup.body.secret) }).expect(200);
  assert.equal(enabled.body.recoveryCodes.length, 10);
  const stored = instance.store.read((state) => state.users.find((item) => item.username === "totp-tester"));
  assert.equal(stored.totpEnabled, true);
  assert.ok(stored.totpSecret && !stored.totpSecret.includes(setup.body.secret));

  const login = await request(instance.app).post("/api/auth/login").send({ username: "totp-tester", password: "TotpStrongPass123!" }).expect(202);
  assert.equal(login.body.requiresTotp, true);
  const completed = await request(instance.app).post("/api/auth/login/totp").send({ challengeId: login.body.challengeId, code: totp(setup.body.secret) }).expect(200);
  assert.equal(completed.body.user.username, "totp-tester");
});

test("CSRF, Origin, постоянная блокировка входа и политика паролей защищают сервер", async () => {
  await request(instance.app).post(`/api/blocks/${user.id}`).set("Cookie", adminCookie).send({}).expect(403);
  await request(instance.app).post(`/api/blocks/${user.id}`).set("Cookie", adminCookie).set("X-Nexora-CSRF", adminCsrf).set("Origin", "https://evil.example").send({}).expect(403);

  await instance.updateSecuritySettings({ minLength: 12, requireUpper: true, requireLower: true, requireNumber: true, requireSymbol: true, loginMaxAttempts: 3, loginLockMinutes: 1 });
  await request(instance.app).post("/api/auth/register").send({ displayName: "Weak", username: "weak-user", password: "WeakPassword123" }).expect(400);
  for (let index = 0; index < 3; index += 1) {
    await request(instance.app).post("/api/auth/login").send({ username: "nova", password: `WrongPassword${index}!` }).expect(401);
  }
  const locked = await request(instance.app).post("/api/auth/login").send({ username: "nova", password: "NovaStrongPass123!" }).expect(423);
  assert.equal(locked.body.code, "LOGIN_LOCKED");
  const data = await instance.listAdminData();
  assert.ok(data.loginAttempts.some((attempt) => attempt.username === "nova" && attempt.reason === "temporary_lock"));
  assert.equal(data.securitySettings.requireSymbol, true);
  await instance.updateSecuritySettings({ minLength: 10, requireUpper: true, requireLower: true, requireNumber: true, requireSymbol: false, loginMaxAttempts: 5, loginLockMinutes: 15 });
});

test("показывает активные сессии и отключает выбранное устройство", async () => {
  const secondDevice = request.agent(instance.app);
  const login = await secondDevice.post("/api/auth/login")
    .set("User-Agent", "Nexora Session Test on Windows")
    .send({ username: "alex", password: "StrongPass123!" })
    .expect(200);
  const secondCookie = cookieFrom(login);
  const secondSocket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: secondCookie } });
  await once(secondSocket, "connect");

  const sessions = await adminAgent.get("/api/sessions").expect(200);
  const remote = sessions.body.sessions.find((session) => session.userAgent.includes("Session Test"));
  assert.ok(remote);
  const disconnected = once(secondSocket, "disconnect");
  await adminAgent.delete(`/api/sessions/${remote.id}`).expect(200);
  await disconnected;
  assert.equal((await adminAgent.get("/api/sessions").expect(200)).body.sessions.some((session) => session.id === remote.id), false);
});

test("смена пароля сохраняет текущую сессию и запрещает старый пароль", async () => {
  await adminAgent.post("/api/users/me/password").send({
    currentPassword: "StrongPass123!",
    newPassword: "NexoraStrongPass789!",
  }).expect(200);
  await request(instance.app).post("/api/auth/login").send({ username: "alex", password: "StrongPass123!" }).expect(401);
  await request(instance.app).post("/api/auth/login").send({ username: "alex", password: "NexoraStrongPass789!" }).expect(200);
  await adminAgent.get("/api/bootstrap").expect(200);
});

test("поиск, ответы, пересылка, mute и идемпотентная очередь работают вместе", async () => {
  const adminSocket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: adminCookie } });
  await once(adminSocket, "connect");

  const clientId = "offline_queue_message_0001";
  const [first, second] = await Promise.all([
    emitAck(adminSocket, "message:send", { conversationId: dmConversationId, text: "Уникальная фраза для глобального поиска", clientId }),
    emitAck(adminSocket, "message:send", { conversationId: dmConversationId, text: "Уникальная фраза для глобального поиска", clientId }),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.message.id, second.message.id);
  assert.ok(first.duplicate || second.duplicate);

  const reply = await emitAck(adminSocket, "message:send", {
    conversationId: dmConversationId,
    text: "Ответ с переходом к исходному сообщению",
    replyToId: dmMessageId,
    clientId: "offline_queue_reply_000002",
  });
  assert.equal(reply.ok, true);
  assert.equal(reply.message.reply.id, dmMessageId);

  const around = await adminAgent.get(`/api/conversations/${dmConversationId}/messages?around=${dmMessageId}`).expect(200);
  assert.equal(around.body.anchorId, dmMessageId);
  assert.ok(around.body.messages.some((message) => message.id === reply.message.id));

  const forwarded = await emitAck(adminSocket, "message:forward", {
    messageId: first.message.id,
    conversationId: generalConversationId,
    clientId: "offline_queue_forward_001",
  });
  assert.equal(forwarded.ok, true);
  assert.equal(forwarded.message.forwarded.senderName, "Алекс 0.3");

  const globalSearch = await adminAgent.get("/api/search/messages?q=%D0%A3%D0%BD%D0%B8%D0%BA%D0%B0%D0%BB%D1%8C%D0%BD%D0%B0%D1%8F").expect(200);
  assert.ok(globalSearch.body.results.some((result) => result.message.id === first.message.id));
  const chatSearch = await adminAgent.get(`/api/search/messages?q=%D0%9E%D1%82%D0%B2%D0%B5%D1%82&conversationId=${dmConversationId}`).expect(200);
  assert.ok(chatSearch.body.results.every((result) => result.conversation.id === dmConversationId));

  const muted = await adminAgent.patch(`/api/conversations/${dmConversationId}/settings`).send({ muted: true }).expect(200);
  assert.equal(muted.body.settings.muted, true);
  const organized = await adminAgent.patch(`/api/conversations/${dmConversationId}/settings`).send({ pinned: true, archived: true, folder: "personal" }).expect(200);
  assert.equal(organized.body.settings.pinned, true);
  assert.equal(organized.body.settings.archived, true);
  assert.equal(organized.body.settings.folder, "personal");
  const bookmarked = await adminAgent.post(`/api/messages/${first.message.id}/bookmark`).send({}).expect(200);
  assert.equal(bookmarked.body.bookmarked, true);
  const bookmarks = await adminAgent.get("/api/bookmarks").expect(200);
  assert.ok(bookmarks.body.bookmarks.some((result) => result.message.id === first.message.id));
  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  assert.equal(bootstrap.body.conversations.find((item) => item.id === dmConversationId).notificationSettings.muted, true);
  assert.equal(bootstrap.body.conversations.find((item) => item.id === dmConversationId).notificationSettings.pinned, true);
  adminSocket.disconnect();
});

test("контакт можно удалить без удаления переписки и без блокировки", async () => {
  await adminAgent.delete(`/api/contacts/${user.id}`).expect(200);
  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  assert.equal(bootstrap.body.contacts.some((contact) => contact.id === user.id), false);
  assert.ok(bootstrap.body.conversations.some((conversation) => conversation.id === dmConversationId));
  assert.equal(bootstrap.body.blocked.some((blockedUser) => blockedUser.id === user.id), false);
});

test("блокировка запрещает личные сообщения и новые заявки", async () => {
  await userAgent.post(`/api/blocks/${admin.id}`).send({}).expect(200);
  const adminSocket = createSocket(baseUrl, { transports: ["websocket"], extraHeaders: { Cookie: adminCookie } });
  await once(adminSocket, "connect");
  const blocked = await emitAck(adminSocket, "message:send", { conversationId: dmConversationId, text: "Не должно отправиться" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /блокировк/i);
  adminSocket.disconnect();
});

test("сервер показывает хранилище, экспортирует комнату и удаляет потерянные файлы", async () => {
  const stats = await adminAgent.get("/api/admin/stats").expect(200);
  assert.equal(stats.body.stats.database, "sqlite");
  assert.equal(stats.body.stats.integrity, "ok");
  assert.ok(stats.body.stats.bytes > 0);

  const updated = await instance.updateStorageSettings({ storageQuotaBytes: 512 * 1024 * 1024, fileRetentionDays: 0 });
  assert.equal(updated.quotaBytes, 512 * 1024 * 1024);
  assert.equal(updated.fileRetentionDays, 0);

  const room = instance.store.read((state) => state.rooms.find((item) => item.slug === "general"));
  const exported = await instance.exportRoom(room.id);
  assert.equal(exported.format, "nexora-room-export");
  assert.ok(exported.messages.some((message) => message.type === "voice"));

  const beforeQuota = instance.store.stats();
  await instance.store.mutate((state) => {
    state.files.push({
      id: "quota-fixture",
      conversationId: generalConversationId,
      uploaderId: admin.id,
      originalName: "quota-fixture.bin",
      storedName: "quota-fixture.bin",
      mimeType: "application/octet-stream",
      size: beforeQuota.quotaBytes - beforeQuota.bytes,
      kind: "file",
      duration: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    });
  });
  await adminAgent.post(`/api/conversations/${generalConversationId}/upload`)
    .field("kind", "file")
    .attach("file", Buffer.from("over quota"), { filename: "too-much.txt", contentType: "text/plain" })
    .expect(507);
  await instance.store.mutate((state) => { state.files = state.files.filter((file) => file.id !== "quota-fixture"); });

  const orphanPath = path.join(directory, "uploads", "orphan.bin");
  await fs.writeFile(orphanPath, "orphan");
  const cleanup = await instance.cleanupStorage();
  assert.ok(cleanup.orphans >= 1);
  await assert.rejects(fs.access(orphanPath));
});

test("ручная резервная копия восстанавливает базу и вложения", async () => {
  const backup = await instance.createBackup();
  assert.equal(backup.automatic, false);
  assert.ok((await instance.listBackups()).some((item) => item.directory === backup.directory));

  await adminAgent.patch("/api/users/me").send({ displayName: "Изменено после копии" }).expect(200);
  assert.equal((await adminAgent.get("/api/bootstrap").expect(200)).body.me.displayName, "Изменено после копии");

  const restored = await instance.restoreBackup(backup.directory);
  assert.equal(restored.stats.integrity, "ok");
  const bootstrap = await adminAgent.get("/api/bootstrap").expect(200);
  assert.equal(bootstrap.body.me.displayName, "Алекс 0.3");
  const voice = bootstrap.body.files.find((file) => file.kind === "voice");
  assert.ok(voice);
  await adminAgent.get(voice.url).expect(200);
});

test("администратор сбрасывает пароль и завершает сессии пользователя", async () => {
  await instance.resetUserPassword(user.id, "AdminResetPass987!");
  await userAgent.get("/api/bootstrap").expect(401);
  await request(instance.app).post("/api/auth/login").send({ username: "mira", password: "StrongPass456!" }).expect(401);
  const freshRaw = request.agent(instance.app);
  const login = await freshRaw.post("/api/auth/login").send({ username: "mira", password: "AdminResetPass987!" }).expect(200);
  assert.equal(login.body.user.mustChangePassword, true);
  let freshCsrf = login.body.csrfToken;
  const freshUser = browserAgent(freshRaw, () => freshCsrf);
  await freshUser.get("/api/bootstrap").expect(428);
  const changed = await freshUser.post("/api/users/me/password").send({ currentPassword: "AdminResetPass987!", newPassword: "MiraPermanentPass654!" }).expect(200);
  assert.equal(changed.body.user.mustChangePassword, false);
  await freshUser.get("/api/bootstrap").expect(200);
  await freshUser.post("/api/sessions/revoke-all").send({}).expect(200);
  await freshUser.get("/api/bootstrap").expect(401);
});

test("локальный HTTPS-сертификат доверяется сгенерированному CA", async () => {
  const tlsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-tls-test-"));
  const tlsInstance = await createNexoraServer({
    dataDir: tlsDirectory,
    clientDir: path.join(__dirname, "..", "client", "dist"),
    tls: true,
    redirect: false,
    port: 0,
    host: "127.0.0.1",
    quiet: true,
  });
  const tlsStatus = await tlsInstance.listen();
  const ca = await fs.readFile(tlsInstance.certificates.caCertificate);
  const body = await new Promise((resolve, reject) => {
    https.get({ hostname: "127.0.0.1", port: tlsStatus.port, path: "/api/health", ca, rejectUnauthorized: true }, (response) => {
      let value = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { value += chunk; });
      response.on("end", () => resolve(JSON.parse(value)));
    }).on("error", reject);
  });
  assert.equal(body.ok, true);
  assert.equal(body.tls, true);
  await tlsInstance.close();
  await fs.rm(tlsDirectory, { recursive: true, force: true });
});
