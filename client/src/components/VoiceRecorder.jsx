import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react";

function supportedMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
}

function microphoneError(error) {
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error?.name)) return "Разрешите Nexora доступ к микрофону в Windows.";
  if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name)) return "Микрофон не найден. Подключите его и попробуйте снова.";
  if (["NotReadableError", "TrackStartError"].includes(error?.name)) return "Микрофон занят другим приложением или недоступен.";
  return "Не удалось включить микрофон.";
}

function compactWaveform(values, bars = 56) {
  if (!values.length) return [];
  const size = Math.max(1, Math.ceil(values.length / bars));
  const compact = [];
  for (let index = 0; index < values.length; index += size) {
    compact.push(Math.round(Math.max(...values.slice(index, index + size)) * 100));
  }
  return compact.slice(0, bars);
}

export default function VoiceRecorder({ maxSeconds = 300, onRecorded, onError, disabled = false }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const chunksRef = useRef([]);
  const waveformRef = useRef([]);
  const timerRef = useRef(null);
  const meterRef = useRef(null);
  const elapsedRef = useRef(0);
  const tickRef = useRef(0);
  const recordingRef = useRef(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(null);

  useEffect(() => { recordingRef.current = recording; }, [recording]);

  function stopMedia() {
    clearInterval(timerRef.current);
    clearInterval(meterRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }

  useEffect(() => () => {
    mountedRef.current = false;
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    stopMedia();
    if (recordingRef.current?.url) URL.revokeObjectURL(recordingRef.current.url);
  }, []);

  async function start() {
    if (disabled || status !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return onError?.("Запись голоса недоступна в этом браузере.");
    setStatus("requesting");
    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (!mountedRef.current) return rawStream.getTracks().forEach((track) => track.stop());
      streamRef.current = rawStream;
      chunksRef.current = [];
      waveformRef.current = [];

      let recordStream = rawStream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        const context = new AudioContext();
        contextRef.current = context;
        const source = context.createMediaStreamSource(rawStream);
        const analyser = context.createAnalyser();
        const gate = context.createGain();
        const destination = context.createMediaStreamDestination();
        analyser.fftSize = 256;
        source.connect(analyser);
        source.connect(gate).connect(destination);
        recordStream = destination.stream;
        const samples = new Uint8Array(analyser.fftSize);
        meterRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) { const value = (sample - 128) / 128; sum += value * value; }
          const rms = Math.sqrt(sum / samples.length);
          const level = Math.min(1, rms * 8);
          waveformRef.current.push(level);
          // Мягкий шумовой порог приглушает почти беззвучные участки, не обрезая слова.
          gate.gain.setTargetAtTime(rms < 0.012 ? 0.06 : 1, context.currentTime, 0.018);
        }, 80);
      }

      const type = supportedMimeType();
      const recorder = new MediaRecorder(recordStream, type ? { mimeType: type } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopMedia();
        recorderRef.current = null;
        if (!mountedRef.current) return;
        if (!blob.size) { setStatus("idle"); return onError?.("Запись получилась пустой. Проверьте микрофон и попробуйте снова."); }
        const duration = Math.min(maxSeconds, Math.max(1, Math.ceil(elapsedRef.current / 1000)));
        const value = { blob, url: URL.createObjectURL(blob), duration, waveform: compactWaveform(waveformRef.current) };
        recordingRef.current = value;
        setRecording(value);
        setStatus("preview");
      };
      recorder.onerror = () => { onError?.("Запись была прервана устройством."); stop(); };
      recorder.start(250);
      elapsedRef.current = 0;
      tickRef.current = Date.now();
      setSeconds(0);
      setRecording(null);
      setStatus("recording");
      timerRef.current = setInterval(() => {
        const now = Date.now();
        if (recorder.state === "recording") elapsedRef.current += now - tickRef.current;
        tickRef.current = now;
        const elapsed = Math.floor(elapsedRef.current / 1000);
        setSeconds(elapsed);
        if (elapsed >= maxSeconds) stop();
      }, 250);
    } catch (error) {
      stopMedia();
      if (mountedRef.current) setStatus("idle");
      onError?.(microphoneError(error));
    }
  }

  function pause() {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.pause();
    setStatus("paused");
  }

  function resume() {
    const recorder = recorderRef.current;
    if (recorder?.state !== "paused") return;
    tickRef.current = Date.now();
    recorder.resume();
    setStatus("recording");
  }

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearInterval(timerRef.current);
    setStatus("processing");
    if (recorder.state === "recording") {
      try { recorder.requestData(); } catch {}
    }
    recorder.stop();
  }

  function reset() {
    if (recording?.url) URL.revokeObjectURL(recording.url);
    chunksRef.current = [];
    waveformRef.current = [];
    recordingRef.current = null;
    setRecording(null);
    setSeconds(0);
    setStatus("idle");
  }

  async function send() {
    if (!recording || status === "sending") return;
    setStatus("sending");
    try {
      await onRecorded(recording.blob, recording.duration, recording.waveform);
      reset();
    } catch (error) {
      if (mountedRef.current) setStatus("preview");
      onError?.(error?.message || "Не удалось отправить голосовое сообщение.");
    }
  }

  if (["recording", "paused"].includes(status)) {
    return (
      <div className={`voice-recorder active${status === "paused" ? " paused" : ""}`}>
        <span className="recording-pulse" />
        <strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong>
        <div className="voice-bars" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>
        <button type="button" onClick={status === "paused" ? resume : pause} title={status === "paused" ? "Продолжить" : "Пауза"}>{status === "paused" ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}</button>
        <button type="button" onClick={stop} title="Остановить"><Square size={16} fill="currentColor" /></button>
      </div>
    );
  }

  if (["requesting", "processing"].includes(status)) return <span className="voice-recorder processing"><LoaderCircle className="spin" size={18} /></span>;

  if (["preview", "sending"].includes(status) && recording) {
    return (
      <div className="voice-recorder preview">
        <button type="button" onClick={reset} title="Удалить" disabled={status === "sending"}><Trash2 size={17} /></button>
        <audio src={recording.url} controls />
        <button type="button" className="voice-send" onClick={send} title="Отправить" disabled={status === "sending"}>{status === "sending" ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
      </div>
    );
  }

  return <button type="button" className="composer-icon-button" onClick={start} disabled={disabled} title="Записать голосовое"><Mic size={19} /></button>;
}
