const audio = typeof window !== "undefined" ? new Audio() : null;
const listeners = new Set();
let snapshot = {
  id: null,
  url: "",
  name: "",
  playing: false,
  currentTime: 0,
  duration: 0,
  rate: 1,
};

function emit(patch = {}) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

if (audio) {
  audio.preload = "metadata";
  audio.addEventListener("play", () => emit({ playing: true }));
  audio.addEventListener("pause", () => emit({ playing: false }));
  audio.addEventListener("timeupdate", () => emit({ currentTime: audio.currentTime || 0 }));
  audio.addEventListener("durationchange", () => emit({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }));
  audio.addEventListener("ended", () => emit({ playing: false, currentTime: audio.duration || 0 }));
  audio.addEventListener("ratechange", () => emit({ rate: audio.playbackRate }));
}

export function subscribeAudio(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAudioSnapshot() {
  return snapshot;
}

export async function toggleVoice(file, messageId) {
  if (!audio) return;
  if (snapshot.id !== messageId) {
    audio.src = file.url;
    audio.playbackRate = 1;
    emit({ id: messageId, url: file.url, name: file.name || "Голосовое сообщение", currentTime: 0, duration: Number(file.duration || 0), rate: 1 });
  }
  if (audio.paused) await audio.play();
  else audio.pause();
}

export function seekVoice(value) {
  if (!audio || !Number.isFinite(value)) return;
  audio.currentTime = Math.max(0, Math.min(value, audio.duration || value));
  emit({ currentTime: audio.currentTime });
}

export function cycleVoiceRate() {
  if (!audio) return 1;
  const rates = [1, 1.5, 2];
  const index = rates.indexOf(audio.playbackRate);
  audio.playbackRate = rates[(index + 1) % rates.length];
  return audio.playbackRate;
}

export function stopVoice() {
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  emit({ playing: false, currentTime: 0 });
}
