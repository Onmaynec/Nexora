import { useCallback, useEffect, useState } from "react";
import { Archive, Download, Info, LoaderCircle, LockKeyhole, RefreshCcw, ShieldAlert } from "lucide-react";
import { api, post } from "../api";
import { Avatar, EmptyState, formatTime } from "./ui";

function safeFileName(value) {
  return String(value || "legacy-secure-history")
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "legacy-secure-history";
}

function LegacyRecord({ message }) {
  const digest = message.messageHash || "hash unavailable";
  return (
    <article className="message-row secure-message legacy-secure-record" id={`message-${message.id}`}>
      <div className="message-stack">
        <div className="message-meta">
          <strong>Legacy MLS ciphertext</strong>
          <time>{formatTime(message.createdAt)}</time>
          <span>только чтение</span>
        </div>
        <div className="message-bubble-wrap">
          <div className="message-bubble">
            <dl className="legacy-secure-metadata">
              <div><dt>Message ID</dt><dd><code>{message.id}</code></dd></div>
              <div><dt>Sender ID</dt><dd><code>{message.senderId}</code></dd></div>
              <div><dt>Epoch / generation</dt><dd>{message.epoch ?? "—"} / {message.generation ?? "—"}</dd></div>
              <div><dt>Content type</dt><dd>{message.contentType || "unknown"}</dd></div>
              <div><dt>Ciphertext SHA-256</dt><dd><code title={digest}>{digest}</code></dd></div>
              {message.attachmentId && <div><dt>Attachment ID</dt><dd><code>{message.attachmentId}</code></dd></div>}
            </dl>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function LegacySecureHistoryPane({ conversation, onDetails, showToast }) {
  const [state, setState] = useState("loading");
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const result = await api(`/api/v3/legacy-secure/conversations/${encodeURIComponent(conversation.id)}/messages?limit=200`);
      setMessages(result.messages || []);
      setState(result.state || ((result.messages || []).length ? "exportable" : "unavailable"));
    } catch (failure) {
      setError(failure);
      setState("error");
    }
  }, [conversation.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportHistory() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await post(`/api/v3/legacy-secure/conversations/${encodeURIComponent(conversation.id)}/export`, {});
      const blob = new Blob([JSON.stringify(result.export, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeFileName(conversation.title)}-legacy-mls-export.json`;
      anchor.rel = "noopener";
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Legacy history экспортирована без server-side расшифровки");
    } catch (failure) {
      showToast(`${failure.message}${failure.requestId ? ` · requestId ${failure.requestId}` : ""}`, "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="message-pane secure-message-pane legacy-secure-history-pane">
      <header className="conversation-header secure-conversation-header">
        <div className="conversation-identity">
          <Avatar user={conversation.peer || conversation} />
          <div><h2>{conversation.title}</h2><span>{conversation.subtitle}</span></div>
        </div>
        <div className="secure-header-state"><LockKeyhole size={17} /><span><strong>Legacy MLS</strong><small>immutable history</small></span></div>
        <div className="conversation-tools">
          <button type="button" onClick={load} disabled={state === "loading"} title="Обновить"><RefreshCcw className={state === "loading" ? "spin" : ""} size={18} /></button>
          <button type="button" onClick={exportHistory} disabled={exporting || state !== "exportable"} title="Экспортировать ciphertext"><Download size={18} /></button>
          <button type="button" onClick={onDetails} title="Сведения о чате"><Info size={19} /></button>
        </div>
      </header>

      <div className="secure-policy-banner warning" role="status">
        <Archive size={16} />
        <span><strong>История доступна только для чтения.</strong> Trust/MLS runtime удалён; Local Server не расшифровывает ciphertext и не принимает новые secure mutations.</span>
      </div>

      <div className="message-list secure-message-history" aria-live="polite">
        {state === "loading" && <div className="messages-loading"><LoaderCircle className="spin" size={20} /><span>Проверяем доступность legacy history…</span></div>}
        {state === "error" && <div className="secure-mls-recovery" role="alert"><ShieldAlert size={24} /><strong>Legacy history недоступна</strong><p>{error?.message || "Не удалось прочитать историю."}{error?.requestId ? ` · requestId ${error.requestId}` : ""}</p><button type="button" onClick={load}><RefreshCcw size={15} /> Повторить</button></div>}
        {state === "unavailable" && <EmptyState icon={LockKeyhole} title="Локально доступного ciphertext нет" description="Запись группы сохранена, но сервер не располагает экспортируемыми legacy-сообщениями. Новая запись в этот scope запрещена." />}
        {state === "exportable" && messages.map((message) => <LegacyRecord key={message.id} message={message} />)}
      </div>

      <footer className="composer-zone secure-composer-zone">
        <div className="secure-policy-banner"><LockKeyhole size={16} /><span>Отправка, редактирование, реакции, вложения и голосовые отключены с кодом <code>LEGACY_READ_ONLY</code>.</span></div>
        <button type="button" className="violet-button" onClick={exportHistory} disabled={exporting || state !== "exportable"}>{exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />} Экспортировать immutable history</button>
      </footer>
    </section>
  );
}
