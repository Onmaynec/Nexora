import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Coins, LoaderCircle, Target, X } from "lucide-react";

function localDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialForm() {
  return {
    title: "Новые реакции комнаты",
    description: "Открывает расширенный набор реакций для всех участников комнаты на 30 дней.",
    targetAmount: "400",
    expiresAt: localDateTime(Date.now() + 30 * 24 * 60 * 60_000),
  };
}

export default function GoalDialog({ open, room, busy = false, onCancel, onSubmit }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const minDeadline = useMemo(() => localDateTime(Date.now() + 60 * 60_000), [open]);

  useEffect(() => {
    if (!open) return undefined;
    setForm(initialForm());
    setError("");
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    const targetAmount = Number(form.targetAmount);
    const expiresAt = new Date(form.expiresAt);
    if (title.length < 3 || title.length > 120) return setError("Название должно содержать от 3 до 120 символов.");
    if (description.length < 3 || description.length > 1000) return setError("Описание должно содержать от 3 до 1000 символов.");
    if (!Number.isSafeInteger(targetAmount) || targetAmount < 400 || targetAmount > 1_000_000) return setError("Цель должна быть целым числом от 400 до 1 000 000 Импульсов.");
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now() + 55 * 60_000) return setError("Срок должен быть как минимум на час позже текущего времени.");
    await onSubmit?.({ title, description, targetAmount, expiresAt: expiresAt.toISOString(), productCode: "room_reaction_pack", entitlementDurationDays: 30 });
  }

  return <div className="pulse-goal-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}>
    <form className="pulse-goal-dialog" role="dialog" aria-modal="true" aria-labelledby="pulse-goal-title" onSubmit={submit}>
      <header>
        <span><Target size={20} /></span>
        <div><small>COLLECTIVE GOAL</small><h2 id="pulse-goal-title">Создать цель комнаты</h2><p>{room?.name || "Выбранная комната"}</p></div>
        <button type="button" onClick={onCancel} disabled={busy} aria-label="Закрыть"><X size={18} /></button>
      </header>
      <div className="pulse-goal-dialog-body">
        <label><span>Название</span><input autoFocus value={form.title} maxLength={120} onChange={(event) => update("title", event.target.value)} required /></label>
        <label><span>Описание</span><textarea value={form.description} maxLength={1000} rows={4} onChange={(event) => update("description", event.target.value)} required /></label>
        <div className="pulse-goal-dialog-grid">
          <label><span><Coins size={14} /> Цель в Импульсах</span><input type="number" inputMode="numeric" min="400" max="1000000" step="1" value={form.targetAmount} onChange={(event) => update("targetAmount", event.target.value)} required /></label>
          <label><span><CalendarClock size={14} /> Срок</span><input type="datetime-local" min={minDeadline} value={form.expiresAt} onChange={(event) => update("expiresAt", event.target.value)} required /></label>
        </div>
        <aside><strong>Результат цели</strong><p>После достижения цели сервер атомарно активирует расширенные реакции комнаты на 30 дней. При отмене активной цели все принятые вклады возвращаются участникам.</p></aside>
        {error && <div className="pulse-goal-dialog-error" role="alert">{error}</div>}
      </div>
      <footer><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Отмена</button><button type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Target size={16} />} Создать цель</button></footer>
    </form>
  </div>;
}
