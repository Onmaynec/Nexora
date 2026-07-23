"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "client", "src", "components", "Workspace.jsx");
let source = fs.readFileSync(file, "utf8");

function replaceExact(before, after) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Workspace.jsx: expected exactly one match, found ${count}`);
  source = source.replace(before, after);
}

replaceExact(
  'import { loadE2eeDraft } from "../crypto/trust-client";\n',
  "",
);
replaceExact(
  'import SecureMessagePane from "./SecureMessagePane";\n',
  'import LegacySecureHistoryPane from "./LegacySecureHistoryPane";\nimport MessagePane from "./MessagePane";\n',
);
replaceExact(
  '  if (message.type === "encrypted") return "Защищённое сообщение";',
  '  if (message.type === "encrypted") return "Legacy secure history · только чтение";',
);
replaceExact(
`  const [draftMap, setDraftMap] = useState({});
  const conversationIdsKey = conversations.map((conversation) => conversation.id).join("|");
  useEffect(() => {
    let cancelled = false;
    const ids = conversationIdsKey ? conversationIdsKey.split("|") : [];
    const refresh = async () => {
      const entries = await Promise.all(ids.map(async (conversationId) => [conversationId, Boolean(await loadE2eeDraft(conversationId).catch(() => ""))]));
      if (!cancelled) setDraftMap(Object.fromEntries(entries));
    };
    refresh();
    const listener = () => refresh();
    window.addEventListener("nexora:drafts", listener);
    return () => { cancelled = true; window.removeEventListener("nexora:drafts", listener); };
  }, [conversationIdsKey]);`,
`  const serverDraftIds = new Set((drafts || []).map((draft) => draft.conversationId));`,
);
replaceExact(
  '          const draft = Boolean(draftMap[conversation.id]);',
  '          const draft = serverDraftIds.has(conversation.id);',
);
replaceExact(
  '{draft ? "Черновик · зашифрован локально" : lastMessageLabel(conversation.lastMessage)}',
  '{draft ? "Черновик" : lastMessageLabel(conversation.lastMessage)}',
);
replaceExact(
  'export default function Workspace({ me, bootstrap, socket, onlineUserIds, trustState, onRefresh, onMeChanged, onLogout, showToast }) {',
  'export default function Workspace({ me, bootstrap, socket, onlineUserIds, onRefresh, onMeChanged, onLogout, showToast }) {',
);
replaceExact(
  '<p>Серверный индекс показывает только legacy-данные. Поиск по MLS E2EE выполняется локально внутри чата.</p>',
  '<p>Серверный индекс охватывает обычные server-readable сообщения. Legacy MLS history доступна только через отдельный read-only viewer.</p>',
);
replaceExact(
  '{section === "chats" && (activeConversation ? <SecureMessagePane key={activeConversation.id} conversation={activeConversation} initialMessageId={jumpTarget?.conversationId === activeConversation.id ? jumpTarget.messageId : null} onJumpHandled={() => setJumpTarget(null)} me={me} socket={socket} onlineUserIds={onlineUserIds} trustState={trustState} onRefresh={onRefresh} onDetails={() => setDetailsOpen((value) => !value)} showToast={showToast} /> : <EmptyState icon={MessageCircleMore} title="Выберите чат" description="Ваши личные диалоги и комнаты появятся слева." />)}',
`{section === "chats" && (activeConversation
          ? activeConversation.legacySecure
            ? <LegacySecureHistoryPane
              key={activeConversation.id}
              conversation={activeConversation}
              serverId={bootstrap.server?.id}
              userId={me.id}
              onDetails={() => setDetailsOpen((value) => !value)}
              showToast={showToast}
            />
            : <MessagePane
              key={activeConversation.id}
              conversation={activeConversation}
              conversations={bootstrap.conversations}
              initialDraft={bootstrap.drafts?.find((draft) => draft.conversationId === activeConversation.id)?.text || ""}
              initialMessageId={jumpTarget?.conversationId === activeConversation.id ? jumpTarget.messageId : null}
              onJumpHandled={() => setJumpTarget(null)}
              me={me}
              socket={socket}
              onlineUserIds={onlineUserIds}
              onRefresh={onRefresh}
              onDetails={() => setDetailsOpen((value) => !value)}
              onOpenProfile={setProfileUser}
              showToast={showToast}
            />
          : <EmptyState icon={MessageCircleMore} title="Выберите чат" description="Ваши личные диалоги и комнаты появятся слева." />)}`,
);

fs.writeFileSync(file, source);
console.log("Stable Core client Trust retirement applied");
