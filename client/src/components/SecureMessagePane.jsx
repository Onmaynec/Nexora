import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark, Check, CheckCheck, Copy, Info, KeyRound, LoaderCircle, LockKeyhole, Pencil,
  RefreshCcw, Reply, Search, Send, ShieldAlert, ShieldCheck, SmilePlus, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { api, patch, post } from "../api";
import {
  decryptServerMessage,
  decryptServerMessages,
  ensureConversationGroup,
  loadE2eeDraft,
  prepareEncryptedEdit,
  prepareEncryptedText,
  redactDecryptedForCache,
  saveE2eeDraft,
} from "../crypto/trust-client";
import {
  enqueueEncryptedMessage, flushOutbox, readOutbox, removeOutboxEntry, retryOutboxEntry,
} from "../outbox";
import { cacheMessages, readCachedMessages } from "../offline-store";
import { emitAck } from "../socket";
import { Avatar, EmptyState, formatTime, InlineLoader } from "./ui";

const reactions = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];

function pendingMessage(entry, me) {
  return {
    id: `outbox-${entry.id}`,
    clientId: entry.id,
    conversationId: entry.conversationId,
    sender: me,
    type: "text",
    text: "Защищённое сообщение ожидает отправки",
    reactions: [],
    createdAt: entry.createdAt,
    isOwn: true,
    e2ee: true,
    deliveryState: entry.state,
    deliveryError: entry.error,
    outboxId: entry.id,
  };
}

function TrustGate({ trustState }) {
  const labels = {
    initializing: [LoaderCircle, "Подготавливаем защищённое устройство", "Создаём локальные ключи и пополняем MLS KeyPackage."],
    verification_required: [KeyRound, "Устройство ожидает подтверждения", "Подтвердите его на другом доверенном устройстве этого аккаунта."],
    error: [ShieldAlert, "Trust Core недоступен", trustState.error || "Ключи устройства не инициализированы."],
  };
  const [Icon, title, detail] = labels[trustState.status] || labels.initializing;
  return <div className="secure-trust-gate"><Icon className={trustState.status === "initializing" ? "spin" : ""} size={30} /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

function SecureMessage({ message, conversation, onReply, onEdit, onDelete, onReact, onBookmark, onCopy, onRetry, onDiscard }) {
  const [showReactions, setShowReactions] = useState(false);
  const deleted = message.type === "deleted";
  const pending = Boolean(message.deliveryState);
  return (
    <article className={`message-row secure-message${message.isOwn ? " own" : ""}${pending ? " pending" : ""}`} id={`message-${message.id}`}>
      {!message.isOwn && <Avatar user={message.sender} size="small" />}
      <div className="message-stack">
        <div className="message-meta">
          {!message.isOwn && <strong>{message.sender?.displayName}</strong>}
          <time>{formatTime(message.createdAt)}</time>
          {message.updatedAt && !deleted && <span>изменено</span>}
          {!pending && <ShieldCheck size={12} title="MLS E2EE" />}
        </div>
        <div className="message-bubble-wrap">
          <div className="message-bubble">
            {message.reply && <button type="button" className="reply-preview"><strong>{message.reply.senderName}</strong><span>{message.reply.text || "Защищённое сообщение"}</span></button>}
            {deleted ? <em className="deleted-copy">Сообщение удалено</em> : message.decryptionError ? <div className="secure-decryption-error"><ShieldAlert size={16} /><span>{message.text}</span></div> : <p>{message.text}</p>}
          </div>
          {!deleted && !pending && <div className="message-actions secure-message-actions">
            <button type="button" onClick={() => onReply(message)} title="Ответить"><Reply size={15} /></button>
            <button type="button" onClick={() => onCopy(message)} title="Копировать"><Copy size={15} /></button>
            <div className="reaction-picker-wrap">
              <button type="button" onClick={() => setShowReactions((value) => !value)} title="Реакция"><SmilePlus size={15} /></button>
              {showReactions && <div className="reaction-picker">{reactions.map((emoji) => <button type="button" key={emoji} onClick={() => { onReact(message, emoji); setShowReactions(false); }}>{emoji}</button>)}</div>}
            </div>
            <button type="button" className={message.bookmarkedByMe ? "active" : ""} onClick={() => onBookmark(message)} title="Сохранить"><Bookmark size={15} /></button>
            {message.canEdit && <button type="button" onClick={() => onEdit(message)} title="Редактировать"><Pencil size={15} /></button>}
            {message.canDelete && <button type="button" className="danger" onClick={() => onDelete(message)} title="Удалить"><Trash2 size={15} /></button>}
          </div>}
        </div>
        {message.reactions?.length > 0 && <div className="message-reactions">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} className={reaction.reactedByMe ? "mine" : ""} onClick={() => onReact(message, reaction.emoji)}><span>{reaction.emoji}</span><b>{reaction.count}</b></button>)}</div>}
        {pending && <div className={`outbox-state ${message.deliveryState}`}><span>{message.deliveryState === "sending" ? "Отправляем ciphertext…" : message.deliveryState === "failed" ? message.deliveryError || "Не отправлено" : "Ciphertext в очереди"}</span>{message.deliveryState === "failed" && <button type="button" onClick={() => onRetry(message)}><RefreshCcw size={13} /> Повторить</button>}<button type="button" onClick={() => onDiscard(message)}><X size={13} /></button></div>}
        {message.isOwn && !pending && <span className={`read-status${message.readCount ? " read" : ""}`}>{message.readCount ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
      </div>
    </article>
  );
}

export default function SecureMessagePane({
  conversation, me, socket, onlineUserIds, trustState, initialMessageId, onJumpHandled,
  onRefresh, onDetails, showToast,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupState, setGroupState] = useState("idle");
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [outbox, setOutbox] = useState(() => readOutbox(me.id));
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const draftTimer = useRef(null);
  const typingTimer = useRef(null);
  const activeConversationId = conversation.id;
  const ready = trustState.status === "ready";

  const persistDraft = useCallback((value) => {
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => saveE2eeDraft(activeConversationId, value).catch(() => {}), 250);
    window.dispatchEvent(new CustomEvent("nexora:drafts", { detail: { conversationId: activeConversationId } }));
  }, [activeConversationId]);

  useEffect(() => {
    let cancelled = false;
    loadE2eeDraft(activeConversationId).then((value) => { if (!cancelled) setText(value); }).catch(() => {});
    return () => { cancelled = true; clearTimeout(draftTimer.current); };
  }, [activeConversationId]);

  const initializeGroup = useCallback(async () => {
    if (!ready || !socket.connected) return null;
    setGroupState("initializing");
    try {
      const result = await ensureConversationGroup(conversation);
      setGroupState("ready");
      return result;
    } catch (error) {
      setGroupState(error.code || "error");
      throw error;
    }
  }, [conversation, ready, socket.connected]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      if (socket.connected) await initializeGroup();
      const result = socket.connected ? await api(`/api/conversations/${activeConversationId}/messages`) : { messages: await readCachedMessages(me.id, activeConversationId) };
      const decrypted = await decryptServerMessages(result.messages || []);
      setMessages(decrypted);
      await cacheMessages(me.id, activeConversationId, redactDecryptedForCache(decrypted));
      if (socket.connected) socket.emit("conversation:read", { conversationId: activeConversationId }, () => {});
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" }));
    } catch (error) {
      const cached = await readCachedMessages(me.id, activeConversationId).catch(() => []);
      if (cached.length) setMessages(await decryptServerMessages(cached));
      else if (ready) showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [activeConversationId, initializeGroup, me.id, ready, showToast, socket]);

  useEffect(() => {
    setMessages([]);
    setReplyingTo(null);
    setEditing(null);
    setGroupState("idle");
    if (ready) loadMessages(); else setLoading(false);
  }, [activeConversationId, loadMessages, ready]);

  useEffect(() => {
    const sync = (event) => { if (!event.detail?.userId || event.detail.userId === me.id) setOutbox(readOutbox(me.id)); };
    window.addEventListener("nexora:outbox", sync);
    return () => window.removeEventListener("nexora:outbox", sync);
  }, [me.id]);

  useEffect(() => {
    let active = true;
    async function onNew(message) {
      if (!active || message.conversationId !== activeConversationId) return;
      if (message.clientId) removeOutboxEntry(me.id, message.clientId);
      const decrypted = await decryptServerMessage(message);
      if (!active) return;
      setMessages((current) => current.some((item) => item.id === decrypted.id) ? current : [...current, decrypted]);
      if (message.sender?.id !== me.id) socket.emit("conversation:read", { conversationId: activeConversationId }, () => {});
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    }
    async function onUpdated(message) {
      if (!active || message.conversationId !== activeConversationId) return;
      const decrypted = await decryptServerMessage(message);
      if (active) setMessages((current) => current.map((item) => item.id === decrypted.id ? decrypted : item));
    }
    function onTyping(event) {
      if (event.conversationId !== activeConversationId || event.user.id === me.id) return;
      setTypingUsers((current) => {
        const next = new Map(current);
        if (event.isTyping) next.set(event.user.id, event.user.displayName); else next.delete(event.user.id);
        return next;
      });
    }
    socket.on("message:new", onNew);
    socket.on("message:updated", onUpdated);
    socket.on("typing:update", onTyping);
    return () => {
      active = false;
      socket.off("message:new", onNew);
      socket.off("message:updated", onUpdated);
      socket.off("typing:update", onTyping);
    };
  }, [activeConversationId, me.id, socket]);

  useEffect(() => {
    if (!initialMessageId || loading) return;
    document.getElementById(`message-${initialMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    onJumpHandled?.();
  }, [initialMessageId, loading, onJumpHandled]);

  useEffect(() => {
    if (messages.length) cacheMessages(me.id, activeConversationId, redactDecryptedForCache(messages)).catch(() => {});
  }, [activeConversationId, me.id, messages]);

  async function submit(event) {
    event?.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    if (!ready) return showToast("Trust Core ещё не готов", "error");
    if (!socket.connected) {
      persistDraft(value);
      return showToast("Соединение отсутствует. Текст сохранён только в зашифрованном локальном черновике.", "error");
    }
    setSending(true);
    try {
      if (editing) {
        const payload = await prepareEncryptedEdit({ conversation, messageId: editing.id, text: value });
        const result = await emitAck(socket, "mls:message-edit", payload, 20_000);
        const decrypted = await decryptServerMessage(result.message);
        setMessages((current) => current.map((item) => item.id === decrypted.id ? decrypted : item));
        setEditing(null);
      } else {
        const prepared = await prepareEncryptedText({
          conversation,
          text: value,
          replyToId: replyingTo?.id || null,
          threadRootId: conversation.type === "room" && replyingTo ? (replyingTo.threadRootId || replyingTo.id) : null,
        });
        enqueueEncryptedMessage(me.id, prepared);
        const result = await flushOutbox(socket, me.id);
        if (result.failed) throw new Error("Ciphertext не доставлен; доступен безопасный повтор.");
        setReplyingTo(null);
      }
      setText("");
      await saveE2eeDraft(activeConversationId, "");
      socket.emit("typing:set", { conversationId: activeConversationId, isTyping: false });
      await onRefresh();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSending(false);
    }
  }

  function onInput(event) {
    const value = event.target.value;
    setText(value);
    if (!editing) persistDraft(value);
    if (!socket.connected) return;
    socket.emit("typing:set", { conversationId: activeConversationId, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing:set", { conversationId: activeConversationId, isTyping: false }), 1_200);
  }

  async function action(event, payload) {
    try { await emitAck(socket, event, payload); await onRefresh(); }
    catch (error) { showToast(error.message, "error"); }
  }

  async function toggleBookmark(message) {
    try {
      const result = await post(`/api/messages/${message.id}/bookmark`);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, bookmarkedByMe: result.bookmarked } : item));
    } catch (error) { showToast(error.message, "error"); }
  }

  async function copyMessage(message) {
    await navigator.clipboard.writeText(message.text || "");
    showToast("Сообщение скопировано");
  }

  async function toggleMute() {
    try { await patch(`/api/conversations/${activeConversationId}/settings`, { muted: !conversation.notificationSettings?.muted }); await onRefresh(); }
    catch (error) { showToast(error.message, "error"); }
  }

  function retryPending(message) {
    retryOutboxEntry(me.id, message.outboxId);
    if (socket.connected) flushOutbox(socket, me.id).then((result) => result.sent && onRefresh());
  }

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ru");
    return query.length >= 2 ? messages.filter((message) => message.text?.toLocaleLowerCase("ru").includes(query)) : messages;
  }, [messages, searchQuery]);
  const pending = outbox.filter((entry) => entry.kind === "mls-message" && entry.conversationId === activeConversationId && !messages.some((message) => message.clientId === entry.id)).map((entry) => pendingMessage(entry, me));
  const displayMessages = [...filtered, ...pending].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const titleOnline = conversation.type === "dm" && onlineUserIds.has(conversation.peer?.id);
  const typingNames = [...typingUsers.values()];
  const cannotPost = conversation.type === "room" && (conversation.permissions?.readOnly || conversation.permissions?.announcementOnly) && !conversation.permissions?.canBypassPosting;

  if (!ready) return <section className="message-pane secure-message-pane"><TrustGate trustState={trustState} /></section>;

  return (
    <section className="message-pane secure-message-pane">
      <header className="conversation-header secure-conversation-header">
        <div className="conversation-identity"><Avatar user={conversation.peer || conversation} online={titleOnline} /><div><h2>{conversation.title}</h2><span>{conversation.type === "dm" ? (titleOnline ? "в сети" : conversation.peer?.status || conversation.subtitle) : `${conversation.members?.length || 0} участников`}</span></div></div>
        <div className="secure-header-state"><ShieldCheck size={17} /><span><strong>MLS E2EE</strong><small>{groupState === "ready" ? "epoch синхронизирована" : groupState === "initializing" ? "синхронизация…" : "Trust Core"}</small></span></div>
        <div className="conversation-tools"><button type="button" className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((value) => !value)} title="Локальный поиск"><Search size={18} /></button><button type="button" className={conversation.notificationSettings?.muted ? "active" : ""} onClick={toggleMute}>{conversation.notificationSettings?.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button type="button" onClick={onDetails}><Info size={19} /></button></div>
      </header>
      {searchOpen && <div className="chat-search-bar secure-local-search"><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Локальный поиск по расшифрованным сообщениям" autoFocus /><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}><X size={16} /></button></div>}
      <div className="secure-policy-banner"><LockKeyhole size={16} /><span><strong>Сервер получает только MLS ciphertext.</strong> Файлы, голосовые, опросы и отложенная отправка отключены до появления E2EE media layer.</span></div>
      <div className="message-list" ref={listRef}>
        {loading ? <div className="messages-loading"><InlineLoader label="Проверяем ключи и расшифровываем" /></div> : displayMessages.length === 0 ? <EmptyState icon={LockKeyhole} title="Защищённый диалог готов" description="Первое сообщение создаст или синхронизирует MLS-группу для всех подтверждённых устройств участников." /> : displayMessages.map((message) => <SecureMessage key={message.id} message={message} conversation={conversation} onReply={(item) => { setReplyingTo(item); setEditing(null); }} onEdit={(item) => { setEditing(item); setReplyingTo(null); setText(item.text); }} onDelete={(item) => window.confirm("Удалить защищённое сообщение?") && action("message:delete", { messageId: item.id })} onReact={(item, emoji) => action("message:react", { messageId: item.id, emoji })} onBookmark={toggleBookmark} onCopy={copyMessage} onRetry={retryPending} onDiscard={(item) => removeOutboxEntry(me.id, item.outboxId)} />)}
      </div>
      <footer className="composer-zone secure-composer-zone">
        <div className="typing-line">{cannotPost ? "Комната работает только для чтения" : typingNames.length ? `${typingNames.slice(0, 2).join(" и ")} печатает…` : !socket.connected ? "Офлайн · текст хранится только в sealed draft" : groupState === "initializing" ? "Синхронизируем MLS epoch…" : "MLS 1.0 · ciphersuite 1"}</div>
        {(replyingTo || editing) && <div className="composer-context">{editing ? <Pencil size={16} /> : <Reply size={16} />}<div><strong>{editing ? "E2EE-редактирование" : `Ответ для ${replyingTo.sender?.displayName}`}</strong><span>{editing?.text || replyingTo?.text || "Защищённое сообщение"}</span></div><button type="button" onClick={() => { setReplyingTo(null); setEditing(null); loadE2eeDraft(activeConversationId).then(setText); }}><X size={16} /></button></div>}
        <form className="composer secure-composer" onSubmit={submit}><span className="secure-composer-lock"><LockKeyhole size={18} /></span><textarea value={text} disabled={cannotPost || sending} onChange={onInput} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} rows={1} maxLength={4000} placeholder={!socket.connected ? "Зашифрованный локальный черновик…" : editing ? "Измените защищённое сообщение…" : "Защищённое сообщение…"} /><button className="composer-send" type="submit" disabled={cannotPost || sending || !text.trim() || !socket.connected} title="Зашифровать и отправить">{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button></form>
        <div className="composer-foot"><span>Черновик зашифрован AES-GCM в IndexedDB</span><span>Серверный поиск по E2EE недоступен</span></div>
      </footer>
    </section>
  );
}
