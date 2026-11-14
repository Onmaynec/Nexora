import { useCallback, useEffect, useState } from "react";
import { api, post, patch, put } from "../api";
import { CalendarDays, Compass, ShieldCheck, UserCheck, UsersRound } from "lucide-react";

const ROOT = "/api/v3/communities";
const errorText = (failure) => failure?.message || "Операция не выполнена.";

export function CommunityDiscovery({ showToast, onRefresh }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState({});

  const search = useCallback(async (text = "", append = false, next = null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: text, limit: "15" });
      if (next) params.set("cursor", next);
      const response = await api(ROOT + "/discovery/search?" + params);
      setResults((items) => {
        if (!append) return response.communities || [];
        const seen = new Set(items.map((item) => item.id));
        return [...items, ...(response.communities || []).filter((item) => !seen.has(item.id))];
      });
      setCursor(response.nextCursor || null);
    } catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { search(); }, [search]);

  async function requestAccess(item) {
    setBusy(true);
    setError("");
    try {
      await post(ROOT + "/" + encodeURIComponent(item.id) + "/hub/join-requests", {});
      setRequested((existing) => ({ ...existing, [item.id]: true }));
      showToast?.("Заявка на вступление отправлена");
      onRefresh?.();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return <section className="community-discovery" aria-label="Поиск сообществ">
    <h3><Compass size={16} /> Открытые сообщества</h3>
    <form onSubmit={(event) => { event.preventDefault(); search(query); }}>
      <label htmlFor="community-discovery-search">Найти сообщество</label>
      <input id="community-discovery-search" placeholder="Название или описание"
        maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} />
      <button disabled={loading} type="submit">Искать</button>
    </form>
    {error && <p role="alert" className="communities-error">{error}</p>}
    {loading && <p role="status">Ищем сообщества…</p>}
    <div className="community-discovery-results">
      {results.map((item) => <article key={item.id} className="community-discovery-result">
        <strong>{item.name}</strong>
        <small><UsersRound size={13} /> {item.memberCount} участников</small>
        {item.description && <p>{item.description}</p>}
        <button type="button" disabled={busy || requested[item.id]} onClick={() => requestAccess(item)}>
          {requested[item.id] ? "Заявка отправлена" : "Подать заявку"}
        </button>
      </article>)}
      {!results.length && !loading && <p className="communities-hint">Нет доступных сообществ. Можно вступить по приглашению.</p>}
      {cursor && <button type="button" disabled={loading} onClick={() => search(query, true, cursor)}>Показать ещё</button>}
    </div>
  </section>;
}

export function CommunityHubExtras({ community, showToast, onRefresh }) {
  const base = ROOT + "/" + encodeURIComponent(community.id) + "/hub";
  const canModerate = community.permissions?.includes("members.moderate");
  const canManageEvents = community.permissions?.includes("events.manage");
  const [hub, setHub] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventCursor, setEventCursor] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestCursor, setRequestCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const tasks = [
      api(base),
      api(base + "/events?limit=20"),
      canModerate ? api(base + "/join-requests?limit=20") : Promise.resolve({ requests: [], nextCursor: null }),
    ];
    const [settings, calendar, requests] = await Promise.all(tasks);
    setHub(settings.hub);
    setEvents(calendar.events || []);
    setEventCursor(calendar.nextCursor || null);
    setJoinRequests(requests.requests || []);
    setRequestCursor(requests.nextCursor || null);
  }, [base, canModerate]);

  useEffect(() => {
    let active = true;
    (async () => {
      try { await refresh(); }
      catch (failure) { if (active) setError(errorText(failure)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [refresh]);

  async function action(fn, success) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (onRefresh) await onRefresh();
      if (success) showToast?.(success);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function saveHub(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action(() => patch(base, {
      rulesText: data.get("rulesText") || "",
      discoverable: data.get("discoverable") === "on",
    }), "Правила и видимость сохранены");
  }

  async function createEvent(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await action(() => post(base + "/events", {
      title: data.get("title"),
      description: data.get("description") || "",
      startsAt: new Date(String(data.get("startsAt"))).toISOString(),
      endsAt: new Date(String(data.get("endsAt"))).toISOString(),
    }), "Событие добавлено");
  }

  async function loadMoreEvents() {
    if (!eventCursor || busy) return;
    setBusy(true);
    try {
      const response = await api(base + "/events?limit=20&cursor=" + encodeURIComponent(eventCursor));
      setEvents((items) => {
        const seen = new Set(items.map((item) => item.id));
        return [...items, ...(response.events || []).filter((item) => !seen.has(item.id))];
      });
      setEventCursor(response.nextCursor || null);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function loadMoreRequests() {
    if (!requestCursor || busy) return;
    setBusy(true);
    try {
      const response = await api(base + "/join-requests?limit=20&cursor=" + encodeURIComponent(requestCursor));
      setJoinRequests((items) => {
        const seen = new Set(items.map((item) => item.userId));
        return [...items, ...(response.requests || []).filter((item) => !seen.has(item.userId))];
      });
      setRequestCursor(response.nextCursor || null);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return <section className="communities-hub" aria-label="Управление сообществом">
    <h3><ShieldCheck size={16} /> Правила и вступление</h3>
    {error && <p role="alert" className="communities-error">{error}</p>}
    {loading && <p role="status">Загрузка правил и событий…</p>}
    {hub && <>
      {hub.rulesText
        ? <div className="communities-rules"><p>{hub.rulesText}</p>
          <small>Редакция {hub.rulesVersion} · {hub.requiresAcceptance ? "Нужно принять правила" : "Правила приняты"}</small>
        </div> : <p className="communities-hint">Правила ещё не опубликованы.</p>}
      {hub.requiresAcceptance && <button type="button" disabled={busy} onClick={() =>
        action(() => post(base + "/rules/accept", { version: hub.rulesVersion }), "Правила приняты")}>
        <UserCheck size={16} /> Принять правила
      </button>}
      {hub.canEdit && <form className="communities-hub-form" key={hub.rulesVersion + ":" + hub.discoverable} onSubmit={saveHub}>
        <label>Правила сообщества<textarea name="rulesText" rows={4} maxLength={3000} defaultValue={hub.rulesText}
          placeholder="Опишите правила общения и поведения" /></label>
        <label className="communities-inline"><input type="checkbox" name="discoverable" defaultChecked={hub.discoverable} />
          Показывать сообщество в каталоге сервера</label>
        <button disabled={busy} type="submit">Сохранить настройки</button>
      </form>}
    </>}
    {canModerate && <div className="communities-join-requests">
      <h3><UsersRound size={16} /> Заявки на вступление</h3>
      {joinRequests.map((entry) => <div className="communities-join-request" key={entry.userId}>
        <span><strong>{entry.userId.slice(0, 8)}</strong><small>{new Date(entry.createdAt).toLocaleString("ru-RU")}</small></span>
        <button type="button" disabled={busy} onClick={() => action(() =>
          patch(base + "/join-requests/" + encodeURIComponent(entry.userId), { decision: "approve" }), "Заявка одобрена")}>Принять</button>
        <button type="button" disabled={busy} onClick={() => action(() =>
          patch(base + "/join-requests/" + encodeURIComponent(entry.userId), { decision: "reject" }), "Заявка отклонена")}>Отклонить</button>
      </div>)}
      {!joinRequests.length && !loading && <p className="communities-hint">Новых заявок нет.</p>}
      {requestCursor && <button disabled={busy} type="button" onClick={loadMoreRequests}>Показать следующие заявки</button>}
    </div>}

    <div className="communities-calendar">
      <h3><CalendarDays size={16} /> События сообщества</h3>
      {canManageEvents && <form className="communities-hub-form" onSubmit={createEvent}>
        <label>Название события<input name="title" minLength={2} maxLength={120} required placeholder="Встреча участников" /></label>
        <label>Описание<textarea name="description" maxLength={1000} rows={2} /></label>
        <div className="communities-event-dates">
          <label>Начало<input name="startsAt" type="datetime-local" required /></label>
          <label>Окончание<input name="endsAt" type="datetime-local" required /></label>
        </div>
        <button disabled={busy} type="submit">Добавить событие</button>
      </form>}
      {events.map((item) => <article className="communities-event" key={item.id}>
        <div><strong>{item.title}</strong>
          <small>{new Date(item.startsAt).toLocaleString("ru-RU")} — {new Date(item.endsAt).toLocaleString("ru-RU")}</small>
          {item.description && <p>{item.description}</p>}
          <small>{item.goingCount} участвуют · {item.interestedCount} интересуются
            {item.status === "cancelled" && " · отменено"}</small>
        </div>
        {item.status === "scheduled" && <div className="communities-event-actions">
          {[["going", "Буду"], ["interested", "Интересно"], ["declined", "Не пойду"]].map(([value, label]) =>
            <button key={value} type="button" disabled={busy} aria-pressed={item.myRsvp === value}
              onClick={() => action(() => put(base + "/events/" + encodeURIComponent(item.id) + "/rsvp",
                { status: value }), "Участие обновлено")}>{label}</button>)}
          {canManageEvents && <button type="button" disabled={busy}
            onClick={() => action(() => patch(base + "/events/" + encodeURIComponent(item.id),
              { status: "cancelled" }), "Событие отменено")}>Отменить</button>}
        </div>}
      </article>)}
      {!events.length && !loading && <p className="communities-hint">Предстоящих событий пока нет.</p>}
      {eventCursor && <button type="button" disabled={busy} onClick={loadMoreEvents}>Показать следующие события</button>}
    </div>
  </section>;
}
