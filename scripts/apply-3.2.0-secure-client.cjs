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

update("client/src/crypto/trust-client.js", (source) => replaceRequired(
  source,
  `}\n\nexport async function processCommitEvent(event) {`,
  `}\n\nexport async function prepareEncryptedEdit({ conversation, messageId, text }) {\n  return serializeConversationOperation(conversation.id, async () => {\n    const { device, local, remote } = await ensureConversationGroupInternal(conversation);\n    const createdAt = new Date().toISOString();\n    const content = { version: 1, type: "text", operation: "edit", messageId: String(messageId), text: String(text) };\n    const authenticatedData = {\n      version: 1,\n      operation: "edit",\n      targetMessageId: String(messageId),\n      conversationId: conversation.id,\n      senderUserId: current().userId,\n      senderDeviceId: device.id,\n      createdAt,\n    };\n    const encrypted = await encryptApplicationMessage({\n      state: local.state,\n      content,\n      authenticatedData,\n      resolveDevice: resolveTrustedDevice,\n    });\n    const messageHash = await sha256Hex(encrypted.message);\n    await persistGroup(conversation.id, remote.id, encrypted.state, encrypted.publicStateHash);\n    await saveDecryptedContent(current().serverId, current().userId, messageHash, content);\n    return {\n      conversationId: conversation.id,\n      messageId: String(messageId),\n      deviceId: device.id,\n      groupRecordId: remote.id,\n      epoch: encrypted.epoch,\n      generation: null,\n      contentType: "text",\n      message: toBase64(encrypted.message),\n      authenticatedDataHash: encrypted.authenticatedDataHash,\n    };\n  });\n}\n\nexport async function processCommitEvent(event) {`,
  "encrypted edit operation",
));

update("client/src/components/Workspace.jsx", (source) => {
  let next = replaceRequired(source, `import MessagePane from "./MessagePane";`, `import SecureMessagePane from "./SecureMessagePane";`, "secure pane import");
  next = replaceRequired(next, `import { api, patch, post, remove } from "../api";`, `import { api, patch, post, remove } from "../api";\nimport { loadE2eeDraft } from "../crypto/trust-client";`, "encrypted draft import");
  next = replaceRequired(next, `  if (message.type === "file") return "Файл";\n  return message.text;`, `  if (message.type === "file") return "Файл";\n  if (message.type === "encrypted") return "Защищённое сообщение";\n  return message.text;`, "encrypted last message label");
  next = replaceRequired(
    next,
    `  const [menuId, setMenuId] = useState(null);\n  const [, setDraftRevision] = useState(0);\n  useEffect(() => { const refresh = () => setDraftRevision((value) => value + 1); window.addEventListener("nexora:drafts", refresh); return () => window.removeEventListener("nexora:drafts", refresh); }, []);\n  useEffect(() => { const close = () => setMenuId(null); window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close); }, []);`,
    `  const [menuId, setMenuId] = useState(null);\n  const [draftMap, setDraftMap] = useState({});\n  useEffect(() => {\n    let cancelled = false;\n    const refresh = async () => {\n      const entries = await Promise.all(conversations.map(async (conversation) => [conversation.id, Boolean(await loadE2eeDraft(conversation.id).catch(() => ""))]));\n      if (!cancelled) setDraftMap(Object.fromEntries(entries));\n    };\n    refresh();\n    const listener = () => refresh();\n    window.addEventListener("nexora:drafts", listener);\n    return () => { cancelled = true; window.removeEventListener("nexora:drafts", listener); };\n  }, [conversations]);\n  useEffect(() => { const close = () => setMenuId(null); window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close); }, []);`,
    "sealed conversation draft map",
  );
  next = replaceRequired(
    next,
    `          const draft = localStorage.getItem(\`nexora:draft:\${userId}:\${conversation.id}\`) ?? drafts.find((item) => item.conversationId === conversation.id)?.text;`,
    `          const draft = Boolean(draftMap[conversation.id]);`,
    "remove plaintext draft source",
  );
  next = replaceRequired(next, `{draft ? \`Черновик: \${draft}\` : lastMessageLabel(conversation.lastMessage)}`, `{draft ? "Черновик · зашифрован локально" : lastMessageLabel(conversation.lastMessage)}`, "redact draft preview");
  next = replaceRequired(
    next,
    `export default function Workspace({ me, bootstrap, socket, onlineUserIds, onRefresh, onMeChanged, onLogout, showToast }) {`,
    `export default function Workspace({ me, bootstrap, socket, onlineUserIds, trustState, onRefresh, onMeChanged, onLogout, showToast }) {`,
    "Workspace trust state prop",
  );
  next = replaceRequired(
    next,
    `{section === "chats" && (activeConversation ? <MessagePane key={activeConversation.id} conversation={activeConversation} conversations={bootstrap.conversations} initialDraft={bootstrap.drafts?.find((draft) => draft.conversationId === activeConversation.id)?.text ?? ""} initialMessageId={jumpTarget?.conversationId === activeConversation.id ? jumpTarget.messageId : null} onJumpHandled={() => setJumpTarget(null)} me={me} socket={socket} onlineUserIds={onlineUserIds} onRefresh={onRefresh} onDetails={() => setDetailsOpen((value) => !value)} onOpenProfile={setProfileUser} showToast={showToast} /> : <EmptyState icon={MessageCircleMore} title="Выберите чат" description="Ваши личные диалоги и комнаты появятся слева." />)}`,
    `{section === "chats" && (activeConversation ? <SecureMessagePane key={activeConversation.id} conversation={activeConversation} initialMessageId={jumpTarget?.conversationId === activeConversation.id ? jumpTarget.messageId : null} onJumpHandled={() => setJumpTarget(null)} me={me} socket={socket} onlineUserIds={onlineUserIds} trustState={trustState} onRefresh={onRefresh} onDetails={() => setDetailsOpen((value) => !value)} showToast={showToast} /> : <EmptyState icon={MessageCircleMore} title="Выберите чат" description="Ваши личные диалоги и комнаты появятся слева." />)}`,
    "secure conversation pane",
  );
  next = replaceRequired(next, `Поиск работает по всем сообщениям и вложениям, которые вам доступны.`, `Серверный индекс показывает только legacy-данные. Поиск по MLS E2EE выполняется локально внутри чата.`, "search privacy copy");
  return next;
});

console.log("3.2.0 secure client integration patch applied");
