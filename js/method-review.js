/**
 * Reviews the presentation log for testing technique (after "Check method"
 * in Wilding's PTA_Sim). It only uses what the student did and saw — the
 * logged tones, responses and stored points — never the patient's hidden
 * thresholds, so it judges method, not accuracy (use Check for that).
 *
 * Findings are Pass, Review (something to look at), Incomplete (not enough
 * evidence yet) or Info. These are teaching heuristics; follow your tutor's
 * protocol where it differs.
 */

const FIRST_EAR_ORDER = [1000, 2000, 4000, 8000, 500, 250, 1000];
const SECOND_EAR_ORDER = [1000, 2000, 4000, 8000, 500, 250];
const OPTIONAL_FREQS = [750, 1500, 3000, 6000];
const FAMILIARISATION_RANGE = [30, 50];
const DURATION_RANGE_MS = [1000, 3000];
const MIN_ISI_MS = 1000;
const THINKING_PAUSE_MS = 10000; // longer gaps aren't part of the rhythm
const MIN_SEARCH_TONES = 3;
const MAX_ASCENDING_FOR_CONFIRMATION = 4;

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
function confirmedThreshold(tones) {
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

// Down 10 after a response, up 5 after none (up 10 allowed before the
// first response in the block, while still finding a starting level).
function stepErrors(tones) {
  const errors = [];
  let anyResponse = heard(tones[0]);
  for (let i = 1; i < tones.length; i++) {
    const prev = tones[i - 1];
    const step = tones[i].level - prev.level;
    const ok = heard(prev) ? step === -10 : (step === 5 || (!anyResponse && step === 10));
    if (!ok) errors.push(tones[i].number);
    if (heard(tones[i])) anyResponse = true;
  }
  return errors;
}

function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return null;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  return sd / mean;
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
    add('Familiarisation', 'Review', `First tone at ${first.level} dB HL (#${first.number}). Start familiarisation at a clearly audible level, usually 40 dB HL, then rise in 10 dB steps until the patient responds.`);
  }

  // ── Threshold searches ──
  const blocks = splitBlocks(tones);
  blocks.forEach((b) => {
    const name = blockName(b);
    const range = `#${b.tones[0].number}–#${b.tones[b.tones.length - 1].number}`;
    if (b.tones.length < MIN_SEARCH_TONES) {
      add(name, 'Info', `${b.tones.length} tone${b.tones.length === 1 ? '' : 's'} (${range}): too few for a threshold search.`);
      return;
    }
    const errors = stepErrors(b.tones);
    if (errors.length) {
      add(name, 'Review', `Step sizes at ${nums(errors)}: go down 10 dB after a response and up 5 dB after no response.`);
    }
    const confirmed = confirmedThreshold(b.tones);
    if (!confirmed) {
      add(name, 'Incomplete', `No level had 2 responses on ascending presentations (${range}). One response is not confirmation.`);
      return;
    }
    const stored = storedPoints.find((p) => p.ear === b.ear && p.mode === b.mode && p.freq === b.freq
      && p.masked === (b.maskerLevel !== null) && !p.noResponse);
    let message = `Threshold confirmed at ${confirmed.level} dB HL on ascending presentations ${nums(confirmed.numbers)}.`;
    let status = errors.length ? 'Review' : 'Pass';
    if (stored && b.maskerLevel === null && stored.level !== confirmed.level) {
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
    const checkOrder = (ear, list, expected) => {
      const seq = sequence(list);
      const matches = expected.every((f, i) => seq[i] === f);
      if (seq.length < expected.length && expected.slice(0, seq.length).every((f, i) => seq[i] === f)) {
        add(`${label(ear)} AC order`, 'Incomplete', `So far: ${seq.map(freqLabel).join(', ')}. Expected order: ${expected.map(freqLabel).join(', ')}.`);
      } else {
        add(`${label(ear)} AC order`, matches ? 'Pass' : 'Review',
          `${matches ? 'Order followed' : 'Order used'}: ${seq.map(freqLabel).join(', ')}. Expected: ${expected.map(freqLabel).join(', ')} (3 and 6 kHz optional).`);
      }
    };
    checkOrder(firstEar, firstEarSwitch === -1 ? acBlocks : acBlocks.slice(0, firstEarSwitch), FIRST_EAR_ORDER);
    if (firstEarSwitch !== -1) {
      const secondEar = acBlocks[firstEarSwitch].ear;
      checkOrder(secondEar, acBlocks.filter((b, i) => i >= firstEarSwitch && b.ear === secondEar), SECOND_EAR_ORDER);
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

  // ── Masking ──
  const maskedKeys = [...new Set(blocks.filter((b) => b.maskerLevel !== null).map((b) => `${b.ear}|${b.mode}|${b.freq}`))];
  maskedKeys.forEach((key) => {
    const [ear, mode, freqText] = key.split('|');
    const freq = Number(freqText);
    const name = `${label(ear)} ${mode} ${freqLabel(freq)} masking`;
    const firstMaskedIndex = blocks.findIndex((b) => b.ear === ear && b.mode === mode && b.freq === freq && b.maskerLevel !== null);
    const before = blocks[firstMaskedIndex - 1];
    if (!(before && before.ear === ear && before.mode === mode && before.freq === freq && before.maskerLevel === null)) {
      add(name, 'Review', 'Recheck the threshold with the masker off just before starting masking.');
    }
    // Latest confirmed threshold at each masker level, in the order the levels were first used.
    const plateau = new Map();
    blocks.forEach((b) => {
      if (b.ear !== ear || b.mode !== mode || b.freq !== freq || b.maskerLevel === null) return;
      const c = confirmedThreshold(b.tones);
      if (c) plateau.set(b.maskerLevel, c.level);
    });
    const series = [...plateau.entries()].sort((a, b) => a[0] - b[0]);
    const text = series.map(([m, t]) => `masker ${m} → ${t}`).join(', ');
    if (series.length < 4) {
      add(name, 'Incomplete', `${series.length} masker level${series.length === 1 ? '' : 's'} with a confirmed threshold${series.length ? ` (${text})` : ''}. Find a plateau: at least 4 masker levels, raising the masker 10 dB each time, with the last 3 thresholds within 5 dB.`);
      return;
    }
    const last3 = series.slice(-3).map(([, t]) => t);
    const flat = Math.max(...last3) - Math.min(...last3) <= 5;
    const steps = series.slice(1).every(([m], i) => m - series[i][0] === 10);
    add(name, flat && steps ? 'Pass' : 'Review',
      `${text}. ${flat ? `Plateau at ${Math.max(...last3)} dB HL.` : 'The last 3 thresholds are not within 5 dB, so no plateau yet.'}${steps ? '' : ' Raise the masker in 10 dB steps.'}`);
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
  const durationCv = coefficientOfVariation(tones.map((e) => e.durationMs));
  if (tones.length >= 6 && durationCv !== null && durationCv < 0.1) {
    add('Tone length', 'Review', 'Tone lengths are very similar. Vary them within 1–3 seconds so the patient can\'t anticipate the end.');
  }

  const quick = tones.filter((e) => e.isiMs !== null && e.isiMs < MIN_ISI_MS).map((e) => e.number);
  if (quick.length) {
    add('Gaps between tones', 'Review', `${quick.length} gap${quick.length === 1 ? '' : 's'} under 1 second (before ${nums(quick)}). Leave time for a late response.`);
  }
  const rhythmGaps = tones.map((e) => e.isiMs).filter((v) => v !== null && v < THINKING_PAUSE_MS);
  const gapCv = coefficientOfVariation(rhythmGaps);
  if (rhythmGaps.length >= 6 && gapCv !== null && gapCv < 0.15) {
    add('Gaps between tones', 'Review', 'The gaps between tones are very regular. Vary them so the patient can\'t respond to the rhythm instead of the tone.');
  } else if (!quick.length && rhythmGaps.length >= 6) {
    add('Gaps between tones', 'Pass', 'Gaps were at least 1 second and varied.');
  }

  return findings;
}
