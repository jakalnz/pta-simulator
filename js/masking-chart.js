import { OTHER_EAR, formatFreq } from './utils.js';
import { RULE_IA } from './audiogram-check.js';
import { confirmedThreshold } from './method-review.js';

/**
 * Masking (plateau) chart, after the one in Wilding's PTA_Sim: the student
 * plots the tone threshold they found at each masker level, one curve per
 * ear / AC-BC / frequency, to document the plateau search.
 *
 * The guide lines use only the student's plotted audiogram, never the
 * patient's hidden thresholds, so the chart is also available in exam mode:
 *  - start: the non-test ear's plotted AC (where masking should begin)
 *  - over-masking: the test ear's plotted BC + the rule interaural
 *    attenuation (40 dB headphones, 55 dB inserts). Masker above this may
 *    cross back and raise the test ear's threshold.
 * Session-only, like the presentation log.
 */

export const PLATEAU_POINTS = 3;
export const PLATEAU_RANGE_DB = 5;
export const MIN_MASKER_LEVELS = 4;

export function seriesKey(ear, mode, freq) {
  return `${ear}|${mode}|${freq}`;
}

export function seriesLabel(key) {
  const [ear, mode, freq] = key.split('|');
  return `${ear === 'right' ? 'Right' : 'Left'} ${mode} ${formatFreq(Number(freq))}`;
}

export function createMaskingChartStore() {
  const series = new Map(); // key -> [{ masker, tone, noResponse }] sorted by masker
  const history = [];       // [{ key, previous }] for undo
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn());

  // One point per masker level; plotting the same masker level again replaces it.
  function plot(ear, mode, freq, masker, tone, noResponse = false) {
    const key = seriesKey(ear, mode, freq);
    const points = series.get(key) ?? [];
    history.push({ key, previous: points.map((p) => ({ ...p })) });
    const next = points.filter((p) => p.masker !== masker);
    next.push({ masker, tone, noResponse });
    next.sort((a, b) => a.masker - b.masker);
    series.set(key, next);
    emit();
    return key;
  }

  function undo() {
    const last = history.pop();
    if (!last) return;
    if (last.previous.length) series.set(last.key, last.previous);
    else series.delete(last.key);
    emit();
  }

  function clear(key) {
    if (!series.has(key)) return;
    history.push({ key, previous: series.get(key) });
    series.delete(key);
    emit();
  }

  return {
    plot,
    undo,
    clear,
    keys: () => [...series.keys()],
    get: (key) => series.get(key) ?? [],
    canUndo: () => history.length > 0,
    onChange: (fn) => listeners.push(fn),
  };
}

// Plateau: the longest run of at least 3 consecutive masker levels whose
// thresholds are within 5 dB, once at least 4 masker levels are plotted.
// A rise after the run suggests over-masking.
export function findPlateau(points) {
  const measured = points.filter((p) => !p.noResponse);
  if (measured.length < MIN_MASKER_LEVELS) return null;
  let best = null;
  for (let i = 0; i < measured.length; i++) {
    let lo = measured[i].tone;
    let hi = measured[i].tone;
    let j = i;
    while (j + 1 < measured.length
      && Math.max(hi, measured[j + 1].tone) - Math.min(lo, measured[j + 1].tone) <= PLATEAU_RANGE_DB) {
      j += 1;
      lo = Math.min(lo, measured[j].tone);
      hi = Math.max(hi, measured[j].tone);
    }
    if (j - i + 1 >= PLATEAU_POINTS && (!best || j - i > best.end - best.start)) best = { start: i, end: j, threshold: hi };
  }
  if (!best) return null;
  const after = measured.slice(best.end + 1);
  return {
    from: measured[best.start].masker,
    to: measured[best.end].masker,
    threshold: best.threshold,
    risesAfter: after.some((p) => p.tone > best.threshold) ? after[0].masker : null,
  };
}

/**
 * Automatic chart from the presentation log: for every masked tone, a dot at
 * (masker, tone level) showing whether the light came on, and at each
 * masker level the threshold confirmed the usual way (2 responses on
 * ascending presentations). Only what the student saw is used.
 */
export function autoMaskingSeries(entries) {
  const series = new Map();
  entries.filter((e) => e.maskerLevel !== null && e.durationMs !== null).forEach((e) => {
    const key = seriesKey(e.earKey, e.mode, e.freq);
    if (!series.has(key)) series.set(key, { byMasker: new Map(), presentations: [] });
    const s = series.get(key);
    const heard = e.response !== 'None';
    s.presentations.push({ masker: e.maskerLevel, level: e.level, heard });
    if (!s.byMasker.has(e.maskerLevel)) s.byMasker.set(e.maskerLevel, []);
    s.byMasker.get(e.maskerLevel).push(e);
  });
  series.forEach((s) => {
    s.points = [...s.byMasker.entries()]
      .map(([masker, tones]) => ({ masker, confirmed: confirmedThreshold(tones) }))
      .filter((p) => p.confirmed)
      .map((p) => ({ masker: p.masker, tone: p.confirmed.level, noResponse: false }))
      .sort((a, b) => a.masker - b.masker);
    delete s.byMasker;
  });
  return series;
}

// Start and over-masking guide levels from the plotted audiogram.
export function guideLevels(key, storedPoints, transducer) {
  const [ear, mode, freqText] = key.split('|');
  const freq = Number(freqText);
  const other = OTHER_EAR[ear];
  const find = (e, m, masked) => storedPoints.find((p) => p.ear === e && p.mode === m && p.freq === freq
    && p.masked === masked && !p.noResponse);
  const nonTestAc = find(other, 'AC', true) ?? find(other, 'AC', false);
  const testBc = find(ear, 'BC', true)
    ?? [find('right', 'BC', false), find('left', 'BC', false)].filter(Boolean).sort((a, b) => a.level - b.level)[0];
  const ia = RULE_IA[transducer] ?? RULE_IA.headphone;
  return {
    start: nonTestAc ? nonTestAc.level : null,
    overmask: testBc ? testBc.level + ia : null,
    ia,
    testBcLabel: testBc ? `${testBc.masked ? 'masked' : 'not-masked'} BC ${testBc.level} dB HL` : null,
  };
}

const AXIS = { xMin: 0, xMax: 120, yMin: -10, yMax: 120 };

export function drawMaskingChart(canvas, { key, points, presentations = [], guides, transducer }) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 640;
  const H = canvas.clientHeight || 420;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { l: 52, r: 16, t: 34, b: 44 };
  const x = (v) => pad.l + ((v - AXIS.xMin) / (AXIS.xMax - AXIS.xMin)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + ((AXIS.yMax - v) / (AXIS.yMax - AXIS.yMin)) * (H - pad.t - pad.b);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.font = '11px system-ui, sans-serif';
  ctx.strokeStyle = '#e2e2e2';
  ctx.fillStyle = '#555';
  ctx.lineWidth = 1;
  for (let v = 0; v <= AXIS.xMax; v += 10) {
    ctx.beginPath(); ctx.moveTo(x(v), y(AXIS.yMin)); ctx.lineTo(x(v), y(AXIS.yMax)); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(String(v), x(v), H - pad.b + 14);
  }
  for (let v = AXIS.yMin; v <= AXIS.yMax; v += 10) {
    ctx.beginPath(); ctx.moveTo(x(AXIS.xMin), y(v)); ctx.lineTo(x(AXIS.xMax), y(v)); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(String(v), pad.l - 6, y(v) + 4);
  }
  ctx.textAlign = 'center';
  ctx.fillText('Masker level (dB EML, non-test ear)', (pad.l + W - pad.r) / 2, H - 8);
  ctx.save();
  ctx.translate(14, (pad.t + H - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Tone threshold (dB HL, test ear)', 0, 0);
  ctx.restore();

  const earColour = key && key.startsWith('right') ? '#d21f1f' : '#1f5fd2';
  ctx.fillStyle = '#222';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(key ? `${seriesLabel(key)} · ${transducer === 'insertphone' ? 'Insert' : 'Headphone'} masker` : 'No masking curve yet', pad.l, 20);

  const vLine = (level, colour, label) => {
    if (level === null || level < AXIS.xMin || level > AXIS.xMax) return;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x(level), y(AXIS.yMin)); ctx.lineTo(x(level), y(AXIS.yMax)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colour;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x(level) + 4, y(AXIS.yMax) + 12);
    ctx.restore();
  };
  if (guides) {
    vLine(guides.start, '#2e7d32', `Start ${guides.start}`);
    vLine(guides.overmask, '#b3261e', `Over-masking ≥ ${guides.overmask}`);
  }

  // Individual presentations (automatic mode): filled = response, open = none.
  // Repeats at the same masker/level spread out sideways so each shows.
  const seen = new Map();
  presentations.forEach((p) => {
    const k = `${p.masker}|${p.level}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const px = x(p.masker) + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 6;
    ctx.beginPath();
    ctx.arc(px, y(p.level), 3, 0, Math.PI * 2);
    if (p.heard) { ctx.fillStyle = '#2e7d32'; ctx.fill(); } else { ctx.strokeStyle = '#888'; ctx.lineWidth = 1; ctx.stroke(); }
  });

  if (!points.length) return;
  const plateau = findPlateau(points);
  if (plateau) {
    ctx.fillStyle = 'rgba(46, 125, 50, 0.12)';
    ctx.fillRect(x(plateau.from) - 6, y(plateau.threshold + 2.5), x(plateau.to) - x(plateau.from) + 12, y(plateau.threshold - PLATEAU_RANGE_DB - 2.5) - y(plateau.threshold + 2.5));
    ctx.fillStyle = '#2e7d32';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Plateau ${plateau.threshold} dB HL`, x(plateau.from), y(plateau.threshold + 2.5) - 4);
  }

  ctx.strokeStyle = earColour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(p.masker), y(p.tone)) : ctx.moveTo(x(p.masker), y(p.tone))));
  ctx.stroke();
  points.forEach((p) => {
    ctx.fillStyle = earColour;
    ctx.beginPath(); ctx.arc(x(p.masker), y(p.tone), 4.5, 0, Math.PI * 2); ctx.fill();
    if (p.noResponse) {
      ctx.strokeStyle = earColour;
      ctx.beginPath(); ctx.moveTo(x(p.masker), y(p.tone) + 5); ctx.lineTo(x(p.masker), y(p.tone) + 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x(p.masker) - 4, y(p.tone) + 11); ctx.lineTo(x(p.masker), y(p.tone) + 16); ctx.lineTo(x(p.masker) + 4, y(p.tone) + 11); ctx.stroke();
    }
  });
}
