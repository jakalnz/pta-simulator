import { BC_MAX_LEVEL, DB_MAX, OTHER_EAR } from './utils.js';

/**
 * Compares the stored audiogram with the current patient's ideal results
 * (after the "Check current audiogram" tool in Wilding's PTA_Sim). Answer-key
 * information: callers must not offer it in exam mode.
 *
 * Ideal values come straight from the patient model, ignoring response
 * variability and ascending/descending effects, so a stored level within
 * ±5 dB of ideal passes.
 *  - Not-masked AC: the better of the test cochlea (+ conductive component)
 *    and the other cochlea heard across the head (+ interaural attenuation).
 *  - Not-masked BC: the better cochlea, each including its own BC
 *    attenuation (BC crosses the head unattenuated).
 *  - Masked AC / BC: the test ear's own threshold. When judging whether
 *    masking can work, the covered non-test ear gains the occlusion effect.
 * Masking is expected where the usual rules apply to the ideal not-masked
 * results; where no masker level can give a plateau (masking dilemma) the
 * masked result is reported but not graded.
 */

export const AC_FREQS = [250, 500, 1000, 2000, 4000, 8000];
export const BC_FREQS = [500, 1000, 2000, 4000];
export const TOLERANCE_DB = 5;

// Clinical masking-rule interaural attenuation (not the patient's actual IA,
// which the student doesn't know): 40 dB headphones, 55 dB inserts.
export const RULE_IA = { headphone: 40, insertphone: 55 };
const RULE_2_GAP = 10;
// Masker needed above the cross-heard tone for the non-test cochlea to stop
// responding reliably (covers response variability).
const MASKING_MARGIN = 5;

function maxLevel(mode, freq) {
  return mode === 'BC' ? BC_MAX_LEVEL[freq] : DB_MAX;
}

export function idealValues(patientModel, transducer) {
  const c = (ear, f) => patientModel.getParam(ear, 'cochlear', f);
  const cond = (ear, f) => patientModel.getParam(ear, 'ipsiConductive', f);
  const ia = (f) => patientModel.getCrossIAA(transducer, f);

  const trueAC = (ear, f) => c(ear, f) + cond(ear, f);
  const bcAtt = (ear, f) => patientModel.getParam(ear, 'bcAttenuation', f);
  const occlusion = (f) => patientModel.getOcclusion(transducer, f);
  const trueBC = (ear, f) => c(ear, f) + bcAtt(ear, f);
  const unmaskedAC = (ear, f) => Math.min(trueAC(ear, f), c(OTHER_EAR[ear], f) + ia(f));
  // Not-masked BC is tested with both ears uncovered, so no occlusion.
  const unmaskedBC = (f) => Math.min(trueBC('right', f), trueBC('left', f));

  // Is there a masker level that stops the other cochlea responding to the
  // tone at the test ear's true threshold without over-masking the test
  // cochlea (and within the audiometer's output)?
  function maskingFeasible(ear, mode, f) {
    const other = OTHER_EAR[ear];
    // With masking the non-test ear is covered, so BC gains the occlusion effect there.
    const toneAtOther = mode === 'AC'
      ? trueAC(ear, f) - ia(f)
      : trueBC(ear, f) - bcAtt(other, f) + occlusion(f);
    if (c(other, f) > toneAtOther) return true;
    const lowest = toneAtOther + MASKING_MARGIN + cond(other, f);
    const highest = Math.min(c(ear, f) + ia(f), DB_MAX);
    return lowest <= highest;
  }

  return { trueAC, trueBC, unmaskedAC, unmaskedBC, maskingFeasible };
}

// Which masked results the ideal not-masked audiogram calls for.
export function maskingRequired(ideal, ear, mode, f, transducer) {
  const ruleIa = RULE_IA[transducer] ?? RULE_IA.headphone;
  const other = OTHER_EAR[ear];
  const ac = ideal.unmaskedAC(ear, f);
  const hasBC = BC_FREQS.includes(f);
  if (mode === 'AC') {
    if (ac - ideal.unmaskedAC(other, f) >= ruleIa) return 'Rule 1';
    if (hasBC && ac - ideal.unmaskedBC(f) >= ruleIa) return 'Rule 3';
    return null;
  }
  if (hasBC && ac - ideal.unmaskedBC(f) >= RULE_2_GAP) return 'Rule 2';
  return null;
}

function expectedFor(ideal, point) {
  const { ear, mode, freq, masked } = point;
  const raw = masked
    ? (mode === 'AC' ? ideal.trueAC(ear, freq) : ideal.trueBC(ear, freq))
    : (mode === 'AC' ? ideal.unmaskedAC(ear, freq) : ideal.unmaskedBC(freq));
  const rounded = Math.ceil(raw / 5) * 5;
  return rounded > maxLevel(mode, freq) ? { nr: true, level: maxLevel(mode, freq) } : { nr: false, level: rounded };
}

function formatResult(r) {
  return r.nr ? `NR (${r.level})` : `${r.level}`;
}

export function checkAudiogram({ patientModel, points, transducer }) {
  const ideal = idealValues(patientModel, transducer);
  const rows = [];
  const has = (ear, mode, f, masked) => points.some((p) => p.ear === ear && p.mode === mode && p.freq === f
    && (masked === undefined || p.masked === masked));

  points.forEach((p) => {
    const series = `${p.mode}${p.masked ? ' masked' : ''}`;
    const row = { ear: p.ear, freq: p.freq, series, yours: formatResult({ nr: p.noResponse, level: p.level }) };
    if (p.mode === 'BC' && maxLevel('BC', p.freq) === undefined) {
      rows.push({ ...row, expected: '—', status: 'Info', note: 'BC is not tested at this frequency.' });
      return;
    }
    const expected = expectedFor(ideal, p);
    row.expected = formatResult(expected);
    if (p.masked && !ideal.maskingFeasible(p.ear, p.mode, p.freq)) {
      rows.push({ ...row, status: 'Info', note: 'Masking dilemma: no masker level gives a plateau here, so this result can\'t be ear-specific. Not graded.' });
      return;
    }
    const correct = expected.nr
      ? p.noResponse
      : !p.noResponse && Math.abs(p.level - expected.level) <= TOLERANCE_DB;
    rows.push({ ...row, status: correct ? 'Correct' : 'Incorrect', note: '' });
  });

  ['right', 'left'].forEach((ear) => {
    AC_FREQS.forEach((f) => {
      if (!has(ear, 'AC', f)) {
        rows.push({ ear, freq: f, series: 'AC', yours: '—', expected: '', status: 'Missing', note: 'No AC result.' });
      }
    });
    [...AC_FREQS.map((f) => ['AC', f]), ...BC_FREQS.map((f) => ['BC', f])].forEach(([mode, f]) => {
      const rule = maskingRequired(ideal, ear, mode, f, transducer);
      if (!rule || has(ear, mode, f, true)) return;
      const feasible = ideal.maskingFeasible(ear, mode, f);
      rows.push({
        ear, freq: f, series: `${mode} masked`, yours: '—', expected: '',
        status: feasible ? 'Missing' : 'Info',
        note: feasible ? `Masking needed (${rule}).` : `Masking needed (${rule}), but this is a masking dilemma: no plateau is possible.`,
      });
    });
  });

  BC_FREQS.forEach((f) => {
    if (!has('right', 'BC', f) && !has('left', 'BC', f)) {
      rows.push({ ear: 'either', freq: f, series: 'BC', yours: '—', expected: '', status: 'Missing', note: 'No BC result in either ear.' });
    }
  });

  const earOrder = { right: 0, left: 1, either: 2 };
  const seriesOrder = { AC: 0, 'AC masked': 1, BC: 2, 'BC masked': 3 };
  rows.sort((a, b) => earOrder[a.ear] - earOrder[b.ear]
    || seriesOrder[a.series] - seriesOrder[b.series]
    || a.freq - b.freq);

  const counts = { Correct: 0, Incorrect: 0, Missing: 0, Info: 0 };
  rows.forEach((r) => { counts[r.status] += 1; });
  return { rows, counts };
}
