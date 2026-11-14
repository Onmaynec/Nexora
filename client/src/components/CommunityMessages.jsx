import { useEffect, useRef, useState } from "react";
import { api, post, remove } from "../api";

const sortMessages = (items) => items.sort(
  (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
);

function mergeMessages(previous, incoming) {
  const byId = new Map(previous.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return sortMessages([...byId.values()]);
}

export default function CommunityMessages({ community, channel }) {
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [accessRevoked, setAccessRevoked] = useState(false);
  const nonceRef = useRef(null);
  const path = "/api/v3/communities/" + encodeURIComponent(community.id)
    + "/channels/" + encodeURIComponent(channel.id) + "/messages";
  const allowedToPost = !accessRevoked && (channel.kind !== "announcement" || community.permissions.includes("channel.announce"));
  const moderator = community.permissions.includes("members.moderate");
  const revokeIfDenied = (failure) => {
    if (["RESOURCE_NOT_FOUND", "FORBIDDEN", "AUTH_REQUIRED"].includes(failure?.code)) {
      setMessages([]);
      setNextCursor(null);
      setContent("");
      nonceRef.current = null;
      setAccessRevoked(true);
    }
  };

  useEffect(() => {
    let active = true;
    const refresh = async (initial = false) => {
      try {
        const result = await api(path + "?limit=50");
        if (!active) return;
        setMessages((existing) => mergeMessages(existing, result.messages || []));
        if (initial) setNextCursor(result.nextCursor || null);
        setAccessRevoked(false);
        setError("");
      } catch (failure) {
        if (active) { revokeIfDenied(failure); setError(failure?.message || "Не удалось получить сообщения."); }
      } finally {
        if (active && initial) setLoading(false);
      }
    };
    refresh(true);
    // Privacy: each fetch is authenticated and rechecks membership and channel permissions.
    const poll = window.setInterval(() => { if (!document.hidden) refresh(); }, 7000);
    return () => { active = false; window.clearInterval(poll); };
  }, [path]);

  async function loadOlder() {
    if (!nextCursor || olderLoading) return;
    setOlderLoading(true);
    try {
      const result = await api(path + "?limit=50&before=" + encodeURIComponent(nextCursor));
      setMessages((old) => mergeMessages(old, result.messages || []));
      setNextCursor(result.nextCursor || null);
    } catch (failure) { revokeIfDenied(failure); setError(failure?.message || "Не удалось загрузить историю."); }
    finally { setOlderLoading(false); }
  }

  async function send(event) {
    event.preventDefault();
    const body = content.trim();
    if (!allowedToPost || !body || sending) return;
    const clientNonce = nonceRef.current?.body === body
      ? nonceRef.current.clientNonce : crypto.randomUUID();
    nonceRef.current = { body, clientNonce };
    setSending(true);
    setError("");
    try {
      const result = await post(path, { body, clientNonce });
      setMessages((old) => mergeMessages(old, [result.message]));
      setContent("");
      nonceRef.current = null;
    } catch (failure) { revokeIfDenied(failure); setError(failure?.message || "Сообщение не отправлено."); }
    finally { setSending(false); }
  }

  async function erase(messageId) {
    setError("");
    try {
      await remove(path + "/" + encodeURIComponent(messageId));
      setMessages((old) => old.map((item) => item.id === messageId
        ? { ...item, body: "", deletedAt: new Date().toISOString() } : item));
    } catch (failure) { revokeIfDenied(failure); setError(failure?.message || "Не удалось удалить сообщение."); }
  }

  return <section className="communities-messages" aria-label={"Переписка: " + channel.name}>
    <header className="communities-messages-head">
      <div><h3># {channel.name}</h3><small>{channel.kind === "announcement" ? "Объявления" : "Текстовый канал"}</small></div>
      <span>История обновляется автоматически</span>
    </header>
    {error && <p role="alert" className="communities-error">{error}</p>}
    {loading && <p role="status">Загружаем переписку…</p>}
    {accessRevoked && <p role="status" className="communities-readonly">Доступ к каналу больше не предоставляется.</p>}
    {nextCursor && <button type="button" className="communities-load-history" onClick={loadOlder} disabled={olderLoading}>
      {olderLoading ? "Загрузка…" : "Показать ранние сообщения"}
    </button>}
    <div className="communities-messages-list" role="log" aria-live="off">
      {!messages.length && !loading && <p className="communities-empty">Сообщений пока нет.</p>}
      {messages.map((message) => <article className="communities-message" key={message.id}>
        <div className="communities-message-meta">
          <strong>{message.mine ? "Вы" : "Участник " + message.authorId.slice(0, 8)}</strong>
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ru-RU")}</time>
          {!message.deletedAt && (message.mine || moderator)
            && <button type="button" onClick={() => erase(message.id)} aria-label="Удалить сообщение">Удалить</button>}
        </div>
        {message.deletedAt ? <em>Сообщение удалено</em> : <p>{message.body}</p>}
      </article>)}
    </div>
    {allowedToPost ? <form className="communities-send-message" onSubmit={send}>
      <label htmlFor="communities-message-input">Сообщение</label>
      <textarea id="communities-message-input" rows={2} maxLength={4000} placeholder="Написать сообщение…"
        value={content} onChange={(event) => { setContent(event.target.value); nonceRef.current = null; }}/>
      <button type="submit" disabled={sending || !content.trim()}>{sending ? "Отправка…" : "Отправить"}</button>
    </form> : <p className="communities-readonly">Публиковать объявления могут только уполномоченные участники.</p>}
  </section>;
}
