import { useEffect, useState } from "react";
import { Clock3, Eye, LoaderCircle, Phone, RefreshCcw, ShieldCheck } from "lucide-react";
import { api, patch } from "../api";
import { Avatar } from "./ui";

const DEFAULT_PRIVACY = {
  presenceVisibility: "everyone",
  lastSeenVisibility: "approximate",
  readReceiptsVisibility: "contacts",
};

const outcomeLabels = {
  completed: "Завершён",
  declined: "Отклонён",
  missed: "Пропущен",
  failed: "Ошибка",
  blocked: "Заблокирован",
  revoked: "Сессия отозвана",
  unavailable: "Недоступен",
};

function formatDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ConnectSettingsCard({ showToast }) {
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY);
  const [calls, setCalls] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [privacyResult, historyResult, diagnosticsResult] = await Promise.all([
        api("/api/v3/privacy"),
        api("/api/v3/calls/history?limit=20"),
        api("/api/v3/calls/diagnostics"),
      ]);
      setPrivacy(privacyResult.privacy || DEFAULT_PRIVACY);
      setCalls(historyResult.calls || []);
      setDiagnostics(diagnosticsResult.diagnostics || null);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function savePrivacy() {
    setSaving(true);
    try {
      const result = await patch("/api/v3/privacy", privacy);
      setPrivacy(result.privacy);
      showToast("Настройки приватности сохранены");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-card connect-settings-card">
      <div className="settings-card-title"><ShieldCheck size={20} /><div><h3>Connect и приватность</h3><span>Presence, last seen, read receipts и вызовы</span></div></div>
      {loading ? <div className="connect-settings-loading"><LoaderCircle className="spin" size={17} /> Загружаем настройки</div> : (
        <>
          <div className="connect-privacy-grid">
            <label><span><Eye size={15} /> Кто видит, что вы в сети</span><select value={privacy.presenceVisibility} onChange={(event) => setPrivacy((current) => ({ ...current, presenceVisibility: event.target.value }))}><option value="everyone">Все на сервере</option><option value="contacts">Только контакты</option><option value="shared_rooms">Участники общих комнат</option><option value="nobody">Никто</option></select></label>
            <label><span><Clock3 size={15} /> Последнее посещение</span><select value={privacy.lastSeenVisibility} onChange={(event) => setPrivacy((current) => ({ ...current, lastSeenVisibility: event.target.value }))}><option value="exact">Точное время</option><option value="approximate">Приблизительно</option><option value="hidden">Скрыто</option></select></label>
            <label><span>Отметки о прочтении</span><select value={privacy.readReceiptsVisibility} onChange={(event) => setPrivacy((current) => ({ ...current, readReceiptsVisibility: event.target.value }))}><option value="everyone">Все на сервере</option><option value="contacts">Только контакты</option><option value="shared_rooms">Участники общих комнат</option><option value="nobody">Никто</option></select></label>
          </div>
          <button type="button" className="server-switch" onClick={savePrivacy} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={15} /> Сохраняем…</> : "Сохранить приватность"}</button>
          <div className="connect-diagnostics" aria-label="Диагностика вызовов">
            <span><Phone size={15} /> WebRTC signaling: <b>{diagnostics?.webrtcSignaling ? "доступен" : "недоступен"}</b></span>
            <span>TURN relay: <b>{diagnostics?.turnConfigured ? "настроен" : "не настроен"}</b></span>
            <small>Диагностика не содержит SDP, IP-кандидаты, токены или идентификаторы пользователей.</small>
          </div>
          <div className="call-history-head"><strong>История вызовов</strong><button type="button" onClick={load} aria-label="Обновить историю"><RefreshCcw size={14} /></button></div>
          <div className="call-history-list">
            {calls.length ? calls.map((item) => <div className="call-history-row" key={item.callId}><Avatar user={item.peer} size="small" /><span><strong>{item.peer?.displayName || "Недоступный пользователь"}</strong><small>{item.direction === "outgoing" ? "Исходящий" : "Входящий"} · {outcomeLabels[item.outcome] || item.outcome} · {formatDuration(item.duration)}</small></span><time dateTime={item.endedAt}>{new Date(item.endedAt).toLocaleString("ru")}</time></div>) : <p className="settings-empty">История вызовов пуста</p>}
          </div>
        </>
      )}
    </section>
  );
}
