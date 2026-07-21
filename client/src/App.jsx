import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearCsrfToken, post } from "./api";
import AuthScreen from "./components/AuthScreen";
import ForcedPasswordChange from "./components/ForcedPasswordChange";
import GlobalVoiceDock from "./components/GlobalVoiceDock";
import Workspace from "./components/Workspace";
import { LoadingScreen } from "./components/ui";
import { getSocket } from "./socket";
import { flushOutbox } from "./outbox";

function playNotificationSound(name) {
  if (!name || name === "none") return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const notes = name === "chime" ? [660, 880] : name === "pulse" ? [440, 440] : [620];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.11;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });
    setTimeout(() => context.close(), 700);
  } catch {}
}

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [me, setMe] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [serverInfo, setServerInfo] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const refreshTimer = useRef(null);
  const toastTimer = useRef(null);
  const bootstrapRef = useRef(null);
  const socket = getSocket();

  const showToast = useCallback((message, type = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3_000);
  }, []);

  const refresh = useCallback(async () => {
    if (!me?.id) return null;
    try {
      const result = await api("/api/bootstrap");
      setBootstrap(result);
      bootstrapRef.current = result;
      setMe((current) => current?.id === result.me.id
        && current.displayName === result.me.displayName
        && current.status === result.me.status
        && current.avatarUrl === result.me.avatarUrl
        && current.role === result.me.role ? current : result.me);
      setOnlineUserIds(new Set(result.onlineUserIds));
      return result;
    } catch (error) {
      if (error.status === 401) {
        setMe(null);
        setBootstrap(null);
        bootstrapRef.current = null;
        setAuthState("anonymous");
        socket.disconnect();
      } else {
        showToast(error.message, "error");
      }
      return null;
    }
  }, [me?.id, showToast, socket]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const result = await api("/api/health");
        if (!cancelled) { setServerOnline(true); setServerInfo(result); }
      } catch {
        if (!cancelled) setServerOnline(false);
      }
    }
    check();
    const timer = setInterval(check, 5_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    api("/api/auth/me")
      .then((result) => {
        setMe(result.user);
        setAuthState(result.user ? "authenticated" : "anonymous");
      })
      .catch(() => setAuthState("anonymous"));
  }, []);

  useEffect(() => {
    if (!me || me.mustChangePassword) return undefined;
    refresh();
    socket.connect();

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(refresh, 120);
    };
    const onPresence = (ids) => setOnlineUserIds(new Set(ids));
    const onMessage = (message) => {
      scheduleRefresh();
      if (message.sender.id === me.id || document.visibilityState === "visible") return;
      if (localStorage.getItem("nexora:notifications") === "off") return;
      const snapshot = bootstrapRef.current;
      const conversation = snapshot?.conversations?.find((item) => item.id === message.conversationId);
      if (conversation?.notificationSettings?.muted) return;
      const sound = snapshot?.preferences?.notificationSound ?? "subtle";
      if ("Notification" in window && Notification.permission === "granted") {
        const body = message.type === "text" ? message.text : message.type === "voice" ? "Голосовое сообщение" : "Новое вложение";
        new Notification(message.sender.displayName, { body, tag: `nexora-${message.conversationId}`, silent: true });
        playNotificationSound(sound);
      }
    };
    const onConnect = () => {
      setServerOnline(true);
      flushOutbox(socket, me.id).then((result) => {
        if (result.sent) scheduleRefresh();
        if (result.failed) showToast(`${result.failed} сообщений ожидают повторной отправки`, "error");
      });
      scheduleRefresh();
    };
    const onDisconnect = () => setServerOnline(false);
    const onConnectError = (error) => {
      if (error.message === "UNAUTHORIZED") {
        setMe(null);
        setBootstrap(null);
        setAuthState("anonymous");
      }
    };

    socket.on("data:refresh", scheduleRefresh);
    socket.on("message:new", onMessage);
    socket.on("presence:update", onPresence);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    return () => {
      clearTimeout(refreshTimer.current);
      socket.off("data:refresh", scheduleRefresh);
      socket.off("message:new", onMessage);
      socket.off("presence:update", onPresence);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [me?.id, me?.mustChangePassword, refresh, socket]);

  async function authenticated(result) {
    setMe(result.user);
    setAuthState("authenticated");
    if (result.firstAdmin) showToast("Это первый аккаунт — вам назначены права администратора сервера.");
  }

  async function logout() {
    try { await post("/api/auth/logout"); } catch {}
    socket.disconnect();
    setMe(null);
    setBootstrap(null);
    bootstrapRef.current = null;
    setAuthState("anonymous");
    clearCsrfToken();
  }

  if (authState === "loading") return <LoadingScreen />;
  if (!me) return <AuthScreen onAuthenticated={authenticated} serverOnline={serverOnline} passwordPolicy={serverInfo?.passwordPolicy} />;
  if (me.mustChangePassword) return <ForcedPasswordChange user={me} policy={serverInfo?.passwordPolicy} onLogout={logout} onChanged={(user) => { setMe(user); setBootstrap(null); setAuthState("authenticated"); }} />;
  if (!bootstrap) return <LoadingScreen label="Собираем ваши чаты" />;

  return (
    <>
      <Workspace
        me={me}
        bootstrap={bootstrap}
        socket={socket}
        onlineUserIds={onlineUserIds}
        onRefresh={refresh}
        onMeChanged={(user) => { setMe(user); setBootstrap((current) => current ? { ...current, me: user } : current); }}
        onLogout={logout}
        showToast={showToast}
      />
      <GlobalVoiceDock />
      <div className={`toast${toast ? " visible" : ""}${toast?.type === "error" ? " error" : ""}`} role="status">{toast?.message ?? ""}</div>
    </>
  );
}
