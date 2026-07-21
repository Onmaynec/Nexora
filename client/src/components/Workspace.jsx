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
import MessagePane from "./MessagePane";
import ParticleField from "./ParticleField";
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
  return message.text;
}

function ConversationList({ conversations, activeId, onOpen, onOpenProfile, onSetting, userId }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [menuId, setMenuId] = useState(null);
  const [, setDraftRevision] = useState(0);
  useEffect(() => { const refresh = () => setDraftRevision((value) => value + 1); window.addEventListener("nexora:drafts", refresh); return () => window.removeEventListener("nexora:drafts", refresh); }, []);
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
          const draft = localStorage.getItem(`nexora:draft:${userId}:${conversation.id}`);
          return (
          <div key={conversation.id} className={`conversation-card${conversation.id === activeId ? " active" : ""}${conversation.notificationSettings?.pinned ? " pinned" : ""}`}>
            <button type="button" className="conversation-open" onClick={() => onOpen(conversation.id)}>
              <Avatar user={conversation.peer ?? conversation} online={conversation.online} onClick={conversation.type === "dm" ? (event) => { event.stopPropagation(); onOpenProfile(conversation.peer); } : undefined} />
              <span className="conversation-copy">
                <span><strong>{conversation.notificationSettings?.pinned && <Pin size={11} fill="currentColor" />}{conversation.title}</strong><time>{formatTime(conversation.updatedAt)}</time></span>
                <small className={draft ? "draft-label" : ""}>{draft ? `Черновик: ${draft}` : lastMessageLabel(conversation.lastMessage)}</small>
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

function RoomsOverview({ rooms, onJoin, onOpen, onCreate }) {
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
            <button type="button" disabled={room.banned || room.joinRequestStatus === "pending"} onClick={() => room.joined ? onOpen(room) : onJoin(room)}>{room.joined ? "Открыть" : room.banned ? "Доступ закрыт" : room.joinRequestStatus === "pending" ? "Заявка отправлена" : room.privacy === "private" ? "Нужен код" : room.joinPolicy === "request" ? "Подать заявку" : "Присоединиться"}<ChevronRight size={16} /></button>
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
  if (!conversation) return null;
  const canModerate = Boolean(conversation.permissions?.canModerate);
  const canManage = Boolean(conversation.permissions?.canManage);
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
  async function saveRoom(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onAction(() => patch(`/api/rooms/${conversation.roomId}`, {
      name: form.get("name"),
      readOnly: form.get("readOnly") === "on",
      allowFiles: form.get("allowFiles") === "on",
      allowVoice: form.get("allowVoice") === "on",
      slowModeSeconds: Number(form.get("slowModeSeconds") || 0),
      joinPolicy: form.get("joinPolicy"),
    }), "Настройки комнаты сохранены");
  }
  async function rotateInvite(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onAction(() => post(`/api/rooms/${conversation.roomId}/invite`, {
      action: "rotate",
      expiresInHours: Number(form.get("expiresInHours") || 0),
      maxUses: Number(form.get("maxUses") || 0),
    }), "Код приглашения обновлён");
  }
  return (
    <aside className="details-drawer">
      <header><span>DETAILS</span><button type="button" onClick={onClose}><X size={18} /></button></header>
      <div className="details-hero"><Avatar user={conversation.peer ?? conversation} size="large" online={conversation.online} onClick={conversation.peer ? () => onOpenProfile(conversation.peer) : undefined} /><h2>{conversation.title}</h2><span>{conversation.subtitle}</span>{conversation.peer?.status && <p>{conversation.peer.status}</p>}</div>
      <nav className="drawer-tabs"><button type="button" className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Обзор</button><button type="button" className={tab === "media" ? "active" : ""} onClick={loadMedia}>Медиа</button>{conversation.type === "room" && canModerate && <button type="button" className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>Управление</button>}</nav>

      {tab === "details" && <>
        {conversation.inviteCode && <section><h3>Код приглашения</h3><button type="button" className="invite-code" onClick={() => copy(conversation.inviteCode, "Код приглашения скопирован")}><code>{conversation.inviteCode}</code><Copy size={15} /></button>{conversation.inviteExpiresAt && <p className="details-empty">Действует до {new Date(conversation.inviteExpiresAt).toLocaleString("ru")}</p>}{conversation.inviteMaxUses > 0 && <p className="details-empty">Использовано {conversation.inviteUseCount} из {conversation.inviteMaxUses}</p>}</section>}
        <section><h3>Закреплённые · {conversation.pinned?.length ?? 0}</h3>{conversation.pinned?.length ? conversation.pinned.map((message) => <button type="button" className="pinned-row" key={message.id} onClick={() => document.querySelector(`#message-${CSS.escape(message.id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Pin size={14} /><span>{message.text || message.file?.name || "Вложение"}</span></button>) : <p className="details-empty">Нет закреплённых сообщений</p>}</section>
        {conversation.type === "room" && <section><h3>Участники · {conversation.members.length}</h3><div className="member-list">{conversation.members.map((member) => <div key={member.id}><Avatar user={member} size="tiny" online={member.online} onClick={() => onOpenProfile(member)} /><span><strong>{member.displayName}</strong><small>@{member.username} · {member.roomRole === "moderator" ? "модератор" : member.roomRole === "owner" ? "владелец" : "участник"}</small></span>{member.roomRole === "owner" ? <Crown size={15} className="owner-crown" /> : canModerate && member.id !== me.id ? <span className="member-actions">{canManage && <button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/members/${member.id}/role`, { role: member.roomRole === "moderator" ? "member" : "moderator" }), member.roomRole === "moderator" ? "Модератор снят" : "Модератор назначен")} title={member.roomRole === "moderator" ? "Снять модератора" : "Назначить модератором"}><Gavel size={14} /></button>}{canManage && <button type="button" onClick={() => window.confirm(`Передать владение ${member.displayName}?`) && onAction(() => post(`/api/rooms/${conversation.roomId}/transfer`, { userId: member.id }), "Владение передано")} title="Передать владение"><Crown size={14} /></button>}<button type="button" onClick={() => window.confirm(`Удалить ${member.displayName} из комнаты?`) && onAction(() => remove(`/api/rooms/${conversation.roomId}/members/${member.id}`), `${member.displayName} удалён`)} title="Удалить"><UserMinus size={14} /></button><button type="button" className="danger" onClick={() => window.confirm(`Заблокировать ${member.displayName} в этой комнате?`) && onAction(() => post(`/api/rooms/${conversation.roomId}/bans/${member.id}`, { reason: "" }), `${member.displayName} заблокирован`)} title="Заблокировать в комнате"><Ban size={14} /></button></span> : null}</div>)}</div></section>}
        {conversation.type === "room" && conversation.viewerRole !== "owner" && <section className="drawer-contact-actions"><button type="button" className="drawer-danger" onClick={() => window.confirm("Покинуть комнату?") && onAction(() => post(`/api/rooms/${conversation.roomId}/leave`), "Вы покинули комнату").then(onClose)}><UserMinus size={16} /> Покинуть комнату</button></section>}
        {conversation.type === "dm" && conversation.peer && <section className="drawer-contact-actions">{conversation.isContact && <button type="button" onClick={() => onRemoveContact(conversation.peer)}><UserMinus size={16} /> Удалить из контактов</button>}<button type="button" className="drawer-danger" onClick={() => onBlock(conversation.peer)}><ShieldBan size={16} /> Заблокировать пользователя</button></section>}
      </>}

      {tab === "media" && <section className="drawer-media"><h3>Медиа и файлы</h3>{mediaBusy ? <p className="details-empty">Загружаем…</p> : media.length ? <div>{media.map((message) => <a key={message.id} href={message.file?.url} target="_blank" rel="noreferrer">{message.type === "image" ? <img src={message.file.thumbnailUrl || message.file.url} alt={message.file.name} /> : message.type === "voice" ? <Mic size={19} /> : <FileArchive size={19} />}<span><strong>{message.file?.name}</strong><small>{formatBytes(message.file?.size)}</small></span></a>)}</div> : <p className="details-empty">В этом чате пока нет вложений</p>}</section>}

      {tab === "manage" && conversation.type === "room" && canModerate && <>
        <section><h3><Settings2 size={14} /> Настройки комнаты</h3><form className="drawer-form" onSubmit={saveRoom}><label>Название<input name="name" defaultValue={conversation.title} maxLength={56} /></label><label className="check-row"><input type="checkbox" name="readOnly" defaultChecked={conversation.permissions.readOnly} /><span>Только чтение</span></label><label className="check-row"><input type="checkbox" name="allowFiles" defaultChecked={conversation.permissions.allowFiles} /><span>Разрешить файлы</span></label><label className="check-row"><input type="checkbox" name="allowVoice" defaultChecked={conversation.permissions.allowVoice} /><span>Разрешить голосовые</span></label><label>Медленный режим<select name="slowModeSeconds" defaultValue={conversation.permissions.slowModeSeconds}><option value="0">Выключен</option><option value="5">5 секунд</option><option value="15">15 секунд</option><option value="30">30 секунд</option><option value="60">1 минута</option><option value="300">5 минут</option><option value="3600">1 час</option></select></label><label>Вступление<select name="joinPolicy" defaultValue={conversation.permissions.joinPolicy}><option value="open">Свободный вход</option><option value="request">По заявке</option><option value="invite">Только по коду</option></select></label><button type="submit">Сохранить</button></form></section>
        {canManage && <section><h3><KeyRound size={14} /> Приглашение</h3><form className="drawer-form" onSubmit={rotateInvite}><label>Срок, часов<input type="number" name="expiresInHours" min="0" max="8760" defaultValue="0" /></label><label>Лимит использований<input type="number" name="maxUses" min="0" max="100000" defaultValue="0" /></label><button type="submit"><RefreshCcw size={14} /> Обновить код</button><button type="button" className="danger" onClick={() => window.confirm("Отозвать текущий код?") && onAction(() => post(`/api/rooms/${conversation.roomId}/invite`, { action: "revoke" }), "Код отозван")}>Отозвать код</button></form></section>}
        <section><h3><UsersRound size={14} /> Заявки · {conversation.joinRequests?.length ?? 0}</h3>{conversation.joinRequests?.length ? conversation.joinRequests.map((request) => <div className="join-request-row" key={request.id}><Avatar user={request.user} size="tiny" onClick={() => onOpenProfile(request.user)} /><span><strong>{request.user.displayName}</strong><small>{new Date(request.createdAt).toLocaleString("ru")}</small></span><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/join-requests/${request.id}`, { decision: "accept" }), "Заявка принята")}><Check size={14} /></button><button type="button" onClick={() => onAction(() => patch(`/api/rooms/${conversation.roomId}/join-requests/${request.id}`, { decision: "reject" }), "Заявка отклонена")}><X size={14} /></button></div>) : <p className="details-empty">Новых заявок нет</p>}</section>
        <section><h3><Ban size={14} /> Заблокированные · {conversation.bannedMembers?.length ?? 0}</h3>{conversation.bannedMembers?.length ? conversation.bannedMembers.map((ban) => <div className="join-request-row" key={ban.id}><Avatar user={ban.user} size="tiny" onClick={() => onOpenProfile(ban.user)} /><span><strong>{ban.user.displayName}</strong><small>{ban.reason || "Без причины"}</small></span><button type="button" onClick={() => onAction(() => remove(`/api/rooms/${conversation.roomId}/bans/${ban.user.id}`), "Блокировка снята")}><X size={14} /></button></div>) : <p className="details-empty">Список пуст</p>}</section>
        <section><h3><History size={14} /> Журнал действий</h3><div className="audit-list">{conversation.auditLog?.map((entry) => <div key={entry.id}><Clock3 size={13} /><span><strong>{auditLabels[entry.action] || entry.action}</strong><small>{entry.actor?.displayName || "Система"}{entry.target ? ` → ${entry.target.displayName}` : ""} · {new Date(entry.createdAt).toLocaleString("ru")}</small></span></div>)}</div></section>
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
      <ParticleField quiet={section !== "chats"} />
      <button type="button" className="mobile-rail-toggle" onClick={() => setRailOpen((value) => !value)} aria-label="Открыть навигацию"><Menu size={19} /></button>
      {railOpen && <button type="button" className="mobile-rail-scrim" onClick={() => setRailOpen(false)} aria-label="Закрыть навигацию" />}
      <aside className={`workspace-rail${railOpen ? " open" : ""}`}>
        <div className="workspace-brand"><NexoraLogo compact /><div className={`connection-indicator ${socket.connected ? "online" : "offline"}`} title={socket.connected ? "На связи" : "Нет соединения"}><i /></div></div>
        <div className="workspace-nav">
          <HoverDock active={section} onSelect={(value) => { setSection(value); setDetailsOpen(false); setRailOpen(false); }} onLogout={onLogout} counts={{ chats: unread, contacts: incoming }} />
        </div>
        <div className="workspace-user"><Avatar user={me} onClick={() => setProfileUser(me)} /><span><strong>{me.displayName}</strong><small>@{me.username}{me.role === "server_admin" ? " · admin" : ""}</small>{me.status && <em>{me.status}</em>}</span></div>
        <div className="rail-content">
          {section === "chats" && <ConversationList conversations={bootstrap.conversations} activeId={activeConversationId} onOpen={openConversation} onOpenProfile={setProfileUser} onSetting={(conversation, fields, message) => run(() => patch(`/api/conversations/${conversation.id}/settings`, fields), message)} userId={me.id} />}
          {section === "search" && <><div className="rail-heading"><div><span>MESSAGE INDEX</span><h2>Поиск</h2></div></div><div className="settings-rail-copy"><Search size={22} /><p>Поиск работает по всем сообщениям и вложениям, которые вам доступны.</p></div></>}
          {section === "rooms" && <RoomsRail rooms={bootstrap.rooms} onOpen={(room) => room.joined && openConversation(room.conversationId)} onCreate={() => setModal("create-room")} onJoinCode={() => setModal("join-code")} />}
          {section === "contacts" && <ContactsRail contacts={bootstrap.contacts} requests={bootstrap.contactRequests} onOpen={openConversation} onOpenProfile={setProfileUser} onAccept={async (requestItem) => { const result = await run(() => post(`/api/contacts/requests/${requestItem.id}/accept`), "Контакт добавлен"); if (result) openConversation(result.conversationId); }} onReject={(requestItem) => run(() => post(`/api/contacts/requests/${requestItem.id}/reject`), "Заявка отклонена")} />}
          {section === "files" && <><div className="rail-heading"><div><span>ARCHIVE</span><h2>Файлы</h2></div>{bootstrap.files.length > 0 && <b>{bootstrap.files.length}</b>}</div><div className="file-rail-summary"><FileImage size={20} /><span><strong>{bootstrap.files.filter((file) => file.kind === "image").length}</strong> изображений</span></div><div className="file-rail-summary"><FileArchive size={20} /><span><strong>{bootstrap.files.filter((file) => file.kind !== "image").length}</strong> остальных файлов</span></div></>}
          {section === "pulse" && <><div className="rail-heading"><div><span>NEXORA PLUS</span><h2>Pulse</h2></div>{bootstrap.pulse?.wallet?.balance > 0 && <b>{bootstrap.pulse.wallet.balance}</b>}</div><div className="settings-rail-copy"><Sparkles size={22} /><p>Plus, импульсы и коллективные цели комнат. Общение остаётся бесплатным.</p></div></>}
          {section === "settings" && <><div className="rail-heading"><div><span>CONTROL</span><h2>Настройки</h2></div></div><div className="settings-rail-copy"><ShieldCheck size={22} /><p>Данные аккаунта хранятся на локальном сервере Nexora.</p></div></>}
        </div>
      </aside>

      <section className={`workspace-main${detailsOpen ? " details-visible" : ""}`}>
        {section === "chats" && (activeConversation ? <MessagePane key={activeConversation.id} conversation={activeConversation} conversations={bootstrap.conversations} initialMessageId={jumpTarget?.conversationId === activeConversation.id ? jumpTarget.messageId : null} onJumpHandled={() => setJumpTarget(null)} me={me} socket={socket} onlineUserIds={onlineUserIds} onRefresh={onRefresh} onDetails={() => setDetailsOpen((value) => !value)} onOpenProfile={setProfileUser} showToast={showToast} /> : <EmptyState icon={MessageCircleMore} title="Выберите чат" description="Ваши личные диалоги и комнаты появятся слева." />)}
        {section === "search" && <GlobalSearch onOpen={openConversation} onOpenProfile={setProfileUser} showToast={showToast} />}
        {section === "rooms" && <RoomsOverview rooms={bootstrap.rooms} onCreate={() => setModal("create-room")} onOpen={(room) => openConversation(room.conversationId)} onJoin={async (room) => {
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
    </main>
  );
}
