import { useEffect, useState } from "react";
import { AtSign, Bell, CheckCheck, MessageCircleReply, MonitorSmartphone, ShieldAlert } from "lucide-react";
import { api, patch } from "../api";
import { EmptyState, formatTime } from "./ui";

const types = {
  "message.mention": { icon: AtSign, title: "Вас упомянули" },
  "message.reply": { icon: MessageCircleReply, title: "Ответ на ваше сообщение" },
  "message.new": { icon: Bell, title: "Новое сообщение" },
  "moderation.report": { icon: ShieldAlert, title: "Новая жалоба" },
  "security.new_device": { icon: MonitorSmartphone, title: "Вход с нового устройства" },
  "security.recovery_code_used": { icon: ShieldAlert, title: "Использован резервный код" },
};

export default function NotificationsPage({ onOpen, showToast }) {
  const [notifications, setNotifications] = useState([]);
  async function load() {
    try { setNotifications((await api("/api/notifications")).notifications); } catch (error) { showToast(error.message, "error"); }
  }
  useEffect(() => { load(); }, []);
  async function readAll() {
    try { await patch("/api/notifications/read", { all: true }); await load(); } catch (error) { showToast(error.message, "error"); }
  }
  return <div className="section-page notifications-page"><header className="section-page-head"><div><span>ACTIVITY</span><h1>Уведомления</h1><p>Упоминания, ответы, модерация и события безопасности.</p></div>{notifications.some((item) => !item.readAt) && <button type="button" className="violet-button" onClick={readAll}><CheckCheck size={17} /> Прочитать все</button>}</header>{notifications.length ? <div className="notification-list">{notifications.map((item) => { const entry = types[item.type] ?? { icon: Bell, title: item.type }; const Icon = entry.icon; return <button type="button" key={item.id} className={item.readAt ? "read" : "unread"} onClick={() => item.conversationId && onOpen(item.conversationId, item.messageId)}><Icon size={19} /><span><strong>{entry.title}</strong><small>{formatTime(item.createdAt)}</small></span>{!item.readAt && <i />}</button>; })}</div> : <EmptyState icon={Bell} title="Всё спокойно" description="Новые упоминания и важные события появятся здесь." />}</div>;
}
