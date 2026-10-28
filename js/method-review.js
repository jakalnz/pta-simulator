/**
 * Reviews the presentation log for testing technique (after "Check method"
 * in Wilding's PTA_Sim). It only uses what the student did and saw — the
 * logged tones, responses and stored points — never the patient's hidden
 * thresholds, so it judges method, not accuracy (use Check for that).
 *
 * It accepts both the UK-style method (as in Wilding's PTA_Sim) and the
 * University of Auckland Clinical Checklist (Feb 2024): 15–20 dB rises
 * while looking for the first response, the 1 kHz retest either straight
 * after 8 kHz or at the end, and plateau or step masking with a single
 * recheck (then +5 dB until a response) at each masker level.
 *
 * Findings are Pass, Review (something to look at), Incomplete (not enough
 * evidence yet) or Info. These are teaching heuristics; follow your tutor's
 * protocol where it differs.
 */

// 1 kHz retest after 8 kHz (UoA) or after 250 Hz (UK-style).
const FIRST_EAR_ORDERS = [
  [1000, 2000, 4000, 8000, 1000, 500, 250],
  [1000, 2000, 4000, 8000, 500, 250, 1000],
];
const SECOND_EAR_ORDER = [1000, 2000, 4000, 8000, 500, 250];
const OPTIONAL_FREQS = [750, 1500, 3000, 6000];
const FAMILIARISATION_RANGE = [30, 50];
const DURATION_RANGE_MS = [1000, 3000];
const MIN_ISI_MS = 1000;
const THINKING_PAUSE_MS = 10000; // longer gaps aren't part of the rhythm
const MIN_DURATION_SPREAD_MS = 100; // tone lengths varying less than this are predictable
const MIN_GAP_SPREAD_MS = 400;      // so are gaps
const MIN_SEARCH_TONES = 3;
const MAX_ASCENDING_FOR_CONFIRMATION = 4;
const PREPARATION_STEPS = [10, 15, 20]; // rises allowed before the first response
// Masking: a plateau is thresholds within 5 dB over at least 20 dB of masker
// (a 15 dB plateau is acceptable for a dilemma / over-masking). Step masking
// accepts a shift of ≤ 15 dB after the initial step and ≤ 10 dB after each
// further 20 dB step.
const PLATEAU_RANGE_DB = 5;
const PLATEAU_SPAN_DB = 20;
const SHORT_PLATEAU_SPAN_DB = 15;
const STEP_MIN_DB = 20;
const STEP_FIRST_SHIFT_DB = 15;
const STEP_LATER_SHIFT_DB = 10;

const heard = (e) => e.response !== 'None';
const label = (ear) => (ear === 'right' ? 'Right' : 'Left');
const freqLabel = (f) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
const nums = (list, max = 6) => {
  const shown = list.slice(0, max).map((n) => `#${n}`).join(', ');
  return list.length > max ? `${shown} and ${list.length - max} more` : shown;
};

// Consecutive tones with the same ear, AC/BC, frequency and masker level.
// Going up after a response is never a search step, so it starts a new
// search (e.g. a masker-off recheck straight after the original search).
function splitBlocks(entries) {
  const blocks = [];
  entries.forEach((e) => {
    const last = blocks[blocks.length - 1];
    const prev = last?.tones[last.tones.length - 1];
    const restart = prev && heard(prev) && e.level > prev.level;
    if (last && !restart && last.ear === e.earKey && last.mode === e.mode && last.freq === e.freq && last.maskerLevel === e.maskerLevel) {
      last.tones.push(e);
    } else {
      blocks.push({ ear: e.earKey, mode: e.mode, freq: e.freq, maskerLevel: e.maskerLevel, tones: [e] });
    }
  });
  return blocks;
}

function blockName(b) {
  const masking = b.maskerLevel === null ? '' : `, masker ${b.maskerLevel} dB`;
  return `${label(b.ear)} ${b.mode} ${freqLabel(b.freq)}${masking}`;
}

/**
 * Lowest level with two responses among its first (up to four) ascending
 * presentations. Only tones louder than the one before count as ascending.
 */
export function confirmedThreshold(tones) {
  const byLevel = new Map();
  for (let i = 1; i < tones.length; i++) {
    if (tones[i].level <= tones[i - 1].level) continue;
    const s = byLevel.get(tones[i].level) ?? { asc: 0, heard: 0, numbers: [] };
    if (s.asc < MAX_ASCENDING_FOR_CONFIRMATION) {
      s.asc += 1;
      if (heard(tones[i])) s.heard += 1;
      s.numbers.push(tones[i].number);
    }
    byLevel.set(tones[i].level, s);
  }
  const confirmed = [...byLevel.entries()].filter(([, s]) => s.heard >= 2).sort((a, b) => a[0] - b[0]);
  return confirmed.length ? { level: confirmed[0][0], numbers: confirmed[0][1].numbers } : null;
}

/**
 * Threshold at one masker level. Either a full search (confirmed as above)
 * or the quick recheck used in plateau and step masking: present at the
 * previous threshold and, if there's no response, go up 5 dB at a time;
 * the first response is the threshold at that masker level.
 */
export function maskedLevelThreshold(tones) {
  const confirmed = confirmedThreshold(tones);
  if (confirmed) return { level: confirmed.level, how: 'confirmed' };
  const k = tones.findIndex(heard);
  if (k === -1) return null;
  const rising = tones.slice(0, k + 1).every((t, i) => i === 0 || t.level >= tones[i - 1].level);
  return rising ? { level: tones[k].level, how: 'recheck' } : null;
}

// Down 10 after a response, up 5 after none (rises of 10–20 dB allowed
// before the first response in the block, while finding a starting level).
function stepErrors(tones) {
  const errors = [];
  let anyResponse = heard(tones[0]);
  for (let i = 1; i < tones.length; i++) {
    const prev = tones[i - 1];
    const step = tones[i].level - prev.level;
    const ok = heard(prev) ? step === -10 : (step === 5 || (!anyResponse && PREPARATION_STEPS.includes(step)));
    if (!ok) errors.push(tones[i].number);
    if (heard(tones[i])) anyResponse = true;
  }
  return errors;
}

// Spread (SD) of a set of times in ms. Judged in absolute terms so slower,
// longer gaps (e.g. ≥ 3 s) aren't flagged for ordinary variation.
function spreadMs(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

export function reviewMethod(entries, storedPoints = []) {
  const findings = [];
  const add = (area, status, message) => findings.push({ area, status, message });
  const tones = entries.filter((e) => e.durationMs !== null);

  if (!tones.length) {
    add('Log', 'Incomplete', 'No tones in the presentation log yet. Reset the log when you start a new patient, then test as normal.');
    return findings;
  }

  // ── Familiarisation ──
  const first = tones[0];
  if (first.level >= FAMILIARISATION_RANGE[0] && first.level <= FAMILIARISATION_RANGE[1]) {
    add('Familiarisation', 'Pass', `First tone at ${first.level} dB HL (#${first.number}).`);
  } else {
    add('Familiarisation', 'Review', `First tone at ${first.level} dB HL (#${first.number}). Start at a clearly audible level (30 dB HL, or 50 dB HL if a hearing loss is suspected), then rise in 10–20 dB steps until the patient responds.`);
  }

  // ── Threshold searches ──
  const blocks = splitBlocks(tones);
  // Masked blocks are judged per masker series under Masking below.
  blocks.filter((b) => b.maskerLevel === null).forEach((b) => {
    const name = blockName(b);
    const range = `#${b.tones[0].number}–#${b.tones[b.tones.length - 1].number}`;
    if (b.tones.length < MIN_SEARCH_TONES) {
      add(name, 'Info', `${b.tones.length} tone${b.tones.length === 1 ? '' : 's'} (${range}): too few for a threshold search.`);
      return;
    }
    const errors = stepErrors(b.tones);
    if (errors.length) {
      add(name, 'Review', `Step sizes at ${nums(errors)}: go down 10 dB after a response and up 5 dB after no response (rises of 10–20 dB are fine before the first response).`);
    }
    const confirmed = confirmedThreshold(b.tones);
    if (!confirmed) {
      add(name, 'Incomplete', `No level had 2 responses on ascending presentations (${range}). One response is not confirmation.`);
      return;
    }
    const stored = storedPoints.find((p) => p.ear === b.ear && p.mode === b.mode && p.freq === b.freq
      && !p.masked && !p.noResponse);
    let message = `Threshold confirmed at ${confirmed.level} dB HL on ascending presentations ${nums(confirmed.numbers)}.`;
    let status = errors.length ? 'Review' : 'Pass';
    if (stored && stored.level !== confirmed.level) {
      message += ` Your stored ${b.mode} result is ${stored.level} dB HL.`;
      status = 'Review';
    }
    add(name, status, message);
  });

  // ── Frequency order (not-masked AC) ──
  const acBlocks = blocks.filter((b) => b.mode === 'AC' && b.maskerLevel === null);
  if (acBlocks.length) {
    const firstEar = acBlocks[0].ear;
    const firstEarSwitch = acBlocks.findIndex((b) => b.ear !== firstEar);
    const sequence = (list) => list
      .map((b) => b.freq)
      .filter((f) => !OPTIONAL_FREQS.includes(f))
      .filter((f, i, arr) => i === 0 || f !== arr[i - 1]);
    const describe = (list) => list.map(freqLabel).join(', ');
    // Passes if the sequence follows any of the accepted orders.
    const checkOrder = (ear, list, accepted) => {
      const seq = sequence(list);
      const full = accepted.find((order) => order.every((f, i) => seq[i] === f));
      const partial = accepted.find((order) => seq.length < order.length && seq.every((f, i) => order[i] === f));
      const expected = accepted.map(describe).join(' or ');
      if (full) {
        add(`${label(ear)} AC order`, 'Pass', `Order followed: ${describe(seq)} (3 and 6 kHz optional).`);
      } else if (partial) {
        add(`${label(ear)} AC order`, 'Incomplete', `So far: ${describe(seq)}. Expected: ${expected}.`);
      } else {
        add(`${label(ear)} AC order`, 'Review', `Order used: ${describe(seq)}. Expected: ${expected} (3 and 6 kHz optional).`);
      }
    };
    checkOrder(firstEar, firstEarSwitch === -1 ? acBlocks : acBlocks.slice(0, firstEarSwitch), FIRST_EAR_ORDERS);
    if (firstEarSwitch !== -1) {
      const secondEar = acBlocks[firstEarSwitch].ear;
      checkOrder(secondEar, acBlocks.filter((b, i) => i >= firstEarSwitch && b.ear === secondEar), [SECOND_EAR_ORDER]);
    }
  }

  // ── BC side ──
  const firstBc = blocks.find((b) => b.mode === 'BC' && b.maskerLevel === null);
  if (firstBc) {
    const acMean = (ear) => {
      const pts = [500, 1000, 2000].map((f) => storedPoints.find((p) => p.ear === ear && p.mode === 'AC' && p.freq === f && !p.masked && !p.noResponse));
      return pts.every(Boolean) ? pts.reduce((a, p) => a + p.level, 0) / 3 : null;
    };
    const right = acMean('right');
    const left = acMean('left');
    if (right === null || left === null) {
      add('BC side', 'Info', 'Store not-masked AC at 500, 1000 and 2000 Hz in both ears to check which side BC started on.');
    } else if (right === left || (right > left ? 'right' : 'left') === firstBc.ear) {
      add('BC side', 'Pass', `Not-masked BC started on the ${firstBc.ear} side${right === left ? '' : ' (the worse ear on mean AC at 0.5–2 kHz)'}.`);
    } else {
      add('BC side', 'Review', `Not-masked BC started on the ${firstBc.ear} side, but the ${right > left ? 'right' : 'left'} ear is worse on mean AC at 0.5–2 kHz.`);
    }
  }

  // ── Masking (plateau or step method) ──
  const maskedKeys = [...new Set(blocks.filter((b) => b.maskerLevel !== null).map((b) => `${b.ear}|${b.mode}|${b.freq}`))];
  maskedKeys.forEach((key) => {
    const [ear, mode, freqText] = key.split('|');
    const freq = Number(freqText);
    const other = ear === 'right' ? 'left' : 'right';
    const name = `${label(ear)} ${mode} ${freqLabel(freq)} masking`;
    const sameKey = (b) => b.ear === ear && b.mode === mode && b.freq === freq;

    // Threshold at each masker level (the latest attempt at that level).
    const atMasker = new Map();
    blocks.forEach((b) => {
      if (!sameKey(b) || b.maskerLevel === null) return;
      const t = maskedLevelThreshold(b.tones);
      if (t) atMasker.set(b.maskerLevel, t.level);
    });
    const series = [...atMasker.entries()].sort((a2, b2) => a2[0] - b2[0]);
    if (!series.length) {
      add(name, 'Incomplete', 'No response at any masker level yet.');
      return;
    }
    const text = series.map(([m, t]) => `masker ${m} → ${t}`).join(', ');

    // Not-masked threshold for this ear (stored, or confirmed in the log).
    const storedUnmasked = storedPoints.find((p) => p.ear === ear && p.mode === mode && p.freq === freq && !p.masked && !p.noResponse);
    const unmaskedBlocks = blocks.filter((b) => sameKey(b) && b.maskerLevel === null).map((b) => confirmedThreshold(b.tones)).filter(Boolean);
    const reference = storedUnmasked?.level ?? unmaskedBlocks[unmaskedBlocks.length - 1]?.level ?? null;
    const nteAc = storedPoints.find((p) => p.ear === other && p.mode === 'AC' && p.freq === freq && p.masked && !p.noResponse)
      ?? storedPoints.find((p) => p.ear === other && p.mode === 'AC' && p.freq === freq && !p.masked && !p.noResponse);
    const startNote = nteAc ? ` Masker started at ${series[0][0]} dB (non-test AC ${nteAc.level} dB HL).` : '';

    const steps = series.slice(1).map(([m], i) => m - series[i][0]);
    const stepMethod = steps.some((d) => d >= STEP_MIN_DB)
      || (series.length === 1 && nteAc && series[0][0] - nteAc.level >= 25);

    let accepted = null; // threshold the series supports
    if (stepMethod) {
      // Step masking: accept once a step shifts the threshold by ≤ 15 dB
      // (initial step, against the not-masked threshold) or ≤ 10 dB (later steps).
      let previous = reference;
      for (let i = 0; i < series.length && accepted === null; i++) {
        const t = series[i][1];
        if (previous !== null) {
          const limit = i === 0 ? STEP_FIRST_SHIFT_DB : STEP_LATER_SHIFT_DB;
          if (t - previous <= limit) accepted = { level: t, masker: series[i][0], shift: t - previous };
        }
        previous = t;
      }
      if (accepted) {
        add(name, 'Pass', `Step masking: ${text}. Accepted at ${accepted.level} dB HL (shift of ${accepted.shift} dB at masker ${accepted.masker}).${startNote}`);
      } else if (reference === null && series.length === 1) {
        add(name, 'Info', `Step masking: ${text}. Store the not-masked threshold first so the shift can be judged.${startNote}`);
      } else {
        const last = series[series.length - 1];
        add(name, 'Incomplete', `Step masking: ${text}. The threshold is still shifting: add another 20 dB of masking (a shift of ≤ 15 dB after the first step, or ≤ 10 dB after later steps, is accepted).${startNote}`);
        accepted = { level: last[1] };
      }
    } else {
      // Plateau masking: the longest run of thresholds within 5 dB.
      let best = null;
      for (let i = 0; i < series.length; i++) {
        let lo = series[i][1];
        let hi = series[i][1];
        let j = i;
        while (j + 1 < series.length && Math.max(hi, series[j + 1][1]) - Math.min(lo, series[j + 1][1]) <= PLATEAU_RANGE_DB) {
          j += 1;
          lo = Math.min(lo, series[j][1]);
          hi = Math.max(hi, series[j][1]);
        }
        const span = series[j][0] - series[i][0];
        if (!best || span > best.span) best = { span, level: hi, end: j };
      }
      const odd = steps.filter((d) => d !== 10 && d !== 5);
      const stepNote = odd.length ? ' Raise the masker in 10 dB steps (5 dB near a masking dilemma).' : '';
      const rise = series.slice(best.end + 1).some(([, t]) => t > best.level + PLATEAU_RANGE_DB)
        ? ' The threshold rose after the plateau: possible over-masking, so the plateau value is the threshold.' : '';
      if (best.span >= PLATEAU_SPAN_DB) {
        add(name, odd.length ? 'Review' : 'Pass', `Plateau masking: ${text}. ${best.span} dB plateau at ${best.level} dB HL.${rise}${stepNote}${startNote}`);
      } else if (best.span >= SHORT_PLATEAU_SPAN_DB) {
        add(name, 'Info', `Plateau masking: ${text}. Short (${best.span} dB) plateau at ${best.level} dB HL: acceptable only for a masking dilemma or over-masking, otherwise extend to 20 dB.${rise}${stepNote}${startNote}`);
      } else {
        add(name, 'Incomplete', `Plateau masking: ${text}. Keep raising the masker 10 dB at a time until the threshold stays within 5 dB over 20 dB of masker (2 steps).${stepNote}${startNote}`);
      }
      accepted = { level: best.level };
    }

    const storedMasked = storedPoints.find((p) => p.ear === ear && p.mode === mode && p.freq === freq && p.masked && !p.noResponse);
    if (storedMasked && accepted && Math.abs(storedMasked.level - accepted.level) > 5) {
      add(name, 'Review', `Your stored masked result is ${storedMasked.level} dB HL, but your masking gave ${accepted.level} dB HL.`);
    }
  });

  // ── Timing ──
  const short = tones.filter((e) => e.durationMs < DURATION_RANGE_MS[0]).map((e) => e.number);
  const long = tones.filter((e) => e.durationMs > DURATION_RANGE_MS[1]).map((e) => e.number);
  if (!short.length && !long.length) {
    add('Tone length', 'Pass', 'All tones lasted 1–3 seconds.');
  } else {
    const parts = [];
    if (short.length) parts.push(`${short.length} shorter than 1 s (${nums(short)})`);
    if (long.length) parts.push(`${long.length} longer than 3 s (${nums(long)})`);
    add('Tone length', short.length + long.length > tones.length * 0.1 ? 'Review' : 'Info',
      `${parts.join('; ')}. Present tones for 1–3 seconds; very short tones may end before the patient responds.`);
  }
  const durationSpread = spreadMs(tones.map((e) => e.durationMs));
  if (tones.length >= 6 && durationSpread !== null && durationSpread < MIN_DURATION_SPREAD_MS) {
    add('Tone length', 'Review', 'Tone lengths are very similar. Vary them within 1–3 seconds so the patient can\'t anticipate the end.');
  }

  const quick = tones.filter((e) => e.isiMs !== null && e.isiMs < MIN_ISI_MS).map((e) => e.number);
  if (quick.length) {
    add('Gaps between tones', 'Review', `${quick.length} gap${quick.length === 1 ? '' : 's'} under 1 second (before ${nums(quick)}). Leave time for a late response.`);
  }
  const rhythmGaps = tones.map((e) => e.isiMs).filter((v) => v !== null && v < THINKING_PAUSE_MS);
  const gapSpread = spreadMs(rhythmGaps);
  if (rhythmGaps.length >= 6 && gapSpread !== null && gapSpread < MIN_GAP_SPREAD_MS) {
    add('Gaps between tones', 'Review', 'The gaps between tones are very regular. Vary them so the patient can\'t respond to the rhythm instead of the tone.');
  } else if (!quick.length && rhythmGaps.length >= 6) {
    add('Gaps between tones', 'Pass', 'Gaps were at least 1 second and varied.');
  }

  return findings;
}
