import { useEffect, useState } from "react";
import { Bookmark, FileText, Search } from "lucide-react";
import { api } from "../api";
import { Avatar, EmptyState, formatTime } from "./ui";

function resultText(message) {
  if (message.type === "voice") return "Голосовое сообщение";
  if (message.file) return message.file.name;
  return message.text;
}

export default function GlobalSearch({ onOpen, onOpenProfile, showToast }) {
  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(event) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setSearched(true);
    try {
      const result = await api(`/api/search/messages?q=${encodeURIComponent(query.trim())}`);
      setResults(result.results);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadBookmarks() {
    setBusy(true);
    setSearched(true);
    try {
      const result = await api("/api/bookmarks");
      setResults(result.bookmarks.map((item) => ({ message: item.message, conversation: item.conversation })));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { if (mode === "bookmarks") loadBookmarks(); }, [mode]);

  return (
    <div className="section-page global-search-page">
      <header className="section-page-head"><div><span>MESSAGE INDEX</span><h1>Глобальный поиск</h1><p>Ищите текст и названия вложений во всех доступных чатах и комнатах.</p></div></header>
      <div className="search-modes"><button type="button" className={mode === "search" ? "active" : ""} onClick={() => { setMode("search"); setResults([]); setSearched(false); }}><Search size={16} /> Поиск</button><button type="button" className={mode === "bookmarks" ? "active" : ""} onClick={() => setMode("bookmarks")}><Bookmark size={16} /> Сохранённые</button></div>
      {mode === "search" && <form className="global-search-form" onSubmit={search}><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Что найти в Nexora?" autoFocus /><button type="submit" disabled={busy || query.trim().length < 2}>{busy ? "Ищем…" : "Найти"}</button></form>}
      <div className="global-search-results">
        {results.map(({ message, conversation }) => <button type="button" key={message.id} onClick={() => onOpen(conversation.id, message.id)}><Avatar user={message.sender} size="small" onClick={(event) => { event.stopPropagation(); onOpenProfile(message.sender); }} /><span className="search-result-copy"><span><strong>{message.sender.displayName}</strong><b>{conversation.title}</b><time>{formatTime(message.createdAt)}</time></span><small>{resultText(message)}</small></span></button>)}
        {searched && !busy && !results.length && <EmptyState icon={mode === "bookmarks" ? Bookmark : FileText} title={mode === "bookmarks" ? "Сохранённых сообщений нет" : "Совпадений нет"} description={mode === "bookmarks" ? "Добавляйте важные сообщения в сохранённые через меню действий." : "Попробуйте другое слово или часть названия файла."} />}
      </div>
    </div>
  );
}
