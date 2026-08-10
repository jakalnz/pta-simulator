import { obfuscate, deobfuscate } from './obfuscate.js';

export const SCHEMA_VERSION = 2;

export function serializeSession({ patientModel, engine, patientInfo, timerSeconds, locked }) {
  const patient = patientModel.getPatient();
  const state = engine.getState();
  const isLocked = Boolean(locked);
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    patientInfo: {
      name: patientInfo?.name ?? '',
      id: patientInfo?.id ?? '',
      dob: patientInfo?.dob ?? '',
    },
    transducer: state.transducer,
    toggleDirection: state.toggleDirection,
    // Exam mode: when true, the patient's true parameters are obfuscated
    // (see obfuscate.js) so opening the .json in a text editor, or decoding
    // the share-link's base64 hash, doesn't hand over the answer key —
    // and Edit Thresholds is disabled on load (see applyLockState in main.js).
    // Mirrors the source simulator's "hidey" URL flag, which disabled its
    // patient-setup panel.
    patient: isLocked ? { __obfuscated: true, data: obfuscate(patient) } : patient,
    storedPoints: engine.getStoredPoints(),
    durationSeconds: timerSeconds ?? 0,
    locked: isLocked,
  };
}

export function deserializeSession(data) {
  if (!data || data.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported or missing schemaVersion (expected ${SCHEMA_VERSION})`);
  }
  return data;
}

export function applySession(data, { patientModel, engine }) {
  const patient = (data.patient && data.patient.__obfuscated)
    ? deobfuscate(data.patient.data)
    : data.patient;
  patientModel.loadPatient(patient);
  engine.restoreStoredPoints(Array.isArray(data.storedPoints) ? data.storedPoints : []);
  if (data.transducer) engine.setTransducer(data.transducer);
  if (data.toggleDirection) engine.setToggleDirection(data.toggleDirection);
  return data;
}
