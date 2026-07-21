import { useState } from "react";
import { KeyRound, LockKeyhole, LogOut } from "lucide-react";
import { post } from "../api";
import ParticleField from "./ParticleField";
import { NexoraLogo } from "./ui";

export default function ForcedPasswordChange({ user, policy, onChanged, onLogout }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get("newPassword") || "");
    if (next !== form.get("confirmPassword")) return setError("Новые пароли не совпадают.");
    setBusy(true);
    setError("");
    try {
      const result = await post("/api/users/me/password", { currentPassword: form.get("currentPassword"), newPassword: next });
      onChanged(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }
  const hint = [
    `минимум ${policy?.minLength ?? 10} символов`,
    policy?.requireUpper !== false && "заглавная буква",
    policy?.requireLower !== false && "строчная буква",
    policy?.requireNumber !== false && "цифра",
    policy?.requireSymbol && "специальный символ",
  ].filter(Boolean).join(", ");
  return (
    <main className="forced-password-screen">
      <ParticleField />
      <section className="forced-password-card">
        <NexoraLogo compact />
        <div className="auth-lock"><LockKeyhole size={19} /></div>
        <span>SECURITY CHECKPOINT</span>
        <h1>Задайте постоянный пароль</h1>
        <p>Администратор сбросил пароль для <strong>@{user.username}</strong>. До его смены чаты и файлы недоступны.</p>
        <form onSubmit={submit}>
          <label><span>Временный пароль</span><div><KeyRound size={17} /><input name="currentPassword" type="password" autoComplete="current-password" required /></div></label>
          <label><span>Новый пароль</span><div><KeyRound size={17} /><input name="newPassword" type="password" minLength={policy?.minLength ?? 10} maxLength={128} autoComplete="new-password" required /></div></label>
          <label><span>Повторите новый пароль</span><div><KeyRound size={17} /><input name="confirmPassword" type="password" minLength={policy?.minLength ?? 10} maxLength={128} autoComplete="new-password" required /></div></label>
          <small>{hint}</small>
          <p className="auth-error">{error}</p>
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Изменить пароль"}</button>
        </form>
        <button type="button" className="forced-logout" onClick={onLogout}><LogOut size={15} /> Выйти из аккаунта</button>
      </section>
    </main>
  );
}
