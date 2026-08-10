export const FREQUENCIES = [250, 500, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000];

export const DB_MIN = -10;
export const DB_MAX = 120;
export const DB_STEP = 5;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function clampLevel(db) {
  return clamp(roundToStep(db, DB_STEP), DB_MIN, DB_MAX);
}

export function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

export function formatFreq(freq) {
  if (freq < 1000) return `${freq} Hz`;
  const kHz = freq / 1000;
  const label = Number.isInteger(kHz) ? kHz : kHz.toFixed(1);
  return `${label} kHz`;
}

export function formatDb(db) {
  return `${db} dB`;
}

export function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const OTHER_EAR = { left: 'right', right: 'left' };
