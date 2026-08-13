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

  /**
   * Pure evaluation — no random-history side effects beyond drawing a fresh
   * jitter sample each call, matching the source simulator calling update()
   * fresh on every presentation.
   */
  function evaluateResponse() {
    const { testEar, testMode, transducer, freq, presentedLevel, maskingOn, maskingLevel } = state;
    const otherEar = OTHER_EAR[testEar];

    const cross = testMode === 'AC' ? patientModel.getCrossIAA(transducer, freq) : 0;
    const ipsiConductiveTest = testMode === 'AC' ? patientModel.getParam(testEar, 'ipsiConductive', freq) : 0;
    const ipsiConductiveOther = testMode === 'AC' ? patientModel.getParam(otherEar, 'ipsiConductive', freq) : 0;

    const testCochleaLevel = presentedLevel - ipsiConductiveTest;
    const contraCochleaLevel = presentedLevel - cross;

    const testThresholdBase = patientModel.getParam(testEar, 'cochlear', freq);
    const contraThresholdBase = patientModel.getParam(otherEar, 'cochlear', freq);

    let effectiveTestThreshold = testThresholdBase;
    let effectiveContraThreshold = contraThresholdBase;
    let overmasked = false;

    if (maskingOn) {
      const maskerAtContraCochlea = maskingLevel - ipsiConductiveOther;
      const maskerCrossToTestCochlea = testMode === 'AC' ? maskingLevel - cross : maskingLevel;
      effectiveContraThreshold = Math.max(contraThresholdBase, maskerAtContraCochlea);
      if (maskerCrossToTestCochlea > testThresholdBase) {
        effectiveTestThreshold = maskerCrossToTestCochlea;
        overmasked = true;
      }
    }

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
      maskerAtContraCochlea: maskingOn ? maskingLevel - ipsiConductiveOther : null,
      maskerCrossToTestCochlea: maskingOn && overmasked ? (testMode === 'AC' ? maskingLevel - cross : maskingLevel) : null,
    };
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
    storeThreshold,
    getStoredPoints,
    deleteStoredPoint,
    clearStoredPoints,
    restoreStoredPoints,
    isPlateauStable,
    getVisualState,
  };
}
