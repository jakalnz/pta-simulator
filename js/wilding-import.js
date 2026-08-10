import { FREQUENCIES, clampLevel } from './utils.js';

// Frequencies present on the source simulator (personalpages.manchester.ac.uk
// .../PTA_Sim/PTAsim.html) — it never tests 750/1500Hz, so those two rows
// have to be synthesised from their neighbours after import (see below).
const WILDING_FREQUENCIES = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];

// Every "row" of the source simulator's Thresholds-and-transmission panel,
// identified by the id/name suffix used on each per-frequency <input> there
// (e.g. "1000R_t", "1000rupdown" — see ptascript.js updateparamlink(), which
// serialises exactly `$("#thresholds input")`), and the default value that
// input carries when the field is absent from a given link.
const ROWS = [
  { suffix: 'R_t', ear: 'right', param: 'cochlear', fallback: 0 },
  { suffix: 'L_t', ear: 'left', param: 'cochlear', fallback: 0 },
  { suffix: 'R_c', ear: 'right', param: 'ipsiConductive', fallback: 0 },
  { suffix: 'L_c', ear: 'left', param: 'ipsiConductive', fallback: 0 },
  { suffix: 'rupdown', ear: 'right', param: 'ascDescDiff', fallback: 2 },
  { suffix: 'lupdown', ear: 'left', param: 'ascDescDiff', fallback: 2 },
  { suffix: 'rfunwidth', ear: 'right', param: 'psychWidth', fallback: 4 },
  { suffix: 'lfunwidth', ear: 'left', param: 'psychWidth', fallback: 4 },
];

function extractEncodedParam(input, name) {
  const match = input.match(new RegExp(`[?&#]${name}=([^&#]+)`));
  return match ? match[1] : null;
}

function decodeParamString(input) {
  const loadl = extractEncodedParam(input, 'loadl');
  if (loadl) {
    if (typeof LZString === 'undefined') {
      throw new Error('LZString library not loaded');
    }
    const decompressed = LZString.decompressFromEncodedURIComponent(loadl);
    if (typeof decompressed !== 'string' || !decompressed) {
      throw new Error('Could not decompress this link — it may be corrupted or truncated');
    }
    return decompressed;
  }
  const loadp = extractEncodedParam(input, 'loadp');
  if (loadp) {
    return atob(loadp);
  }
  throw new Error('No "loadl" or "loadp" parameter found — paste a full PTA Simulator (Wilding) share link');
}

function num(params, key, fallback) {
  const v = params.get(key);
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Averages the two neighbouring frequencies for a row and rounds to the
// nearest 5dB (the source simulator's dial step), since 750/1500Hz don't
// exist on the source simulator and have no measured value to import.
function interpolate(row, lowFreq, highFreq) {
  return clampLevel((row[lowFreq] + row[highFreq]) / 2);
}

function insertphoneCrossDefault() {
  const row = {};
  FREQUENCIES.forEach((f) => { row[f] = f <= 1000 ? 60 : 50; });
  return row;
}

/**
 * Parses a share link/URL (or raw query string) from the source PTA
 * Simulator into a patient object compatible with this app's patientModel,
 * filling in 750/1500Hz by interpolation. Throws with a user-facing message
 * on malformed input.
 */
export function parseWildingLink(input) {
  const decoded = decodeParamString(input.trim());
  const params = new URLSearchParams(decoded);

  const crossIAARow = {};
  WILDING_FREQUENCIES.forEach((f) => { crossIAARow[f] = num(params, `${f}ac_ia`, 40); });
  crossIAARow[750] = interpolate(crossIAARow, 500, 1000);
  crossIAARow[1500] = interpolate(crossIAARow, 1000, 2000);

  const earParams = { right: {}, left: {} };
  ['right', 'left'].forEach((ear) => {
    ['cochlear', 'ipsiConductive', 'ascDescDiff', 'psychWidth'].forEach((param) => {
      earParams[ear][param] = {};
    });
  });

  ROWS.forEach(({ suffix, ear, param, fallback }) => {
    const row = earParams[ear][param];
    WILDING_FREQUENCIES.forEach((f) => { row[f] = num(params, `${f}${suffix}`, fallback); });
    row[750] = interpolate(row, 500, 1000);
    row[1500] = interpolate(row, 1000, 2000);
  });

  const patient = {
    right: { ...earParams.right },
    left: { ...earParams.left },
    crossIAA: {
      headphone: crossIAARow,
      insertphone: insertphoneCrossDefault(),
    },
  };

  const hidey = Boolean(params.get('hidey'));

  return { patient, locked: hidey };
}
