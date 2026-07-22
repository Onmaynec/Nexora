import { useEffect, useRef, useState } from "react";
import {
  Bell, BellOff, Camera, Copy, DownloadCloud, Fingerprint, KeyRound, Laptop, LoaderCircle, QrCode,
  LogOut, MonitorSmartphone, RefreshCcw, Server, ShieldBan, ShieldCheck, Smartphone,
  Volume2, X,
} from "lucide-react";
import { api, patch, post, remove, uploadAvatar } from "../api";
import TrustDevicesCard from "./TrustDevicesCard";
import { Avatar } from "./ui";

function deviceLabel(userAgent) {
  const value = String(userAgent || "");
  if (/Electron/i.test(value)) return { icon: MonitorSmartphone, title: "Nexora Client" };
  if (/Windows/i.test(value)) return { icon: Laptop, title: "Windows · браузер" };
  if (/Android|iPhone|Mobile/i.test(value)) return { icon: Smartphone, title: "Мобильный браузер" };
  return { icon: Laptop, title: "Браузер" };
}

export default function SettingsPage({ me, blocked, version, server, preferences, passwordPolicy, onMeChanged, onOpenProfile, onUnblock, onLogout, showToast }) {
  const [displayName, setDisplayName] = useState(me.displayName);
  const [status, setStatus] = useState(me.status ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [notifications, setNotifications] = useState(localStorage.getItem("nexora:notifications") !== "off");
  const [sound, setSound] = useState(preferences?.notificationSound ?? "subtle");
  const [sessions, setSessions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [update, setUpdate] = useState(null);
  const [totpEnabled, setTotpEnabled] = useState(Boolean(me.totpEnabled));
  const [totpSetup, setTotpSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [notificationMode, setNotificationMode] = useState(preferences?.notificationMode ?? "all");
  const [quietHoursStart, setQuietHoursStart] = useState(preferences?.quietHoursStart ?? "");
  const [quietHoursEnd, setQuietHoursEnd] = useState(preferences?.quietHoursEnd ?? "");
  const [installReady, setInstallReady] = useState(Boolean(window.nexoraInstallPrompt));
  const avatarInput = useRef(null);

  async function loadSessions() {
    try { setSessions((await api("/api/sessions")).sessions); } catch (error) { showToast(error.message, "error"); }
  }

  useEffect(() => {
    loadSessions();
    const onInstallReady = () => setInstallReady(true);
    window.addEventListener("nexora:install-ready", onInstallReady);
    if (!window.nexoraClient?.updateStatus) return () => window.removeEventListener("nexora:install-ready", onInstallReady);
    window.nexoraClient.updateStatus().then(setUpdate);
    const removeUpdate = window.nexoraClient.onUpdate?.(setUpdate);
    return () => { removeUpdate?.(); window.removeEventListener("nexora:install-ready", onInstallReady); };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await patch("/api/users/me", { displayName, status, bio });
      onMeChanged(result.user);
      showToast("Профиль обновлён");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function changeAvatar(files) {
    const file = files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const result = await uploadAvatar(file);
      onMeChanged(result.user);
      showToast("Аватар обновлён");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get("newPassword") || "");
    if (next !== String(form.get("confirmPassword") || "")) return showToast("Новые пароли не совпадают", "error");
    setSaving(true);
    try {
      await post("/api/users/me/password", { currentPassword: form.get("currentPassword"), newPassword: next });
      event.currentTarget.reset();
      await loadSessions();
      showToast("Пароль изменён, остальные сессии завершены");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleNotifications() {
    const next = !notifications;
    if (next && "Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    setNotifications(next);
    localStorage.setItem("nexora:notifications", next ? "on" : "off");
  }

  async function changeSound(value) {
    setSound(value);
    try {
      await patch("/api/users/me", { notificationSound: value });
      showToast("Звук уведомлений сохранён");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function endSession(session) {
    try {
      const result = await remove(`/api/sessions/${session.id}`);
      if (result.currentEnded) return onLogout();
      await loadSessions();
      showToast("Сессия завершена");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function endAllSessions() {
    if (!window.confirm("Завершить все активные сессии Nexora?")) return;
    try { await post("/api/sessions/revoke-all"); } catch {}
    onLogout();
  }

  async function beginTotp() {
    try { setTotpSetup(await post("/api/users/me/totp/setup")); } catch (error) { showToast(error.message, "error"); }
  }

  async function enableTotp(event) {
    event.preventDefault();
    try {
      const result = await post("/api/users/me/totp/enable", { code: new FormData(event.currentTarget).get("code") });
      setRecoveryCodes(result.recoveryCodes);
      setTotpEnabled(true);
      setTotpSetup(null);
      onMeChanged({ ...me, totpEnabled: true });
      showToast("Двухфакторная защита включена");
    } catch (error) { showToast(error.message, "error"); }
  }

  async function disableTotp(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/users/me/totp", { method: "DELETE", body: JSON.stringify({ password: form.get("password"), code: form.get("code") }) });
      setTotpEnabled(false); setRecoveryCodes([]); onMeChanged({ ...me, totpEnabled: false }); event.currentTarget.reset();
      showToast("Двухфакторная защита выключена");
    } catch (error) { showToast(error.message, "error"); }
  }

  async function saveNotificationPreferences() {
    try {
      await patch("/api/users/me/preferences", { notificationMode, quietHoursStart, quietHoursEnd });
      showToast("Режим уведомлений сохранён");
    } catch (error) { showToast(error.message, "error"); }
  }

  async function installPwa() {
    const prompt = window.nexoraInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    window.nexoraInstallPrompt = null;
    setInstallReady(false);
  }

  return (
    <div className="section-page settings-page">
      <header className="section-page-head"><div><span>IDENTITY & DEVICES</span><h1>Настройки</h1><p>Профиль, безопасность и уведомления Nexora.</p></div><div className="release-badge"><span>RELEASE</span><strong>v{version ?? "3.0.0"}</strong></div></header>
      <div className="settings-grid settings-grid-v3">
        <section className="settings-card profile-settings-card">
          <div className="settings-card-title"><ShieldCheck size={20} /><div><h3>Профиль</h3><span>@{me.username}</span></div></div>
          <div className="avatar-editor"><Avatar user={me} size="large" /><input ref={avatarInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => changeAvatar(event.target.files)} /><button type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>{avatarBusy ? <LoaderCircle className="spin" size={17} /> : <Camera size={17} />} Загрузить аватар</button><small>JPG, PNG, WEBP или GIF · до 5 МБ</small></div>
          <form className="stacked-settings-form" onSubmit={saveProfile}><label>Отображаемое имя<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={48} /></label><label>Статус<input value={status} onChange={(event) => setStatus(event.target.value)} maxLength={80} placeholder="Например, На связи" /></label><label>О себе<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={240} rows={3} placeholder="Коротко расскажите о себе" /></label><button className="violet-button" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить профиль"}</button></form>
        </section>

        <section className="settings-card notification-settings-card">
          <div className="settings-card-title">{notifications ? <Bell size={20} /> : <BellOff size={20} />}<div><h3>Windows-уведомления</h3><span>Для новых сообщений в фоне</span></div></div>
          <button type="button" className={`toggle${notifications ? " on" : ""}`} onClick={toggleNotifications}><i /><span>{notifications ? "Включены" : "Выключены"}</span></button>
          <label className="sound-select"><span><Volume2 size={16} /> Звук уведомлений</span><select value={sound} onChange={(event) => changeSound(event.target.value)}><option value="none">Без звука</option><option value="subtle">Тихий</option><option value="pulse">Импульс</option><option value="chime">Сигнал</option></select></label>
          <label className="sound-select"><span>Какие события показывать</span><select value={notificationMode} onChange={(event) => setNotificationMode(event.target.value)}><option value="all">Все сообщения</option><option value="mentions">Только упоминания и ответы</option><option value="none">Не показывать</option></select></label>
          <div className="quiet-hours"><label>Тихие часы с<input type="time" value={quietHoursStart} onChange={(event) => setQuietHoursStart(event.target.value)} /></label><label>до<input type="time" value={quietHoursEnd} onChange={(event) => setQuietHoursEnd(event.target.value)} /></label></div>
          <button type="button" className="server-switch" onClick={saveNotificationPreferences}>Сохранить режим</button>
        </section>

        <section className="settings-card totp-card">
          <div className="settings-card-title"><QrCode size={20} /><div><h3>Двухфакторная защита</h3><span>{totpEnabled ? "Включена" : "TOTP и резервные коды"}</span></div></div>
          {!totpEnabled && !totpSetup && <button type="button" className="server-switch" onClick={beginTotp}>Настроить 2FA</button>}
          {totpSetup && <><img className="totp-qr" src={totpSetup.qrCode} alt="QR-код TOTP" /><code className="totp-secret">{totpSetup.secret}</code><form className="password-form" onSubmit={enableTotp}><input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Код из приложения" required /><button type="submit">Подтвердить</button></form></>}
          {totpEnabled && <form className="password-form" onSubmit={disableTotp}><input name="password" type="password" autoComplete="current-password" placeholder="Текущий пароль" required /><input name="code" autoComplete="one-time-code" placeholder="Одноразовый или резервный код" required /><button type="submit" className="outline-danger">Выключить 2FA</button></form>}
          {recoveryCodes.length > 0 && <div className="recovery-codes"><strong>Сохраните коды сейчас — повторно они не показываются</strong><code>{recoveryCodes.join("\n")}</code><button type="button" onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}><Copy size={15} /> Копировать</button></div>}
        </section>

        {(installReady || window.matchMedia?.("(display-mode: standalone)").matches) && <section className="settings-card pwa-card"><div className="settings-card-title"><DownloadCloud size={20} /><div><h3>Приложение для браузера и Android</h3><span>{window.matchMedia?.("(display-mode: standalone)").matches ? "Уже установлено" : "PWA с офлайн-историей"}</span></div></div>{installReady && <button type="button" className="server-switch" onClick={installPwa}>Установить Nexora</button>}</section>}

        <section className="settings-card password-card">
          <div className="settings-card-title"><KeyRound size={20} /><div><h3>Изменить пароль</h3><span>Остальные устройства будут отключены</span></div></div>
          <form className="password-form" onSubmit={changePassword}><input name="currentPassword" type="password" placeholder="Текущий пароль" autoComplete="current-password" required /><input name="newPassword" type="password" placeholder={`Новый пароль · минимум ${passwordPolicy?.minLength ?? 10} символов`} minLength={passwordPolicy?.minLength ?? 10} maxLength={128} autoComplete="new-password" required /><input name="confirmPassword" type="password" placeholder="Повторите новый пароль" minLength={passwordPolicy?.minLength ?? 10} maxLength={128} autoComplete="new-password" required /><button type="submit" disabled={saving}>Изменить пароль</button></form>
        </section>

        <TrustDevicesCard serverId={server?.id} userId={me.id} onLogout={onLogout} showToast={showToast} />

        <section className="settings-card sessions-card">
          <div className="settings-card-title"><MonitorSmartphone size={20} /><div><h3>Активные сессии</h3><span>{sessions.length} устройств</span></div></div>
          <div className="session-list">{sessions.map((session) => { const device = deviceLabel(session.userAgent); const Icon = device.icon; return <div className="session-row" key={session.id}><Icon size={18} /><span><strong>{device.title}{session.current ? " · это устройство" : ""}</strong><small>{session.ip} · {new Date(session.lastSeenAt).toLocaleString("ru")}</small></span><button type="button" onClick={() => endSession(session)} title="Завершить"><X size={15} /></button></div>; })}</div>
          <button type="button" className="outline-danger" onClick={endAllSessions}><LogOut size={16} /> Завершить все сессии</button>
        </section>

        <section className="settings-card server-trust-card">
          <div className="settings-card-title"><Server size={20} /><div><h3>Этот сервер</h3><span>Защита от незаметной подмены</span></div></div>
          <div className="server-identity-row"><Fingerprint size={18} /><span><strong>Отпечаток сертификата</strong><code>{server?.fingerprint || "HTTPS не используется"}</code></span></div>
          <div className="server-identity-row"><ShieldCheck size={18} /><span><strong>Server ID</strong><code>{server?.id || "—"}</code></span></div>
          {window.nexoraClient?.showConnector && <button type="button" className="server-switch" onClick={() => window.nexoraClient.showConnector()}>Сменить сервер</button>}
        </section>

        {window.nexoraClient?.checkForUpdates && <section className="settings-card update-card">
          <div className="settings-card-title"><DownloadCloud size={20} /><div><h3>Обновления Client</h3><span>{update?.status === "downloaded" ? `Версия ${update.availableVersion} готова` : update?.status === "downloading" ? `Загрузка · ${update.progress}%` : update?.status === "available" ? `Доступна ${update.availableVersion}` : update?.status === "current" ? "Установлена актуальная версия" : update?.reason === "feed_not_configured" ? "Канал обновлений не настроен" : "Автоматическая проверка"}</span></div></div>
          {update?.status === "downloaded" ? <button type="button" className="server-switch" onClick={() => window.nexoraClient.installUpdate()}>Перезапустить и установить</button> : <button type="button" className="server-switch" onClick={() => window.nexoraClient.checkForUpdates().then(setUpdate)}><RefreshCcw size={15} /> Проверить обновления</button>}
        </section>}

        <section className="settings-card blocked-card">
          <div className="settings-card-title"><ShieldBan size={20} /><div><h3>Заблокированные</h3><span>Не могут писать лично и отправлять заявки</span></div></div>
          {blocked.length ? blocked.map((user) => <div className="blocked-row" key={user.id}><Avatar user={user} size="small" onClick={() => onOpenProfile(user)} /><span><strong>{user.displayName}</strong><small>@{user.username}</small></span><button type="button" onClick={() => onUnblock(user)}>Разблокировать</button></div>) : <p className="settings-empty">Список пуст</p>}
        </section>

        <section className="settings-card danger-card"><div><h3>Выйти на этом устройстве</h3><p>Остальные активные сессии продолжат работать.</p></div><button type="button" onClick={onLogout}>Выйти из Nexora</button></section>
      </div>
    </div>
  );
}
