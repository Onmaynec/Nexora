import { useSyncExternalStore } from "react";
import { Pause, Play, X } from "lucide-react";
import { getAudioSnapshot, stopVoice, subscribeAudio, toggleVoice } from "../audio-player";

function time(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function GlobalVoiceDock() {
  const audio = useSyncExternalStore(subscribeAudio, getAudioSnapshot, getAudioSnapshot);
  if (!audio.id) return null;
  return (
    <div className="global-voice-dock">
      <button type="button" onClick={() => toggleVoice({ url: audio.url, name: audio.name }, audio.id)}>{audio.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
      <span><strong>{audio.name}</strong><small>{time(audio.currentTime)} / {time(audio.duration)}</small></span>
      <button type="button" onClick={stopVoice}><X size={15} /></button>
    </div>
  );
}
