import { FREQUENCIES, clampLevel } from './utils.js';

/**
 * Patient parameter model — deliberately mirrors the underlying physiological
 * model used by the source simulator (ptascript.js update()/plotpoint()), not
 * a simplified AC/BC-threshold-only table. This lets a supervisor construct a
 * "patient" the same way Wilding's tool does: true cochlear reserve per ear,
 * a conductive component that only attenuates the *ipsilateral* AC/insert path,
 * a cross-hearing (interaural attenuation) row for the contralateral cochlea,
 * and per-ear ascending/descending hysteresis + psychometric function width
 * that drive the simulated response variability.
 *
 * Per Claude.MD, the AC transducer has two forms with different interaural
 * attenuation: Headphone (flat 40dB) and Insertphone (frequency-dependent,
 * 60dB <=1000Hz / 50dB >1000Hz). Each therefore needs its own
 * "cochlea contra (cross)" row rather than sharing one flat IAA value — the
 * insertphone's steeper low-frequency IAA can let a student cross-hear a
 * response that the flat headphone IAA would suggest is masked, and getting
 * that wrong is exactly the kind of trap this simulator exists to teach.
 */

function flatRow(value) {
  const row = {};
  FREQUENCIES.forEach((f) => { row[f] = value; });
  return row;
}

function slopingRow(base, highBoost) {
  const row = {};
  FREQUENCIES.forEach((f, i) => {
    const ratio = i / (FREQUENCIES.length - 1);
    row[f] = clampLevel(base + highBoost * ratio);
  });
  return row;
}

function headphoneCrossDefault() {
  return flatRow(40);
}

function insertphoneCrossDefault() {
  const row = {};
  FREQUENCIES.forEach((f) => { row[f] = f <= 1000 ? 60 : 50; });
  return row;
}

function defaultEarParams(cochlearRow) {
  return {
    cochlear: cochlearRow,
    ipsiConductive: flatRow(0),
    ascDescDiff: flatRow(2),
    psychWidth: flatRow(4),
  };
}

function buildPatient({ right, left } = {}) {
  return {
    right: defaultEarParams(right ?? flatRow(0)),
    left: defaultEarParams(left ?? flatRow(0)),
    crossIAA: {
      headphone: headphoneCrossDefault(),
      insertphone: insertphoneCrossDefault(),
    },
  };
}

export const PRESETS = {
  normal: {
    label: 'Normal Hearing',
    generate: () => buildPatient({ right: flatRow(0), left: flatRow(0) }),
  },
  conductive: {
    label: 'Conductive Loss (bilateral)',
    generate: () => {
      const p = buildPatient({ right: flatRow(5), left: flatRow(5) });
      p.right.ipsiConductive = flatRow(40);
      p.left.ipsiConductive = flatRow(40);
      return p;
    },
  },
  sensorineural: {
    label: 'Sensorineural Loss (sloping, bilateral)',
    generate: () => buildPatient({ right: slopingRow(20, 50), left: slopingRow(20, 50) }),
  },
  mixed: {
    label: 'Mixed Loss (bilateral)',
    generate: () => {
      const p = buildPatient({ right: flatRow(35), left: flatRow(35) });
      p.right.ipsiConductive = flatRow(30);
      p.left.ipsiConductive = flatRow(30);
      return p;
    },
  },
  unilateral: {
    label: 'Unilateral Severe (left) / Normal (right)',
    generate: () => buildPatient({ right: flatRow(10), left: flatRow(80) }),
  },
};

export function createPatientModel(initial) {
  let patient = initial ?? PRESETS.normal.generate();

  function getParam(ear, param, freq) {
    return patient[ear][param][freq];
  }

  function setParam(ear, param, freq, value) {
    patient[ear][param][freq] = clampLevel(value);
  }

  function getCrossIAA(transducer, freq) {
    return patient.crossIAA[transducer][freq];
  }

  function setCrossIAA(transducer, freq, value) {
    patient.crossIAA[transducer][freq] = clampLevel(value);
  }

  /**
   * Approximate single-number threshold, for callers (masking-required flag,
   * summary displays) that don't need the full hysteresis/jitter model:
   * BC threshold == cochlear reserve; AC threshold == cochlear reserve + ipsi conductive.
   */
  function getThreshold(ear, mode, freq) {
    const cochlear = getParam(ear, 'cochlear', freq);
    if (mode === 'BC') return cochlear;
    return clampLevel(cochlear + getParam(ear, 'ipsiConductive', freq));
  }

  function loadPreset(name) {
    if (!PRESETS[name]) throw new Error(`Unknown preset: ${name}`);
    patient = PRESETS[name].generate();
  }

  function loadPatient(newPatient) {
    patient = newPatient;
  }

  function getPatient() {
    return patient;
  }

  return {
    getParam,
    setParam,
    getCrossIAA,
    setCrossIAA,
    getThreshold,
    loadPreset,
    loadPatient,
    getPatient,
  };
}
