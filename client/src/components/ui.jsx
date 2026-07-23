import { LoaderCircle, Radio } from "lucide-react";

export function NexoraLogo({ compact = false }) {
  return (
    <div className={`nexora-logo${compact ? " compact" : ""}`} aria-label="Nexora">
      <span className="nexora-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <b />
      </span>
      <span>NEXORA</span>
    </div>
  );
}

export function Avatar({ user, size = "medium", online = false, onClick, label }) {
  const name = user?.displayName || user?.title || "?";
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const frameClass = user?.avatarFrame && user.avatarFrame !== "none" ? ` avatar-frame-${user.avatarFrame}` : "";
  const profileClass = user?.profileColor && user.profileColor !== "violet" ? ` avatar-profile-${user.profileColor}` : "";
  return (
    <span
      className={`avatar avatar-${size}${onClick ? " avatar-interactive" : ""}${frameClass}${profileClass}`}
      title={label || (onClick ? `Открыть профиль ${name}` : name)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(event);
        }
      } : undefined}
    >
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : letters || "?"}
      {online && <i className="online-dot" />}
    </span>
  );
}

export function LoadingScreen({ label = "Загружаем Nexora" }) {
  return (
    <div className="loading-screen">
      <div className="loading-orbit"><span /><span /><span /></div>
      <strong>{label}</strong>
    </div>
  );
}

export function InlineLoader({ label = "Загрузка" }) {
  return <span className="inline-loader"><LoaderCircle size={15} className="spin" />{label}</span>;
}

export function EmptyState({ icon: Icon = Radio, title, description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={24} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("ru", { day: "2-digit", month: "short" }).format(date);
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} Б`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / 1024 ** 2).toFixed(1)} МБ`;
}
