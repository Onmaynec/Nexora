import { useEffect, useState } from "react";
import {
  AtSign, CalendarDays, Check, Copy, Crown, LoaderCircle, MessageCircleMore,
  Settings2, ShieldBan, Sparkles, UserPlus, UsersRound, X,
} from "lucide-react";
import { api } from "../api";
import { Avatar } from "./ui";

export default function UserProfileModal({
  initialUser, onClose, onOpenConversation, onSendRequest, onBlock, onOpenSettings, showToast,
}) {
  const [profile, setProfile] = useState(initialUser ? { user: initialUser, relationship: null } : null);
  const [loading, setLoading] = useState(true);
  const userId = initialUser?.id;

  useEffect(() => {
    let cancelled = false;
    setProfile(initialUser ? { user: initialUser, relationship: null } : null);
    setLoading(true);
    api(`/api/users/${encodeURIComponent(userId)}/profile`)
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((error) => { if (!cancelled) showToast(error.message, "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  if (!profile?.user) return null;
  const { user, relationship = {} } = profile;
  const joined = user.createdAt ? new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(new Date(user.createdAt)) : null;

  async function copyUsername() {
    await navigator.clipboard.writeText(`@${user.username}`);
    showToast("Username скопирован");
  }

  return (
    <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`profile-modal profile-tone-${user.profileColor || "violet"}`} role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Закрыть профиль"><X size={18} /></button>
        <div className="profile-cover"><span /><span /><span /></div>
        <div className="profile-main">
          <Avatar user={user} size="xlarge" online={Boolean(user.online)} />
          <div className="profile-title-row">
            <div>
              <h2 id="profile-title">{user.displayName}</h2>
              <button type="button" className="profile-username" onClick={copyUsername}><AtSign size={14} />{user.username}<Copy size={13} /></button>
            </div>
            {user.plus && user.plusBadgeVisible !== false && <span className="plus-badge"><Sparkles size={14} /> PLUS</span>}
            {user.role === "server_admin" && <span className="admin-badge"><Crown size={14} /> ADMIN</span>}
          </div>
          {user.status && <p className="profile-status">{user.status}</p>}
          {user.bio && <p className="profile-bio">{user.bio}</p>}
          {loading && <div className="profile-loading"><LoaderCircle className="spin" size={15} /> Обновляем профиль</div>}

          <div className="profile-facts">
            {joined && <span><CalendarDays size={15} /><i>В Nexora</i><b>{joined}</b></span>}
            <span><UsersRound size={15} /><i>Общие комнаты</i><b>{relationship.sharedRooms?.length ?? 0}</b></span>
          </div>

          <div className="profile-actions">
            {relationship.self ? (
              <button type="button" className="violet-button" onClick={() => { onClose(); onOpenSettings(); }}><Settings2 size={17} /> Настроить профиль</button>
            ) : relationship.conversationId ? (
              <button type="button" className="violet-button" onClick={() => { onClose(); onOpenConversation(relationship.conversationId); }}><MessageCircleMore size={17} /> Написать</button>
            ) : !relationship.blockedByMe && !relationship.requestDirection ? (
              <button type="button" className="violet-button" onClick={async () => { await onSendRequest(user); onClose(); }}><UserPlus size={17} /> Добавить в контакты</button>
            ) : relationship.contact ? (
              <span className="profile-relation"><Check size={16} /> В контактах</span>
            ) : relationship.requestDirection ? (
              <span className="profile-relation"><Check size={16} /> {relationship.requestDirection === "outgoing" ? "Заявка отправлена" : "Входящая заявка"}</span>
            ) : null}
            {!relationship.self && !relationship.blockedByMe && <button type="button" className="profile-danger" onClick={async () => { await onBlock(user); onClose(); }}><ShieldBan size={16} /> Блокировать</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
