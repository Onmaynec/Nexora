import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, BarChart3, BellOff, Bookmark, Check, CheckCheck, CheckSquare, ChevronDown, Clock3, Copy, Download, File as FileIcon,
  Flag, Forward, GitBranch, History, Image as ImageIcon, Info, ListChecks, LoaderCircle, MoreHorizontal, Paperclip,
  Pencil, Pin, RefreshCcw, Reply, Search, Send, SmilePlus, Trash2, UploadCloud, UsersRound,
  Volume2, VolumeX, X,
} from "lucide-react";
import { api, patch, post, uploadFile } from "../api";
import {
  enqueueForward, enqueueMessage, flushOutbox, readOutbox, removeOutboxEntry,
  retryOutboxEntry,
} from "../outbox";
import { emitAck } from "../socket";
import { cacheMessages, readCachedMessages } from "../offline-store";
import ConfirmDialog from "./ConfirmDialog";
import VoiceRecorder from "./VoiceRecorder";
import VoicePlayer from "./VoicePlayer";
import { Avatar, EmptyState, formatBytes, formatTime, InlineLoader } from "./ui";

const reactionChoices = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];

function localDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function FileContent({ message, onPreview }) {
  const file = message.file;
  if (!file) return null;
  if (message.type === "image") {
    return (
      <button type="button" className="message-image" onClick={() => onPreview(file)}>
        <img src={file.url} alt={file.name} loading="lazy" />
        {message.text && <span>{message.text}</span>}
      </button>
    );
  }
  if (message.type === "voice") {
    return <VoicePlayer message={message} />;
  }
  const previewable = file.mimeType === "application/pdf" || file.mimeType?.startsWith("text/") || ["application/json", "application/xml"].includes(file.mimeType);
  return (
    <div className="file-message">
      <span className="file-icon"><FileIcon size={21} /></span>
      <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
      {previewable && <button type="button" onClick={() => onPreview(file)}>Просмотр</button>}
      <a href={file.url} download title="Скачать"><Download size={17} /></a>
    </div>
  );
}

function PollContent({ message, onVote }) {
  const poll = message.poll;
  const [selected, setSelected] = useState(() => new Set(poll.options.filter((option) => option.selectedByMe).map((option) => option.id)));
  function toggle(id) {
    setSelected((current) => {
      if (!poll.multiple) return new Set([id]);
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
  return <div className="poll-card"><strong>{poll.question}</strong><div className="poll-options">{poll.options.map((option) => {
    const percent = totalVotes ? Math.round(option.votes / totalVotes * 100) : 0;
    return <button type="button" key={option.id} className={selected.has(option.id) ? "selected" : ""} disabled={Boolean(poll.closedAt)} onClick={() => toggle(option.id)}><i style={{ width: `${percent}%` }} /><span>{option.text}</span><small>{option.votes} · {percent}%</small></button>;
  })}</div><footer><span>{poll.totalVoters} голосов{poll.closedAt ? " · завершён" : poll.multiple ? " · несколько вариантов" : ""}</span>{!poll.closedAt && <button type="button" disabled={!selected.size} onClick={() => onVote(message, [...selected])}>Голосовать</button>}</footer></div>;
}

function ReadStatus({ message, conversation }) {
  if (!message.isOwn || message.type === "deleted" || message.deliveryState) return null;
  if (conversation.type === "dm") {
    return <span className={`read-status${message.readCount ? " read" : ""}`} title={message.readCount ? "Прочитано" : "Доставлено"}>{message.readCount ? <CheckCheck size={14} /> : <Check size={14} />}</span>;
  }
  return message.readCount > 0 ? <span className="read-count" title="Прочитали сообщение"><CheckCheck size={13} /> {message.readCount}</span> : null;
}

function messageCopyText(message) {
  if (message.type === "deleted") return "Сообщение удалено";
  if (message.type === "expired") return "Вложение удалено по сроку хранения";
  if (message.type === "voice") return "[Голосовое сообщение]";
  if (message.file) return `[${message.file.name}]${message.text ? ` ${message.text}` : ""}`;
  return message.text || "";
}

function MessageItem({
  message, conversation, onReply, onEdit, onDelete, onReact, onPin, onBookmark, onPreview, onJump,
  onForward, onOpenProfile, onPollVote, onReport, onHistory, selectionMode, selected, onToggleSelect, onRetry, onDiscard,
}) {
  const [actions, setActions] = useState(false);
  const [reactions, setReactions] = useState(false);
  const actionsRef = useRef(null);
  const deleted = message.type === "deleted";
  const pending = Boolean(message.deliveryState);

  useEffect(() => {
    if (!actions && !reactions) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && actionsRef.current?.contains(event.target)) return;
      setActions(false);
      setReactions(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [actions, reactions]);

  if (message.type === "system") {
    return <div id={`message-${message.id}`} className="system-message"><span>{message.text}</span><time>{formatTime(message.createdAt)}</time></div>;
  }

  return (
    <article id={`message-${message.id}`} className={`message-row${message.isOwn ? " own" : ""}${deleted ? " deleted" : ""}${selected ? " selected" : ""}${pending ? " pending" : ""}`}>
      {selectionMode && <button type="button" className="message-select" onClick={() => onToggleSelect(message)} aria-label={selected ? "Снять выбор" : "Выбрать сообщение"}>{selected ? <CheckSquare size={18} /> : <span />}</button>}
      {!message.isOwn && <Avatar user={message.sender} size="small" onClick={() => onOpenProfile(message.sender)} />}
      <div className="message-stack">
        <div className="message-meta">
          {!message.isOwn && <strong>{message.sender.displayName}</strong>}
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {message.updatedAt && !deleted && <span>изменено</span>}
          {message.pinnedAt && <Pin size={12} fill="currentColor" />}
        </div>
        <div className="message-bubble-wrap">
          <div className="message-bubble" onClick={selectionMode ? () => onToggleSelect(message) : undefined}>
            {message.forwarded && <div className="forwarded-label"><Forward size={13} /><span>Переслано от <strong>{message.forwarded.senderName}</strong></span></div>}
            {message.reply && (
              <button type="button" className="reply-preview" onClick={(event) => { event.stopPropagation(); onJump(message.reply.id); }}>
                <strong>{message.reply.senderName}</strong>
                <span>{message.reply.deletedAt ? "Сообщение удалено" : message.reply.text || (message.reply.type === "voice" ? "Голосовое сообщение" : "Вложение")}</span>
              </button>
            )}
            {message.threadRootId && <button type="button" className="thread-label" onClick={() => onJump(message.threadRootId)}><GitBranch size={12} /> Ветка обсуждения</button>}
            {deleted ? (
              <em className="deleted-copy">Сообщение удалено</em>
            ) : message.type === "expired" ? (
              <div className="expired-attachment"><FileIcon size={18} /><span>Вложение удалено по сроку хранения</span></div>
            ) : message.poll ? (
              <PollContent message={message} onVote={onPollVote} />
            ) : message.type === "text" ? (
              <p>{message.text}</p>
            ) : (
              <FileContent message={message} onPreview={onPreview} />
            )}
          </div>

          {!deleted && !selectionMode && !pending && (
            <div ref={actionsRef} className={`message-actions${actions || reactions ? " open" : ""}`}>
              <button type="button" onClick={() => { onReply(message); setActions(false); }} title="Ответить"><Reply size={15} /></button>
              <button type="button" onClick={() => { onForward(message); setActions(false); }} title="Переслать"><Forward size={15} /></button>
              <div className="reaction-picker-wrap">
                <button type="button" aria-expanded={reactions} onClick={() => { setActions(true); setReactions((value) => !value); }} title="Реакция"><SmilePlus size={15} /></button>
                {reactions && <div className="reaction-picker" role="menu" aria-label="Выбрать реакцию" onPointerDown={(event) => event.stopPropagation()}>{reactionChoices.map((emoji) => <button type="button" role="menuitem" key={emoji} onClick={() => { onReact(message, emoji); setReactions(false); setActions(false); }}>{emoji}</button>)}</div>}
              </div>
              <button type="button" className={message.bookmarkedByMe ? "active" : ""} onClick={() => { onBookmark(message); setActions(false); }} title={message.bookmarkedByMe ? "Убрать из сохранённых" : "Сохранить сообщение"}><Bookmark size={15} fill={message.bookmarkedByMe ? "currentColor" : "none"} /></button>
              {message.canPin && <button type="button" onClick={() => { onPin(message); setActions(false); }} title={message.pinnedAt ? "Открепить" : "Закрепить"}><Pin size={15} /></button>}
              {message.canEdit && <button type="button" onClick={() => { onEdit(message); setActions(false); }} title="Редактировать"><Pencil size={15} /></button>}
              {message.editCount > 0 && <button type="button" onClick={() => { onHistory(message); setActions(false); }} title="История правок"><History size={15} /></button>}
              {message.canDelete && <button type="button" className="danger" onClick={() => { onDelete(message); setActions(false); }} title="Удалить"><Trash2 size={15} /></button>}
              {!message.isOwn && conversation.type === "room" && <button type="button" className="danger" onClick={() => { onReport(message); setActions(false); }} title="Пожаловаться"><Flag size={15} /></button>}
              <button className="actions-more" type="button" aria-expanded={actions} onClick={() => { setReactions(false); setActions((value) => !value); }} title="Действия"><MoreHorizontal size={15} /></button>
            </div>
          )}
        </div>

        {message.reactions?.length > 0 && <div className="message-reactions">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} className={reaction.reactedByMe ? "mine" : ""} onClick={() => onReact(message, reaction.emoji)}><span>{reaction.emoji}</span><b>{reaction.count}</b></button>)}</div>}
        {pending && <div className={`outbox-state ${message.deliveryState}`}><span>{message.deliveryState === "sending" ? "Отправляем…" : message.deliveryState === "failed" ? message.deliveryError || "Не отправлено" : "В очереди — отправится после подключения"}</span>{message.deliveryState === "failed" && <button type="button" onClick={() => onRetry(message)}><RefreshCcw size={13} /> Повторить</button>}<button type="button" onClick={() => onDiscard(message)} title="Удалить из очереди"><X size={13} /></button></div>}
        <ReadStatus message={message} conversation={conversation} />
      </div>
    </article>
  );
}

function pendingMessage(entry, me) {
  return {
    id: `outbox-${entry.id}`,
    clientId: entry.id,
    conversationId: entry.conversationId,
    sender: me,
    type: "text",
    text: entry.kind === "forward" ? entry.previewText : entry.text,
    forwarded: entry.kind === "forward" ? { senderName: "ожидает пересылки" } : null,
    threadRootId: entry.threadRootId ?? null,
    reactions: [],
    createdAt: entry.createdAt,
    updatedAt: null,
    deletedAt: null,
    pinnedAt: null,
    readCount: 0,
    isOwn: true,
    canEdit: false,
    canDelete: false,
    deliveryState: entry.state,
    deliveryError: entry.error,
    outboxId: entry.id,
  };
}

export default function MessagePane({ conversation, conversations, initialDraft = "", initialMessageId, onJumpHandled, me, socket, onlineUserIds, onRefresh, onDetails, onOpenProfile, showToast }) {
  const draftKey = `nexora:draft:${me.id}:${conversation.id}`;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? initialDraft);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [uploadJobs, setUploadJobs] = useState([]);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [showJump, setShowJump] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [forwarding, setForwarding] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [outbox, setOutbox] = useState(() => readOutbox(me.id));
  const [silentNext, setSilentNext] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [editHistory, setEditHistory] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileInputRef = useRef(null);
  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const reloadTimer = useRef(null);
  const highlightTimer = useRef(null);
  const uploadControllers = useRef(new Map());
  const draftSyncTimer = useRef(null);
  const firstUnreadId = useRef(conversation.firstUnreadMessageId);

  const uploading = voiceUploading || uploadJobs.some((job) => job.status === "uploading" || job.status === "checking");

  useEffect(() => {
    if (editing) return;
    if (text) localStorage.setItem(draftKey, text);
    else localStorage.removeItem(draftKey);
    window.dispatchEvent(new CustomEvent("nexora:drafts", { detail: { conversationId: conversation.id } }));
    clearTimeout(draftSyncTimer.current);
    if (socket.connected) {
      draftSyncTimer.current = setTimeout(() => {
        api(`/api/v3/drafts/${encodeURIComponent(conversation.id)}`, text
          ? { method: "PUT", body: JSON.stringify({ text }) }
          : { method: "DELETE" }).catch(() => {});
      }, 600);
    }
    return () => clearTimeout(draftSyncTimer.current);
  }, [conversation.id, draftKey, editing, socket.connected, text]);

  useEffect(() => {
    const sync = (event) => { if (!event.detail?.userId || event.detail.userId === me.id) setOutbox(readOutbox(me.id)); };
    window.addEventListener("nexora:outbox", sync);
    return () => window.removeEventListener("nexora:outbox", sync);
  }, [me.id]);

  const markRead = useCallback(() => {
    if (conversation?.id && socket.connected) socket.emit("conversation:read", { conversationId: conversation.id }, () => {});
  }, [conversation?.id, socket]);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior }));
  }, []);

  const loadMessages = useCallback(async (shouldMarkRead = true) => {
    if (!conversation?.id) return;
    setLoading(true);
    try {
      const result = await api(`/api/conversations/${conversation.id}/messages`);
      setMessages(result.messages);
      cacheMessages(me.id, conversation.id, result.messages).catch(() => {});
      setHasMore(result.hasMore);
      scrollToBottom("auto");
      if (shouldMarkRead) markRead();
    } catch (error) {
      const cached = await readCachedMessages(me.id, conversation.id);
      if (cached.length) {
        setMessages(cached);
        setHasMore(false);
      } else showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [conversation?.id, markRead, me.id, scrollToBottom, showToast]);

  useEffect(() => {
    if (messages.length) cacheMessages(me.id, conversation.id, messages).catch(() => {});
  }, [conversation.id, me.id, messages]);

  useEffect(() => {
    setMessages([]);
    setReplyingTo(null);
    setEditing(null);
    setTypingUsers(new Map());
    setSelectedIds(new Set());
    setSelectionMode(false);
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    function onNew(message) {
      if (message.conversationId !== conversation.id) return;
      if (message.clientId) removeOutboxEntry(me.id, message.clientId);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      const nearBottom = listRef.current && listRef.current.scrollHeight - listRef.current.scrollTop - listRef.current.clientHeight < 180;
      if (nearBottom || message.sender.id === me.id) scrollToBottom();
      if (message.sender.id !== me.id) markRead();
    }
    function onUpdated(message) {
      if (message.conversationId !== conversation.id) return;
      setMessages((current) => current.map((item) => item.id === message.id ? message : item));
    }
    function onTyping(event) {
      if (event.conversationId !== conversation.id || event.user.id === me.id) return;
      setTypingUsers((current) => {
        const next = new Map(current);
        if (event.isTyping) next.set(event.user.id, event.user.displayName);
        else next.delete(event.user.id);
        return next;
      });
    }
    function onRead(event) {
      if (event.conversationId !== conversation.id || event.userId === me.id) return;
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => loadMessages(false), 180);
    }
    socket.on("message:new", onNew);
    socket.on("message:updated", onUpdated);
    socket.on("typing:update", onTyping);
    socket.on("conversation:read", onRead);
    return () => {
      socket.off("message:new", onNew);
      socket.off("message:updated", onUpdated);
      socket.off("typing:update", onTyping);
      socket.off("conversation:read", onRead);
      clearTimeout(reloadTimer.current);
      clearTimeout(highlightTimer.current);
    };
  }, [conversation.id, loadMessages, markRead, me.id, scrollToBottom, socket]);

  async function loadEarlier() {
    if (!messages.length) return;
    setLoadingMore(true);
    try {
      const result = await api(`/api/conversations/${conversation.id}/messages?before=${encodeURIComponent(messages[0].createdAt)}`);
      setMessages((current) => [...result.messages, ...current]);
      setHasMore(result.hasMore);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function jumpToMessage(messageId) {
    let element = document.getElementById(`message-${messageId}`);
    if (!element) {
      try {
        const result = await api(`/api/conversations/${conversation.id}/messages?around=${encodeURIComponent(messageId)}`);
        setMessages(result.messages);
        setHasMore(result.hasMore);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        element = document.getElementById(`message-${messageId}`);
      } catch (error) {
        showToast(error.message, "error");
        return;
      }
    }
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1_800);
  }

  useEffect(() => {
    if (!initialMessageId || loading) return;
    jumpToMessage(initialMessageId).finally(() => onJumpHandled?.());
  }, [initialMessageId, loading]);

  async function submit(event) {
    event?.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (editing) {
      try {
        await emitAck(socket, "message:edit", { messageId: editing.id, text: value });
        setText("");
        setEditing(null);
        localStorage.removeItem(draftKey);
      } catch (error) {
        showToast(error.message, "error");
      }
      return;
    }
    enqueueMessage(me.id, { conversationId: conversation.id, text: value, replyToId: replyingTo?.id ?? null, threadRootId: conversation.type === "room" && replyingTo ? (replyingTo.threadRootId ?? replyingTo.id) : null, silent: silentNext });
    setText("");
    setReplyingTo(null);
    setSilentNext(false);
    localStorage.removeItem(draftKey);
    socket.emit("typing:set", { conversationId: conversation.id, isTyping: false });
    scrollToBottom();
    if (!socket.connected) {
      showToast("Сообщение добавлено в очередь");
      return;
    }
    const result = await flushOutbox(socket, me.id);
    if (result.failed) showToast("Сообщение не отправлено — доступен повтор", "error");
    else await onRefresh();
  }

  async function scheduleMessage(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = text.trim();
    if (!value) return;
    try {
      await post("/api/messages/scheduled", { conversationId: conversation.id, text: value, replyToId: replyingTo?.id ?? null, threadRootId: conversation.type === "room" && replyingTo ? (replyingTo.threadRootId ?? replyingTo.id) : null, silent: silentNext, scheduledAt: new Date(String(form.get("scheduledAt"))).toISOString() });
      setText(""); setReplyingTo(null); setSilentNext(false); setScheduleOpen(false); localStorage.removeItem(draftKey);
      showToast("Сообщение запланировано");
    } catch (error) { showToast(error.message, "error"); }
  }

  async function createPoll(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const options = form.getAll("option").map(String).map((value) => value.trim()).filter(Boolean);
    try {
      const result = await post(`/api/conversations/${conversation.id}/polls`, { question: form.get("question"), options, multiple: form.get("multiple") === "on", anonymous: form.get("anonymous") === "on" });
      setMessages((current) => current.some((item) => item.id === result.message.id) ? current : [...current, result.message]);
      setPollOpen(false);
    } catch (error) { showToast(error.message, "error"); }
  }

  async function votePoll(message, optionIds) {
    try {
      const result = await post(`/api/polls/${message.poll.id}/votes`, { optionIds });
      setMessages((current) => current.map((item) => item.id === message.id ? result.message : item));
    } catch (error) { showToast(error.message, "error"); }
  }

  async function reportMessage(message) {
    const reason = window.prompt("Опишите причину жалобы");
    if (!reason) return;
    try { await post(`/api/messages/${message.id}/report`, { reason }); showToast("Жалоба отправлена модераторам"); }
    catch (error) { showToast(error.message, "error"); }
  }

  async function showEditHistory(message) {
    try {
      const result = await api(`/api/messages/${message.id}/edits`);
      setEditHistory({ message, edits: result.edits });
    } catch (error) { showToast(error.message, "error"); }
  }

  function onInput(event) {
    setText(event.target.value);
    if (!socket.connected) return;
    socket.emit("typing:set", { conversationId: conversation.id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing:set", { conversationId: conversation.id, isTyping: false }), 1_200);
  }

  function appendUploaded(message) {
    if (!message) return;
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    scrollToBottom();
  }

  function updateUpload(id, patch) {
    setUploadJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job));
  }

  async function runUpload(job) {
    const controller = new AbortController();
    uploadControllers.current.set(job.id, controller);
    updateUpload(job.id, { status: "uploading", progress: 0, error: "" });
    try {
      const result = await uploadFile(conversation.id, job.file, job.kind, 0, "", {
        signal: controller.signal,
        uploadId: job.uploadId,
        onProgress: (progress) => updateUpload(job.id, { progress }),
      });
      appendUploaded(result.message);
      updateUpload(job.id, { status: "done", progress: 100 });
      return true;
    } catch (error) {
      const cancelled = error.code === "UPLOAD_ABORTED";
      updateUpload(job.id, { status: cancelled ? "cancelled" : "failed", error: error.message, uploadId: error.uploadId ?? job.uploadId });
      if (!cancelled) showToast(`${job.file.name}: ${error.message}`, "error");
      return false;
    } finally {
      uploadControllers.current.delete(job.id);
    }
  }

  async function handleFiles(files) {
    const selected = [...(files ?? [])].slice(0, 10);
    if (!selected.length) return;
    if (!socket.connected) return showToast("Файлы можно отправить после восстановления соединения", "error");
    if (conversation.type === "room" && conversation.permissions?.allowFiles === false) return showToast("Отправка файлов в этой комнате отключена", "error");
    try {
      const largest = Math.max(...selected.map((file) => file.size));
      const capacity = await api(`/api/conversations/${conversation.id}/upload-capacity?bytes=${largest}`);
      const total = selected.reduce((sum, file) => sum + file.size, 0);
      if (selected.some((file) => file.size > capacity.maxFileBytes)) throw new Error("Один из файлов превышает лимит 25 МБ.");
      if (total > capacity.remainingBytes) throw new Error(`На сервере недостаточно места: доступно ${formatBytes(capacity.remainingBytes)}.`);
      const jobs = selected.map((file) => ({ id: crypto.randomUUID(), file, kind: file.type.startsWith("image/") ? "image" : "file", progress: 0, status: "checking", error: "" }));
      setUploadJobs((current) => [...current.filter((job) => job.status === "uploading"), ...jobs]);
      const outcomes = await Promise.all(jobs.map(runUpload));
      if (outcomes.some(Boolean)) await onRefresh();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function retryUpload(job) {
    runUpload(job).then((sent) => sent && onRefresh());
  }

  function cancelUpload(job) {
    uploadControllers.current.get(job.id)?.abort();
    if (!["uploading", "checking"].includes(job.status)) setUploadJobs((current) => current.filter((item) => item.id !== job.id));
  }

  async function handleVoice(blob, duration, waveform) {
    if (!socket.connected) throw new Error("Голосовое можно отправить после восстановления соединения.");
    if (conversation.type === "room" && conversation.permissions?.allowVoice === false) throw new Error("Голосовые сообщения в этой комнате отключены.");
    const mimeType = blob.type || "audio/webm";
    const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
    const file = new globalThis.File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
    setVoiceUploading(true);
    try {
      const capacity = await api(`/api/conversations/${conversation.id}/upload-capacity?kind=voice&bytes=${file.size}`);
      if (!capacity.allowed) throw new Error("Для голосового сообщения недостаточно места на сервере.");
      const result = await uploadFile(conversation.id, file, "voice", duration, "", { waveform });
      appendUploaded(result.message);
      await onRefresh();
      return result;
    } finally {
      setVoiceUploading(false);
    }
  }

  async function action(event, payload, success) {
    try {
      await emitAck(socket, event, payload);
      success?.();
      onRefresh();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await emitAck(socket, "message:delete", { messageId: deleteTarget.id });
      setDeleteTarget(null);
      await onRefresh();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function searchCurrent(event) {
    event?.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 2) return setSearchResults([]);
    setSearchBusy(true);
    try {
      const result = await api(`/api/search/messages?q=${encodeURIComponent(query)}&conversationId=${encodeURIComponent(conversation.id)}`);
      setSearchResults(result.results);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSearchBusy(false);
    }
  }

  async function forwardTo(targetConversation) {
    const source = forwarding;
    setForwarding(null);
    enqueueForward(me.id, {
      messageId: source.id,
      conversationId: targetConversation.id,
      previewText: messageCopyText(source),
    });
    if (!socket.connected) return showToast("Пересылка добавлена в очередь");
    const result = await flushOutbox(socket, me.id);
    if (result.failed) showToast("Пересылка не выполнена — доступен повтор", "error");
    else showToast(`Переслано в «${targetConversation.title}»`);
  }

  function toggleSelected(message) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(message.id)) next.delete(message.id); else next.add(message.id);
      return next;
    });
  }

  async function copySelected() {
    const selected = displayMessages.filter((message) => selectedIds.has(message.id));
    if (!selected.length) return;
    const value = selected.map((message) => `[${new Date(message.createdAt).toLocaleString("ru")}] ${message.sender?.displayName ?? me.displayName}: ${messageCopyText(message)}`).join("\n");
    await navigator.clipboard.writeText(value);
    showToast(`Скопировано сообщений: ${selected.length}`);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function toggleMute() {
    try {
      await patch(`/api/conversations/${conversation.id}/settings`, { muted: !conversation.notificationSettings?.muted });
      await onRefresh();
      showToast(conversation.notificationSettings?.muted ? "Уведомления чата включены" : "Уведомления чата отключены");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function toggleBookmark(message) {
    try {
      const result = await post(`/api/messages/${message.id}/bookmark`);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, bookmarkedByMe: result.bookmarked } : item));
      showToast(result.bookmarked ? "Сообщение сохранено" : "Сообщение удалено из сохранённых");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function retryPending(message) {
    retryOutboxEntry(me.id, message.outboxId);
    if (socket.connected) flushOutbox(socket, me.id).then((result) => result.sent && onRefresh());
  }

  const titleOnline = conversation.type === "dm" && onlineUserIds.has(conversation.peer?.id);
  const typingNames = [...typingUsers.values()];
  const pending = outbox.filter((entry) => entry.conversationId === conversation.id && !messages.some((message) => message.clientId === entry.id)).map((entry) => pendingMessage(entry, me));
  const displayMessages = useMemo(() => [...messages, ...pending].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [messages, pending]);
  const cannotPost = conversation.type === "room" && (conversation.permissions?.readOnly || conversation.permissions?.announcementOnly) && !conversation.permissions?.canBypassPosting;
  const slowMode = conversation.type === "room" ? Number(conversation.permissions?.slowModeSeconds || 0) : 0;

  return (
    <section className={`message-pane background-${conversation.notificationSettings?.background ?? "default"}${conversation.notificationSettings?.compact ? " compact-messages" : ""}${dragging ? " dragging-files" : ""}`} onDragEnter={(event) => { if (event.dataTransfer?.types?.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragOver={(event) => { if (event.dataTransfer?.types?.includes("Files")) event.preventDefault(); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files); }}>
      <header className="conversation-header">
        <div className="conversation-identity"><Avatar user={conversation.peer ?? conversation} online={titleOnline} onClick={conversation.type === "dm" ? () => onOpenProfile(conversation.peer) : undefined} /><div><h2>{conversation.title}</h2><span>{conversation.type === "dm" ? (titleOnline ? "в сети" : conversation.peer?.status || conversation.subtitle) : `${conversation.members?.length ?? 0} участников · ${conversation.privacy === "private" ? "приватная" : "публичная"}`}</span></div></div>
        <div className="conversation-tools">
          <button type="button" className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((value) => !value)} title="Поиск в чате"><Search size={18} /></button>
          <button type="button" className={selectionMode ? "active" : ""} onClick={() => { setSelectionMode((value) => !value); setSelectedIds(new Set()); }} title="Выбрать сообщения"><ListChecks size={18} /></button>
          <button type="button" className={conversation.notificationSettings?.muted ? "active" : ""} onClick={toggleMute} title={conversation.notificationSettings?.muted ? "Включить уведомления" : "Отключить уведомления"}>{conversation.notificationSettings?.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <button type="button" onClick={onDetails} title="Информация"><Info size={19} /></button>
        </div>
      </header>

      {searchOpen && <form className="chat-search-bar" onSubmit={searchCurrent}><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Поиск в текущем чате" autoFocus /><button type="submit" disabled={searchBusy}>{searchBusy ? <LoaderCircle className="spin" size={16} /> : "Найти"}</button><button type="button" onClick={() => { setSearchOpen(false); setSearchResults([]); }}><X size={16} /></button>{searchResults.length > 0 && <div className="chat-search-results">{searchResults.map(({ message }) => <button type="button" key={message.id} onClick={() => { jumpToMessage(message.id); setSearchOpen(false); }}><span>{message.sender.displayName}<time>{formatTime(message.createdAt)}</time></span><small>{messageCopyText(message)}</small></button>)}</div>}</form>}

      <div className="message-list" ref={listRef} onScroll={(event) => { const node = event.currentTarget; setShowJump(node.scrollHeight - node.scrollTop - node.clientHeight > 260); }}>
        {hasMore && <button type="button" className="load-earlier" onClick={loadEarlier} disabled={loadingMore}>{loadingMore ? <InlineLoader label="Загрузка" /> : <><ChevronDown size={15} /> Более ранние сообщения</>}</button>}
        {loading ? <div className="messages-loading"><InlineLoader label="Загружаем переписку" /></div> : displayMessages.length === 0 ? <EmptyState icon={conversation.type === "dm" ? Send : UsersRound} title={conversation.isSavedMessages ? "Ваше личное пространство" : "Начало разговора"} description={conversation.isSavedMessages ? "Сохраняйте здесь заметки, файлы и сообщения — они доступны только вам на этом сервере." : conversation.type === "dm" ? `Напишите первое сообщение для ${conversation.title}.` : "В этой комнате пока тихо. Начните обсуждение."} /> : displayMessages.map((message) => <div key={message.id} className={highlightedId === message.id ? "message-highlight" : ""}>{firstUnreadId.current === message.id && <div className="unread-divider"><span>Новые сообщения</span></div>}<MessageItem message={message} conversation={conversation} onReply={(item) => { setReplyingTo(item); setEditing(null); }} onEdit={(item) => { setEditing(item); setReplyingTo(null); setText(item.text); }} onDelete={setDeleteTarget} onReact={(item, emoji) => action("message:react", { messageId: item.id, emoji })} onPin={(item) => action("message:pin", { messageId: item.id })} onBookmark={toggleBookmark} onPreview={setImagePreview} onJump={jumpToMessage} onForward={setForwarding} onOpenProfile={onOpenProfile} onPollVote={votePoll} onReport={reportMessage} onHistory={showEditHistory} selectionMode={selectionMode} selected={selectedIds.has(message.id)} onToggleSelect={toggleSelected} onRetry={retryPending} onDiscard={(item) => removeOutboxEntry(me.id, item.outboxId)} /></div>)}
      </div>

      {showJump && <button type="button" className="jump-latest" onClick={() => scrollToBottom()}><ArrowDown size={17} /> К последнему</button>}

      {dragging && <div className="file-drop-overlay"><UploadCloud size={34} /><strong>Отпустите файлы для отправки</strong><span>Можно выбрать до 10 файлов одновременно</span></div>}

      <footer className="composer-zone">
        {selectionMode ? <div className="selection-toolbar"><span><CheckSquare size={17} /> Выбрано: {selectedIds.size}</span><button type="button" onClick={copySelected} disabled={!selectedIds.size}><Copy size={16} /> Копировать</button><button type="button" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}><X size={16} /> Отмена</button></div> : <>
          {uploadJobs.length > 0 && (
            <div className="upload-queue">
              {uploadJobs.map((job) => (
                <div key={job.id} className={`upload-job ${job.status}`}>
                  <FileIcon size={15} />
                  <span>
                    <strong>{job.file.name}</strong>
                    <i><b style={{ width: `${job.progress}%` }} /></i>
                    <small>{job.status === "done" ? "Отправлено" : job.status === "failed" ? job.error : job.status === "cancelled" ? "Отменено" : `${job.progress}%`}</small>
                  </span>
                  {job.status === "failed" && <button type="button" onClick={() => retryUpload(job)} title="Повторить"><RefreshCcw size={14} /></button>}
                  <button type="button" onClick={() => cancelUpload(job)} title={job.status === "uploading" ? "Отменить" : "Убрать"}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="typing-line">{cannotPost ? "Комната работает в режиме «только чтение»" : typingNames.length ? `${typingNames.slice(0, 2).join(" и ")} ${typingNames.length > 1 ? "печатают" : "печатает"}…` : !socket.connected ? "Нет соединения · текстовые сообщения попадут в очередь" : slowMode ? `Медленный режим · ${slowMode} сек.` : ""}</div>
          {(replyingTo || editing) && <div className="composer-context">{editing ? <Pencil size={16} /> : <Reply size={16} />}<div><strong>{editing ? "Редактирование" : `Ответ для ${replyingTo.sender.displayName}`}</strong><span>{editing?.text ?? replyingTo?.text ?? "Вложение"}</span></div><button type="button" onClick={() => { setReplyingTo(null); setEditing(null); if (editing) setText(localStorage.getItem(draftKey) ?? ""); }}><X size={16} /></button></div>}
          <form className="composer" onSubmit={submit}><input ref={fileInputRef} type="file" hidden multiple onChange={(event) => handleFiles(event.target.files)} /><button type="button" className="composer-icon-button" onClick={() => fileInputRef.current?.click()} disabled={cannotPost || conversation.permissions?.allowFiles === false} title={conversation.permissions?.allowFiles === false ? "Файлы отключены в комнате" : "Прикрепить файлы"}>{uploading ? <LoaderCircle className="spin" size={19} /> : <Paperclip size={19} />}</button><button type="button" className="composer-icon-button" onClick={() => setPollOpen(true)} disabled={cannotPost || !socket.connected} title="Создать опрос"><BarChart3 size={18} /></button><textarea value={text} disabled={cannotPost} onChange={onInput} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} rows={1} maxLength={4000} placeholder={cannotPost ? "Только чтение" : editing ? "Измените сообщение…" : socket.connected ? "Сообщение…" : "Сообщение будет отправлено после подключения…"} /><button type="button" className={`composer-icon-button${silentNext ? " active" : ""}`} onClick={() => setSilentNext((value) => !value)} disabled={cannotPost || editing} title="Отправить без уведомления"><BellOff size={18} /></button><button type="button" className="composer-icon-button" onClick={() => setScheduleOpen(true)} disabled={cannotPost || editing || !text.trim() || !socket.connected} title="Отложить отправку"><Clock3 size={18} /></button><VoiceRecorder maxSeconds={300} disabled={cannotPost || voiceUploading || !socket.connected || conversation.permissions?.allowVoice === false} onRecorded={handleVoice} onError={(message) => showToast(message, "error")} /><button className="composer-send" type="submit" disabled={cannotPost || !text.trim()} title={silentNext ? "Отправить без уведомления" : "Отправить"}><Send size={19} /></button></form>
          <div className="composer-foot"><span>{text && !editing ? "Черновик сохраняется автоматически" : "Enter — отправить"}</span><span>Файл до 25 МБ · голосовое до 5 минут</span></div>
        </>}
      </footer>

      {forwarding && <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && setForwarding(null)}><section className="modal-card forward-modal"><header><div><span>FORWARD</span><h2>Переслать сообщение</h2></div><button type="button" onClick={() => setForwarding(null)}><X size={18} /></button></header><p className="forward-preview">{messageCopyText(forwarding)}</p><div className="forward-conversations">{conversations.filter((item) => item.id !== conversation.id).map((item) => <button type="button" key={item.id} onClick={() => forwardTo(item)}><Avatar user={item.peer ?? item} size="small" /><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><Forward size={16} /></button>)}</div></section></div>}

      {scheduleOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="modal-card mini-feature-modal"><header><div><span>SCHEDULE</span><h2>Отложенная отправка</h2></div><button type="button" onClick={() => setScheduleOpen(false)}><X size={18} /></button></header><form className="modal-form" onSubmit={scheduleMessage}><label>Дата и время<input type="datetime-local" name="scheduledAt" min={localDateTimeValue(Date.now() + 60_000)} required /></label><p>{text.trim()}</p><button className="violet-button" type="submit"><Clock3 size={17} /> Запланировать</button></form></section></div>}

      {pollOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="modal-card mini-feature-modal"><header><div><span>POLL</span><h2>Новый опрос</h2></div><button type="button" onClick={() => setPollOpen(false)}><X size={18} /></button></header><form className="modal-form" onSubmit={createPoll}><label>Вопрос<input name="question" maxLength={240} required /></label>{[1, 2, 3, 4].map((index) => <label key={index}>Вариант {index}<input name="option" maxLength={120} required={index < 3} /></label>)}<label className="check-row"><input type="checkbox" name="multiple" /><span>Можно выбрать несколько</span></label><label className="check-row"><input type="checkbox" name="anonymous" /><span>Анонимный опрос</span></label><button className="violet-button" type="submit"><BarChart3 size={17} /> Опубликовать</button></form></section></div>}

      {editHistory && <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && setEditHistory(null)}><section className="modal-card mini-feature-modal"><header><div><span>EDIT HISTORY</span><h2>История правок</h2></div><button type="button" onClick={() => setEditHistory(null)}><X size={18} /></button></header><div className="edit-history-list">{editHistory.edits.map((edit) => <article key={edit.id}><time>{new Date(edit.createdAt).toLocaleString("ru")}</time><p>{edit.previousText}</p></article>)}</div><div className="edit-history-current"><strong>Текущая версия</strong><p>{editHistory.message.text}</p></div></section></div>}

      {imagePreview && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр вложения" onClick={() => setImagePreview(null)}><button type="button" onClick={() => setImagePreview(null)}><X size={22} /></button>{imagePreview.kind === "image" ? <img src={imagePreview.url} alt={imagePreview.name} onClick={(event) => event.stopPropagation()} /> : <iframe src={`${imagePreview.url}?preview=1`} title={imagePreview.name} onClick={(event) => event.stopPropagation()} />}<span>{imagePreview.name}</span></div>}
      <ConfirmDialog open={Boolean(deleteTarget)} danger busy={deleteBusy} title="Удалить сообщение?" description="Сообщение будет заменено системной отметкой. Это действие нельзя отменить." confirmLabel="Удалить" onCancel={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDelete} />
    </section>
  );
}
