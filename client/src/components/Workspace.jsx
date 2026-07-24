import { useEffect, useState } from "react";
import {
  Archive, ArchiveRestore, AtSign, Ban, BellOff, Check, ChevronRight, CirclePlus, Clock3, Copy, Crown, FileArchive,
  FileImage, Files, Gavel, Hash, History, Image, KeyRound, LockKeyhole, Menu,
  MessageCircleMore, Mic, MoreHorizontal, Pin, Plus, RefreshCcw, Search, Settings2, ShieldBan, Sparkles,
  ShieldCheck, UserMinus, UserPlus, UsersRound, X,
} from "lucide-react";
import { api, patch, post, remove } from "../api";
import HoverDock from "./HoverDock";
import GlobalSearch from "./GlobalSearch";
import LegacySecureHistoryPane from "./LegacySecureHistoryPane";
import MessagePane from "./MessagePane";
import NotificationsPage from "./NotificationsPage";
import PulsePage from "./PulsePage";
import AccountSettingsPage from "./SettingsPage";
import UserProfileModal from "./UserProfileModal";
import { Avatar, EmptyState, formatBytes, formatTime, NexoraLogo } from "./ui";

function lastMessageLabel(message) {
  if (!message) return "Нет сообщений";
  if (message.type === "deleted") return "Сообщение удалено";
  if (message.type === "image") return "Изображение";
  if (message.type === "voice") return "Голосовое сообщение";
  if (message.type === "file") return "Файл";
  if (message.type === "encrypted") return "Legacy secure history · только чтение";
  return message.text;
}

function ConversationList({ conversations, drafts = [], activeId, onOpen, onOpenProfile, onSetting, userId }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [menuId, setMenuId] = useState(null);
  const serverDraftIds = new Set((drafts || []).map((draft) => draft.conversationId));
  useEffect(() => { const close = () => setMenuId(null); window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close); }, []);
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0);
  const filtered = conversations.filter((conversation) => {
    const matchesQuery = `${conversation.title} ${conversation.subtitle}`.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "archive") return conversation.notificationSettings?.archived;
    if (conversation.notificationSettings?.archived) return false;
    if (filter === "unread") return conversation.unreadCount > 0;
    if (filter === "personal") return conversation.type === "dm";
    if (filter === "rooms") return conversation.type === "room";
    return true;
  });
  return (
    <>
      <div className="rail-heading"><div><span>INBOX</span><h2>Сообщения</h2></div>{unreadTotal > 0 && <b>{unreadTotal}</b>}</div>
      <label className="rail-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти чат" /></label>
      <div className="conversation-filters" role="tablist" aria-label="Фильтр чатов">{[
        ["all", "Все"], ["unread", "Новые"], ["personal", "Личные"], ["rooms", "Комнаты"], ["archive", "Архив"],
      ].map(([id, label]) => <button type="button" role="tab" aria-selected={filter === id} className={filter === id ? "active" : ""} key={id} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <div className="conversation-list">
        {filtered.map((conversation) => {
          const draft = serverDraftIds.has(conversation.id);
          return (
          <div key={conversation.id} className={`conversation-card${conversation.id === activeId ? " active" : ""}${conversation.notificationSettings?.pinned ? " pinned" : ""}`}>
            <button type="button" className="conversation-open" onClick={() => onOpen(conversation.id)}>
              <Avatar user={conversation.peer ?? conversation} online={conversation.online} onClick={conversation.type === "dm" ? (event) => { event.stopPropagation(); onOpenProfile(conversation.peer); } : undefined} />
              <span className="conversation-copy">
                <span><strong>{conversation.notificationSettings?.pinned && <Pin size={11} fill="currentColor" />}{conversation.title}</strong><time>{formatTime(conversation.updatedAt)}</time></span>
                <small className={draft ? "draft-label" : ""}>{draft ? "Черновик" : lastMessageLabel(conversation.lastMessage)}</small>
              </span>
              {conversation.unreadCount > 0 && <b className="unread-badge">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</b>}
            </button>
            <button type="button" className="conversation-menu-trigger" aria-expanded={menuId === conversation.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setMenuId((current) => current === conversation.id ? null : conversation.id); }} title="Действия с чатом"><MoreHorizontal size={15} /></button>
            {menuId === conversation.id && <div className="conversation-menu" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => { setMenuId(null); onSetting(conversation, { pinned: !conversation.notificationSettings?.pinned }, conversation.notificationSettings?.pinned ? "Чат откреплён" : "Чат закреплён"); }}><Pin size={14} />{conversation.notificationSettings?.pinned ? "Открепить" : "Закрепить"}</button>
              <button type="button" onClick={() => { setMenuId(null); onSetting(conversation, { muted: !conversation.notificationSettings?.muted }, conversation.notificationSettings?.muted ? "Уведомления включены" : "Уведомления отключены"); }}><BellOff size={14} />{conversation.notificationSettings?.muted ? "Включить звук" : "Без уведомлений"}</button>
              <button type="button" onClick={() => { setMenuId(null); onSetting(conversation, { archived: !conversation.notificationSettings?.archived }, conversation.notificationSettings?.archived ? "Чат возвращён" : "Чат перенесён в архив"); }}>{conversation.notificationSettings?.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{conversation.notificationSettings?.archived ? "Вернуть из архива" : "В архив"}</button>
            </div>}
          </div>
          );
        })}
        {!filtered.length && <p className="rail-empty">Чаты не найдены</p>}
      </div>
    </>
  );
}

function RoomsRail({ rooms, onOpen, onCreate, onJoinCode }) {
  return (
    <>
      <div className="rail-heading"><div><span>SPACES</span><h2>Комнаты</h2></div><button type="button" onClick={onCreate}><Plus size={17} /></button></div>
      <button type="button" className="rail-primary-action" onClick={onJoinCode}><LockKeyhole size={16} /> Войти по коду</button>
      <div className="room-rail-list">
        {rooms.map((room) => (
          <button key={room.id} type="button" onClick={() => onOpen(room)}>
            <span className="room-symbol">{room.privacy === "private" ? <LockKeyhole size={16} /> : <Hash size={17} />}</span>
            <span><strong>{room.name}</strong><small>{room.memberCount} участников</small></span>
            {room.joined && <Check size={15} className="joined-check" />}
          </button>
        ))}
      </div>
    </>
  );
}

function RoomsOverview({ rooms, onJoin, onOpen, onCreate, onAppeal }) {
  return (
    <div className="section-page">
      <header className="section-page-head"><div><span>PUBLIC & PRIVATE</span><h1>Пространства команды</h1><p>Создавайте открытые обсуждения или приватные комнаты по приглашению.</p></div><button className="violet-button" type="button" onClick={onCreate}><CirclePlus size={18} /> Новая комната</button></header>
      <div className="room-grid">
        {rooms.map((room) => (
          <article key={room.id} className="room-card">
            <div className="room-card-icon">{room.privacy === "private" ? <LockKeyhole /> : <Hash />}</div>
            <div className="privacy-pill">{room.privacy === "private" ? "PRIVATE" : "PUBLIC"}</div>
            <h3>{room.name}</h3>
            <p>Владелец: {room.owner?.displayName ?? "—"}</p>
            <div className="room-card-stats"><span><UsersRound size={14} /> {room.memberCount}</span><span className="online-copy">{room.onlineCount} онлайн</span></div>
            <button type="button" disabled={room.joinRequestStatus === "pending"} onClick={() => room.banned ? onAppeal(room) : room.joined ? onOpen(room) : onJoin(room)}>{room.joined ? "Открыть" : room.banned ? "Подать апелляцию" : room.joinRequestStatus === "pending" ? "Заявка отправлена" : room.privacy === "private" ? "Нужен код" : room.joinPolicy === "request" ? "Подать заявку" : "Присоединиться"}<ChevronRight size={16} /></button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ContactsRail({ contacts, requests, onOpen, onOpenProfile, onAccept, onReject }) {
  const incoming = requests.filter((request) => request.direction === "incoming");
  return (
    <>
      <div className="rail-heading"><div><span>NETWORK</span><h2>Контакты</h2></div>{incoming.length > 0 && <b>{incoming.length}</b>}</div>
      {incoming.length > 0 && <h3 className="rail-subtitle">Заявки</h3>}
      {incoming.map((request) => (
        <div key={request.id} className="request-card">
          <Avatar user={request.user} size="small" onClick={() => onOpenProfile(request.user)} />
          <span><strong>{request.user.displayName}</strong><small>@{request.user.username}</small></span>
          <button type="button" className="accept" onClick={() => onAccept(request)}><Check size={15} /></button>
          <button type="button" onClick={() => onReject(request)}><X size={15} /></button>
        </div>
      ))}
      <h3 className="rail-subtitle">Ваши контакты</h3>
      <div className="contact-list">
        {contacts.map((contact) => (
          <button key={contact.id} type="button" onClick={() => onOpen(contact.conversationId)}>
            <Avatar user={contact} size="small" online={contact.online} onClick={(event) => { event.stopPropagation(); onOpenProfile(contact); }} />
            <span><strong>{contact.displayName}</strong><small>@{contact.username}</small></span>
            <MessageCircleMore size={16} />
          </button>
        ))}
        {!contacts.length && <p className="rail-empty">Пока нет контактов</p>}
      </div>
    </>
  );
}

function ContactSearch({ onRequest, onBlock, onOpenProfile, showToast }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  async function search(event) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      setResults(result.users);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-page contact-search-page">
      <header className="section-page-head"><div><span>DISCOVERY</span><h1>Найти человека</h1><p>Поиск работает по отображаемому имени и точному @username внутри этого сервера.</p></div></header>
      <form className="people-search" onSubmit={search}><AtSign size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="username или имя" /><button type="submit" disabled={busy}>{busy ? "Ищем…" : "Найти"}</button></form>
      <div className="people-results">
        {results.map((user) => (
          <article key={user.id}>
            <Avatar user={user} onClick={() => onOpenProfile(user)} />
            <div><strong>{user.displayName}</strong><span>@{user.username}</span></div>
            <div className="people-actions">
              {user.contact ? <span className="relation-state"><Check size={15} /> В контактах</span>
                : user.requestDirection ? <span className="relation-state">{user.requestDirection === "outgoing" ? "Заявка отправлена" : "Входящая заявка"}</span>
                  : user.blockedByMe ? <span className="relation-state">Заблокирован</span>
                    : <button type="button" className="violet-button small" onClick={() => onRequest(user)}><UserPlus size={16} /> Добавить</button>}
              {!user.blockedByMe && <button type="button" className="ghost-danger" onClick={() => onBlock(user)}><ShieldBan size={16} /> Блокировать</button>}
            </div>
          </article>
        ))}
        {!busy && query && !results.length && <EmptyState icon={Search} title="Никого не нашли" description="Проверьте написание username или попробуйте часть имени." />}
      </div>
    </div>
  );
}

function FilesPage({ files }) {
  return (
    <div className="section-page">
      <header className="section-page-head"><div><span>STORAGE</span><h1>Все вложения</h1><p>Файлы из доступных вам личных чатов и комнат.</p></div><div className="storage-total"><Files size={18} /><span>{files.length} файлов</span><strong>{formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</strong></div></header>
      {files.length ? <div className="file-grid">{files.map((file) => (
        <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="file-card">
          <span className="file-card-preview">{file.kind === "image" ? <img src={file.url} alt="" loading="lazy" /> : file.kind === "voice" ? <span className="audio-orb">◉</span> : <FileArchive size={26} />}</span>
          <span><strong>{file.name}</strong><small>{file.uploader?.displayName} · {formatBytes(file.size)}</small></span>
        </a>
      ))}</div> : <EmptyState icon={Files} title="Вложений пока нет" description="Изображения, голосовые и документы появятся здесь после отправки." />}
    </div>
  );
}

const auditLabels = {
  "room.created": "Комната создана",
  "room.settings_updated": "Настройки комнаты изменены",
  "member.joined": "Участник присоединился",
  "member.left": "Участник покинул комнату",
  "member.removed": "Участник удалён",
  "member.banned": "Участник заблокирован",
  "member.unbanned": "Блокировка снята",
  "moderator.assigned": "Назначен модератор",
  "moderator.removed": "Снят модератор",
  "owner.transferred": "Передано владение",
  "invite.rotated": "Код приглашения обновлён",
  "invite.revoked": "Код приглашения отозван",
  "join.requested": "Запрошено вступление",
  "join.accepted": "Заявка принята",
  "join.rejected": "Заявка отклонена",
};

function DetailsDrawer({ conversation, me, onClose, onOpenProfile, onRemoveContact, onBlock, onAction, showToast }) {
  const [tab, setTab] = useState("details");
  const [media, setMedia] = useState([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [integrations, setIntegrations] = useState(null);
  const [integrationBusy, setIntegrationBusy] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState(null);
  if (!conversation) return null;
  const canModerate = Boolean(conversation.permissions?.canModerate);
  const canManage = Boolean(conversation.permissions?.canManage);
  const canConfigure = Boolean(conversation.permissions?.canConfigure);
  const canManageMembers = Boolean(conversation.permissions?.canManageMembers);
  const canManageReports = Boolean(conversation.permissions?.canManageReports);
  const ownMembership = conversation.type === "room" ? conversation.members?.find((member) => member.id === me.id) : null;
  const restricted = Boolean(ownMembership?.restrictedUntil && Date.parse(ownMembership.restrictedUntil) > Date.now());
  async function copy(value, message) {
    await navigator.clipboard.writeText(value);
    showToast(message);
  }
  async function loadMedia() {
    setTab("media");
    if (media.length || mediaBusy) return;
    setMediaBusy(true);
    try { setMedia((await api(`/api/conversations/${conversation.id}/media`)).media); }
    catch (error) { showToast(error.message, "error"); }
    finally { setMediaBusy(false); }
  }
  async function loadIntegrations() {
    setTab("integrations");
    setIntegrationBusy(true);
    try { setIntegrations(await api(`/api/rooms/${conversation.roomId}/integrations`)); }
    catch (error) { showToast(error.message, "error"); }
    finally { setIntegrationBusy(false); }
  }
  async function saveRoom(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onAction(() => patch(`/api/rooms/${conversation.roomId}`, {
      name: form.get("name"),
      description: form.get("description"),
      rules: form.get("rules"),
      readOnly: form.get("readOnly") === "on",
      allowFiles: form.get("allowFiles") === "on",
      allowImages: form.get("allowImages") === "on",
      allowVoice: form.get("allowVoice") === "on",
      announcementOnly: form.get("announcementOnly") === "on",
      preapproveMessages: form.get("preapproveMessages") === "on",
      slowModeSeconds: Number(form.get("slowModeSeconds") || 0),
      joinPolicy: form.get("joinPolicy"),
    }), "Настройки комнаты сохранены");
  }
  async function rotateInvite(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onAction(() => post(`/api/rooms/${conversation.roomId}/invites`, {
      label: form.get("label"),
      expiresInHours: Number(form.get("expiresInHours") || 0),
      maxUses: Number(form.get("maxUses") || 0),
    }), "Приглашение создано");
  }
  async function createRole(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await onAction(() => post(`/api/rooms/${conversation.roomId}/roles`, {
      name: form.get("name"), color: form.get("color"), permissions: form.getAll("permission"),
    }), "Роль создана");
    if (result) event.currentTarget.reset();
  }
  async function assignRole(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const member = conversation.members.find((item) => item.id === form.get("userId"));
    const roleId = String(form.get("roleId") || "");
    if (!member || !roleId) return;
    const roles = new Set(member.customRoleIds ?? []);
    if (form.get("action") === "remove") roles.delete(roleId); else roles.add(roleId);
    await onAction(() => patch(`/api/rooms/${conversation.roomId}/members/${member.id}/custom-roles`, { roleIds: [...roles] }), "Роли участника обновлены");
  }
  async function createCategory(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await onAction(() => post(`/api/rooms/${conversation.roomId}/categories`, { name: form.get("name") }), "Категория назначена");
    if (result) event.currentTarget.reset();
  }
  async function createBot(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await onAction(() => post(`/api/rooms/${conversation.roomId}/bots`, { displayName: form.get("displayName"), username: form.get("username"), description: form.get("description") }), "Бот создан");
    if (result) { event.currentTarget.reset(); await loadIntegrations(); }
  }
  async function createBotToken(bot) {
    const result = await onAction(() => post(`/api/bots/${bot.id}/tokens`, { name: "Room token", scopes: ["messages:write"] }), "Токен создан");
    if (result?.token?.value) { setOneTimeSecret({ title: `Токен ${bot.user?.displayName ?? "бота"}`, value: result.token.value }); await loadIntegrations(); }
  }
  async function createWebhook(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await onAction(() => post(`/api/rooms/${conversation.roomId}/webhooks`, { name: form.get("name"), url: form.get("url"), events: form.getAll("event") }), "Webhook создан");
    if (result?.signingSecret) { setOneTimeSecret({ title: "Webhook signing secret", value: result.signingSecret }); event.currentTarget.reset(); await loadIntegrations(); }
  }
  return (
    <aside className="details-drawer">
      <header><span>DETAILS</span><button type="button" onClick={onClose}><X size={18} /></button></header>
      <div className="details-hero"><Avatar user={conversation.peer ?? conversation} size="large" online={conversation.online} onClick={conversation.peer ? () => onOpenProfile(conversation.peer) : undefined} /><h2>{conversation.title}</h2><span>{conversation.subtitle}</span>{conversation.peer?.status && <p>{conversation.peer.status}</p>}</div>
      <nav className="drawer-tabs"><button type="button" className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Обзор</button><button type="button" className={tab === "media" ? "active" : ""} onClick={loadMedia}>Медиа</button>{conversation.type === "room" && canModerate && <button type="button" className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>Управление</button>}{conversation.type === "room" && canManage && <button type="button" className={tab === "integrations" ? "active" : ""} onClick={loadIntegrations}>Интеграции</button>}</nav>

      {tab === "details" && <>
        {restricted && <section><h3><Gavel size={14} /> Временное ограничение</h3><p className="details-empty">До {new Date(ownMembership.restrictedUntil).toLocaleString("ru")}</p><button type="button" className="server-switch" onClick={async () => { const reason = window.prompt("Обоснование апелляции (не менее 10 символов)"); if (reason) await onAction(() => post(`/api/rooms/${conversation.roomId}/appeals`, { reason }), "Апелляция отправлена"); }}>Подать апелляцию</button></section>}
        {conversation.inviteCode && <section><h3>Код приглашения</h3><button type="button" className="invite-code" onClick={() => copy(conversation.inviteCode, "Код приглашения скопирован")}><code>{conversation.inviteCode}</code><Copy size={15} /></button>{conversation.inviteExpiresAt && <p className="details-empty">Действует до {new Date(conversation.inviteExpiresAt).toLocaleString("ru")}</p>}{conversation.inviteMaxUses > 0 && <p className="details-empty">Использовано {conversation.inviteUseCount} из {conversation.inviteMaxUses}</p>}</section>}
        <section><h3>Закреплённые · {conversation.pinned?.length ?? 0}</h3>{conversation.pinned?.length ? conversation.pinned.map((message) => <button type="button" className="pinned-row" key={message.id} onClick={() => document.querySelector(`#message-${CSS.escape(message.id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Pin size={14} /><span>{message.text || message.file?.name || "Вложение"}</span></button>) : <p className="details-empty">Нет закреплённых сообщений</p>}</section>
        {conversation.type === "room" && <section><h3>Участники · {conversation.members.length}</h3><div className="member-list">{conversation.members.map((member) => <div key={member.id}><Avatar user={member} size="tiny" online={member.online} onClick={() => onOpenProfile(member)} /><span><strong>{member.displayName}</strong><small>@{member.username} · {member.roomRole === "moderator" ? "модератор" : member.roomRole === "owner" ? "владелец" : "участник"}{member.restrictedUntil && Date.parse(member.restrictedUntil) > Date.now() ? ` · ограничен до ${new Date(member.restrictedUntil).toLocaleString("ru")}` : ""}</small></span>{member.roomRole === "owner" ? <Crown size={15} className="owner-crown" /> : canManageMembers && member.id !== me.id ? <span className="member-actions">{canManage && <button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/members/${member.id}/role`, { role: member.roomRole === "moderator" ? "member" : "moderator" }), member.roomRole === "moderator" ? "Модератор снят" : "Модератор назначен")} title={member.roomRole === "moderator" ? "Снять модератора" : "Назначить модератором"}><Gavel size={14} /></button>}{canManage && <button type="button" onClick={() => window.confirm(`Передать владение ${member.displayName}?`) && onAction(() => post(`/api/rooms/${conversation.roomId}/transfer`, { userId: member.id }), "Владение передано")} title="Передать владение"><Crown size={14} /></button>}<button type="button" onClick={() => { const minutes = window.prompt("Ограничить отправку на сколько минут? 0 — снять", "60"); if (minutes != null) onAction(() => patch(`/api/rooms/${conversation.roomId}/members/${member.id}/restriction`, { minutes: Number(minutes) }), Number(minutes) > 0 ? "Ограничение установлено" : "Ограничение снято"); }} title="Временное ограничение"><Clock3 size={14} /></button><button type="button" onClick={() => window.confirm(`Удалить ${member.displayName} из комнаты?`) && onAction(() => remove(`/api/rooms/${conversation.roomId}/members/${member.id}`), `${member.displayName} удалён`)} title="Удалить"><UserMinus size={14} /></button><button type="button" className="danger" onClick={() => window.confirm(`Заблокировать ${member.displayName} в этой комнате?`) && onAction(() => post(`/api/rooms/${conversation.roomId}/bans/${member.id}`, { reason: "" }), `${member.displayName} заблокирован`)} title="Заблокировать в комнате"><Ban size={14} /></button></span> : null}</div>)}</div></section>}
        {conversation.type === "room" && conversation.viewerRole !== "owner" && <section className="drawer-contact-actions"><button type="button" className="drawer-danger" onClick={() => window.confirm("Покинуть комнату?") && onAction(() => post(`/api/rooms/${conversation.roomId}/leave`), "Вы покинули комнату").then(onClose)}><UserMinus size={16} /> Покинуть комнату</button></section>}
        {conversation.type === "dm" && conversation.peer && <section className="drawer-contact-actions">{conversation.isContact && <button type="button" onClick={() => onRemoveContact(conversation.peer)}><UserMinus size={16} /> Удалить из контактов</button>}<button type="button" className="drawer-danger" onClick={() => onBlock(conversation.peer)}><ShieldBan size={16} /> Заблокировать пользователя</button></section>}
      </>}

      {tab === "media" && <section className="drawer-media"><h3>Медиа и файлы</h3>{mediaBusy ? <p className="details-empty">Загружаем…</p> : media.length ? <div>{media.map((message) => <a key={message.id} href={message.file?.url} target="_blank" rel="noreferrer">{message.type === "image" ? <img src={message.file.thumbnailUrl || message.file.url} alt={message.file.name} /> : message.type === "voice" ? <Mic size={19} /> : <FileArchive size={19} />}<span><strong>{message.file?.name}</strong><small>{formatBytes(message.file?.size)}</small></span></a>)}</div> : <p className="details-empty">В этом чате пока нет вложений</p>}</section>}

      {tab === "integrations" && conversation.type === "room" && canManage && <>
        {oneTimeSecret && <section><h3><KeyRound size={14} /> {oneTimeSecret.title}</h3><p className="details-empty">Показывается один раз. Сохраните в secret manager.</p><button type="button" className="invite-code" onClick={() => copy(oneTimeSecret.value, "Secret скопирован")}><code>{oneTimeSecret.value}</code><Copy size={14} /></button><button type="button" onClick={() => setOneTimeSecret(null)}>Скрыть</button></section>}
        <section><h3><Sparkles size={14} /> Боты</h3><form className="drawer-form" onSubmit={createBot}><label>Имя<input name="displayName" minLength={2} maxLength={48} required /></label><label>Username<input name="username" minLength={3} maxLength={24} placeholder="build_bot" /></label><label>Описание<input name="description" maxLength={240} /></label><button type="submit">Создать бота</button></form>{integrationBusy ? <p className="details-empty">Загружаем…</p> : integrations?.bots?.map((bot) => <div className="invite-management-row" key={bot.id}><span><strong>{bot.user?.displayName}</strong><small>@{bot.user?.username} · токенов {bot.tokens?.filter((token) => !token.revokedAt).length ?? 0}</small></span><button type="button" onClick={() => createBotToken(bot)}><KeyRound size={14} /></button><button type="button" className="danger" onClick={async () => { await onAction(() => remove(`/api/rooms/${conversation.roomId}/bots/${bot.id}`), "Бот отключён"); await loadIntegrations(); }}><X size={14} /></button></div>)}</section>
        <section><h3><RefreshCcw size={14} /> Outgoing webhooks</h3><form className="drawer-form" onSubmit={createWebhook}><label>Название<input name="name" maxLength={80} defaultValue="Notifications" /></label><label>Публичный HTTPS URL<input name="url" type="url" pattern="https://.*" required /></label>{[["message.created", "Новое сообщение"], ["poll.created", "Новый опрос"], ["message.edited", "Редактирование"]].map(([value, label]) => <label className="check-row" key={value}><input type="checkbox" name="event" value={value} defaultChecked={value === "message.created"} /><span>{label}</span></label>)}<button type="submit">Создать webhook</button></form>{integrations?.webhooks?.map((webhook) => <div className="invite-management-row" key={webhook.id}><span><strong>{webhook.name}</strong><small>{webhook.url}{webhook.lastError ? ` · ${webhook.lastError}` : ""}</small></span><button type="button" className="danger" onClick={async () => { await onAction(() => remove(`/api/rooms/${conversation.roomId}/webhooks/${webhook.id}`), "Webhook отключён"); await loadIntegrations(); }}><X size={14} /></button></div>)}</section>
      </>}

      {tab === "manage" && conversation.type === "room" && canModerate && <>
        {canConfigure && <section><h3><Settings2 size={14} /> Настройки комнаты</h3><form className="drawer-form" onSubmit={saveRoom}><label>Название<input name="name" defaultValue={conversation.title} maxLength={56} /></label><label>Описание<textarea name="description" defaultValue={conversation.description} maxLength={500} rows={2} /></label><label>Правила<textarea name="rules" defaultValue={conversation.rules} maxLength={2000} rows={3} /></label><label className="check-row"><input type="checkbox" name="readOnly" defaultChecked={conversation.permissions.readOnly} /><span>Только чтение</span></label><label className="check-row"><input type="checkbox" name="announcementOnly" defaultChecked={conversation.permissions.announcementOnly} /><span>Канал объявлений</span></label><label className="check-row"><input type="checkbox" name="preapproveMessages" defaultChecked={conversation.permissions.preapproveMessages} /><span>Премодерация сообщений</span></label><label className="check-row"><input type="checkbox" name="allowFiles" defaultChecked={conversation.permissions.allowFiles} /><span>Разрешить файлы</span></label><label className="check-row"><input type="checkbox" name="allowImages" defaultChecked={conversation.permissions.allowImages} /><span>Разрешить изображения</span></label><label className="check-row"><input type="checkbox" name="allowVoice" defaultChecked={conversation.permissions.allowVoice} /><span>Разрешить голосовые</span></label><label>Медленный режим<select name="slowModeSeconds" defaultValue={conversation.permissions.slowModeSeconds}><option value="0">Выключен</option><option value="5">5 секунд</option><option value="15">15 секунд</option><option value="30">30 секунд</option><option value="60">1 минута</option><option value="300">5 минут</option><option value="3600">1 час</option></select></label><label>Вступление<select name="joinPolicy" defaultValue={conversation.permissions.joinPolicy}><option value="open">Свободный вход</option><option value="request">По заявке</option><option value="invite">Только по коду</option></select></label><button type="submit">Сохранить</button></form></section>}
        {canManage && <section><h3><KeyRound size={14} /> Приглашения · {conversation.activeInvites?.length ?? 0}</h3><form className="drawer-form" onSubmit={rotateInvite}><label>Название<input name="label" maxLength={80} defaultValue="Основное" /></label><label>Срок, часов<input type="number" name="expiresInHours" min="0" max="8760" defaultValue="0" /></label><label>Лимит использований<input type="number" name="maxUses" min="0" max="100000" defaultValue="0" /></label><button type="submit"><CirclePlus size={14} /> Создать код</button></form>{conversation.activeInvites?.map((invite) => <div className="invite-management-row" key={invite.id}><button type="button" className="invite-code" onClick={() => copy(invite.code, "Код скопирован")}><code>{invite.code}</code><Copy size={14} /></button><small>{invite.label} · {invite.useCount}/{invite.maxUses || "∞"}</small><button type="button" className="danger" onClick={() => onAction(() => remove(`/api/rooms/${conversation.roomId}/invites/${invite.id}`), "Приглашение отозвано")}><X size={14} /></button></div>)}</section>}
        {canManage && <section><h3><Crown size={14} /> Роли и категория</h3><form className="drawer-form" onSubmit={createRole}><label>Новая роль<input name="name" maxLength={48} placeholder="Редактор" required /></label><label>Цвет<input name="color" type="color" defaultValue="#9c6cff" /></label>{[["room.pin_messages", "Закреплять"], ["room.delete_messages", "Удалять сообщения"], ["room.manage_members", "Управлять участниками"], ["room.manage_reports", "Разбирать жалобы"]].map(([value, label]) => <label className="check-row" key={value}><input type="checkbox" name="permission" value={value} /><span>{label}</span></label>)}<button type="submit">Создать роль</button></form>{conversation.customRoles?.length > 0 && <form className="drawer-form" onSubmit={assignRole}><label>Участник<select name="userId">{conversation.members.filter((member) => member.roomRole !== "owner").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>Роль<select name="roleId">{conversation.customRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>Действие<select name="action"><option value="add">Назначить</option><option value="remove">Снять</option></select></label><button type="submit">Применить</button></form>}<form className="drawer-form" onSubmit={createCategory}><label>Категория комнаты<input name="name" maxLength={56} defaultValue={conversation.category?.name ?? ""} required /></label><button type="submit">Назначить категорию</button></form></section>}
        {canManageMembers && <section><h3><UsersRound size={14} /> Заявки · {conversation.joinRequests?.length ?? 0}</h3>{conversation.joinRequests?.length ? conversation.joinRequests.map((request) => <div className="join-request-row" key={request.id}><Avatar user={request.user} size="tiny" onClick={() => onOpenProfile(request.user)} /><span><strong>{request.user.displayName}</strong><small>{new Date(request.createdAt).toLocaleString("ru")}</small></span><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/join-requests/${request.id}`, { decision: "accept" }), "Заявка принята")}><Check size={14} /></button><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/join-requests/${request.id}`, { decision: "reject" }), "Заявка отклонена")}><X size={14} /></button></div>) : <p className="details-empty">Новых заявок нет</p>}</section>}
        {canManageMembers && <section><h3><Ban size={14} /> Заблокированные · {conversation.bannedMembers?.length ?? 0}</h3>{conversation.bannedMembers?.length ? conversation.bannedMembers.map((ban) => <div className="join-request-row" key={ban.id}><Avatar user={ban.user} size="tiny" onClick={() => onOpenProfile(ban.user)} /><span><strong>{ban.user.displayName}</strong><small>{ban.reason || "Без причины"}</small></span><button type="button" onClick={() => onAction(() => remove(`/api/rooms/${conversation.roomId}/bans/${ban.user.id}`), "Блокировка снята")}><X size={14} /></button></div>) : <p className="details-empty">Список пуст</p>}</section>}
        {canManageReports && <section><h3><ShieldBan size={14} /> Жалобы · {conversation.reports?.length ?? 0}</h3>{conversation.reports?.length ? conversation.reports.map((report) => <div className="join-request-row" key={report.id}><span><strong>{report.reason}</strong><small>{new Date(report.createdAt).toLocaleString("ru")}</small></span><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/reports/${report.id}`, { status: "resolved", resolution: "Проверено модератором" }), "Жалоба закрыта")}><Check size={14} /></button><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/reports/${report.id}`, { status: "rejected" }), "Жалоба отклонена")}><X size={14} /></button></div>) : <p className="details-empty">Новых жалоб нет</p>}</section>}
        {canManageReports && <section><h3><Gavel size={14} /> Апелляции · {conversation.appeals?.length ?? 0}</h3>{conversation.appeals?.length ? conversation.appeals.map((appeal) => <div className="join-request-row" key={appeal.id}><Avatar user={appeal.user} size="tiny" onClick={() => appeal.user && onOpenProfile(appeal.user)} /><span><strong>{appeal.reason}</strong><small>{new Date(appeal.createdAt).toLocaleString("ru")}</small></span><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/appeals/${appeal.id}`, { status: "accepted", resolution: "Ограничение снято" }), "Апелляция принята")}><Check size={14} /></button><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/appeals/${appeal.id}`, { status: "rejected" }), "Апелляция отклонена")}><X size={14} /></button></div>) : <p className="details-empty">Новых апелляций нет</p>}</section>}
        {canConfigure && <section><h3><History size={14} /> Журнал действий</h3><div className="audit-list">{conversation.auditLog?.map((entry) => <div key={entry.id}><Clock3 size={13} /><span><strong>{auditLabels[entry.action] || entry.action}</strong><small>{entry.actor?.displayName || "Система"}{entry.target ? ` → ${entry.target.displayName}` : ""} · {new Date(entry.createdAt).toLocaleString("ru")}</small></span></div>)}</div></section>}
      </>}
    </aside>
  );
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><header><h2>{title}</h2><button type="button" onClick={onClose}><X size={18} /></button></header>{children}</section></div>;
}

export default function Workspace({ me, bootstrap, socket, onlineUserIds, onRefresh, onMeChanged, onLogout, showToast }) {
  const [section, setSection] = useState("chats");
  const [activeConversationId, setActiveConversationId] = useState(bootstrap.conversations[0]?.id ?? null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [railOpen, setRailOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [appealRoom, setAppealRoom] = useState(null);

  const activeConversation = bootstrap.conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  useEffect(() => {
    if (activeConversationId && !bootstrap.conversations.some((conversation) => conversation.id === activeConversationId)) setActiveConversationId(bootstrap.conversations[0]?.id ?? null);
  }, [activeConversationId, bootstrap.conversations]);

  function openConversation(id, messageId = null) {
    if (!id) return;
    setActiveConversationId(id);
    setJumpTarget(messageId ? { conversationId: id, messageId, nonce: Date.now() } : null);
    setSection("chats");
    setDetailsOpen(false);
    setRailOpen(false);
  }

  async function run(action, successMessage) {
    try {
      const result = await action();
      await onRefresh();
      if (successMessage) showToast(successMessage);
      return result;
    } catch (error) {
      showToast(error.message, "error");
      return null;
    }
  }

  async function createRoom(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await run(() => post("/api/rooms", { name: form.get("name"), privacy: form.get("privacy") }), "Комната создана");
    if (result) { setModal(null); openConversation(result.room.conversationId); }
  }

  async function joinCode(event) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    const result = await run(() => post("/api/rooms/join-by-code", { code }), "Вы присоединились к комнате");
    if (result) { setModal(null); openConversation(result.conversationId); }
  }

  const unread = bootstrap.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const incoming = bootstrap.contactRequests.filter((request) => request.direction === "incoming").length;

  return (
    <main className={`workspace-shell workspace-${section}`}>
      <button type="button" className="mobile-rail-toggle" onClick={() => setRailOpen((value) => !value)} aria-label="Открыть навигацию"><Menu size={19} /></button>
      {railOpen && <button type="button" className="mobile-rail-scrim" onClick={() => setRailOpen(false)} aria-label="Закрыть навигацию" />}
      <aside className={`workspace-rail${railOpen ? " open" : ""}`}>
        <div className="workspace-brand"><NexoraLogo compact /><div className={`connection-indicator ${socket.connected ? "online" : "offline"}`} title={socket.connected ? "На связи" : "Нет соединения"}><i /></div></div>
        <div className="workspace-nav">
          <HoverDock active={section} onSelect={(value) => { setSection(value); setDetailsOpen(false); setRailOpen(false); }} onLogout={onLogout} counts={{ chats: unread, contacts: incoming, notifications: bootstrap.notificationCount }} />
        </div>
        <div className="workspace-user"><Avatar user={me} onClick={() => setProfileUser(me)} /><span><strong>{me.displayName}</strong><small>@{me.username}{me.role === "server_admin" ? " · admin" : ""}</small>{me.status && <em>{me.status}</em>}</span></div>
        <div className="rail-content">
          {section === "chats" && <ConversationList conversations={bootstrap.conversations} drafts={bootstrap.drafts} activeId={activeConversationId} onOpen={openConversation} onOpenProfile={setProfileUser} onSetting={(conversation, fields, message) => run(() => patch(`/api/conversations/${conversation.id}/settings`, fields), message)} userId={me.id} />}
          {section === "search" && <><div className="rail-heading"><div><span>MESSAGE INDEX</span><h2>Поиск</h2></div></div><div className="settings-rail-copy"><Search size={22} /><p>Серверный индекс охватывает обычные server-readable сообщения. Legacy MLS history доступна только через отдельный read-only viewer.</p></div></>}
          {section === "notifications" && <><div className="rail-heading"><div><span>ACTIVITY</span><h2>Уведомления</h2></div>{bootstrap.notificationCount > 0 && <b>{bootstrap.notificationCount}</b>}</div><div className="settings-rail-copy"><BellOff size={22} /><p>Упоминания, ответы и события безопасности собраны в одном месте.</p></div></>}
          {section === "rooms" && <RoomsRail rooms={bootstrap.rooms} onOpen={(room) => room.joined && openConversation(room.conversationId)} onCreate={() => setModal("create-room")} onJoinCode={() => setModal("join-code")} />}
          {section === "contacts" && <ContactsRail contacts={bootstrap.contacts} requests={bootstrap.contactRequests} onOpen={openConversation} onOpenProfile={setProfileUser} onAccept={async (requestItem) => { const result = await run(() => post(`/api/contacts/requests/${requestItem.id}/accept`), "Контакт добавлен"); if (result) openConversation(result.conversationId); }} onReject={(requestItem) => run(() => post(`/api/contacts/requests/${requestItem.id}/reject`), "Заявка отклонена")} />}
          {section === "files" && <><div className="rail-heading"><div><span>ARCHIVE</span><h2>Файлы</h2></div>{bootstrap.files.length > 0 && <b>{bootstrap.files.length}</b>}</div><div className="file-rail-summary"><FileImage size={20} /><span><strong>{bootstrap.files.filter((file) => file.kind === "image").length}</strong> изображений</span></div><div className="file-rail-summary"><FileArchive size={20} /><span><strong>{bootstrap.files.filter((file) => file.kind !== "image").length}</strong> остальных файлов</span></div></>}
          {section === "pulse" && <><div className="rail-heading"><div><span>NEXORA PLUS</span><h2>Pulse</h2></div>{bootstrap.pulse?.wallet?.balance > 0 && <b>{bootstrap.pulse.wallet.balance}</b>}</div><div className="settings-rail-copy"><Sparkles size={22} /><p>Plus, импульсы и коллективные цели комнат. Общение остаётся бесплатным.</p></div></>}
          {section === "settings" && <><div className="rail-heading"><div><span>CONTROL</span><h2>Настройки</h2></div></div><div className="settings-rail-copy"><ShieldCheck size={22} /><p>Данные аккаунта хранятся на локальном сервере Nexora.</p></div></>}
        </div>
      </aside>

      <section className={`workspace-main${detailsOpen ? " details-visible" : ""}`}>
        {section === "chats" && (activeConversation
          ? activeConversation.legacySecure
            ? <LegacySecureHistoryPane key={activeConversation.id} conversation={activeConversation} serverId={bootstrap.server?.id} userId={me.id} onDetails={() => setDetailsOpen((value) => !value)} showToast={showToast} />
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
          : <EmptyState icon={MessageCircleMore} title="Выберите чат" description="Ваши личные диалоги и комнаты появятся слева." />)}
        {section === "search" && <GlobalSearch onOpen={openConversation} onOpenProfile={setProfileUser} showToast={showToast} />}
        {section === "notifications" && <NotificationsPage onOpen={openConversation} showToast={showToast} />}
        {section === "rooms" && <RoomsOverview rooms={bootstrap.rooms} onCreate={() => setModal("create-room")} onOpen={(room) => openConversation(room.conversationId)} onAppeal={setAppealRoom} onJoin={async (room) => {
          if (room.privacy !== "public") return setModal("join-code");
          const result = await run(() => post(`/api/rooms/${room.id}/join`));
          if (result?.pending) showToast("Заявка на вступление отправлена");
          else if (result?.conversationId) { showToast("Вы присоединились к комнате"); openConversation(result.conversationId); }
        }} />}
        {section === "contacts" && <ContactSearch showToast={showToast} onOpenProfile={setProfileUser} onRequest={(user) => run(() => post("/api/contacts/requests", { userId: user.id }), "Заявка отправлена")} onBlock={(user) => run(() => post(`/api/blocks/${user.id}`), "Пользователь заблокирован")} />}
        {section === "files" && <FilesPage files={bootstrap.files} />}
        {section === "pulse" && <PulsePage initialOverview={bootstrap.pulse} rooms={bootstrap.rooms} me={me} onMeChanged={onMeChanged} onRefresh={onRefresh} showToast={showToast} />}
        {section === "settings" && <AccountSettingsPage me={me} blocked={bootstrap.blocked} version={bootstrap.version} server={bootstrap.server} preferences={bootstrap.preferences} passwordPolicy={bootstrap.passwordPolicy} onMeChanged={onMeChanged} onOpenProfile={setProfileUser} onUnblock={(user) => run(() => remove(`/api/blocks/${user.id}`), "Пользователь разблокирован")} onLogout={onLogout} showToast={showToast} />}
      </section>

      {detailsOpen && activeConversation && <DetailsDrawer conversation={activeConversation} me={me} onClose={() => setDetailsOpen(false)} onOpenProfile={setProfileUser} showToast={showToast} onAction={run} onRemoveContact={(user) => window.confirm(`Удалить ${user.displayName} из контактов? История переписки сохранится.`) && run(() => remove(`/api/contacts/${user.id}`), "Контакт удалён").then(() => setDetailsOpen(false))} onBlock={(user) => run(() => post(`/api/blocks/${user.id}`), "Пользователь заблокирован").then(() => setDetailsOpen(false))} />}

      {profileUser && <UserProfileModal initialUser={profileUser} onClose={() => setProfileUser(null)} onOpenConversation={openConversation} onOpenSettings={() => setSection("settings")} onSendRequest={(user) => run(() => post("/api/contacts/requests", { userId: user.id }), "Заявка отправлена")} onBlock={(user) => run(() => post(`/api/blocks/${user.id}`), "Пользователь заблокирован")} showToast={showToast} />}

      {modal === "create-room" && <Modal title="Новая комната" onClose={() => setModal(null)}><form className="modal-form" onSubmit={createRoom}><label>Название<input name="name" maxLength={56} placeholder="Например, Product Lab" required /></label><label>Доступ<select name="privacy"><option value="public">Публичная — видна всем</option><option value="private">Приватная — вход по коду</option></select></label><button className="violet-button" type="submit"><Plus size={17} /> Создать комнату</button></form></Modal>}
      {modal === "join-code" && <Modal title="Войти по коду" onClose={() => setModal(null)}><form className="modal-form" onSubmit={joinCode}><label>Код приглашения<input name="code" placeholder="Вставьте код владельца комнаты" required /></label><button className="violet-button" type="submit"><LockKeyhole size={17} /> Присоединиться</button></form></Modal>}
      {appealRoom && <Modal title={`Апелляция · ${appealRoom.name}`} onClose={() => setAppealRoom(null)}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); const reason = new FormData(event.currentTarget).get("reason"); const result = await run(() => post(`/api/rooms/${appealRoom.id}/appeals`, { reason }), "Апелляция отправлена"); if (result) setAppealRoom(null); }}><label>Обоснование<textarea name="reason" minLength={10} maxLength={1000} rows={5} placeholder="Опишите, почему ограничение следует пересмотреть" required /></label><button className="violet-button" type="submit"><Gavel size={17} /> Отправить модераторам</button></form></Modal>}
    </main>
  );
}
