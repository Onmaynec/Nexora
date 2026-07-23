import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark, Check, CheckCheck, Copy, Download, FileText, Info, KeyRound, LoaderCircle,
  LockKeyhole, Mic, Paperclip, Pause, Pencil, Play, RefreshCcw, Reply, Search, Send,
  ShieldAlert, ShieldCheck, SmilePlus, Square, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { api, patch, post } from "../api";
import {
  cancelEncryptedAttachment, decodeAttachmentContent, decryptDownloadedAttachment,
  encodeAttachmentContent, encryptAndUploadAttachment,
} from "../crypto/e2ee-media";
import {
  decryptServerMessage, decryptServerMessages, ensureConversationGroup, loadE2eeDraft,
  prepareEncryptedEdit, prepareEncryptedText, redactDecryptedForCache, saveE2eeDraft,
} from "../crypto/trust-client";
import { enqueueEncryptedMessage, flushOutbox, readOutbox, removeOutboxEntry, retryOutboxEntry } from "../outbox";
import { cacheMessages, readCachedMessages } from "../offline-store";
import { emitAck } from "../socket";
import ConfirmDialog from "./ConfirmDialog";
import ParticleField from "./ParticleField";
import SecureVoicePlayer from "./SecureVoicePlayer";
import { normalizeVoiceWaveform, waveformLevel } from "../utils/voice-waveform";
import { Avatar, EmptyState, formatTime, InlineLoader } from "./ui";

const BASE_REACTIONS = ["👍", "❤️", "🔥", "😂", "👀", "🎉"];
const PLUS_REACTIONS = ["✨", "💜", "⚡", "🫡", "🤝", "🚀"];

function normalizeWaveform(values, target = 48) {
  const source = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value >= 0);
  const sumSquares = source.reduce((sum, value) => sum + value * value, 0);
  const rms = source.length ? Math.sqrt(sumSquares / source.length) : 0;
  const scaled = source.length ? source.map((value) => Math.max(value, rms * 0.12)) : source;
  return normalizeVoiceWaveform(scaled, target);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function hydrated(message) { return decodeAttachmentContent(message); }
function nearBottom(element, threshold = 150) {
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}
function offlineSafe(messages) {
  return redactDecryptedForCache(messages).map((message) => {
    if (!message.attachment) return message;
    const { attachment: _attachment, ...safe } = message;
    return safe;
  });
}
function pendingMessage(entry, me) {
  const attachment = Boolean(entry.payload?.attachmentId);
  return {
    id: `outbox-${entry.id}`, clientId: entry.id, conversationId: entry.conversationId,
    sender: me, type: attachment ? "attachment" : "text",
    text: attachment ? "Защищённое вложение ожидает отправки" : "Защищённое сообщение ожидает отправки",
    reactions: [], createdAt: entry.createdAt, isOwn: true, e2ee: true,
    deliveryState: entry.state, deliveryError: entry.error, outboxId: entry.id,
    attachmentId: entry.payload?.attachmentId || null,
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

function SecureAttachment({ message, showToast }) {
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const urlRef = useRef(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function ensureResource() {
    if (resource) return resource;
    setLoading(true); setError("");
    try {
      const decrypted = await decryptDownloadedAttachment({ conversationId: message.conversationId, attachment: message.attachment, serverFile: message.file });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const next = { ...decrypted, url: URL.createObjectURL(decrypted.blob) };
      urlRef.current = next.url; setResource(next); return next;
    } catch (failure) {
      setError(failure.message); showToast(failure.message, "error"); return null;
    } finally { setLoading(false); }
  }
  useEffect(() => { if (["image", "voice"].includes(message.attachment.kind)) void ensureResource(); }, [message.id]);
  async function download() {
    const value = await ensureResource();
    if (!value) return;
    const anchor = document.createElement("a");
    anchor.href = value.url; anchor.download = value.name; anchor.rel = "noopener"; anchor.click();
  }
  if (message.attachment.kind === "image") return <div className="secure-media-inline secure-image-inline">{loading && <div className="secure-media-skeleton"><LoaderCircle className="spin" size={20} /> Расшифровываем изображение…</div>}{resource && <img className="secure-image-preview" src={resource.url} alt={resource.name} loading="lazy" />}{resource && <button type="button" className="secure-media-download-float" onClick={download} title="Скачать"><Download size={16} /></button>}{error && <span className="secure-attachment-error"><ShieldAlert size={14} />{error}</span>}</div>;
  if (message.attachment.kind === "voice") return <div className="secure-media-inline">{loading && <div className="secure-media-skeleton"><LoaderCircle className="spin" size={18} /> Готовим голосовое…</div>}{resource && <SecureVoicePlayer resource={resource} waveform={message.attachment.waveform} duration={message.attachment.duration || resource.duration} />}{error && <span className="secure-attachment-error"><ShieldAlert size={14} />{error}</span>}</div>;
  return <div className="secure-attachment-card file">
    <div className="secure-attachment-summary"><span className="secure-attachment-icon"><FileText size={20} /></span><div><strong>{message.attachment.name}</strong><span>{formatBytes(message.attachment.plaintextSize)} · AES-256-GCM</span></div><ShieldCheck size={16} title="Descriptor проверен MLS" /></div>
    {!resource && <button type="button" className="secure-attachment-open" onClick={ensureResource} disabled={loading}>{loading ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}{loading ? "Проверяем и расшифровываем…" : "Открыть локально"}</button>}
    {resource && <button type="button" className="secure-attachment-download" onClick={download}><Download size={15} /> Скачать {resource.name}</button>}
    {error && <span className="secure-attachment-error"><ShieldAlert size={14} />{error}</span>}
  </div>;
}

const SecureMessage = memo(function SecureMessage({ message, availableReactions, onReply, onEdit, onDelete, onReact, onBookmark, onCopy, onRetry, onDiscard, showToast }) {
  const [showReactions, setShowReactions] = useState(false);
  const deleted = message.type === "deleted";
  const pending = Boolean(message.deliveryState);
  return <article className={`message-row secure-message${message.isOwn ? " own" : ""}${pending ? " pending" : ""}${message.system ? " system-message" : ""}${message.sender?.messageStyle === "prism" ? " message-style-prism" : ""}`} id={`message-${message.id}`}>
    {!message.isOwn && !message.system && <Avatar user={message.sender} size="small" />}
    <div className="message-stack">
      <div className="message-meta">{!message.isOwn && <strong>{message.sender?.displayName}</strong>}<time>{formatTime(message.createdAt)}</time>{message.updatedAt && !deleted && <span>изменено</span>}{!pending && <ShieldCheck size={12} title="MLS E2EE" />}</div>
      <div className="message-bubble-wrap">
        <div className="message-bubble">
          {message.reply && <button type="button" className="reply-preview"><strong>{message.reply.senderName}</strong><span>{message.reply.text || "Защищённое сообщение"}</span></button>}
          {deleted ? <em className="deleted-copy">Сообщение удалено</em> : message.decryptionError ? <div className="secure-decryption-error"><ShieldAlert size={16} /><span>{message.text}</span></div> : message.attachment ? <><SecureAttachment message={message} showToast={showToast} />{message.text && <p className="secure-attachment-caption">{message.text}</p>}</> : <p>{message.text}</p>}
        </div>
        {!deleted && !pending && !message.system && <div className="message-actions secure-message-actions">
          <button type="button" onClick={() => onReply(message)} title="Ответить"><Reply size={15} /></button>
          {message.text && <button type="button" onClick={() => onCopy(message)} title="Копировать"><Copy size={15} /></button>}
          <div className="reaction-picker-wrap"><button type="button" onClick={() => setShowReactions((value) => !value)} title="Реакция"><SmilePlus size={15} /></button>{showReactions && <div className="reaction-picker">{availableReactions.map((emoji) => <button type="button" key={emoji} onClick={() => { onReact(message, emoji); setShowReactions(false); }}>{emoji}</button>)}</div>}</div>
          <button type="button" className={message.bookmarkedByMe ? "active" : ""} onClick={() => onBookmark(message)} title="Сохранить"><Bookmark size={15} /></button>
          {message.canEdit && <button type="button" onClick={() => onEdit(message)} title="Редактировать"><Pencil size={15} /></button>}
          {message.canDelete && <button type="button" className="danger" onClick={() => onDelete(message)} title="Удалить"><Trash2 size={15} /></button>}
        </div>}
      </div>
      {message.reactions?.length > 0 && <div className="message-reactions">{message.reactions.map((reaction) => <button type="button" key={reaction.emoji} className={reaction.reactedByMe ? "mine" : ""} onClick={() => onReact(message, reaction.emoji)}><span>{reaction.emoji}</span><b>{reaction.count}</b></button>)}</div>}
      {pending && <div className={`outbox-state ${message.deliveryState}`}><span>{message.deliveryState === "sending" ? "Отправляем ciphertext…" : message.deliveryState === "failed" ? message.deliveryError || "Не отправлено" : "Ciphertext в очереди"}</span>{message.deliveryState === "failed" && <button type="button" onClick={() => onRetry(message)}><RefreshCcw size={13} /> Повторить</button>}<button type="button" onClick={() => onDiscard(message)} title="Удалить из очереди"><X size={13} /></button></div>}
      {message.isOwn && !pending && <span className={`read-status${message.readCount ? " read" : ""}`}>{message.readCount ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
    </div>
  </article>;
}, (previous, next) => previous.message === next.message && previous.showToast === next.showToast);

async function voiceWaveform(blob) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return [];
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const bars = 48;
    const size = Math.max(1, Math.floor(buffer.length / bars));
    const amplitudes = Array.from({ length: bars }, (_, index) => {
      const start = index * size;
      const end = Math.min(buffer.length, start + size);
      let sumSquares = 0;
      let peak = 0;
      let samples = 0;
      for (let offset = start; offset < end; offset += 1) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[offset] || 0) / channels.length;
        sumSquares += sample * sample;
        peak = Math.max(peak, sample);
        samples += 1;
      }
      return Math.sqrt(sumSquares / Math.max(1, samples)) * .72 + peak * .28;
    });
    return normalizeWaveform(amplitudes, bars);
  } catch { return []; }
  finally { await context.close().catch(() => {}); }
}

export default function SecureMessagePane({ conversation, me, socket, onlineUserIds, trustState, initialMessageId, onJumpHandled, onRefresh, onDetails, showToast }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupState, setGroupState] = useState("idle");
  const [groupError, setGroupError] = useState(null);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [outbox, setOutbox] = useState(() => readOutbox(me.id));
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [sending, setSending] = useState(false);
  const [mediaState, setMediaState] = useState(null);
  const [recording, setRecording] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftTimer = useRef(null);
  const typingTimer = useRef(null);
  const uploadAbort = useRef(null);
  const recorderRef = useRef(null);
  const recordingTimer = useRef(null);
  const activeConversationId = conversation.id;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const ready = trustState.status === "ready";
  const mediaAllowed = conversation.type !== "room" || (conversation.permissions?.allowFiles !== false && conversation.permissions?.allowImages !== false && conversation.permissions?.allowVoice !== false);

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
  useEffect(() => () => {
    uploadAbort.current?.abort(); clearInterval(recordingTimer.current);
    const active = recorderRef.current;
    if (active) { active.cancelled = true; cancelAnimationFrame(active.animationFrame || 0); active.source?.disconnect?.(); active.analyser?.disconnect?.(); active.audioContext?.close?.().catch(() => {}); if (active.recorder.state !== "inactive") active.recorder.stop(); active.stream.getTracks().forEach((track) => track.stop()); }
  }, []);

  const initializeGroup = useCallback(async () => {
    if (!ready || !socket.connected) return null;
    setGroupState("initializing"); setGroupError(null);
    try { const result = await ensureConversationGroup(conversationRef.current, { forceSync: true }); setGroupState("ready"); return result; }
    catch (error) { setGroupError(error); setGroupState(error.code || "error"); throw error; }
  }, [activeConversationId, ready, socket.connected]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      if (socket.connected) await initializeGroup();
      const result = socket.connected ? await api(`/api/conversations/${activeConversationId}/messages`) : { messages: await readCachedMessages(me.id, activeConversationId) };
      const decrypted = (await decryptServerMessages(result.messages || [])).map(hydrated);
      setMessages(decrypted); await cacheMessages(me.id, activeConversationId, offlineSafe(decrypted));
      if (socket.connected) socket.emit("conversation:read", { conversationId: activeConversationId }, () => {});
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "auto" }));
    } catch (error) {
      const cached = await readCachedMessages(me.id, activeConversationId).catch(() => []);
      if (cached.length) setMessages((await decryptServerMessages(cached)).map(hydrated));
      else if (ready) showToast(error.message, "error");
    } finally { setLoading(false); }
  }, [activeConversationId, initializeGroup, me.id, ready, showToast, socket]);

  useEffect(() => {
    setMessages([]); setReplyingTo(null); setEditing(null); setDeleteTarget(null); setGroupState("idle"); setGroupError(null); setMediaState(null); uploadAbort.current?.abort();
    if (ready) loadMessages(); else setLoading(false);
  }, [activeConversationId, loadMessages, ready]);
  useEffect(() => {
    if (!ready || !socket.connected || ["ready", "initializing"].includes(groupState)) return undefined;
    const timer = setTimeout(() => initializeGroup().catch(() => {}), groupState === "idle" ? 0 : 8_000);
    return () => clearTimeout(timer);
  }, [groupState, initializeGroup, ready, socket.connected]);
  useEffect(() => {
    const sync = (event) => { if (!event.detail?.userId || event.detail.userId === me.id) setOutbox(readOutbox(me.id)); };
    window.addEventListener("nexora:outbox", sync); return () => window.removeEventListener("nexora:outbox", sync);
  }, [me.id]);
  useEffect(() => {
    let active = true;
    async function onNew(message) {
      if (!active || message.conversationId !== activeConversationId) return;
      if (message.clientId) removeOutboxEntry(me.id, message.clientId);
      const shouldFollow = message.sender?.id === me.id || nearBottom(listRef.current);
      const decrypted = hydrated(await decryptServerMessage(message));
      if (!active) return;
      setMessages((current) => current.some((item) => item.id === decrypted.id) ? current : [...current, decrypted]);
      if (message.sender?.id !== me.id) socket.emit("conversation:read", { conversationId: activeConversationId }, () => {});
      if (shouldFollow) requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    }
    async function onUpdated(message) {
      if (!active || message.conversationId !== activeConversationId) return;
      const decrypted = hydrated(await decryptServerMessage(message));
      if (active) setMessages((current) => current.map((item) => item.id === decrypted.id ? decrypted : item));
    }
    function onTyping(event) {
      if (event.conversationId !== activeConversationId || event.user.id === me.id) return;
      setTypingUsers((current) => { const next = new Map(current); if (event.isTyping) next.set(event.user.id, event.user.displayName); else next.delete(event.user.id); return next; });
    }
    socket.on("message:new", onNew); socket.on("message:updated", onUpdated); socket.on("typing:update", onTyping);
    return () => { active = false; socket.off("message:new", onNew); socket.off("message:updated", onUpdated); socket.off("typing:update", onTyping); };
  }, [activeConversationId, me.id, socket]);
  useEffect(() => { if (initialMessageId && !loading) { document.getElementById(`message-${initialMessageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); onJumpHandled?.(); } }, [initialMessageId, loading, onJumpHandled]);
  useEffect(() => { if (messages.length) cacheMessages(me.id, activeConversationId, offlineSafe(messages)).catch(() => {}); }, [activeConversationId, me.id, messages]);

  async function submit(event) {
    event?.preventDefault();
    const value = text.trim();
    if (!value || sending || mediaState || recording) return;
    if (!ready) return showToast("Trust Core ещё не готов", "error");
    if (groupState !== "ready") { void initializeGroup().catch(() => {}); return showToast("Синхронизируем защищённый диалог…", "error"); }
    if (!socket.connected) { persistDraft(value); return showToast("Соединение отсутствует. Текст сохранён только в зашифрованном локальном черновике.", "error"); }
    setSending(true);
    try {
      if (editing) {
        const payload = await prepareEncryptedEdit({ conversation: conversationRef.current, messageId: editing.id, text: value });
        const result = await emitAck(socket, "mls:message-edit", payload, 20_000);
        const decrypted = hydrated(await decryptServerMessage(result.message));
        setMessages((current) => current.map((item) => item.id === decrypted.id ? decrypted : item));
        setEditing(null); setText(""); await saveE2eeDraft(activeConversationId, ""); void onRefresh().catch(() => {});
      } else {
        const prepared = await prepareEncryptedText({ conversation: conversationRef.current, text: value, replyToId: replyingTo?.id || null, threadRootId: conversation.type === "room" && replyingTo ? (replyingTo.threadRootId || replyingTo.id) : null });
        enqueueEncryptedMessage(me.id, prepared); setText(""); setReplyingTo(null); void saveE2eeDraft(activeConversationId, ""); socket.emit("typing:set", { conversationId: activeConversationId, isTyping: false }); setSending(false);
        void flushOutbox(socket, me.id).then((result) => { if (result.failed) showToast("Ciphertext не доставлен; доступен безопасный повтор.", "error"); }).catch((error) => showToast(error.message, "error"));
      }
    } catch (error) { showToast(error.message, "error"); }
    finally { setSending(false); }
  }

  async function sendAttachment(file, kind, extras = {}) {
    if (!file || sending || mediaState) return;
    if (!ready || !socket.connected) return showToast("E2EE media требует активное соединение и готовый Trust Core.", "error");
    if (!mediaAllowed) return showToast("В комнате ограничен один или несколько типов медиа. E2EE media заблокирован fail-closed.", "error");
    const controller = new AbortController(); uploadAbort.current = controller; let descriptor = null; let enqueued = false;
    setMediaState({ phase: "reading", progress: 0, name: file.name || "Голосовое сообщение" });
    try {
      descriptor = await encryptAndUploadAttachment({ conversationId: activeConversationId, file, kind, duration: extras.duration, waveform: extras.waveform, signal: controller.signal, onProgress: (event) => {
        const base = event.phase === "reading" ? 2 : event.phase === "encrypting" ? 12 : event.phase === "uploading" ? 20 : 95;
        const span = event.phase === "uploading" ? 72 : 5;
        setMediaState({ phase: event.phase, progress: Math.min(99, Math.round(base + span * Number(event.progress || 0))), name: file.name || "Голосовое сообщение" });
      } });
      setMediaState({ phase: "sealing", progress: 97, name: descriptor.name });
      const prepared = await prepareEncryptedText({ conversation: conversationRef.current, text: encodeAttachmentContent(descriptor, text), replyToId: replyingTo?.id || null, threadRootId: conversation.type === "room" && replyingTo ? (replyingTo.threadRootId || replyingTo.id) : null });
      prepared.payload.contentType = "attachment"; prepared.payload.attachmentId = descriptor.id; enqueueEncryptedMessage(me.id, prepared); enqueued = true;
      setText(""); setReplyingTo(null); await saveE2eeDraft(activeConversationId, ""); setMediaState({ phase: "sending", progress: 100, name: descriptor.name });
      const result = await flushOutbox(socket, me.id); if (result.failed) throw new Error("E2EE attachment сохранён в безопасной очереди для повтора.");
    } catch (error) {
      if (descriptor?.id && !enqueued) await cancelEncryptedAttachment(descriptor.id).catch(() => {});
      if (error.code !== "E2EE_ATTACHMENT_UPLOAD_CANCELLED") showToast(error.message, "error");
    } finally { uploadAbort.current = null; setMediaState(null); }
  }
  async function chooseFile(event) { const file = event.target.files?.[0]; event.target.value = ""; if (file) await sendAttachment(file, file.type.startsWith("image/") ? "image" : "file"); }
  async function startVoiceRecording() {
    if (recording || mediaState || sending) return;
    if (!globalThis.MediaRecorder || !navigator.mediaDevices?.getUserMedia) return showToast("Запись голоса не поддерживается этим клиентом.", "error");
    if (!mediaAllowed) return showToast("E2EE media заблокирован политикой комнаты.", "error");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
      const mimeType = candidates.find((value) => MediaRecorder.isTypeSupported(value)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const liveWaveform = Array.from({ length: 48 }, () => 12);
      let audioContext = null; let analyser = null; let sourceNode = null;
      try {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (Context) {
          audioContext = new Context(); analyser = audioContext.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.72;
          sourceNode = audioContext.createMediaStreamSource(stream); sourceNode.connect(analyser);
        }
      } catch { audioContext = null; analyser = null; sourceNode = null; }
      const active = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, mimeType: recorder.mimeType || mimeType || "audio/webm", liveWaveform, audioContext, analyser, source: sourceNode, animationFrame: 0 };
      const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
      const draw = () => {
        if (recorderRef.current !== active || active.cancelled) return;
        if (analyser && samples) { analyser.getByteTimeDomainData(samples); liveWaveform.shift(); liveWaveform.push(Math.max(8, waveformLevel(samples))); }
        setRecording({ seconds: Math.min(300, Math.floor((Date.now() - active.startedAt) / 1000)), waveform: [...liveWaveform] });
        active.animationFrame = requestAnimationFrame(draw);
      };
      recorder.ondataavailable = (event) => { if (event.data?.size) active.chunks.push(event.data); };
      recorderRef.current = active; recorder.start(250); setRecording({ seconds: 0, waveform: [...liveWaveform] }); active.animationFrame = requestAnimationFrame(draw);
      recordingTimer.current = setInterval(() => setRecording((current) => ({ seconds: Math.min(300, Math.floor((Date.now() - active.startedAt) / 1000)), waveform: current?.waveform || [...liveWaveform] })), 500);
      setTimeout(() => { if (recorderRef.current === active && recorder.state === "recording") void stopVoiceRecording(); }, 300_000);
    } catch (error) { showToast(error.name === "NotAllowedError" ? "Нет разрешения на микрофон." : `Не удалось начать запись: ${error.message}`, "error"); }
  }
  async function stopVoiceRecording() {
    const active = recorderRef.current;
    if (!active || active.recorder.state === "inactive") return;
    clearInterval(recordingTimer.current); setRecording(null);
    await new Promise((resolve) => {
      active.recorder.onstop = async () => {
        cancelAnimationFrame(active.animationFrame || 0); active.source?.disconnect?.(); active.analyser?.disconnect?.(); await active.audioContext?.close?.().catch(() => {}); active.stream.getTracks().forEach((track) => track.stop()); recorderRef.current = null;
        if (!active.cancelled) {
          const duration = Math.max(1, Math.min(300, Math.round((Date.now() - active.startedAt) / 1000)));
          const blob = new Blob(active.chunks, { type: active.mimeType });
          if (blob.size) {
            const decodedWaveform = await voiceWaveform(blob);
            const waveform = decodedWaveform.length ? decodedWaveform : normalizeVoiceWaveform(active.liveWaveform);
            const extension = active.mimeType.includes("ogg") ? "ogg" : "webm";
            await sendAttachment(new File([blob], `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, { type: active.mimeType }), "voice", { duration, waveform });
          }
        }
        resolve();
      };
      active.recorder.stop();
    });
  }
  function cancelVoiceRecording() {
    const active = recorderRef.current; if (!active) return; active.cancelled = true; clearInterval(recordingTimer.current); setRecording(null);
    cancelAnimationFrame(active.animationFrame || 0); active.source?.disconnect?.(); active.analyser?.disconnect?.(); active.audioContext?.close?.().catch(() => {}); active.stream.getTracks().forEach((track) => track.stop()); if (active.recorder.state !== "inactive") active.recorder.stop(); recorderRef.current = null;
  }
  function onInput(event) {
    const value = event.target.value; setText(value); if (!editing) persistDraft(value); if (!socket.connected) return;
    socket.emit("typing:set", { conversationId: activeConversationId, isTyping: true }); clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing:set", { conversationId: activeConversationId, isTyping: false }), 1_200);
  }
  async function action(event, payload) { try { await emitAck(socket, event, payload); void onRefresh().catch(() => {}); } catch (error) { showToast(error.message, "error"); } }
  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try { await emitAck(socket, "message:delete", { messageId: deleteTarget.id }); setDeleteTarget(null); void onRefresh().catch(() => {}); }
    catch (error) { showToast(error.message, "error"); }
    finally { setDeleteBusy(false); }
  }
  async function toggleBookmark(message) { try { const result = await post(`/api/messages/${message.id}/bookmark`); setMessages((current) => current.map((item) => item.id === message.id ? { ...item, bookmarkedByMe: result.bookmarked } : item)); } catch (error) { showToast(error.message, "error"); } }
  async function copyMessage(message) { await navigator.clipboard.writeText(message.text || ""); showToast("Сообщение скопировано"); }
  async function toggleMute() { try { await patch(`/api/conversations/${activeConversationId}/settings`, { muted: !conversation.notificationSettings?.muted }); void onRefresh().catch(() => {}); } catch (error) { showToast(error.message, "error"); } }
  function retryPending(message) { retryOutboxEntry(me.id, message.outboxId); if (socket.connected) void flushOutbox(socket, me.id).then((result) => { if (result.failed) showToast("Ciphertext не доставлен; доступен безопасный повтор.", "error"); }).catch((error) => showToast(error.message, "error")); }
  async function discardPending(message) {
    const entry = readOutbox(me.id).find((item) => item.id === message.outboxId); removeOutboxEntry(me.id, message.outboxId);
    if (entry?.payload?.attachmentId) { try { await cancelEncryptedAttachment(entry.payload.attachmentId); } catch (error) { if (![404, 409, 410].includes(error.status)) showToast(error.message, "error"); } }
  }

  const filtered = useMemo(() => { const query = searchQuery.trim().toLocaleLowerCase("ru"); return query.length >= 2 ? messages.filter((message) => `${message.text || ""} ${message.attachment?.name || ""}`.toLocaleLowerCase("ru").includes(query)) : messages; }, [messages, searchQuery]);
  const pending = useMemo(() => outbox.filter((entry) => entry.kind === "mls-message" && entry.conversationId === activeConversationId && !messages.some((message) => message.clientId === entry.id)).map((entry) => pendingMessage(entry, me)), [activeConversationId, me, messages, outbox]);
  const displayMessages = useMemo(() => [...filtered, ...pending].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [filtered, pending]);
  const titleOnline = conversation.type === "dm" && onlineUserIds.has(conversation.peer?.id);
  const typingNames = [...typingUsers.values()];
  const cannotPost = conversation.type === "room" && (conversation.permissions?.readOnly || conversation.permissions?.announcementOnly) && !conversation.permissions?.canBypassPosting;
  const busy = sending || Boolean(mediaState) || Boolean(recording) || groupState !== "ready";
  const availableReactions = useMemo(() => [...BASE_REACTIONS, ...((me.stickerPack === "nova" || conversation.reactionPack === "expanded") ? PLUS_REACTIONS : [])], [conversation.reactionPack, me.stickerPack]);
  const paneEffects = `${conversation.theme === "midnight" ? " room-theme-midnight" : ""}`;
  if (!ready) return <section className="message-pane secure-message-pane"><TrustGate trustState={trustState} /></section>;

  return <section className={`message-pane secure-message-pane${paneEffects}`}>
    <header className="conversation-header secure-conversation-header">
      <div className="conversation-identity"><Avatar user={conversation.peer || conversation} online={titleOnline} /><div><h2>{conversation.title}</h2><span>{conversation.type === "dm" ? (titleOnline ? "в сети" : conversation.peer?.status || conversation.subtitle) : `${conversation.members?.length || 0} участников`}</span></div></div>
      <div className="secure-header-state"><ShieldCheck size={17} /><span><strong>MLS E2EE</strong><small>{groupState === "ready" ? "epoch синхронизирована" : groupState === "initializing" ? "синхронизация…" : "Trust Core"}</small></span></div>
      <div className="conversation-tools"><button type="button" className={searchOpen ? "active" : ""} onClick={() => setSearchOpen((value) => !value)} title="Локальный поиск"><Search size={18} /></button><button type="button" className={conversation.notificationSettings?.muted ? "active" : ""} onClick={toggleMute}>{conversation.notificationSettings?.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button><button type="button" onClick={onDetails}><Info size={19} /></button></div>
    </header>
    {conversation.bannerStyle === "aurora" && <div className="secure-room-banner-aurora"><strong>AURORA ROOM</strong><span>Активный баннер комнаты · Pulse</span></div>}
    {searchOpen && <div className="chat-search-bar secure-local-search"><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Локальный поиск по расшифрованным сообщениям" autoFocus /><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}><X size={16} /></button></div>}
    <div className="secure-policy-banner"><LockKeyhole size={16} /><span><strong>Сервер получает только MLS ciphertext и opaque media.</strong> Ключи, имена, MIME и подписи вложений находятся внутри MLS. Опросы и отложенная отправка остаются отключены.</span></div>
    {!mediaAllowed && <div className="secure-policy-banner warning"><ShieldAlert size={16} /><span>В комнате ограничен один или несколько типов медиа. Поскольку сервер не видит тип зашифрованного файла, весь E2EE media path заблокирован fail-closed.</span></div>}
    <div className="message-list secure-message-history" ref={listRef}><ParticleField contained className="chat-particle-field" />{loading ? <div className="messages-loading"><InlineLoader label="Проверяем ключи и расшифровываем" /></div> : groupState !== "ready" ? <div className="secure-mls-recovery"><ShieldAlert size={24} /><strong>MLS-сессия не синхронизирована</strong><p>{groupError?.message || "Клиент безопасно запрашивает актуальный epoch и Welcome. Отправка остаётся заблокированной без fallback на plaintext."}</p><button type="button" onClick={loadMessages}><RefreshCcw size={15} /> Повторить синхронизацию</button></div> : displayMessages.length === 0 ? <EmptyState icon={LockKeyhole} title="Защищённый диалог готов" description="Первое сообщение создаст или синхронизирует MLS-группу для всех подтверждённых устройств участников." /> : displayMessages.map((message) => <SecureMessage key={message.id} message={message} availableReactions={availableReactions} onReply={(item) => { setReplyingTo(item); setEditing(null); }} onEdit={(item) => { setEditing(item); setReplyingTo(null); setText(item.text); }} onDelete={setDeleteTarget} onReact={(item, emoji) => action("message:react", { messageId: item.id, emoji })} onBookmark={toggleBookmark} onCopy={copyMessage} onRetry={retryPending} onDiscard={discardPending} showToast={showToast} />)}</div>
    <footer className="composer-zone secure-composer-zone">
      <div className="typing-line">{cannotPost ? "Комната работает только для чтения" : typingNames.length ? `${typingNames.slice(0, 2).join(" и ")} печатает…` : !socket.connected ? "Офлайн · текст хранится только в sealed draft" : groupState === "initializing" ? "Синхронизируем MLS epoch…" : "MLS 1.0 · ciphersuite 1"}</div>
      {(replyingTo || editing) && <div className="composer-context">{editing ? <Pencil size={16} /> : <Reply size={16} />}<div><strong>{editing ? "E2EE-редактирование" : `Ответ для ${replyingTo.sender?.displayName}`}</strong><span>{editing?.text || replyingTo?.text || replyingTo?.attachment?.name || "Защищённое сообщение"}</span></div><button type="button" onClick={() => { setReplyingTo(null); setEditing(null); loadE2eeDraft(activeConversationId).then(setText); }}><X size={16} /></button></div>}
      {mediaState && <div className="secure-media-progress" aria-live="polite"><div><LoaderCircle className="spin" size={16} /><span>{mediaState.phase === "reading" ? "Читаем локальный файл" : mediaState.phase === "encrypting" ? "Шифруем AES-256-GCM" : mediaState.phase === "uploading" ? "Загружаем ciphertext" : mediaState.phase === "verifying" ? "Проверяем SHA-256" : mediaState.phase === "sealing" ? "Запечатываем descriptor в MLS" : "Отправляем MLS envelope"}</span><b>{mediaState.progress}%</b><button type="button" onClick={() => uploadAbort.current?.abort()} title="Отменить загрузку"><X size={15} /></button></div><span>{mediaState.name}</span><progress max="100" value={mediaState.progress} /></div>}
      {recording && <div className="secure-recording" aria-live="polite"><span className="recording-dot" /><strong>Запись {recording.seconds} сек.</strong><div className="secure-recording-wave" aria-hidden="true">{normalizeVoiceWaveform(recording.waveform || []).map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><button type="button" onClick={stopVoiceRecording}><Square size={15} /> Завершить и отправить</button><button type="button" className="danger" onClick={cancelVoiceRecording}><X size={15} /> Отменить</button></div>}
      <form className="composer secure-composer" onSubmit={submit}>
        <input ref={fileInputRef} className="visually-hidden" type="file" onChange={chooseFile} disabled={cannotPost || busy || !socket.connected || !mediaAllowed || editing} />
        <button type="button" className="secure-media-button" onClick={() => fileInputRef.current?.click()} disabled={cannotPost || busy || !socket.connected || !mediaAllowed || editing} title="Зашифровать файл или изображение"><Paperclip size={18} /></button>
        <button type="button" className={`secure-media-button${recording ? " active" : ""}`} onClick={recording ? stopVoiceRecording : startVoiceRecording} disabled={cannotPost || sending || Boolean(mediaState) || !socket.connected || !mediaAllowed || editing} title={recording ? "Завершить запись" : "Записать защищённое голосовое"}>{recording ? <Square size={17} /> : <Mic size={18} />}</button>
        <textarea value={text} disabled={cannotPost || busy} onChange={onInput} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} rows={1} maxLength={4000} placeholder={!socket.connected ? "Зашифрованный локальный черновик…" : editing ? "Измените защищённое сообщение…" : "Защищённое сообщение или подпись к вложению…"} />
        <button className="composer-send" type="submit" disabled={cannotPost || busy || !text.trim() || !socket.connected} title="Зашифровать и отправить">{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button>
      </form>
      <div className="composer-foot"><span>Черновик и media descriptor зашифрованы локально</span><span>Сервер видит размер ciphertext, время, отправителя и диалог</span></div>
    </footer>
    <ConfirmDialog open={Boolean(deleteTarget)} danger busy={deleteBusy} title="Удалить защищённое сообщение?" description="Сообщение будет заменено системной отметкой. Восстановить его после подтверждения нельзя." confirmLabel="Удалить" onCancel={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDelete} />
  </section>;
}
