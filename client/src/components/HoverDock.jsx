import { Bell, ContactRound, DoorOpen, Files, MessageCircleMore, Search, Settings2, Sparkles, UsersRound } from "lucide-react";

const items = [
  { id: "chats", label: "Чаты", icon: MessageCircleMore },
  { id: "search", label: "Поиск", icon: Search },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "rooms", label: "Комнаты", icon: UsersRound },
  { id: "contacts", label: "Контакты", icon: ContactRound },
  { id: "files", label: "Файлы", icon: Files },
  { id: "pulse", label: "Pulse", icon: Sparkles },
  { id: "settings", label: "Настройки", icon: Settings2 },
];

export default function HoverDock({ active, onSelect, onLogout, counts = {} }) {
  return (
    <nav className="hover-dock" aria-label="Основная навигация">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={`dock-item${active === id ? " active" : ""}`}
          onClick={() => onSelect(id)}
          aria-current={active === id ? "page" : undefined}
          title={label}
        >
          <Icon size={20} />
          <span className="dock-label">{label}</span>
          {counts[id] > 0 && <b className="dock-count">{counts[id] > 99 ? "99+" : counts[id]}</b>}
        </button>
      ))}
      <span className="dock-divider" />
      <button type="button" className="dock-item danger" onClick={onLogout} title="Выйти">
        <DoorOpen size={20} />
        <span className="dock-label">Выйти</span>
      </button>
    </nav>
  );
}
