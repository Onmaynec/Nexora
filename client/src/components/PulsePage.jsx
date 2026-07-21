import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowUpRight, Check, Coins, Crown, Database, Gauge, Gift, LoaderCircle,
  Palette, RefreshCcw, ShieldCheck, SmilePlus, Sparkles, Target, Zap,
} from "lucide-react";
import { api, patch, post } from "../api";
import { formatTime } from "./ui";

const productIcons = { database: Database, chart: Gauge, archive: Archive, sparkles: Sparkles, smile: SmilePlus };
const accents = [
  { id: "violet", label: "Violet", color: "#9b5cff" },
  { id: "amethyst", label: "Amethyst", color: "#bd78ff" },
  { id: "rose", label: "Rose", color: "#ff79ad" },
  { id: "ocean", label: "Ocean", color: "#65caff" },
  { id: "graphite", label: "Graphite", color: "#a7a3b0" },
  { id: "emerald", label: "Emerald", color: "#70e6b1" },
];
const frames = ["none", "pulse", "orbit", "prism"];

export default function PulsePage({ initialOverview, rooms, me, onMeChanged, onRefresh, showToast }) {
  const [overview, setOverview] = useState(initialOverview);
  const [busy, setBusy] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(() => rooms.find((room) => room.joined)?.id ?? "");
  const [goals, setGoals] = useState([]);
  const [catalog, setCatalog] = useState(initialOverview?.roomCatalog ?? []);
  const [goalsBusy, setGoalsBusy] = useState(false);
  const plus = overview?.plan?.code === "nexora_plus";
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId), [rooms, selectedRoomId]);

  async function loadOverview() {
    setBusy(true);
    try { setOverview(await api("/api/pulse/overview")); }
    catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function loadGoals(roomId = selectedRoomId) {
    if (!roomId) return setGoals([]);
    setGoalsBusy(true);
    try {
      const result = await api(`/api/pulse/rooms/${encodeURIComponent(roomId)}/goals`);
      setGoals(result.goals);
      setCatalog(result.catalog);
    } catch (error) { showToast(error.message, "error"); }
    finally { setGoalsBusy(false); }
  }

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { loadGoals(selectedRoomId); }, [selectedRoomId]);

  async function activateSandbox() {
    setBusy(true);
    try {
      const result = await post("/api/pulse/sandbox/activate-plus");
      setOverview(result);
      await onRefresh();
      showToast("Nexora Plus активирован в тестовом Pulse Sandbox");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function checkout() {
    if (!window.confirm("Открыть защищённую страницу Nexora Billing для оформления Plus? Оплата считается выполненной только после подтверждения провайдером.")) return;
    setBusy(true);
    try {
      const result = await post("/api/pulse/checkout");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function applyStyle(fields) {
    try {
      const result = await patch("/api/users/me", fields);
      onMeChanged(result.user);
      await onRefresh();
      showToast("Оформление профиля обновлено");
    } catch (error) { showToast(error.message, "error"); }
  }

  async function createGoal(productCode) {
    if (!window.confirm("Опубликовать эту цель комнаты? После первого взноса продукт и требуемая сумма не изменяются.")) return;
    try {
      await post(`/api/pulse/rooms/${encodeURIComponent(selectedRoomId)}/goals`, { productCode });
      await loadGoals();
      showToast("Цель комнаты опубликована");
    } catch (error) { showToast(error.message, "error"); }
  }

  async function contribute(goal, amount) {
    if (!window.confirm(`Направить до ${amount} импульсов в цель «${goal.title}»? Последний взнос может быть принят частично, если до цели осталось меньше.`)) return;
    try {
      const result = await api(`/api/pulse/goals/${encodeURIComponent(goal.id)}/contributions`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount }),
      });
      setOverview((current) => current ? { ...current, wallet: { ...current.wallet, balance: result.balance } } : current);
      await loadGoals();
      showToast(result.refusedPulse > 0
        ? `Принято ${result.acceptedPulse} импульсов, ${result.refusedPulse} не списано`
        : `В цель направлено ${result.acceptedPulse} импульсов`);
    } catch (error) { showToast(error.message, "error"); }
  }

  async function cancelGoal(goal) {
    if (!window.confirm(`Отменить цель «${goal.title}»? Все тестовые взносы будут автоматически возвращены.`)) return;
    try {
      const result = await api(`/api/pulse/goals/${encodeURIComponent(goal.id)}/cancel`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: "{}",
      });
      await Promise.all([loadOverview(), loadGoals()]);
      showToast(`Цель отменена · возвращено ${result.refundedPulse} импульсов`);
    } catch (error) { showToast(error.message, "error"); }
  }

  const mode = overview?.status?.mode ?? "disabled";
  const canManageSelected = selectedRoom?.viewerRole === "owner";

  return (
    <div className="section-page pulse-page">
      <header className="section-page-head pulse-head">
        <div><span>NEXORA PULSE · 2.0</span><h1>Больше возможностей.<br /><em>Без платного общения.</em></h1><p>Личные сообщения, комнаты, файлы и голосовые остаются бесплатными. Plus добавляет оформление и импульсы для развития любимых комнат.</p></div>
        <div className="pulse-balance"><Coins size={20} /><span>Ваш баланс</span><strong>{overview?.wallet?.balance ?? 0}</strong><small>ИМПУЛЬСОВ</small></div>
      </header>

      {overview?.warning && <div className="pulse-warning"><RefreshCcw size={16} /><span><strong>Показаны последние подтверждённые данные</strong>{overview.warning.message}</span></div>}

      <section className={`plus-hero${plus ? " active" : ""}`}>
        <div className="plus-orbit"><Sparkles size={27} /><i /><i /><i /></div>
        <div className="plus-copy"><span>{plus ? "PLUS ACTIVE" : "NEXORA PLUS"}</span><h2>{plus ? "Ваш Plus работает" : "Персональный уровень Nexora"}</h2><p>{plus ? `Следующее подтверждение: ${overview.plan.renewsAt ? new Date(overview.plan.renewsAt).toLocaleDateString("ru") : "бессрочно"}` : "Премиальное оформление, наборы реакций и ежемесячные импульсы. Базовые функции мессенджера не ограничиваются."}</p></div>
        <div className="plus-cta">
          {plus ? <span><Check size={18} /> Активен</span>
            : mode === "production" ? <button type="button" onClick={checkout} disabled={busy}>Подключить Plus <ArrowUpRight size={17} /></button>
              : mode === "sandbox" ? <button type="button" onClick={activateSandbox} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Zap size={17} />} Активировать тестовый Plus</button>
                : <span className="plus-disabled"><ShieldCheck size={17} /> Billing не подключён</span>}
          <small>{mode === "sandbox" ? "Тестовый режим · без реального платежа" : mode === "production" ? "Оплата проходит в Nexora Billing" : "Администратор может подключить Pulse Cloud"}</small>
        </div>
      </section>

      <div className="pulse-grid">
        <section className="pulse-card benefits-card"><header><Gift size={18} /><div><span>PLUS BENEFITS</span><h2>Что входит</h2></div></header><div className="benefit-list">{(overview?.benefits ?? []).map((benefit) => <div key={benefit}><Check size={15} /><span>{benefit}</span></div>)}</div></section>
        <section className={`pulse-card style-card${plus ? "" : " locked"}`}><header><Palette size={18} /><div><span>IDENTITY</span><h2>Стиль профиля</h2></div></header><p>Акцент виден в карточке профиля. Рамка работает на всех аватарах пользователя.</p><div className="accent-picker">{accents.map((accent) => <button type="button" key={accent.id} className={me.profileColor === accent.id ? "active" : ""} disabled={!plus && accent.id !== "violet"} onClick={() => applyStyle({ profileColor: accent.id })} title={accent.label}><i style={{ background: accent.color }} /></button>)}</div><div className="frame-picker">{frames.map((frame) => <button type="button" key={frame} className={me.avatarFrame === frame ? "active" : ""} disabled={!plus && frame !== "none"} onClick={() => applyStyle({ avatarFrame: frame })}>{frame === "none" ? "Без рамки" : frame}</button>)}</div>{!plus && <div className="locked-note"><Crown size={14} /> Остальные варианты входят в Plus</div>}</section>
      </div>

      <section className="room-pulse-section">
        <header><div><span>COLLECTIVE GOALS</span><h2>Импульсы для комнат</h2><p>Участники вместе открывают функции комнаты. Импульсы нельзя передавать другому пользователю или обменивать на деньги.</p></div><label>Комната<select value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}><option value="">Выберите комнату</option>{rooms.filter((room) => room.joined).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label></header>
        {goalsBusy ? <div className="pulse-loader"><LoaderCircle className="spin" /> Загружаем цели</div> : selectedRoomId ? <>
          <div className="goal-grid">{goals.map((goal) => {
            const progress = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
            return <article key={goal.id} className={`goal-card ${goal.status}`}><header><Target size={18} /><span>{goal.status === "funded" ? "ОТКРЫТО" : goal.status === "cancelled" ? "ОТМЕНЕНО" : goal.status === "expired" ? "СРОК ИСТЁК" : `${progress}%`}</span></header><h3>{goal.title}</h3><p>{goal.description}</p><div className="goal-progress" role="progressbar" aria-label={`Прогресс цели ${goal.title}`} aria-valuemin="0" aria-valuemax={goal.targetAmount} aria-valuenow={goal.currentAmount}><i style={{ width: `${progress}%` }} /></div><div className="goal-numbers"><strong>{goal.currentAmount} / {goal.targetAmount}</strong><span>{goal.contributionCount} вкладов</span></div>{goal.status === "active" && <div className="goal-actions">{[10, 50, 100].map((amount) => <button key={amount} type="button" disabled={(overview?.wallet?.balance ?? 0) < Math.min(amount, goal.targetAmount - goal.currentAmount)} onClick={() => contribute(goal, amount)}>+{amount}</button>)}{canManageSelected && <button type="button" className="goal-cancel" onClick={() => cancelGoal(goal)}>Отменить</button>}</div>}</article>;
          })}</div>
          {!goals.length && <div className="pulse-empty"><Target size={24} /><strong>У комнаты пока нет активных целей</strong><span>{canManageSelected ? "Выберите возможность из каталога ниже." : "Владелец комнаты может открыть коллективную цель."}</span></div>}
          {canManageSelected && <div className="pulse-catalog"><h3>Каталог комнаты</h3><div>{catalog.map((product) => { const Icon = productIcons[product.icon] || Sparkles; const exists = goals.some((goal) => goal.productCode === product.code && goal.status === "active"); const available = product.available && overview?.status?.enabled; return <article key={product.code} className={product.available ? "" : "unavailable"}><Icon size={18} /><span><strong>{product.title}</strong><small>{product.available ? product.description : `${product.description} · ${product.availabilityReason}`}</small></span><b>{product.target} ◈</b><button type="button" disabled={exists || !available} onClick={() => createGoal(product.code)}>{exists ? "Активно" : !product.available ? "Нужен адаптер" : overview?.status?.enabled ? "Открыть цель" : "Pulse отключён"}</button></article>; })}</div></div>}
        </> : <div className="pulse-empty"><Target size={24} /><strong>Выберите комнату</strong><span>Здесь появятся общие цели и прогресс участников.</span></div>}
      </section>

      <footer className="pulse-legal"><ShieldCheck size={16} /><span>Номер карты и платёжные реквизиты не передаются локальному Nexora Server. Денежные операции выполняет только настроенный Nexora Billing, а сервер принимает подписанные права.</span><time>{overview?.cachedAt ? `Синхронизация ${formatTime(overview.cachedAt)}` : ""}</time></footer>
    </div>
  );
}
