import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Eye, EyeOff, KeyRound, LockKeyhole, Radio, UserRound, Zap } from "lucide-react";
import { post } from "../api";
import ParticleField from "./ParticleField";
import { NexoraLogo } from "./ui";

function Field({ icon: Icon, label, ...props }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className="auth-input-wrap">
        <Icon size={17} aria-hidden="true" />
        <input {...props} />
      </div>
    </label>
  );
}

export default function AuthScreen({ onAuthenticated, serverOnline, passwordPolicy }) {
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ displayName: "", username: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const minimum = passwordPolicy?.minLength ?? 10;

  useEffect(() => setError(""), [mode]);

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (mode === "register" && form.password !== form.confirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    try {
      const result = await post(`/api/auth/${mode}`, mode === "login"
        ? { username: form.username, password: form.password }
        : { displayName: form.displayName, username: form.username, password: form.password });
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <ParticleField />
      <div className="auth-vignette" aria-hidden="true" />
      <motion.section
        className="auth-intro"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75 }}
      >
        <NexoraLogo />
        <div className="auth-kicker"><Zap size={14} /> PRIVATE COMMUNICATION LAYER</div>
        <h1>Связь, которая<br /><em>остаётся вашей.</em></h1>
        <p>Личные сообщения, комнаты и файлы внутри закрытого сетевого контура.</p>
        <div className={`server-state ${serverOnline ? "online" : "offline"}`}>
          <Radio size={15} />
          <span>{serverOnline ? "Локальный сервер доступен" : "Ожидаем локальный сервер"}</span>
        </div>
      </motion.section>

      <motion.div
        className="auth-card-shell"
        initial={{ opacity: 0, scale: 0.96, x: 20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ duration: 0.65, delay: 0.12 }}
      >
        <div className="neon-frame" aria-hidden="true" />
        <section className="auth-card">
          <div className="auth-card-head">
            <div className="auth-lock"><LockKeyhole size={18} /></div>
            <div>
              <span>SECURE ACCESS</span>
              <h2>{mode === "login" ? "С возвращением" : "Создать аккаунт"}</h2>
            </div>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Авторизация">
            {[["login", "Вход"], ["register", "Регистрация"]].map(([value, label]) => (
              <button key={value} type="button" className={mode === value ? "active" : ""} onClick={() => setMode(value)}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <Field icon={UserRound} label="Отображаемое имя" value={form.displayName} onChange={update("displayName")} autoComplete="name" maxLength={48} placeholder="Как вас будут видеть" required />
                </motion.div>
              )}
            </AnimatePresence>
            <Field icon={AtSign} label="Username" value={form.username} onChange={update("username")} autoComplete="username" maxLength={24} pattern="[a-zA-Z0-9_.-]{3,24}" placeholder="your_username" required />
            <label className="auth-field">
              <span>Пароль</span>
              <div className="auth-input-wrap">
                <KeyRound size={17} />
                <input type={showPassword ? "text" : "password"} value={form.password} onChange={update("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? minimum : 1} maxLength={128} placeholder={mode === "register" ? `Минимум ${minimum} символов` : "Ваш пароль"} required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            {mode === "register" && (
              <Field icon={KeyRound} label="Повторите пароль" type={showPassword ? "text" : "password"} value={form.confirm} onChange={update("confirm")} autoComplete="new-password" minLength={minimum} placeholder="Ещё раз" required />
            )}
            <p className="auth-error" role="alert">{error}</p>
            <button className="auth-submit" type="submit" disabled={busy || !serverOnline}>
              <span>{busy ? "Подключаем…" : mode === "login" ? "Войти в Nexora" : "Создать аккаунт"}</span>
              <b aria-hidden="true">↗</b>
            </button>
          </form>
          <p className="auth-footnote">Сессия хранится только на вашем локальном сервере.</p>
        </section>
      </motion.div>
    </main>
  );
}
