import { FREQUENCIES, clampLevel, OTHER_EAR, BC_MAX_LEVEL, DB_MAX } from './utils.js';

// Frequencies outside BC_MAX_LEVEL (6000/8000Hz) aren't offered via BC on
// real audiometers; there's no dedicated frequency selector to grey them
// out (frequency is stepped, shared with AC), so fall back to the highest
// defined BC ceiling rather than DB_MAX so the dial still can't run away.
const BC_FALLBACK_MAX = Math.max(...Object.values(BC_MAX_LEVEL));

function maxLevelFor(mode, freq) {
  return mode === 'BC' ? (BC_MAX_LEVEL[freq] ?? BC_FALLBACK_MAX) : DB_MAX;
}
import { isMaskingRequired, createPlateauTracker } from './masking-logic.js';

/**
 * Response simulation mirrors ptascript.js update(): presented level is
 * attenuated by the test ear's own ipsilateral conductive loss to reach the
 * test cochlea, and separately attenuated by the (transducer-specific)
 * interaural attenuation to reach the contralateral cochlea. Masking noise
 * presented to the non-test ear is itself attenuated by that ear's own
 * conductive loss to reach its cochlea (raising its effective threshold),
 * and can cross back to the test cochlea by the same IAA, over-masking it.
 * Each ear's effective threshold is further offset by a per-ear ascending/
 * descending hysteresis term and a random psychometric-function jitter.
 */
export function createAudiometerEngine(patientModel) {
  const state = {
    testEar: 'right',
    testMode: 'AC',
    transducer: 'headphone',
    freq: 1000,
    presentedLevel: 40,
    maskingOn: false,
    maskingLevel: 0,
    toggleDirection: 'up-louder',
    lastResponse: null,
    noResponse: false,
    cochleaResponse: { right: null, left: null },
    // 'auto': transducers are always where they should be (AC: headset on
    // both ears; BC: bone conductor on the test side, test ear uncovered,
    // non-test ear covered only while masking). 'manual': the student
    // places them (see setPlacement).
    placementMode: 'auto',
    placement: {
      headset: 'on',                         // 'on' | 'swapped' | 'off'
      cover: { right: 'over', left: 'over' }, // earphone 'over' (in) the ear, or 'above' (out of) it
      bc: 'off',                             // 'right' | 'left' | 'off'
    },
  };

  const lastCochleaLevel = { right: -10, left: -10 };
  const plateau = createPlateauTracker();
  const listeners = new Set();
  const storedPoints = [];

  function emit() {
    listeners.forEach((fn) => fn(getState()));
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getState() {
    return { ...state };
  }

  function setTestEar(ear) {
    state.testEar = ear;
    plateau.reset();
    emit();
  }

  function setTestMode(mode) {
    state.testMode = mode;
    state.presentedLevel = clampLevel(state.presentedLevel, maxLevelFor(mode, state.freq));
    plateau.reset();
    emit();
  }

  function setTransducer(type) {
    state.transducer = type;
    plateau.reset();
    emit();
  }

  function setToggleDirection(dir) {
    state.toggleDirection = dir;
    emit();
  }

  function stepFrequency(dir) {
    const idx = FREQUENCIES.indexOf(state.freq);
    const nextIdx = clampIndex(idx + dir, FREQUENCIES.length);
    state.freq = FREQUENCIES[nextIdx];
    state.presentedLevel = clampLevel(state.presentedLevel, maxLevelFor(state.testMode, state.freq));
    plateau.reset();
    emit();
  }

  function clampIndex(i, len) {
    return Math.min(len - 1, Math.max(0, i));
  }

  function adjustPresentedLevel(dir) {
    // dir: +1 = "up" key. toggleDirection decides whether up = louder or quieter.
    const sign = state.toggleDirection === 'up-louder' ? dir : -dir;
    state.presentedLevel = clampLevel(state.presentedLevel + sign * 5, maxLevelFor(state.testMode, state.freq));
    emit();
  }

  function toggleMasking() {
    state.maskingOn = !state.maskingOn;
    plateau.reset();
    emit();
  }

  function adjustMaskingLevel(delta) {
    state.maskingLevel = clampLevel(state.maskingLevel + delta);
    emit();
  }

  function ascDescOffset(ear, freq, cochleaLevel) {
    const ascending = cochleaLevel >= lastCochleaLevel[ear];
    const diff = patientModel.getParam(ear, 'ascDescDiff', freq);
    return ascending ? diff / 2 : -diff / 2;
  }

  function psychJitter(ear, freq) {
    const width = patientModel.getParam(ear, 'psychWidth', freq);
    return Math.random() * width - width / 2;
  }

  // Extra loss (dB) for a transducer that is off the patient or resting
  // above / out of the ear, as estimated in Wilding's PTA_Sim.
  const MISPLACED_LOSS = 40;

  // Where automatic mode puts the transducers for a test.
  function idealPlacement({ testEar, testMode, maskingOn } = state) {
    const other = OTHER_EAR[testEar];
    if (testMode === 'AC') return { headset: 'on', cover: { right: 'over', left: 'over' }, bc: 'off' };
    return {
      headset: 'on',
      cover: { [testEar]: 'above', [other]: maskingOn ? 'over' : 'above' },
      bc: testEar,
    };
  }

  function effectivePlacement() {
    return state.placementMode === 'manual' ? state.placement : idealPlacement();
  }

  // Level reaching each cochlea from the AC earphone labelled `channelEar`
  // (Channel 1 = test ear's earphone, Channel 2 = the other one): straight
  // through the ear it sits on (minus that ear's conductive component) and
  // across the head to the other cochlea (minus interaural attenuation).
  function deliverAc(level, channelEar, placement) {
    const { transducer, freq } = state;
    const physical = placement.headset === 'swapped' ? OTHER_EAR[channelEar] : channelEar;
    const misplaced = placement.headset === 'off' || placement.cover[physical] === 'above';
    const at = level - (misplaced ? MISPLACED_LOSS : 0);
    return {
      [physical]: at - patientModel.getParam(physical, 'ipsiConductive', freq),
      [OTHER_EAR[physical]]: at - patientModel.getCrossIAA(transducer, freq),
    };
  }

  // BC reaches both cochleae equally, less each one's BC transmission loss,
  // plus the occlusion effect in any ear covered by an earphone.
  function deliverBc(level, placement) {
    const { transducer, freq } = state;
    const at = level - (placement.bc === 'off' ? MISPLACED_LOSS : 0);
    const covered = (ear) => placement.headset !== 'off' && placement.cover[ear] === 'over';
    const out = {};
    ['right', 'left'].forEach((ear) => {
      out[ear] = at - patientModel.getParam(ear, 'bcAttenuation', freq)
        + (covered(ear) ? patientModel.getOcclusion(transducer, freq) : 0);
    });
    return out;
  }

  /**
   * Pure evaluation — no random-history side effects beyond drawing a fresh
   * jitter sample each call, matching the source simulator calling update()
   * fresh on every presentation. Each cochlea responds if the tone reaching
   * it is at or above its threshold, raised by any masker reaching it (which
   * is how the non-test ear is masked, and how over-masking happens).
   */
  function evaluateResponse() {
    const { testEar, testMode, transducer, freq, presentedLevel, maskingOn, maskingLevel } = state;
    const otherEar = OTHER_EAR[testEar];
    const placement = effectivePlacement();

    const tone = testMode === 'AC' ? deliverAc(presentedLevel, testEar, placement) : deliverBc(presentedLevel, placement);
    const masker = maskingOn ? deliverAc(maskingLevel, otherEar, placement) : null;

    const testThresholdBase = patientModel.getParam(testEar, 'cochlear', freq);
    const contraThresholdBase = patientModel.getParam(otherEar, 'cochlear', freq);
    const effectiveTestThreshold = masker ? Math.max(testThresholdBase, masker[testEar]) : testThresholdBase;
    const effectiveContraThreshold = masker ? Math.max(contraThresholdBase, masker[otherEar]) : contraThresholdBase;
    const overmasked = effectiveTestThreshold > testThresholdBase;

    const testCochleaLevel = tone[testEar];
    const contraCochleaLevel = tone[otherEar];
    const testResponds = testCochleaLevel >= (effectiveTestThreshold + ascDescOffset(testEar, freq, testCochleaLevel) + psychJitter(testEar, freq));
    const contraResponds = contraCochleaLevel >= (effectiveContraThreshold + ascDescOffset(otherEar, freq, contraCochleaLevel) + psychJitter(otherEar, freq));

    const maskingNeeded = isMaskingRequired({ testEar, testMode, freq, presentedLevel, transducer, patientModel });

    return {
      heard: testResponds || contraResponds,
      testResponds,
      contraResponds,
      maskingNeeded,
      overmasked,
      testCochleaLevel,
      contraCochleaLevel,
      effectiveTestThreshold,
      effectiveContraThreshold,
      maskerAtContraCochlea: masker ? masker[otherEar] : null,
      maskerCrossToTestCochlea: masker && overmasked ? masker[testEar] : null,
    };
  }

  function setPlacementMode(mode) {
    state.placementMode = mode === 'manual' ? 'manual' : 'auto';
    emit();
  }

  // Partial update, e.g. { headset: 'swapped' } or { cover: { left: 'above' } }.
  function setPlacement(change) {
    state.placement = {
      ...state.placement,
      ...change,
      cover: { ...state.placement.cover, ...(change.cover ?? {}) },
    };
    emit();
  }

  // Short description of where the transducers are, for the log.
  function describePlacement() {
    if (state.placementMode === 'auto') return 'Automatic';
    const p = state.placement;
    const ear = (e) => (p.headset === 'off' ? 'off' : (p.cover[e] === 'over' ? 'covered' : 'uncovered'));
    return `Headset ${p.headset}; R ${ear('right')}, L ${ear('left')}; BC ${p.bc}`;
  }

  // Placement problems for the current test, for the log and method review.
  function placementIssues() {
    if (state.placementMode === 'auto') return [];
    const p = state.placement;
    const { testEar, testMode, maskingOn } = state;
    const other = OTHER_EAR[testEar];
    const covered = (e) => p.headset !== 'off' && p.cover[e] === 'over';
    const issues = [];
    if (p.headset === 'swapped' && (testMode === 'AC' || maskingOn)) issues.push('earphones on the wrong ears');
    if (testMode === 'AC' && !covered(testEar)) issues.push('test earphone not on the ear');
    if (testMode === 'BC') {
      if (p.bc === 'off') issues.push('bone conductor not fitted');
      else if (p.bc !== testEar) issues.push('bone conductor on the non-test side');
      if (covered(testEar)) issues.push('test ear covered during BC (occlusion effect)');
    }
    if (maskingOn && p.headset !== 'swapped' && !covered(other)) issues.push('masking earphone not on the non-test ear');
    return issues;
  }

  function presentTone() {
    const result = evaluateResponse();
    state.lastResponse = result.heard;
    state.noResponse = !result.heard;
    // Mirrors ptascript.js: the "last cochlea level" hysteresis anchor only
    // advances for a cochlea that actually responded this trial.
    if (result.testResponds) lastCochleaLevel[state.testEar] = result.testCochleaLevel;
    if (result.contraResponds) lastCochleaLevel[OTHER_EAR[state.testEar]] = result.contraCochleaLevel;
    state.cochleaResponse = {
      ...state.cochleaResponse,
      [state.testEar]: result.testResponds,
      [OTHER_EAR[state.testEar]]: result.contraResponds,
    };
    if (state.maskingOn) {
      plateau.record(state.maskingLevel, result.heard);
    }
    emit();
    return result;
  }

  /**
   * One stored point per (ear, mode, freq, masked) — matches the source
   * simulator, which has exactly one form field per that combination and
   * overwrites it on each store. An unmasked and a masked point can
   * legitimately coexist at the same frequency (e.g. a shadow curve next to
   * its true masked threshold); selecting a new level for the same
   * combination replaces the old symbol rather than adding a second one.
   */
  function upsertPoint(point) {
    const idx = storedPoints.findIndex((p) => p.ear === point.ear
      && p.mode === point.mode
      && p.freq === point.freq
      && p.masked === point.masked);
    if (idx >= 0) storedPoints[idx] = point;
    else storedPoints.push(point);
    return point;
  }

  /**
   * No-response is a clinician decision, not something inferred from the
   * simulated patient's last response — the clinician stores NR only after
   * judging (e.g. at max output) that the patient genuinely can't hear it.
   */
  function storeThreshold(noResponse = false) {
    const point = upsertPoint({
      ear: state.testEar,
      mode: state.testMode,
      freq: state.freq,
      level: state.presentedLevel,
      masked: state.maskingOn,
      noResponse,
    });
    emit();
    return point;
  }

  /**
   * ULL (uncomfortable loudness level) at the current ear, frequency and
   * level. Loudness discomfort isn't simulated: the clinician records the
   * level the patient reports. Storing the same level again removes it.
   */
  function toggleUll() {
    const idx = storedPoints.findIndex((p) => p.ear === state.testEar && p.mode === 'ULL' && p.freq === state.freq);
    let point = null;
    if (idx >= 0 && storedPoints[idx].level === state.presentedLevel) {
      storedPoints.splice(idx, 1);
    } else {
      point = upsertPoint({ ear: state.testEar, mode: 'ULL', freq: state.freq, level: state.presentedLevel, masked: false, noResponse: false });
    }
    emit();
    return point;
  }

  function getStoredPoints() {
    return [...storedPoints];
  }

  /**
   * Deletes the stored point matching the *current* dial state (same
   * identity tuple upsertPoint matches on) — lets a student clear one wrong
   * entry without wiping the whole test. No-op if nothing matches.
   */
  function deleteStoredPoint() {
    const idx = storedPoints.findIndex((p) => p.ear === state.testEar
      && p.mode === state.testMode
      && p.freq === state.freq
      && p.masked === state.maskingOn);
    if (idx >= 0) storedPoints.splice(idx, 1);
    emit();
  }

  function clearStoredPoints() {
    storedPoints.length = 0;
    emit();
  }

  function restoreStoredPoints(points) {
    storedPoints.length = 0;
    points.forEach((p) => upsertPoint(p));
    emit();
  }

  function isPlateauStable() {
    return plateau.isStable();
  }

  /**
   * Mirrors the source simulator's "Visual" foldout: for each cochlea, the
   * tone level and masker level actually arriving there at the current dial
   * settings, the effective threshold they're being judged against, the
   * hysteresis anchor from the last response, and whether that cochlea
   * responded on the last presentation. This is answer-key information
   * (it shows *why* the simulated patient will or won't respond), so callers
   * should only surface it when hints are enabled.
   */
  function getVisualState() {
    const r = evaluateResponse();
    const testEar = state.testEar;
    const otherEar = OTHER_EAR[testEar];

    const perEar = { right: {}, left: {} };
    perEar[testEar] = {
      toneLevel: r.testCochleaLevel,
      maskerLevel: r.maskerCrossToTestCochlea,
      threshold: r.effectiveTestThreshold,
      lastLevel: lastCochleaLevel[testEar],
      responded: state.cochleaResponse[testEar],
    };
    perEar[otherEar] = {
      toneLevel: r.contraCochleaLevel,
      maskerLevel: r.maskerAtContraCochlea,
      threshold: r.effectiveContraThreshold,
      lastLevel: lastCochleaLevel[otherEar],
      responded: state.cochleaResponse[otherEar],
    };
    return perEar;
  }

  return {
    getState,
    onChange,
    setTestEar,
    setTestMode,
    setTransducer,
    setToggleDirection,
    stepFrequency,
    adjustPresentedLevel,
    toggleMasking,
    adjustMaskingLevel,
    evaluateResponse,
    presentTone,
    setPlacementMode,
    setPlacement,
    idealPlacement,
    effectivePlacement,
    describePlacement,
    placementIssues,
    storeThreshold,
    toggleUll,
    getStoredPoints,
    deleteStoredPoint,
    clearStoredPoints,
    restoreStoredPoints,
    isPlateauStable,
    getVisualState,
  };
}
