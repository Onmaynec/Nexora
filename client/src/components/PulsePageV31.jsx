import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BadgeCheck, Banknote, Check, CircleDollarSign, Cloud, CloudOff, Coins,
  Crown, ExternalLink, Gauge, History, KeyRound, Link2, LoaderCircle, LogOut,
  PackagePlus, ReceiptText, RefreshCcw, ShieldCheck, Target, Unlink, WalletCards,
} from "lucide-react";
import { api } from "../api";
import "../pulse-v31.css";

const TABS = [
  ["overview", "Обзор", Gauge],
  ["wallet", "Кошелёк", WalletCards],
  ["transactions", "Операции", History],
  ["rooms", "Комнаты", Target],
  ["security", "Связь", ShieldCheck],
];

function call(path, method = "GET", body, idempotencyKey) {
  return api(path, {
    method,
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function requestKey(scope, userId) {
  return `${scope}:${userId}:${globalThis.crypto.randomUUID()}`;
}

function decodeBase64UrlJson(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru", { dateStyle: "medium", timeStyle: "short" });
}

function field(value, camel, snake, fallback = null) {
  return value?.[camel] ?? value?.[snake] ?? fallback;
}

function operationLabel(type) {
  return ({
    plus_monthly_grant: "Ежемесячный грант Plus",
    impulse_pack_purchase: "Покупка Импульсов",
    room_goal_contribution: "Вклад в цель комнаты",
    room_goal_refund: "Возврат из цели",
    payment_refund: "Возврат платежа",
    chargeback: "Оспаривание платежа",
    promotional_grant: "Промо-грант",
  })[type] || String(type || "Операция").replaceAll("_", " ");
}

function StatCard({ icon: Icon, label, value, detail, accent = false }) {
  return <article className={`pulse31-stat${accent ? " accent" : ""}`}>
    <span><Icon size={18} /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
  </article>;
}

function Empty({ icon: Icon, title, detail }) {
  return <div className="pulse31-empty"><Icon size={28} /><strong>{title}</strong><span>{detail}</span></div>;
}

export default function PulsePageV31({ initialOverview = null, rooms = [], me, onRefresh, showToast = () => {} }) {
  const [tab, setTab] = useState("overview");
  const [status, setStatus] = useState(null);
  const [account, setAccount] = useState(null);
  const [overview, setOverview] = useState(initialOverview);
  const [transactions, setTransactions] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(() => rooms.find((room) => room.joined)?.id || "");
  const [goals, setGoals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sectionBusy, setSectionBusy] = useState(false);
  const [callbackHandled, setCallbackHandled] = useState(false);

  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId), [rooms, selectedRoomId]);
  const linked = account?.status === "linked";
  const wallet = overview?.wallet || { balance: 0, currency: "IMPULSE" };
  const subscription = overview?.subscription || null;
  const plusActive = Boolean(subscription && ["active", "trialing"].includes(subscription.status));
  const cloudOnline = status?.cloud?.mode === "production" && !overview?.cached;

  const loadStatus = useCallback(async () => {
    const [pulseStatus, linkStatus] = await Promise.all([
      api("/api/v3/pulse/status"),
      api("/api/v3/cloud-account"),
    ]);
    setStatus(pulseStatus);
    setAccount(linkStatus.account || null);
    return Boolean(linkStatus.account?.status === "linked");
  }, []);

  const loadOverview = useCallback(async () => {
    setSectionBusy(true);
    try { setOverview(await api("/api/v3/pulse/overview")); }
    catch (error) { if (error.code !== "CLOUD_ACCOUNT_NOT_LINKED") showToast(error.message, "error"); }
    finally { setSectionBusy(false); }
  }, [showToast]);

  const refreshPulse = useCallback(async () => {
    try { if (await loadStatus()) await loadOverview(); }
    catch (error) { showToast(error.message, "error"); }
  }, [loadOverview, loadStatus, showToast]);

  const loadTransactions = useCallback(async () => {
    if (!linked) return;
    setSectionBusy(true);
    try {
      const [history, receiptHistory] = await Promise.all([
        api("/api/v3/pulse/transactions?limit=100"),
        api("/api/v3/pulse/receipts?limit=50").catch(() => ({ receipts: [] })),
      ]);
      setTransactions(history.transactions || []);
      setReceipts(receiptHistory.receipts || []);
    } catch (error) { showToast(error.message, "error"); }
    finally { setSectionBusy(false); }
  }, [linked, showToast]);

  const loadGoals = useCallback(async (roomId) => {
    if (!linked || !roomId) { setGoals([]); return; }
    setSectionBusy(true);
    try { setGoals((await api(`/api/v3/rooms/${encodeURIComponent(roomId)}/pulse/goals`)).goals || []); }
    catch (error) { showToast(error.message, "error"); }
    finally { setSectionBusy(false); }
  }, [linked, showToast]);

  useEffect(() => { refreshPulse(); }, [refreshPulse]);
  useEffect(() => { if (tab === "transactions") loadTransactions(); }, [loadTransactions, tab]);
  useEffect(() => { if (tab === "rooms") loadGoals(selectedRoomId); }, [loadGoals, selectedRoomId, tab]);

  useEffect(() => {
    if (callbackHandled) return;
    const params = new URLSearchParams(window.location.search);
    const linkId = params.get("linkId");
    const encoded = params.get("attestation");
    if (!linkId || !encoded) return;
    setCallbackHandled(true);
    setBusy(true);
    let attestation;
    try { attestation = decodeBase64UrlJson(encoded); }
    catch {
      showToast("Cloud вернул повреждённое подтверждение связи.", "error");
      setBusy(false);
      return;
    }
    call("/api/v3/cloud-account/link/complete", "POST", { linkId, attestation })
      .then(async () => {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
        await refreshPulse();
        await onRefresh?.();
        setTab("overview");
        showToast("Cloud Account подключён");
      })
      .catch((error) => showToast(error.message, "error"))
      .finally(() => setBusy(false));
  }, [callbackHandled, onRefresh, refreshPulse, showToast]);

  async function connectAccount() {
    setBusy(true);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}?pulse-link-callback=1`;
      const result = await call("/api/v3/cloud-account/link/start", "POST", { redirectUri });
      if (!/^https:\/\//i.test(String(result.authorizationUrl || ""))) throw new Error("Local Server не вернул безопасную Cloud-ссылку.");
      window.location.assign(result.authorizationUrl);
    } catch (error) { showToast(error.message, "error"); setBusy(false); }
  }

  async function unlinkAccount() {
    const currentPassword = window.prompt("Введите текущий пароль Local Account");
    if (!currentPassword || !window.confirm("Отвязать Cloud Account от этого Local Account?")) return;
    setBusy(true);
    try {
      await call("/api/v3/cloud-account/link", "DELETE", { currentPassword });
      setAccount(null);
      setOverview(null);
      setTransactions([]);
      setReceipts([]);
      setGoals([]);
      await onRefresh?.();
      showToast("Cloud Account отвязан");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function checkout(kind) {
    if (!linked) { setTab("security"); return; }
    setBusy(true);
    try {
      const path = kind === "plus" ? "/api/v3/pulse/checkout/subscription" : "/api/v3/pulse/checkout/impulses";
      const body = kind === "plus"
        ? { currency: "EUR", region: "FI" }
        : { productCode: "impulse_pack_500", currency: "EUR", region: "FI" };
      const result = await call(path, "POST", body, requestKey(`checkout:${kind}`, me.id));
      if (!/^https:\/\//i.test(String(result.checkout?.url || ""))) throw new Error("Cloud не вернул безопасную checkout-ссылку.");
      window.open(result.checkout.url, "_blank", "noopener,noreferrer");
      showToast("Checkout открыт. Зачисление произойдёт только после подтверждения провайдером.");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const result = await call("/api/v3/pulse/subscription/portal", "POST", { returnUrl: window.location.href }, requestKey("billing:portal", me.id));
      if (!/^https:\/\//i.test(String(result.url || ""))) throw new Error("Cloud не вернул безопасную ссылку портала.");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function cancelSubscription() {
    if (!window.confirm("Отключить продление Plus в конце текущего периода?")) return;
    setBusy(true);
    try {
      await call("/api/v3/pulse/subscription/cancel", "POST", {}, requestKey("subscription:cancel", me.id));
      await loadOverview();
      showToast("Автопродление Plus отключено");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function createGoal() {
    if (selectedRoom?.viewerRole !== "owner") return;
    const title = window.prompt("Название цели", "Новый набор реакций");
    if (!title) return;
    const targetAmount = Number(window.prompt("Сколько Импульсов собрать?", "500"));
    if (!Number.isSafeInteger(targetAmount) || targetAmount < 10 || targetAmount > 1_000_000) {
      showToast("Введите целое число от 10 до 1 000 000.", "error");
      return;
    }
    const description = window.prompt("Описание цели", "Откроет новую возможность для всей комнаты") || "";
    setBusy(true);
    try {
      await call(`/api/v3/rooms/${encodeURIComponent(selectedRoom.id)}/pulse/goals`, "POST", {
        productCode: "room_reaction_pack",
        title,
        description,
        targetAmount,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        entitlementDurationDays: 30,
      }, requestKey("goal:create", me.id));
      await loadGoals(selectedRoom.id);
      showToast("Цель комнаты создана");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function contribute(goal, requestedAmount) {
    const current = Number(field(goal, "currentAmount", "current_amount", 0));
    const target = Number(field(goal, "targetAmount", "target_amount", 0));
    const amount = Math.min(requestedAmount, Math.max(0, target - current));
    if (!amount || !window.confirm(`Направить до ${amount} Импульсов в цель «${goal.title}»?`)) return;
    setBusy(true);
    try {
      await call(`/api/v3/rooms/${encodeURIComponent(selectedRoomId)}/pulse/goals/${encodeURIComponent(goal.id)}/contributions`, "POST", { amount }, requestKey("goal:contribution", me.id));
      await Promise.all([loadOverview(), loadGoals(selectedRoomId)]);
      showToast("Вклад подтверждён");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function cancelGoal(goal) {
    if (!window.confirm(`Отменить цель «${goal.title}» и вернуть все вклады?`)) return;
    setBusy(true);
    try {
      await call(`/api/v3/rooms/${encodeURIComponent(selectedRoomId)}/pulse/goals/${encodeURIComponent(goal.id)}/cancel`, "POST", {}, requestKey("goal:cancel", me.id));
      await Promise.all([loadOverview(), loadGoals(selectedRoomId)]);
      showToast("Цель отменена, вклады возвращены");
    } catch (error) { showToast(error.message, "error"); }
    finally { setBusy(false); }
  }

  return <div className="section-page pulse31-page">
    <header className="pulse31-hero">
      <div>
        <span>NEXORA PULSE · 3.1</span>
        <h1>Plus, Импульсы и цели.<br /><em>Без платного общения.</em></h1>
        <p>Cloud Account отвечает только за покупки и переносимые права. Сообщения, файлы и комнаты остаются на Local Server.</p>
      </div>
      <div className={`pulse31-cloud-state${cloudOnline ? " online" : ""}`}>
        {cloudOnline ? <Cloud size={20} /> : <CloudOff size={20} />}
        <span><strong>{cloudOnline ? "Pulse Cloud online" : status?.cloud?.mode === "production" ? "Проверенный кэш" : "Cloud отключён"}</strong><small>{linked ? "Cloud Account связан" : "Требуется связь аккаунта"}</small></span>
        <button type="button" onClick={refreshPulse} disabled={sectionBusy}><RefreshCcw className={sectionBusy ? "spin" : ""} size={16} /></button>
      </div>
    </header>

    <nav className="pulse31-tabs" aria-label="Разделы Pulse">
      {TABS.map(([id, label, Icon]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={16} /><span>{label}</span></button>)}
    </nav>

    {!linked && <section className="pulse31-connect-banner">
      <div><span><Link2 size={20} /></span><div><strong>Подключите Cloud Account</strong><p>Для Plus, Импульсов и восстановления покупок на связанных серверах.</p></div></div>
      <button type="button" onClick={connectAccount} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />} Подключить</button>
    </section>}

    {overview?.warning && <section className="pulse31-warning"><RefreshCcw size={17} /><div><strong>Cloud временно недоступен</strong><p>{overview.warning.message} Показаны последние данные с проверенной подписью.</p></div></section>}

    {tab === "overview" && <main className="pulse31-content">
      <div className="pulse31-stats">
        <StatCard icon={Coins} label="Баланс" value={`${wallet.balance ?? 0} ◈`} detail={overview?.cached ? `Кэш от ${formatDate(overview.cachedAt)}` : "Подтверждено Pulse Cloud"} accent />
        <StatCard icon={Crown} label="Nexora Plus" value={plusActive ? "Активен" : "Не подключён"} detail={field(subscription, "currentPeriodEnd", "current_period_end") ? `До ${formatDate(field(subscription, "currentPeriodEnd", "current_period_end"))}` : "Базовые функции бесплатны"} />
        <StatCard icon={BadgeCheck} label="Cloud Account" value={linked ? "Связан" : "Не связан"} detail={account?.cloudAccountId ? `ID ${account.cloudAccountId.slice(0, 12)}…` : "Отдельная Cloud Identity"} />
      </div>
      <section className={`pulse31-plus-card${plusActive ? " active" : ""}`}>
        <div className="pulse31-plus-symbol"><Crown size={30} /></div>
        <div><span>{plusActive ? "PLUS ACTIVE" : "NEXORA PLUS"}</span><h2>{plusActive ? "Plus работает на этом аккаунте" : "Персональный уровень Nexora"}</h2><p>Дополнительное оформление, реакции и 400 Импульсов каждый подтверждённый расчётный период.</p><ul><li><Check size={14} /> 400 Импульсов в месяц</li><li><Check size={14} /> Премиальные рамки и акценты</li><li><Check size={14} /> Покупки привязаны к Cloud Account</li></ul></div>
        <div className="pulse31-plus-actions">{plusActive ? <><button type="button" onClick={openPortal} disabled={busy}><ExternalLink size={16} /> Управление</button>{!field(subscription, "cancelAtPeriodEnd", "cancel_at_period_end", false) && <button type="button" className="secondary" onClick={cancelSubscription} disabled={busy}>Отменить продление</button>}</> : <button type="button" onClick={() => checkout("plus")} disabled={busy || !linked}>Подключить Plus <ExternalLink size={16} /></button>}</div>
      </section>
      <section className="pulse31-principles">
        <article><ShieldCheck /><h3>Без paywall</h3><p>Общение, комнаты, файлы и история не требуют Plus.</p></article>
        <article><Banknote /><h3>Цена только с сервера</h3><p>Клиент не определяет стоимость и сумму списания.</p></article>
        <article><KeyRound /><h3>Подписанные права</h3><p>Возможности применяются после проверки Ed25519.</p></article>
      </section>
    </main>}

    {tab === "wallet" && <main className="pulse31-content">
      <section className="pulse31-wallet-panel">
        <div className="pulse31-wallet-visual"><CircleDollarSign size={34} /><small>Текущий баланс</small><strong>{wallet.balance ?? 0}</strong><span>Импульсов</span></div>
        <div><h2>Кошелёк Импульсов</h2><p>Импульсы используются для коллективных целей. Их нельзя вывести, обменять на деньги или передать напрямую.</p><div className="pulse31-wallet-actions"><button type="button" onClick={() => checkout("impulses")} disabled={!linked || busy}><PackagePlus size={16} /> Купить 500</button><button type="button" className="secondary" onClick={() => setTab("transactions")}><History size={16} /> История</button></div></div>
      </section>
      <section className="pulse31-info-grid"><article><strong>Double-entry</strong><p>Каждое изменение баланса имеет равную дебетовую и кредитовую запись.</p></article><article><strong>Без отрицательного баланса</strong><p>Возвраты и chargeback оформляются компенсациями.</p></article><article><strong>Идемпотентность</strong><p>Повтор запроса не создаёт повторное списание.</p></article></section>
    </main>}

    {tab === "transactions" && <main className="pulse31-content">
      <header className="pulse31-section-head"><div><span>LEDGER HISTORY</span><h2>Операции</h2><p>Подтверждённые изменения баланса и квитанции.</p></div><button type="button" onClick={loadTransactions} disabled={sectionBusy || !linked}><RefreshCcw className={sectionBusy ? "spin" : ""} size={16} /> Обновить</button></header>
      {sectionBusy ? <div className="pulse31-loader"><LoaderCircle className="spin" /> Загружаем операции</div> : transactions.length ? <div className="pulse31-transactions">{transactions.map((item) => {
        const amount = Number(field(item, "amount", "amount", 0));
        return <article key={item.id}><span className={amount >= 0 ? "positive" : "negative"}>{amount >= 0 ? "+" : ""}{amount}</span><div><strong>{operationLabel(field(item, "operationType", "operation_type"))}</strong><small>{formatDate(field(item, "createdAt", "created_at"))} · {item.status || "completed"}</small></div><b>{field(item, "balanceAfter", "balance_after", "—")} ◈</b></article>;
      })}</div> : <Empty icon={ReceiptText} title="Операций пока нет" detail="Покупки, гранты и вклады появятся здесь." />}
      {receipts.length > 0 && <section className="pulse31-receipts"><h3>Квитанции</h3>{receipts.map((receipt) => {
        const url = field(receipt, "providerUrl", "provider_url");
        const amount = Number(field(receipt, "amountMinor", "amount_minor", 0));
        return <a key={receipt.id} href={url || undefined} target={url ? "_blank" : undefined} rel="noreferrer"><ReceiptText size={16} /><span><strong>{field(receipt, "receiptNumber", "receipt_number")}</strong><small>{formatDate(field(receipt, "createdAt", "created_at"))} · {(amount / 100).toFixed(2)} {receipt.currency}</small></span><b>{receipt.status}</b></a>;
      })}</section>}
    </main>}

    {tab === "rooms" && <main className="pulse31-content">
      <header className="pulse31-section-head"><div><span>COLLECTIVE GOALS</span><h2>Цели комнат</h2><p>Участники совместно открывают возможности комнаты.</p></div><label className="pulse31-room-select"><span>Комната</span><select value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}><option value="">Выберите комнату</option>{rooms.filter((room) => room.joined).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label></header>
      {selectedRoom?.viewerRole === "owner" && <button type="button" className="pulse31-create-goal" onClick={createGoal} disabled={busy || !linked}><Target size={17} /> Создать цель</button>}
      {sectionBusy ? <div className="pulse31-loader"><LoaderCircle className="spin" /> Загружаем цели</div> : goals.length ? <div className="pulse31-goals">{goals.map((goal) => {
        const current = Number(field(goal, "currentAmount", "current_amount", 0));
        const target = Number(field(goal, "targetAmount", "target_amount", 1));
        const progress = Math.min(100, Math.round(current / target * 100));
        return <article key={goal.id}><header><span><Target size={17} /> {goal.status === "funded" ? "ЦЕЛЬ ДОСТИГНУТА" : goal.status === "cancelled" ? "ОТМЕНЕНА" : `${progress}%`}</span><b>{goal.status}</b></header><h3>{goal.title}</h3><p>{goal.description}</p><div className="pulse31-progress" role="progressbar" aria-valuemin="0" aria-valuemax={target} aria-valuenow={current}><i style={{ width: `${progress}%` }} /></div><div className="pulse31-goal-numbers"><strong>{current} / {target} ◈</strong><span>{field(goal, "contributionCount", "contribution_count", 0)} вкладов</span></div>{goal.status === "active" && <footer>{[10, 50, 100].map((amount) => <button type="button" key={amount} disabled={busy || Number(wallet.balance || 0) < Math.min(amount, target - current)} onClick={() => contribute(goal, amount)}>+{amount}</button>)}{selectedRoom?.viewerRole === "owner" && <button type="button" className="danger" onClick={() => cancelGoal(goal)}>Отменить</button>}</footer>}</article>;
      })}</div> : <Empty icon={Target} title={selectedRoomId ? "Активных целей нет" : "Выберите комнату"} detail={selectedRoomId ? "Владелец может создать коллективную цель." : "Доступны комнаты, в которых вы состоите."} />}
    </main>}

    {tab === "security" && <main className="pulse31-content">
      <header className="pulse31-section-head"><div><span>CLOUD IDENTITY</span><h2>Связь аккаунтов</h2><p>Local Account автономен. Cloud Account используется только для покупок и переносимых прав.</p></div></header>
      <section className={`pulse31-link-card${linked ? " linked" : ""}`}><span>{linked ? <BadgeCheck size={30} /> : <Link2 size={30} />}</span><div><small>{linked ? "ACCOUNT LINKED" : "NOT LINKED"}</small><h3>{linked ? "Cloud Account подключён" : "Подключите Cloud Account"}</h3><p>{linked ? `Связь подтверждена ${formatDate(account.linkedAt)}. Cloud Account: ${account.cloudAccountId}` : "Local Server не получает Cloud-пароль, MFA-secret, refresh token и платёжные реквизиты."}</p></div>{linked ? <button type="button" className="danger" onClick={unlinkAccount} disabled={busy}><Unlink size={16} /> Отвязать</button> : <button type="button" onClick={connectAccount} disabled={busy}><Link2 size={16} /> Подключить</button>}</section>
      <div className="pulse31-security-list"><article><ShieldCheck size={19} /><div><strong>OAuth 2.1 + PKCE</strong><p>Одноразовый authorization code и S256 challenge.</p></div></article><article><KeyRound size={19} /><div><strong>Ed25519</strong><p>Проверяются Server ID, Local User ID, link ID и nonce.</p></div></article><article><LogOut size={19} /><div><strong>Отзыв связи</strong><p>Отвязывание требует текущий пароль Local Account.</p></div></article></div>
    </main>}
  </div>;
}
