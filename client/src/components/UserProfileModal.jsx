import { useEffect, useState } from "react";
import {
  AtSign, CalendarDays, Check, Copy, Crown, LoaderCircle, MessageCircleMore, Phone,
  Settings2, ShieldBan, Sparkles, UserMinus, UserPlus, UsersRound, X,
} from "lucide-react";
import { api } from "../api";
import { Avatar } from "./ui";

function idempotencyKey(scope, id) {
  return `${scope}-${id}-${crypto.randomUUID()}`.slice(0, 150);
}

export default function UserProfileModal({
  initialUser, onClose, onOpenConversation, onOpenSettings, showToast,
}) {
  const [profile, setProfile] = useState(initialUser ? { user: initialUser, relationship: {} } : null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const userId = initialUser?.id;

  async function load() {
    const result = await api(`/api/v3/users/${encodeURIComponent(userId)}/profile`);
    setProfile(result);
    return result;
  }

  useEffect(() => {
    let cancelled = false;
    setProfile(initialUser ? { user: initialUser, relationship: {} } : null);
    setLoading(true);
    api(`/api/v3/users/${encodeURIComponent(userId)}/profile`)
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
  const { user } = profile;
  const relationship = profile.relationship ?? {};
  const joined = user.createdAt ? new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(new Date(user.createdAt)) : null;

  async function copyUsername() {
    await navigator.clipboard.writeText(`@${user.username}`);
    showToast("Username скопирован");
  }

  async function copyDeepLink() {
    const target = new URL("/", location.origin);
    target.searchParams.set("nexora", "profile");
    target.searchParams.set("serverId", profile.deepLink?.serverId || "");
    target.searchParams.set("id", user.id);
    await navigator.clipboard.writeText(target.toString());
    showToast("Безопасная ссылка на профиль скопирована");
  }

  async function mutate(action) {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "request") {
        await api("/api/v3/contacts/requests", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey("contact", user.id) },
          body: JSON.stringify({ userId: user.id }),
        });
        showToast("Заявка отправлена");
      } else if (["accept", "reject", "cancel"].includes(action)) {
        await api(`/api/v3/contacts/requests/${encodeURIComponent(relationship.requestId)}`, {
          method: "PATCH",
          headers: { "Idempotency-Key": idempotencyKey(action, relationship.requestId) },
          body: JSON.stringify({ action }),
        });
        showToast(action === "accept" ? "Контакт добавлен" : action === "reject" ? "Заявка отклонена" : "Заявка отменена");
      } else if (action === "remove") {
        if (!window.confirm(`Удалить ${user.displayName} из контактов?`)) return;
        await api(`/api/v3/contacts/${encodeURIComponent(user.id)}`, { method: "DELETE" });
        showToast("Контакт удалён");
      } else if (action === "block") {
        if (!window.confirm(`Заблокировать ${user.displayName}? Переписка, presence и вызовы станут недоступны.`)) return;
        await api(`/api/v3/blocks/${encodeURIComponent(user.id)}`, { method: "POST", body: "{}" });
        showToast("Пользователь заблокирован");
      }
      await load();
    } catch (error) {
      showToast(`${error.message}${error.requestId ? ` · requestId ${error.requestId}` : ""}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function startCall() {
    window.dispatchEvent(new CustomEvent("nexora:start-call", { detail: { user } }));
    onClose();
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
            ) : (
              <>
                {relationship.conversationId && <button type="button" className="violet-button" onClick={() => { onClose(); onOpenConversation(relationship.conversationId); }}><MessageCircleMore size={17} /> Написать</button>}
                {relationship.canCall && <button type="button" className="violet-button" onClick={startCall}><Phone size={17} /> Позвонить</button>}
                {!relationship.blockedByMe && !relationship.contact && !relationship.requestDirection && <button type="button" className="violet-button" disabled={busy} onClick={() => mutate("request")}><UserPlus size={17} /> Добавить в контакты</button>}
                {relationship.requestDirection === "incoming" && <><button type="button" className="violet-button" disabled={busy} onClick={() => mutate("accept")}><Check size={17} /> Принять</button><button type="button" disabled={busy} onClick={() => mutate("reject")}>Отклонить</button></>}
                {relationship.requestDirection === "outgoing" && <button type="button" disabled={busy} onClick={() => mutate("cancel")}><X size={17} /> Отменить заявку</button>}
                {relationship.contact && <button type="button" disabled={busy} onClick={() => mutate("remove")}><UserMinus size={17} /> Удалить контакт</button>}
              </>
            )}
            <button type="button" onClick={copyDeepLink}><Copy size={16} /> Ссылка</button>
            {!relationship.self && !relationship.blockedByMe && <button type="button" className="profile-danger" disabled={busy} onClick={() => mutate("block")}><ShieldBan size={16} /> Блокировать</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
