"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function file(relative) {
  return path.join(root, relative);
}

function read(relative) {
  return fs.readFileSync(file(relative), "utf8");
}

function write(relative, content) {
  fs.writeFileSync(file(relative), content, "utf8");
}

function replaceExact(relative, before, after) {
  const source = read(relative);
  if (!source.includes(before)) throw new Error(`Patch anchor not found in ${relative}: ${before.slice(0, 100)}`);
  write(relative, source.replace(before, after));
}

const trustFile = "client/src/crypto/trust-client.js";
replaceExact(trustFile,
`async function requestWelcomeAndWait(device, conversationId) {`,
`function isRecoverableWelcomeError(error) {
  return ["MLS_WELCOME_NO_MATCHING_KEY_PACKAGE", "MLS_WELCOME_RACE"].includes(error?.code || error?.message);
}

async function claimWelcomeSafely(device, conversationId) {
  try {
    return await claimWelcome(device, conversationId);
  } catch (error) {
    if (isRecoverableWelcomeError(error)) return null;
    throw error;
  }
}

async function requestWelcomeAndWait(device, conversationId) {`);
replaceExact(trustFile,
`      const joined = await claimWelcome(device, conversationId);
      if (joined) return joined;
    } catch (error) {
      if (!["MLS_WELCOME_NO_MATCHING_KEY_PACKAGE", "MLS_WELCOME_RACE"].includes(error.code || error.message)) throw error;
    }`,
`      const joined = await claimWelcomeSafely(device, conversationId);
      if (joined) return joined;
    } catch (error) {
      if (!isRecoverableWelcomeError(error)) throw error;
    }`);
replaceExact(trustFile,
`  await claimWelcome(device, conversation.id).catch((error) => {
    if (!["MLS_WELCOME_NO_MATCHING_KEY_PACKAGE", "MLS_WELCOME_RACE"].includes(error.code || error.message)) throw error;
  });`,
`  await claimWelcomeSafely(device, conversation.id);`);
replaceExact(trustFile,
`      const joined = await claimWelcome(device, conversation.id) || await requestWelcomeAndWait(device, conversation.id);`,
`      const joined = await claimWelcomeSafely(device, conversation.id) || await requestWelcomeAndWait(device, conversation.id);`);
replaceExact(trustFile,
`    const joined = await claimWelcome(device, conversation.id);
    local = joined || await loadLocalGroup(conversation.id) || await requestWelcomeAndWait(device, conversation.id);`,
`    const joined = await claimWelcomeSafely(device, conversation.id);
    local = joined || await loadLocalGroup(conversation.id) || await requestWelcomeAndWait(device, conversation.id);`);

replaceExact("server/mls-transport.cjs",
`    const recipients = emitToVerifiedGroupDevices(io, store.db, scope, eventName, ({ userId }) => serializeMessage(state, result.message, userId));
    for (const recipient of recipients) io.to(trustDeviceRoom(recipient.deviceId)).emit("data:refresh");`,
`    // The message event already contains the complete serialized payload. A second
    // data:refresh forced every Client to download bootstrap and rebuilt the whole
    // workspace after each send, producing visible jumps and avoidable latency.
    emitToVerifiedGroupDevices(io, store.db, scope, eventName, ({ userId }) => serializeMessage(state, result.message, userId));`);

const appFile = "client/src/App.jsx";
replaceExact(appFile,
`  const refresh = useCallback(async () => {`,
`  const applyMessagePreview = useCallback((message) => {
    if (!message?.conversationId) return;
    setBootstrap((current) => {
      if (!current) return current;
      let changed = false;
      const conversations = (current.conversations || []).map((conversation) => {
        if (conversation.id !== message.conversationId) return conversation;
        changed = true;
        return {
          ...conversation,
          lastMessage: message,
          updatedAt: message.createdAt || conversation.updatedAt,
        };
      });
      if (!changed) return current;
      const next = { ...current, conversations };
      bootstrapRef.current = next;
      cacheBootstrap(next).catch(() => {});
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {`);
replaceExact(appFile,
`    const onMessage = (message) => {
      scheduleRefresh();`,
`    const onMessage = (message) => {
      applyMessagePreview(message);`);
replaceExact(appFile,
`    socket.on("message:new", onMessage);
    socket.on("mls.commit", onMlsCommit);`,
`    socket.on("message:new", onMessage);
    socket.on("message:updated", applyMessagePreview);
    socket.on("mls.commit", onMlsCommit);`);
replaceExact(appFile,
`      socket.off("message:new", onMessage);
      socket.off("mls.commit", onMlsCommit);`,
`      socket.off("message:new", onMessage);
      socket.off("message:updated", applyMessagePreview);
      socket.off("mls.commit", onMlsCommit);`);
replaceExact(appFile,
`  }, [me?.id, me?.mustChangePassword, refresh, socket, showToast, trustState.device?.id]);`,
`  }, [applyMessagePreview, me?.id, me?.mustChangePassword, refresh, socket, showToast, trustState.device?.id]);`);

const paneFile = "client/src/components/SecureMessagePane.jsx";
replaceExact(paneFile,
`          .then((result) => {
            if (result.failed) showToast("Ciphertext не доставлен; доступен безопасный повтор.", "error");
            void onRefresh().catch(() => {});
          })`,
`          .then((result) => {
            if (result.failed) showToast("Ciphertext не доставлен; доступен безопасный повтор.", "error");
          })`);
replaceExact(paneFile,
`      const result = await flushOutbox(socket, me.id);
      if (result.failed) throw new Error("E2EE attachment сохранён в безопасной очереди для повтора.");
      void onRefresh().catch(() => {});`,
`      const result = await flushOutbox(socket, me.id);
      if (result.failed) throw new Error("E2EE attachment сохранён в безопасной очереди для повтора.");`);
replaceExact(paneFile,
`    if (socket.connected) flushOutbox(socket, me.id).then((result) => { if (result.sent) void onRefresh().catch(() => {}); });`,
`    if (socket.connected) void flushOutbox(socket, me.id)
      .then((result) => { if (result.failed) showToast("Ciphertext не доставлен; доступен безопасный повтор.", "error"); })
      .catch((error) => showToast(error.message, "error"));`);

const regressionFile = "test/release-3.2.5-regressions.test.cjs";
replaceExact(regressionFile,
`  assert.match(trust, /claimWelcome\\(device, conversation\\.id\\)\\s*\\|\\|\\s*await requestWelcomeAndWait/);`,
`  assert.match(trust, /claimWelcomeSafely\\(device, conversation\\.id\\)\\s*\\|\\|\\s*await requestWelcomeAndWait/);
  assert.doesNotMatch(trust, /const joined = await claimWelcome\\(device, conversation\\.id\\)/);`);
replaceExact(regressionFile,
`test("3.2.5: local Windows release build is available without weakening signed publication", () => {`,
`test("3.2.5: message delivery does not force a full bootstrap refresh", () => {
  const transport = fs.readFileSync(path.join(root, "server", "mls-transport.cjs"), "utf8");
  const pane = fs.readFileSync(path.join(root, "client", "src", "components", "SecureMessagePane.jsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");
  assert.doesNotMatch(transport, /emit\\("data:refresh"\\)/);
  assert.match(app, /applyMessagePreview\\(message\\)/);
  assert.doesNotMatch(pane, /result\\.failed[\\s\\S]{0,180}onRefresh/);
});

test("3.2.5: local Windows release build is available without weakening signed publication", () => {`);

replaceExact("RELEASE_NOTES_3.2.5.md",
`- полный refresh выполняется в фоне, а новое сообщение добавляется через realtime-событие;`,
`- realtime-событие обновляет сообщение и превью чата локально, без повторной загрузки всего bootstrap;`);
replaceExact("RELEASE_NOTES_3.2.5.md",
`- гонка одновременного создания MLS-группы теперь переходит в защищённый запрос Welcome и ограниченное ожидание вместо немедленной ошибки;`,
`- гонка одновременного создания MLS-группы и временное отсутствие подходящего KeyPackage переходят в защищённый запрос Welcome и ограниченное ожидание вместо немедленной ошибки;`);

console.log("Applied final Nexora 3.2.5 stability corrections.");
