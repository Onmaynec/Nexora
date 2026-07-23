import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, ShieldAlert } from "lucide-react";
import { finiteDuration, formatVoiceDuration, normalizeVoiceWaveform, seekRatio } from "../utils/voice-waveform";

const PLAYBACK_RATES = [1, 1.5, 2];

function mediaDuration(audio, fallback) {
  const direct = finiteDuration(audio?.duration, -1);
  if (direct > 0) return direct;
  if (audio?.seekable?.length) {
    const end = finiteDuration(audio.seekable.end(audio.seekable.length - 1));
    if (end > 0) return end;
  }
  return finiteDuration(fallback);
}

export default function SecureVoicePlayer({ resource, waveform = [], duration = 0 }) {
  const audioRef = useRef(null);
  const waveRef = useRef(null);
  const frameRef = useRef(0);
  const draggingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(finiteDuration(duration));
  const [rateIndex, setRateIndex] = useState(0);
  const [error, setError] = useState("");
  const bars = useMemo(() => normalizeVoiceWaveform(waveform), [waveform]);
  const progress = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
  const activeIndex = Math.min(bars.length - 1, Math.floor(progress * bars.length));
  const rate = PLAYBACK_RATES[rateIndex];

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  useEffect(() => {
    setCurrent(0);
    setTotal(finiteDuration(duration));
    setPlaying(false);
    setError("");
  }, [resource.url, duration]);

  function syncClock() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrent(finiteDuration(audio.currentTime));
    setTotal((value) => mediaDuration(audio, value || duration));
    if (!audio.paused && !audio.ended) frameRef.current = requestAnimationFrame(syncClock);
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    setError("");
    try {
      if (audio.paused) {
        audio.playbackRate = rate;
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      setError("Голосовое не удалось воспроизвести.");
      setPlaying(false);
    }
  }

  function setPosition(ratio) {
    const audio = audioRef.current;
    const resolved = mediaDuration(audio, total || duration);
    if (!audio || resolved <= 0) return;
    const next = Math.max(0, Math.min(resolved, ratio * resolved));
    audio.currentTime = next;
    setCurrent(next);
  }

  function positionFromPointer(event) {
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(seekRatio(event.clientX, rect.left, rect.width));
  }

  function onPointerDown(event) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    positionFromPointer(event);
  }

  function onPointerMove(event) {
    if (draggingRef.current) positionFromPointer(event);
  }

  function onPointerUp(event) {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    positionFromPointer(event);
  }

  function onSeekKey(event) {
    const step = event.shiftKey ? 10 : 5;
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) event.preventDefault();
    if (event.key === "Home") setPosition(0);
    else if (event.key === "End") setPosition(1);
    else if (event.key === "ArrowLeft") setPosition(Math.max(0, current - step) / Math.max(1, total));
    else if (event.key === "ArrowRight") setPosition(Math.min(total, current + step) / Math.max(1, total));
  }

  function cycleRate() {
    const nextIndex = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(nextIndex);
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[nextIndex];
  }

  function updateDuration(event) {
    setTotal(mediaDuration(event.currentTarget, duration));
  }

  return <div className={`secure-voice-message${playing ? " playing" : ""}${error ? " failed" : ""}`}>
    <audio
      ref={audioRef}
      src={resource.url}
      preload="metadata"
      onPlay={() => { setPlaying(true); cancelAnimationFrame(frameRef.current); frameRef.current = requestAnimationFrame(syncClock); }}
      onPause={() => { setPlaying(false); cancelAnimationFrame(frameRef.current); setCurrent(finiteDuration(audioRef.current?.currentTime)); }}
      onEnded={() => { setPlaying(false); cancelAnimationFrame(frameRef.current); setCurrent(0); }}
      onLoadedMetadata={updateDuration}
      onDurationChange={updateDuration}
      onCanPlay={updateDuration}
      onTimeUpdate={(event) => setCurrent(finiteDuration(event.currentTarget.currentTime))}
      onError={() => setError("Голосовое повреждено или формат не поддерживается.")}
    />
    <button type="button" className="secure-voice-play" onClick={toggle} aria-label={playing ? "Пауза" : "Воспроизвести"}>
      {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
    </button>
    <div className="secure-voice-wave-wrap">
      <div
        ref={waveRef}
        className="secure-voice-wave"
        role="slider"
        tabIndex={0}
        aria-label="Позиция голосового сообщения"
        aria-valuemin="0"
        aria-valuemax={Math.max(0, Math.round(total))}
        aria-valuenow={Math.max(0, Math.round(current))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { draggingRef.current = false; }}
        onKeyDown={onSeekKey}
      >
        {bars.map((height, index) => <i
          key={index}
          className={`${index <= activeIndex && progress > 0 ? "played" : ""}${playing && index === activeIndex ? " active" : ""}`}
          style={{ height: `${height}%` }}
        />)}
      </div>
      <span>{formatVoiceDuration(current)} / {formatVoiceDuration(total)}</span>
      {error && <small className="secure-voice-error"><ShieldAlert size={12} />{error}</small>}
    </div>
    <button type="button" className="secure-voice-rate" onClick={cycleRate} aria-label={`Скорость ${rate}×`}>{rate}×</button>
  </div>;
}
