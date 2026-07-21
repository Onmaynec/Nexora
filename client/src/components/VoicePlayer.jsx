import { useEffect, useSyncExternalStore, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { post } from "../api";
import { cycleVoiceRate, getAudioSnapshot, seekVoice, subscribeAudio, toggleVoice } from "../audio-player";

function time(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function VoicePlayer({ message }) {
  const audio = useSyncExternalStore(subscribeAudio, getAudioSnapshot, getAudioSnapshot);
  const [listened, setListened] = useState(Boolean(message.listenedByMe));
  const active = audio.id === message.id;
  const file = message.file;
  const waveform = file.waveform?.length ? file.waveform : Array.from({ length: 42 }, (_, index) => 22 + ((index * 17) % 58));
  const current = active ? audio.currentTime : 0;
  const duration = active && audio.duration ? audio.duration : Number(file.duration || 0);

  useEffect(() => setListened(Boolean(message.listenedByMe)), [message.listenedByMe]);

  async function toggle() {
    await toggleVoice(file, message.id);
    if (!listened && !message.isOwn) {
      setListened(true);
      post(`/api/messages/${message.id}/listened`).catch(() => setListened(false));
    }
  }

  return (
    <div className={`voice-message${listened ? " listened" : ""}`}>
      <button type="button" className="voice-play" onClick={toggle} aria-label={active && audio.playing ? "Пауза" : "Воспроизвести"}>{active && audio.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
      <div className="voice-wave-wrap">
        <button type="button" className="voice-wave" onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          seekVoice(((event.clientX - rect.left) / rect.width) * Math.max(duration, 1));
        }} aria-label="Перемотать голосовое">
          {waveform.slice(0, 56).map((height, index) => <i key={index} className={duration && (index / waveform.length) <= current / duration ? "played" : ""} style={{ height: `${Math.max(10, Math.min(100, height))}%` }} />)}
        </button>
        <span><small>{time(current)} / {time(duration)}</small>{listened && <small className="voice-listened"><Volume2 size={11} /> прослушано</small>}</span>
      </div>
      <button type="button" className="voice-rate" onClick={cycleVoiceRate}>{active ? audio.rate : 1}×</button>
    </div>
  );
}
