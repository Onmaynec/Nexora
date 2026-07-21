import { useEffect, useState } from "react";
import { ArrowRight, Bell, Check, Cloud, LockKeyhole, MessageCircleMore, ShieldCheck, Sparkles, X } from "lucide-react";
import "../onboarding.css";

const STEPS = [
  {
    eyebrow: "WELCOME TO NEXORA",
    title: "Ваши разговоры. Ваш сервер.",
    description: "Nexora объединяет личные сообщения, комнаты, файлы и голосовые в одном самостоятельном пространстве.",
    icon: MessageCircleMore,
    points: ["Local-first хранение", "Windows, браузер и Android", "Офлайн-кэш и очередь отправки"],
  },
  {
    eyebrow: "TRUST MODEL",
    title: "Безопасность не скрыта за интерфейсом.",
    description: "Права, блокировки, лимиты комнат и загрузок проверяются сервером для каждого запроса.",
    icon: ShieldCheck,
    points: ["CSRF и Origin protection", "Роли owner / moderator / member", "Подписанные Pulse entitlements"],
  },
  {
    eyebrow: "NEXORA PULSE",
    title: "Plus без платного общения.",
    description: "Cloud Account нужен только для покупок и переносимых прав. Пароль Cloud и платёжные данные не попадают в Local Server.",
    icon: Cloud,
    points: ["OAuth 2.1 + PKCE", "Импульсы для целей комнат", "Базовые функции всегда бесплатны"],
  },
  {
    eyebrow: "READY",
    title: "Настройте уведомления и начинайте.",
    description: "Разрешение можно изменить позже в настройках браузера или приложения.",
    icon: Bell,
    points: ["Уведомления о новых сообщениях", "Тихие часы и режим упоминаний", "Синхронизация после восстановления сети"],
  },
];

export default function ProductOnboarding({ children }) {
  const [visible, setVisible] = useState(() => localStorage.getItem("nexora:onboarding:3.1.0") !== "done");
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;

  useEffect(() => {
    if (!visible) document.documentElement.classList.remove("onboarding-open");
    else document.documentElement.classList.add("onboarding-open");
    return () => document.documentElement.classList.remove("onboarding-open");
  }, [visible]);

  if (!visible) return children;

  async function finish() {
    if (step === STEPS.length - 1 && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* Browser controls the permission result. */ }
    }
    localStorage.setItem("nexora:onboarding:3.1.0", "done");
    setVisible(false);
  }

  return <>{children}<div className="product-onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className="product-onboarding-backdrop" />
    <section className="product-onboarding-card">
      <header><div className="product-onboarding-brand"><span><Sparkles size={18} /></span><strong>NEXORA</strong><small>3.1</small></div><button type="button" aria-label="Закрыть знакомство" onClick={finish}><X size={18} /></button></header>
      <div className="product-onboarding-progress" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>{STEPS.map((_, index) => <i key={index} className={index <= step ? "active" : ""} />)}</div>
      <main>
        <div className="product-onboarding-icon"><Icon size={34} /></div>
        <span>{current.eyebrow}</span>
        <h1 id="onboarding-title">{current.title}</h1>
        <p>{current.description}</p>
        <ul>{current.points.map((point) => <li key={point}><Check size={15} /> {point}</li>)}</ul>
      </main>
      <footer><button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Назад</button><span>{step + 1} / {STEPS.length}</span>{step < STEPS.length - 1 ? <button type="button" className="primary" onClick={() => setStep((value) => value + 1)}>Далее <ArrowRight size={16} /></button> : <button type="button" className="primary" onClick={finish}><LockKeyhole size={16} /> Открыть Nexora</button>}</footer>
    </section>
  </div></>;
}
