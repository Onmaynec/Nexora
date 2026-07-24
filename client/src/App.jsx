import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearCsrfToken, CLIENT_VERSION, post } from "./api";
import AuthScreen from "./components/AuthScreen";
import ForcedPasswordChange from "./components/ForcedPasswordChange";
import GlobalVoiceDock from "./components/GlobalVoiceDock";
import Workspace from "./components/Workspace";
import { LoadingScreen } from "./components/ui";
import { getSocket } from "./socket";
import { flushOutbox } from "./outbox";
import { cacheBootstrap, readLastBootstrap, syncSequenceKey } from "./offline-store";

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
    setTimeout(() => context.close().catch((error) => console.debug("Notification audio cleanup failed", error)), 700);
  } catch (error) {
    console.debug("Notification sound unavailable", error);
  }
}

function quietHoursActive(preferences, date = new Date()) {
  const start = String(preferences?.quietHoursStart || "");
  const end = String(preferences?.quietHoursEnd || "");
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start === end) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const from = startHour * 60 + startMinute;
  const until = endHour * 60 + endMinute;
  return from < until ? minutes >= from && minutes < until : minutes >= from || minutes < until;
}

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [me, setMe] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [serverInfo, setServerInfo] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
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

  const clearAuthenticatedState = useCallback(() => {
    socket.disconnect();
    setMe(null);
    setBootstrap(null);
    bootstrapRef.current = null;
    setOnlineUserIds(new Set());
    setOfflineMode(false);
    setAuthState("anonymous");
    clearCsrfToken();
  }, [socket]);

  const applyMessagePreview = useCallback((message) => {
    if (!message?.conversationId) return;
    setBootstrap((current) => {
      if (!current) return current;
      let changed = false;
      const conversations = (current.conversations || []).map((conversation) => {
        if (conversation.id !== message.conversationId) return conversation;
        changed = true;
        return { ...conversation, lastMessage: message, updatedAt: message.createdAt || conversation.updatedAt };
      });
      if (!changed) return current;
      const next = { ...current, conversations };
      bootstrapRef.current = next;
      cacheBootstrap(next).catch((error) => console.debug("Bootstrap cache update failed", error));
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!me?.id) return null;
    try {
      const result = await api("/api/bootstrap");
      setBootstrap(result);
      bootstrapRef.current = result;
      cacheBootstrap(result).catch((error) => console.debug("Bootstrap cache update failed", error));
      setOfflineMode(false);
      setMe((current) => current?.id === result.me.id
        && current.displayName === result.me.displayName
        && current.status === result.me.status
        && current.avatarUrl === result.me.avatarUrl
        && current.role === result.me.role ? current : result.me);
      setOnlineUserIds(new Set(result.onlineUserIds));
      return result;
    } catch (error) {
      if (error.status === 401 || error.code === "AUTH_REQUIRED") {
        clearAuthenticatedState();
      } else {
        setOfflineMode(true);
        if (!bootstrapRef.current) showToast(`${error.message}${error.requestId ? ` · requestId ${error.requestId}` : ""}`, "error");
      }
      return null;
    }
  }, [clearAuthenticatedState, me?.id, showToast]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const result = await api("/api/health");
        if (!cancelled) {
          setServerOnline(true);
          setServerInfo(result);
        }
      } catch {
        if (!cancelled) setServerOnline(false);
      }
    }
    check();
    const timer = setInterval(check, 5_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    api("/api/auth/me")
      .then((result) => {
        setMe(result.user);
        setAuthState(result.user ? "authenticated" : "anonymous");
      })
      .catch(async () => {
        const cached = await readLastBootstrap().catch(() => null);
        if (cached?.me) {
          setMe(cached.me);
          setBootstrap(cached);
          bootstrapRef.current = cached;
          setOnlineUserIds(new Set());
          setOfflineMode(true);
          setAuthState("authenticated");
        } else {
          setAuthState("anonymous");
        }
      });
  }, []);

  useEffect(() => {
    if (authState !== "authenticated" || !me?.id || me.mustChangePassword || bootstrap) return undefined;
    refresh();
    return undefined;
  }, [authState, bootstrap, me?.id, me?.mustChangePassword, refresh]);

  useEffect(() => {
    if (authState !== "authenticated" || !me?.id || me.mustChangePassword || !bootstrap?.server?.id) return undefined;

    socket.auth = { clientVersion: CLIENT_VERSION };
    socket.connect();

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(refresh, 120);
    };
    const onPresence = (ids) => setOnlineUserIds(new Set(ids));
    const onMessage = (message) => {
      applyMessagePreview(message);
      if (message.sender?.id === me.id || document.visibilityState === "visible") return;
      if (localStorage.getItem("nexora:notifications") === "off") return;
      const snapshot = bootstrapRef.current;
      const conversation = snapshot?.conversations?.find((item) => item.id === message.conversationId);
      if (conversation?.notificationSettings?.muted) return;
      const preferences = snapshot?.preferences ?? {};
      const mode = conversation?.notificationSettings?.mode ?? preferences.notificationMode ?? "all";
      const direct = message.mentions?.includes(me.id) || message.reply?.senderId === me.id;
      if (message.silent || mode === "none" || (mode === "mentions" && !direct) || quietHoursActive(preferences)) return;
      const sound = preferences.notificationSound ?? "subtle";
      if ("Notification" in window && Notification.permission === "granted") {
        const body = message.type === "encrypted" ? "Legacy secure history обновлена" : message.type === "text" ? message.text : message.type === "voice" ? "Голосовое сообщение" : "Новое вложение";
        new Notification(message.sender?.displayName || "Nexora", { body, tag: `nexora-${message.conversationId}`, silent: true });
        playNotificationSound(sound);
      }
    };
    const onConnect = async () => {
      setServerOnline(true);
      setOfflineMode(false);
      const outboxResult = await flushOutbox(socket, me.id);
      if (outboxResult.sent) scheduleRefresh();
      if (outboxResult.failed) showToast(`${outboxResult.failed} сообщений ожидают повторной отправки`, "error");
      const snapshot = bootstrapRef.current;
      if (snapshot?.server?.id) {
        const key = syncSequenceKey(snapshot.server.id, me.id);
        const after = Number(localStorage.getItem(key) || snapshot.sync?.latestSequence || 0);
        try {
          const delta = await api(`/api/v3/sync?after=${Math.max(0, after)}&limit=500`);
          localStorage.setItem(key, String(delta.latestSequence || after));
          if (delta.resyncRequired || delta.events.length) scheduleRefresh();
        } catch (error) {
          console.debug("Delta sync deferred", error);
        }
      }
      scheduleRefresh();
    };
    const onDisconnect = () => {
      setServerOnline(false);
      setOfflineMode(true);
    };
    const onConnectError = (error) => {
      setServerOnline(false);
      const code = error.data?.code || error.message;
      if (["AUTH_REQUIRED", "UNAUTHORIZED"].includes(code)) clearAuthenticatedState();
      else if (code === "CLIENT_VERSION_INCOMPATIBLE") showToast("Версия клиента несовместима с Local Server.", "error");
    };
    const onSessionRevoked = (event) => {
      clearAuthenticatedState();
      showToast(`Сессия отозвана${event?.reason ? `: ${event.reason}` : "."}`, "error");
    };

    socket.on("data:refresh", scheduleRefresh);
    socket.on("message:new", onMessage);
    socket.on("message:updated", applyMessagePreview);
    socket.on("presence:update", onPresence);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("session.revoked", onSessionRevoked);
    socket.on("device.updated", scheduleRefresh);
    socket.on("legacy_secure_history.state", scheduleRefresh);

    return () => {
      clearTimeout(refreshTimer.current);
      socket.off("data:refresh", scheduleRefresh);
      socket.off("message:new", onMessage);
      socket.off("message:updated", applyMessagePreview);
      socket.off("presence:update", onPresence);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("session.revoked", onSessionRevoked);
      socket.off("device.updated", scheduleRefresh);
      socket.off("legacy_secure_history.state", scheduleRefresh);
    };
  }, [applyMessagePreview, authState, bootstrap?.server?.id, clearAuthenticatedState, me?.id, me?.mustChangePassword, refresh, showToast, socket]);

  async function authenticated(result) {
    setMe(result.user);
    setAuthState("authenticated");
    if (result.firstAdmin) showToast("Это первый аккаунт — вам назначены права администратора сервера.");
  }

  async function logout() {
    try {
      await post("/api/auth/logout");
    } catch (error) {
      console.debug("Remote logout failed; clearing the local session state", error);
    }
    clearAuthenticatedState();
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
      {offlineMode && <div className="offline-banner" role="status">Офлайн-режим · история доступна из локального кэша, новые сообщения стоят в очереди</div>}
      <GlobalVoiceDock />
      <div className={`toast${toast ? " visible" : ""}${toast?.type === "error" ? " error" : ""}`} role="status">{toast?.message ?? ""}</div>
    </>
  );
}
