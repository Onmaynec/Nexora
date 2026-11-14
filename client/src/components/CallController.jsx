import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, RefreshCcw, Settings2, Volume2, X } from "lucide-react";
import { api } from "../api";
import { emitAck, getSocket } from "../socket";
import UserProfileModal from "./UserProfileModal";
import { Avatar } from "./ui";

const TERMINAL = new Set(["ended", "declined", "missed", "failed"]);
const stateLabels = {
  ringing: "Вызов…",
  connecting: "Соединяем…",
  active: "Разговор",
  reconnecting: "Восстанавливаем соединение…",
  ended: "Вызов завершён",
  declined: "Вызов отклонён",
  missed: "Пропущенный вызов",
  failed: "Не удалось соединиться",
};

function seconds(value) {
  const amount = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(amount / 60)}:${String(amount % 60).padStart(2, "0")}`;
}

function platformGuidance(code) {
  if (code === "MEDIA_PERMISSION_DENIED") return "Разрешите доступ к микрофону в настройках сайта или приложения и повторите вызов.";
  if (code === "TURN_UNAVAILABLE") return "TURN relay недоступен. Проверьте конфигурацию Local Server или повторите позже.";
  if (code === "PEER_UNSUPPORTED") return "Эта платформа не поддерживает WebRTC-вызовы.";
  if (code === "NO_AUDIO_DEVICE") return "Подключите микрофон и обновите список устройств.";
  return "Проверьте сеть и повторите вызов.";
}

function quietHoursActive() {
  try {
    const value = JSON.parse(localStorage.getItem("nexora:quiet-hours") || "{}");
    const start = String(value.start || "");
    const end = String(value.end || "");
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start === end) return false;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);
    const from = startHour * 60 + startMinute;
    const until = endHour * 60 + endMinute;
    return from < until ? minutes >= from && minutes < until : minutes >= from || minutes < until;
  } catch {
    return false;
  }
}

function normalizeError(error, fallback = "CALL_FAILED") {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return { code: "MEDIA_PERMISSION_DENIED", message: "Доступ к микрофону запрещён.", requestId: null };
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return { code: "NO_AUDIO_DEVICE", message: "Микрофон не найден.", requestId: null };
  }
  return {
    code: error?.code || fallback,
    message: error?.message || "Вызов не выполнен.",
    requestId: error?.requestId || null,
  };
}

export default function CallController() {
  const socket = getSocket();
  const [call, setCall] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [muted, setMuted] = useState(false);
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [inputId, setInputId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [deepLinkProfile, setDeepLinkProfile] = useState(null);
  const [deepLinkError, setDeepLinkError] = useState("");
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const sequenceRef = useRef(0);
  const pendingIceRef = useRef([]);
  const offerStartedRef = useRef(false);
  const callRef = useRef(null);
  const incomingRef = useRef(null);
  const inputIdRef = useRef("");

  useEffect(() => { inputIdRef.current = inputId; }, [inputId]);
  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices({ inputs: [], outputs: [] });
      return;
    }
    const items = await navigator.mediaDevices.enumerateDevices();
    const inputs = items.filter((item) => item.kind === "audioinput");
    const outputs = items.filter((item) => item.kind === "audiooutput");
    setDevices({ inputs, outputs });
    if (!inputIdRef.current && inputs[0]) {
      inputIdRef.current = inputs[0].deviceId;
      setInputId(inputs[0].deviceId);
    }
    setOutputId((current) => current || outputs[0]?.deviceId || "");
  }, []);

  const releaseMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    sequenceRef.current = 0;
    offerStartedRef.current = false;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.pause();
    }
    setMuted(false);
  }, []);

  const finishLocal = useCallback((nextCall, nextError = null) => {
    releaseMedia();
    setIncoming(null);
    setSettingsOpen(false);
    if (nextError) setError(nextError);
    if (nextCall) {
      setCall(nextCall);
      setTimeout(() => setCall((current) => current?.callId === nextCall.callId && TERMINAL.has(current.state) ? null : current), 2_500);
    } else {
      setCall(null);
    }
  }, [releaseMedia]);

  const sendSignal = useCallback(async (kind, data) => {
    const current = callRef.current;
    if (!current?.callId) return;
    sequenceRef.current += 1;
    await emitAck(socket, "call.signal", {
      callId: current.callId,
      sequence: sequenceRef.current,
      kind,
      data,
    }, 10_000);
  }, [socket]);

  const ensureLocalStream = useCallback(async (preferredId = inputIdRef.current) => {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
      throw Object.assign(new Error("WebRTC не поддерживается этой платформой."), { code: "PEER_UNSUPPORTED" });
    }
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: preferredId ? { deviceId: { exact: preferredId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    localStreamRef.current = stream;
    setMuted(false);
    await refreshDevices();
    return stream;
  }, [refreshDevices]);

  const ensurePeer = useCallback(async (callId) => {
    if (peerRef.current) return peerRef.current;
    const credentials = await api(`/api/v3/calls/${encodeURIComponent(callId)}/turn-credentials`, { method: "POST", body: JSON.stringify({}) });
    const stream = await ensureLocalStream();
    const peer = new RTCPeerConnection({ iceServers: credentials.iceServers, iceTransportPolicy: "all" });
    peerRef.current = peer;
    remoteStreamRef.current = new MediaStream();
    for (const track of stream.getTracks()) peer.addTrack(track, stream);
    peer.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks?.() || [event.track]) remoteStreamRef.current.addTrack(track);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
        remoteAudioRef.current.play().catch((failure) => setError(normalizeError(failure)));
      }
    };
    peer.onicecandidate = (event) => {
      sendSignal("ice", event.candidate ? event.candidate.toJSON() : null).catch((failure) => setError(normalizeError(failure)));
    };
    peer.onconnectionstatechange = () => {
      const current = callRef.current;
      if (!current?.callId) return;
      if (peer.connectionState === "connected") {
        emitAck(socket, "call:state", { callId: current.callId, state: "active" }).catch((failure) => setError(normalizeError(failure)));
      } else if (peer.connectionState === "disconnected") {
        emitAck(socket, "call:state", { callId: current.callId, state: "reconnecting" }).catch((failure) => setError(normalizeError(failure)));
      } else if (peer.connectionState === "failed") {
        emitAck(socket, "call:state", { callId: current.callId, state: "failed", reason: "peer_connection_failed" }).catch((failure) => setError(normalizeError(failure)));
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") peer.restartIce?.();
    };
    return peer;
  }, [ensureLocalStream, sendSignal, socket]);

  const startOffer = useCallback(async (current) => {
    if (!current?.callId || offerStartedRef.current) return;
    offerStartedRef.current = true;
    try {
      const peer = await ensurePeer(current.callId);
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      await sendSignal("offer", { type: "offer", sdp: offer.sdp });
    } catch (failure) {
      const normalized = normalizeError(failure);
      setError(normalized);
      await emitAck(socket, "call:end", { callId: current.callId, reason: normalized.code }).catch((failure) => setError(normalizeError(failure)));
    }
  }, [ensurePeer, sendSignal, socket]);

  const startCall = useCallback(async (user) => {
    if (!user?.id || callRef.current || incomingRef.current) return;
    setError(null);
    const callId = globalThis.crypto.randomUUID();
    try {
      const result = await emitAck(socket, "call:start", { callId, targetUserId: user.id }, 10_000);
      setCall(result.call);
      callRef.current = result.call;
    } catch (failure) {
      setError(normalizeError(failure));
    }
  }, [socket]);

  const answer = useCallback(async () => {
    const candidate = incoming;
    if (!candidate) return;
    setError(null);
    try {
      callRef.current = candidate;
      setCall(candidate);
      await ensurePeer(candidate.callId);
      const result = await emitAck(socket, "call:answer", { callId: candidate.callId }, 10_000);
      setIncoming(null);
      setCall(result.call);
      callRef.current = result.call;
    } catch (failure) {
      releaseMedia();
      callRef.current = null;
      setCall(null);
      setError(normalizeError(failure));
    }
  }, [ensurePeer, incoming, releaseMedia, socket]);

  const decline = useCallback(async () => {
    const candidate = incoming;
    if (!candidate) return;
    await emitAck(socket, "call:decline", { callId: candidate.callId }).catch((failure) => setError(normalizeError(failure)));
    setIncoming(null);
  }, [incoming, socket]);

  const end = useCallback(async () => {
    const current = callRef.current;
    if (!current?.callId) return;
    await emitAck(socket, "call:end", { callId: current.callId, reason: "user_ended" }).catch((failure) => setError(normalizeError(failure)));
    finishLocal({ ...current, state: "ended", endedAt: new Date().toISOString() });
  }, [finishLocal, socket]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  }, [muted]);

  const switchInput = useCallback(async (deviceId) => {
    const oldId = inputIdRef.current;
    inputIdRef.current = deviceId;
    setInputId(deviceId);
    const previous = localStreamRef.current;
    if (!previous) return;

    let replacement;
    try {
      replacement = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (localStreamRef.current !== previous) {
        replacement.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = replacement.getAudioTracks()[0];
      if (!track) throw new Error("Выбранный микрофон не передаёт аудио.");
      const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "audio");
      if (peerRef.current && !sender) throw new Error("Аудиоканал звонка недоступен.");
      const enabled = previous.getAudioTracks()[0]?.enabled !== false;
      track.enabled = enabled;
      if (sender) await sender.replaceTrack(track);
      if (localStreamRef.current !== previous) {
        replacement.getTracks().forEach((item) => item.stop());
        return;
      }
      localStreamRef.current = replacement;
      previous.getTracks().forEach((item) => item.stop());
      setMuted(!enabled);
    } catch (failure) {
      replacement?.getTracks().forEach((track) => track.stop());
      inputIdRef.current = oldId;
      setInputId(oldId);
      setError(normalizeError(failure));
    }
  }, []);

  const switchOutput = useCallback(async (deviceId) => {
    setOutputId(deviceId);
    try {
      if (remoteAudioRef.current?.setSinkId) await remoteAudioRef.current.setSinkId(deviceId);
    } catch (failure) {
      setError(normalizeError(failure, "OUTPUT_DEVICE_FAILED"));
    }
  }, []);

  useEffect(() => () => releaseMedia(), [releaseMedia]);

  useEffect(() => {
    const onStart = (event) => startCall(event.detail?.user);
    const onIncoming = (event) => {
      if (callRef.current) return;
      setError(null);
      setIncoming(event.call);
      if (document.visibilityState !== "visible" && !quietHoursActive() && localStorage.getItem("nexora:notifications") !== "off" && "Notification" in window && Notification.permission === "granted") {
        new Notification("Входящий вызов Nexora", { body: event.call?.peer?.displayName || "Входящий вызов", tag: `nexora-call-${event.call?.callId}` });
      }
    };
    const onState = (event) => {
      const next = event.call;
      const current = callRef.current;
      if (incomingRef.current?.callId === next.callId && TERMINAL.has(next.state)) setIncoming(null);
      if (!current || current.callId !== next.callId) {
        if (next.direction === "outgoing" || !TERMINAL.has(next.state)) {
          setCall(next);
          callRef.current = next;
        }
      } else {
        setCall(next);
        callRef.current = next;
      }
      if (next.state === "connecting" && next.direction === "outgoing") startOffer(next);
      if (TERMINAL.has(next.state)) finishLocal(next);
    };
    const onSignal = async (event) => {
      const current = callRef.current;
      if (!current || event.callId !== current.callId || (event.expiresAt && Date.parse(event.expiresAt) <= Date.now())) return;
      try {
        const peer = await ensurePeer(current.callId);
        if (event.kind === "offer") {
          await peer.setRemoteDescription({ type: "offer", sdp: event.data.sdp });
          for (const candidate of pendingIceRef.current.splice(0)) await peer.addIceCandidate(candidate);
          const answerDescription = await peer.createAnswer();
          await peer.setLocalDescription(answerDescription);
          await sendSignal("answer", { type: "answer", sdp: answerDescription.sdp });
        } else if (event.kind === "answer") {
          await peer.setRemoteDescription({ type: "answer", sdp: event.data.sdp });
          for (const candidate of pendingIceRef.current.splice(0)) await peer.addIceCandidate(candidate);
        } else if (event.kind === "ice") {
          if (!event.data) return;
          if (peer.remoteDescription) await peer.addIceCandidate(event.data);
          else pendingIceRef.current.push(event.data);
        } else if (event.kind === "restart") {
          peer.restartIce?.();
        }
      } catch (failure) {
        const normalized = normalizeError(failure);
        setError(normalized);
        emitAck(socket, "call:state", { callId: current.callId, state: "failed", reason: normalized.code }).catch((failure) => setError(normalizeError(failure)));
      }
    };
    const onDisconnect = () => {
      const current = callRef.current;
      if (current) finishLocal({ ...current, state: "failed", reason: "socket_disconnected" }, { code: "TEMPORARY_UNAVAILABLE", message: "Соединение с Local Server потеряно.", requestId: null });
    };
    const onDeviceChange = () => refreshDevices().catch((failure) => setError(normalizeError(failure)));
    window.addEventListener("nexora:start-call", onStart);
    socket.on("call.incoming", onIncoming);
    socket.on("call.state_changed", onState);
    socket.on("call.signal", onSignal);
    socket.on("disconnect", onDisconnect);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    refreshDevices().catch((failure) => setError(normalizeError(failure)));
    return () => {
      window.removeEventListener("nexora:start-call", onStart);
      socket.off("call.incoming", onIncoming);
      socket.off("call.state_changed", onState);
      socket.off("call.signal", onSignal);
      socket.off("disconnect", onDisconnect);
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [ensurePeer, finishLocal, refreshDevices, sendSignal, socket, startCall, startOffer]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.get("nexora") !== "profile") return;
    const serverId = query.get("serverId") || "";
    const id = query.get("id") || "";
    let cancelled = false;
    api(`/api/v3/deep-links/resolve?serverId=${encodeURIComponent(serverId)}&type=profile&id=${encodeURIComponent(id)}`)
      .then((result) => { if (!cancelled) setDeepLinkProfile(result.object?.profile || null); })
      .catch(() => { if (!cancelled) setDeepLinkError("Профиль по ссылке недоступен или скрыт настройками доступа."); });
    return () => { cancelled = true; };
  }, []);

  function closeDeepLink() {
    setDeepLinkProfile(null);
    setDeepLinkError("");
    history.replaceState(history.state, "", `${location.pathname}${location.hash}`);
  }

  function openDeepLinkConversation(conversationId) {
    const target = new URL(location.href);
    target.search = "";
    target.searchParams.set("conversation", conversationId);
    location.assign(target.toString());
  }

  useEffect(() => {
    const startedAt = call?.answeredAt && ["active", "reconnecting"].includes(call.state) ? Date.parse(call.answeredAt) : null;
    if (!startedAt) return setElapsed(0);
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [call?.answeredAt, call?.state]);

  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape") {
        if (incoming) decline(); else if (callRef.current && !TERMINAL.has(callRef.current.state)) end();
      }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [decline, end, incoming, toggleMute]);

  const visibleCall = incoming || call;
  if (!visibleCall && !error && !deepLinkProfile && !deepLinkError) return <audio ref={remoteAudioRef} autoPlay playsInline />;

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {visibleCall && (
        <div className="call-overlay" role="dialog" aria-modal="true" aria-label={incoming ? "Входящий вызов" : "Голосовой вызов"}>
          <section className={`call-card state-${visibleCall.state}`}>
            <div className="call-pulse" aria-hidden="true"><span /><span /><span /></div>
            <Avatar user={visibleCall.peer || { displayName: "Nexora" }} size="xlarge" />
            <h2>{visibleCall.peer?.displayName || "Недоступный пользователь"}</h2>
            <p aria-live="polite">{incoming ? "Входящий голосовой вызов" : stateLabels[visibleCall.state] || visibleCall.state}</p>
            {call?.state === "active" && <strong className="call-timer">{seconds(elapsed)}</strong>}
            {error && <div className="call-error"><b>{error.code}</b><span>{error.message}</span><small>{platformGuidance(error.code)}{error.requestId ? ` · requestId ${error.requestId}` : ""}</small></div>}
            {incoming ? (
              <div className="call-actions incoming">
                <button type="button" className="call-decline" onClick={decline} aria-label="Отклонить вызов"><PhoneOff size={22} /></button>
                <button type="button" className="call-answer" onClick={answer} aria-label="Ответить на вызов"><Phone size={22} /></button>
              </div>
            ) : (
              <div className="call-actions">
                <button type="button" className={muted ? "active" : ""} onClick={toggleMute} aria-label={muted ? "Включить микрофон" : "Выключить микрофон"}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
                <button type="button" onClick={() => setSettingsOpen((value) => !value)} aria-label="Настройки устройств" aria-expanded={settingsOpen}><Settings2 size={20} /></button>
                <button type="button" className="call-decline" onClick={end} aria-label="Завершить вызов"><PhoneOff size={22} /></button>
              </div>
            )}
            {settingsOpen && (
              <div className="call-device-settings">
                <label><span><Mic size={15} /> Микрофон</span><select value={inputId} onChange={(event) => switchInput(event.target.value)}>{devices.inputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Микрофон ${index + 1}`}</option>)}</select></label>
                <label><span><Volume2 size={15} /> Вывод</span><select value={outputId} disabled={!remoteAudioRef.current?.setSinkId} onChange={(event) => switchOutput(event.target.value)}>{devices.outputs.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Устройство ${index + 1}`}</option>)}</select></label>
                <button type="button" onClick={() => refreshDevices().catch((failure) => setError(normalizeError(failure)))}><RefreshCcw size={15} /> Обновить устройства</button>
              </div>
            )}
          </section>
        </div>
      )}
      {!visibleCall && error && (
        <div className="call-diagnostic-toast" role="alert"><span><b>{error.code}</b>{error.message}</span><button type="button" onClick={() => setError(null)} aria-label="Закрыть"><X size={16} /></button></div>
      )}
      {deepLinkProfile && <UserProfileModal initialUser={deepLinkProfile} onClose={closeDeepLink} onOpenConversation={openDeepLinkConversation} onOpenSettings={closeDeepLink} showToast={(message, type) => type === "error" ? setDeepLinkError(message) : setError({ code: "CONNECT", message, requestId: null })} />}
      {deepLinkError && !deepLinkProfile && <div className="deep-link-error" role="alert"><span>{deepLinkError}</span><button type="button" onClick={closeDeepLink}>Закрыть</button></div>}
    </>
  );
}
