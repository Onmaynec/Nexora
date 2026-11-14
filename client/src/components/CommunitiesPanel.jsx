import { useCallback, useEffect, useState } from "react";
import { api, post, patch, remove } from "../api";
import { ChevronLeft, Hash, LockKeyhole, Plus, ShieldCheck, Ticket, UsersRound } from "lucide-react";

const ROOT = "/api/v3/communities";
const perms = (community, name) => community?.permissions?.includes(name);
const errorText = (error) => error?.code === "STATE_CONFLICT"
  ? "Данные изменились. Обновите страницу сообщества."
  : error?.message || "Операция не выполнена.";

export default function CommunitiesPanel({ onBack, showToast }) {
  const [communities, setCommunities] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [community, setCommunity] = useState(null);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [reports, setReports] = useState([]);
  const [invites, setInvites] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshList = useCallback(async () => {
    const result = await api(ROOT + "?limit=50");
    setCommunities(result.communities || []);
    setNextCursor(result.nextCursor || null);
  }, []);

  const load = useCallback(async (id) => {
    if (!id) { setCommunity(null); return; }
    const result = await api(ROOT + "/" + encodeURIComponent(id));
    const item = result.community;
    const prefix = ROOT + "/" + encodeURIComponent(id);
    const jobs = [
      perms(item, "members.moderate") ? api(prefix + "/members") : Promise.resolve({ members: [] }),
      perms(item, "roles.manage") ? api(prefix + "/roles") : Promise.resolve({ roles: [] }),
      perms(item, "reports.manage") ? api(prefix + "/reports") : Promise.resolve({ reports: [] }),
      perms(item, "invites.create") ? api(prefix + "/invites") : Promise.resolve({ invites: [] }),
      perms(item, "reports.manage") ? api(prefix + "/audit") : Promise.resolve({ entries: [] }),
    ];
    const [memberResult, roleResult, reportResult, inviteResult, auditResult] = await Promise.all(jobs);
    setCommunity(item);
    setMembers(memberResult.members || []);
    setRoles(roleResult.roles || []);
    setReports(reportResult.reports || []);
    setInvites(inviteResult.invites || []);
    setAuditEntries(auditResult.entries || []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api(ROOT + "?limit=50");
        if (active) {
          setCommunities(result.communities || []);
          setNextCursor(result.nextCursor || null);
        }
      } catch (failure) {
        if (active) setError(errorText(failure));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!currentId) { setCommunity(null); return; }
    let active = true;
    setError("");
    load(currentId).catch((failure) => {
      if (active) { setError(errorText(failure)); setCommunity(null); }
    });
    return () => { active = false; };
  }, [currentId, load]);

  async function perform(action, successText, options = {}) {
    if (busy) return null;
    setError("");
    setBusy(true);
    try {
      const result = await action();
      await refreshList();
      if (options.id) {
        setCurrentId(options.id);
        await load(options.id);
      } else if (currentId) {
        await load(currentId);
      }
      if (successText) showToast?.(successText);
      return result;
    } catch (failure) {
      setError(errorText(failure));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreCommunities() {
    if (!nextCursor || loadingMore || busy) return;
    setLoadingMore(true);
    setError("");
    try {
      const result = await api(ROOT + "?limit=50&cursor=" + encodeURIComponent(nextCursor));
      setCommunities((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...(result.communities || []).filter((item) => !seen.has(item.id))];
      });
      setNextCursor(result.nextCursor || null);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setLoadingMore(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await perform(() => post(ROOT, {
      name: form.get("name"), description: form.get("description"),
    }), "Сообщество создано");
    if (result?.community?.id) setCurrentId(result.community.id);
  }

  async function join(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await perform(() => post(ROOT + "/join", { code: form.get("code") }), "Вы присоединились к сообществу");
    if (result?.communityId) setCurrentId(result.communityId);
  }

  async function createCategory(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await perform(() => post(ROOT + "/" + currentId + "/categories", { name: form.get("name") }), "Категория создана");
    if (result) event.currentTarget.reset();
  }

  async function createChannel(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await perform(() => post(ROOT + "/" + currentId + "/channels", {
      name: form.get("name"), kind: form.get("kind"),
      isPrivate: form.get("isPrivate") === "on",
      categoryId: form.get("categoryId") || null,
    }), "Канал создан");
    if (result) event.currentTarget.reset();
  }

  async function createInvite(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await perform(() => post(ROOT + "/" + currentId + "/invites", {
      maxUses: Number(form.get("maxUses")), expiresInHours: Number(form.get("expiresInHours")),
    }));
    if (result?.code) setNewCode(result.code);
  }

  async function createRole(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const results = await perform(() => post(ROOT + "/" + currentId + "/roles", {
      name: form.get("name"),
      permissions: form.get("viewPrivate") ? ["channel.view_private"] : [],
    }), "Роль создана");
    if (results) event.currentTarget.reset();
  }

  async function assignRole(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(() => api(ROOT + "/" + currentId + "/members/" + encodeURIComponent(form.get("userId")) + "/roles/" + encodeURIComponent(form.get("roleId")), {
      method: "PUT", body: JSON.stringify({}),
    }), "Роль назначена");
  }

  async function reorder(index, delta) {
    const channels = community?.channels || [];
    const next = index + delta;
    if (next < 0 || next >= channels.length) return;
    const ids = channels.map((channel) => channel.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    await perform(() => patch(ROOT + "/" + currentId + "/channels/order", {
      ids, expectedRevision: community.revision,
    }), "Порядок каналов обновлён");
  }

  async function moderate(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const target = String(fields.get("userId") || "");
    if (!target || !window.confirm("Заблокировать выбранного участника?")) return;
    const result = await perform(() => post(ROOT + "/" + currentId + "/bans/" + encodeURIComponent(target), {
      reason: fields.get("reason"),
    }), "Участник заблокирован");
    if (result) event.currentTarget.reset();
  }

  async function transfer(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const target = String(fields.get("userId") || "");
    if (!target || !window.confirm("Передать владение сообществом? Отменить это действие автоматически нельзя.")) return;
    await perform(() => post(ROOT + "/" + currentId + "/transfer", { userId: target }), "Владение передано");
  }

  async function leave() {
    if (!window.confirm("Покинуть сообщество?")) return;
    const result = await perform(() => post(ROOT + "/" + currentId + "/leave", {}), "Вы покинули сообщество");
    if (result) { setCurrentId(null); setCommunity(null); }
  }

  async function reportAction(reportId, state) {
    await perform(() => patch(ROOT + "/" + currentId + "/reports/" + reportId, { state }), "Жалоба обработана");
  }

  return (
    <div className="section-page communities-page">
      <header className="section-page-head">
        <div>
          <span>COMMUNITIES · EXPERIMENTAL</span>
          <h1>Сообщества</h1>
          <p>Категории, каналы и управление доступом. Общение внутри новых каналов пока не подключено.</p>
        </div>
        <button type="button" className="communities-back" onClick={onBack}><ChevronLeft size={17} /> К комнатам</button>
      </header>

      {error && <p role="alert" className="communities-error">{error}</p>}
      {loading && <p role="status">Загружаем сообщества…</p>}

      <div className="communities-layout">
        <aside className="communities-sidebar">
          <h2>Ваши сообщества</h2>
          {communities.map((item) => (
            <button type="button" key={item.id} aria-current={currentId === item.id ? "page" : undefined}
              className={currentId === item.id ? "selected" : ""}
              onClick={() => { setCurrentId(item.id); setNewCode(""); }}>
              <UsersRound size={17} /><span>{item.name}<small>{item.viewerRole}</small></span>
            </button>
          ))}
          {!communities.length && !loading && <p>Вы пока не вступили ни в одно сообщество.</p>}
          {nextCursor && <button type="button" disabled={loadingMore || busy}
            aria-busy={loadingMore} onClick={loadMoreCommunities}>
            {loadingMore ? "Загружаем…" : "Показать ещё сообщества"}
          </button>}
          <h3>Создать сообщество</h3>
          <form onSubmit={create}>
            <label>Название<input name="name" minLength={2} maxLength={80} required /></label>
            <label>Описание<textarea name="description" maxLength={500} rows={2} /></label>
            <button disabled={busy} type="submit" className="violet-button"><Plus size={16} /> Создать</button>
          </form>
          <h3>Войти по приглашению</h3>
          <form onSubmit={join}>
            <label>Код<input name="code" minLength={30} required autoComplete="off" /></label>
            <button disabled={busy} type="submit"><Ticket size={16} /> Присоединиться</button>
          </form>
        </aside>

        <div className="communities-detail">
          {!community && <div className="communities-empty">Выберите сообщество слева, чтобы просмотреть категории и каналы.</div>}
          {community && <>
            <div className="communities-heading">
              <div><h2>{community.name}</h2><p>{community.description || "Описание не указано"}</p></div>
              <span><ShieldCheck size={15} /> {community.viewerRole} · {community.memberCount} участников</span>
            </div>
            <div className="communities-channel-list">
              <h3>Каналы</h3>
              {community.channels.map((channel, index) => (
                <div className="communities-channel" key={channel.id}>
                  {channel.isPrivate ? <LockKeyhole size={17} /> : <Hash size={17} />}
                  <span><strong>{channel.name}</strong><small>{channel.kind === "announcement" ? "Объявления" : "Текстовый"} · {community.categories.find((cat) => cat.id === channel.categoryId)?.name || "Без категории"}</small></span>
                  {channel.isPrivate && <span>Закрытый</span>}
                  {perms(community, "channel.order") && <div className="communities-order">
                    <button type="button" disabled={busy || index === 0} aria-label={"Поднять " + channel.name} onClick={() => reorder(index, -1)}>↑</button>
                    <button type="button" disabled={busy || index === community.channels.length - 1} aria-label={"Опустить " + channel.name} onClick={() => reorder(index, 1)}>↓</button>
                  </div>}
                </div>
              ))}
              {!community.channels.length && <p>Доступных каналов пока нет.</p>}
            </div>
            {perms(community, "channel.create") && <div className="communities-controls">
              <form onSubmit={createCategory}><h3>Новая категория</h3><label>Название<input required name="name" minLength={2} maxLength={80} /></label>
                <button disabled={busy} type="submit">Добавить категорию</button></form>
              <form onSubmit={createChannel}><h3>Новый канал</h3><label>Название<input required name="name" minLength={2} maxLength={80} /></label>
                <label>Категория<select name="categoryId"><option value="">Без категории</option>{community.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>Тип<select name="kind"><option value="text">Текстовый</option><option value="announcement">Объявления</option></select></label>
                <label className="communities-inline"><input type="checkbox" name="isPrivate" /> Приватный канал</label>
                <button disabled={busy} type="submit">Создать канал</button></form>
            </div>}
            {perms(community, "invites.create") && <section className="communities-manage">
              <h3>Приглашения</h3>
              <form onSubmit={createInvite} className="communities-horizontal">
                <label>Использований<input name="maxUses" type="number" defaultValue="5" min="1" max="100" required /></label>
                <label>Срок, часов<input name="expiresInHours" type="number" defaultValue="24" min="1" max="720" required /></label>
                <button disabled={busy} type="submit">Создать приглашение</button>
              </form>
              {newCode && <div className="communities-code"><label>Новый код — сохраните его сейчас<input readOnly aria-label="Новый код приглашения" value={newCode} /></label>
                <button type="button" onClick={() => navigator.clipboard?.writeText(newCode).catch(() => setError("Скопируйте код вручную."))}>Скопировать</button></div>}
              {invites.map((item) => <div className="communities-invite" key={item.id}><span>{item.uses} из {item.maxUses} · до {new Date(item.expiresAt).toLocaleString("ru-RU")}{item.revokedAt ? " · отозвано" : ""}</span>
                {!item.revokedAt && <button type="button" disabled={busy} onClick={() => perform(() => remove(ROOT + "/" + currentId + "/invites/" + item.id), "Приглашение отозвано")}>Отозвать</button>}</div>)}
            </section>}
            {perms(community, "roles.manage") && <section className="communities-manage">
              <h3>Роли</h3>
              <form className="communities-horizontal" onSubmit={createRole}><label>Название<input name="name" minLength={2} maxLength={80} required /></label>
                <label className="communities-inline"><input type="checkbox" name="viewPrivate" /> Доступ к приватным каналам</label>
                <button disabled={busy} type="submit">Создать роль</button></form>
              {roles.length > 0 && <form className="communities-horizontal" onSubmit={assignRole}>
                <label>Участник<select name="userId">{members.filter((item) => item.role !== "owner").map((item) => <option key={item.userId} value={item.userId}>{item.userId}</option>)}</select></label>
                <label>Роль<select name="roleId">{roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <button disabled={busy || !members.some((item) => item.role !== "owner")} type="submit">Назначить</button>
              </form>}
            </section>}
            {perms(community, "members.moderate") && <section className="communities-manage">
              <h3>Участники и модерация</h3>
              <p>{members.length} участников в текущем списке. Владелец и защищённые модераторы недоступны для блокировки.</p>
              <form className="communities-horizontal" onSubmit={moderate}>
                <label>Участник<select name="userId">{members.filter((item) => item.userId !== community.ownerId).map((item) => <option key={item.userId} value={item.userId}>{item.userId} ({item.role})</option>)}</select></label>
                <label>Причина<input name="reason" required minLength={2} maxLength={240} /></label>
                <button type="submit" disabled={busy || members.length <= 1}>Заблокировать</button>
              </form>
              {community.viewerRole === "owner" && <form className="communities-horizontal" onSubmit={transfer}>
                <label>Новый владелец<select name="userId">{members.filter((item) => item.userId !== community.ownerId).map((item) => <option key={item.userId} value={item.userId}>{item.userId}</option>)}</select></label>
                <button type="submit" disabled={busy || members.length <= 1}>Передать владение</button>
              </form>}
            </section>}
            {community.viewerRole !== "owner" && <button type="button" disabled={busy} className="communities-leave" onClick={leave}>Покинуть сообщество</button>}
            {perms(community, "reports.manage") && <section className="communities-manage">
              <h3>Жалобы</h3>
              {reports.filter((item) => item.state === "open").map((item) => <div className="communities-report" key={item.id}>
                <div><strong>{item.reason}</strong><small>На участника: {item.targetId}</small></div>
                <button type="button" disabled={busy} onClick={() => reportAction(item.id, "resolved")}>Закрыть</button>
                <button type="button" disabled={busy} onClick={() => reportAction(item.id, "rejected")}>Отклонить</button>
              </div>)}
              {!reports.some((item) => item.state === "open") && <p>Новых жалоб нет.</p>}
              <h3>Журнал действий</h3>
              {auditEntries.slice(0, 20).map((item, index) => <p className="communities-audit" key={item.createdAt + index}>{item.action} · {new Date(item.createdAt).toLocaleString("ru-RU")}</p>)}
            </section>}
          </>}
        </div>
      </div>
    </div>
  );
}
