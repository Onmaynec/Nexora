export function finiteDuration(value, fallback = 0) {
  const primary = Number(value);
  if (Number.isFinite(primary) && primary >= 0) return primary;
  const secondary = Number(fallback);
  return Number.isFinite(secondary) && secondary >= 0 ? secondary : 0;
}

export function formatVoiceDuration(value) {
  const seconds = Math.max(0, Math.round(finiteDuration(value)));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function normalizeVoiceWaveform(values, target = 48) {
  const size = Math.max(8, Math.min(96, Math.trunc(Number(target) || 48)));
  const source = (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value >= 0);
  if (!source.length) return Array.from({ length: size }, (_, index) => 18 + ((index * 29) % 67));
  const resampled = Array.from({ length: size }, (_, index) => source[Math.min(source.length - 1, Math.floor(index / size * source.length))]);
  const sorted = [...resampled].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const ceiling = Math.max(floor + 1, sorted[Math.floor(sorted.length * 0.92)] || 1);
  return resampled.map((value, index) => {
    const previous = index ? resampled[index - 1] : value;
    const next = index < resampled.length - 1 ? resampled[index + 1] : value;
    const local = (previous + value * 2 + next) / 4;
    const normalized = Math.max(0, Math.min(1, (value - floor) / (ceiling - floor)));
    const localNormalized = Math.max(0, Math.min(1, (local - floor) / (ceiling - floor)));
    return Math.round(14 + Math.sqrt((normalized + localNormalized) / 2) * 86);
  });
}

export function waveformLevel(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const sample of samples) {
    const centered = (Number(sample) - 128) / 128;
    sum += centered * centered;
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.max(0, Math.min(100, Math.round(Math.pow(rms, 0.58) * 145)));
}

export function seekRatio(clientX, left, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  return Math.max(0, Math.min(1, (Number(clientX) - Number(left || 0)) / safeWidth));
}
