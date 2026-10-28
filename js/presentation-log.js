/**
 * Session-only record of every tone presentation, so a student (or tutor)
 * can review how thresholds were found, not just the final audiogram:
 * settings at tone onset, how long the tone was held, the gap since the
 * previous tone, and whether / when the response light came on.
 *
 * It records only what the student could see — never the patient's hidden
 * thresholds or which cochlea heard the tone. Not saved in links or JSON;
 * download the CSV before leaving.
 */

const COLUMNS = [
  ['#', (e) => e.number],
  ['Start time', (e) => e.startedAt],
  ['Ear', (e) => e.ear],
  ['Transducer', (e) => e.transducer],
  ['Frequency (Hz)', (e) => e.freq],
  ['Level (dB HL)', (e) => e.level],
  ['Masking (dB)', (e) => e.masking],
  ['Duration (s)', (e) => seconds(e.durationMs)],
  ['ISI (s)', (e) => seconds(e.isiMs)],
  ['Response', (e) => e.response],
  ['Response delay from onset (s)', (e) => seconds(e.responseDelayMs)],
  ['Ended by', (e) => e.endReason ?? ''],
  ['Input', (e) => e.input],
  ['Sound', (e) => (e.soundOn ? 'On' : 'Off')],
  ['Placement', (e) => e.placement ?? ''],
  ['Placement issues', (e) => (e.placementIssues ?? []).join('; ')],
];

function seconds(ms) {
  return ms === null || ms === undefined ? '' : (ms / 1000).toFixed(3);
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function createPresentationLog({ now = () => performance.now(), wallNow = () => new Date() } = {}) {
  let entries = [];
  let active = null;      // entry for the tone being held
  let activeStart = 0;
  let previousEnd = null;
  const startTimes = new Map(); // entry number -> onset time, for late responses
  const listeners = [];

  function emit() {
    listeners.forEach((fn) => fn());
  }

  /**
   * settings: { ear, mode, transducer, freq, level, maskingOn, maskingLevel, soundOn }
   * Returns the entry number, which markResponse() uses to attribute a
   * response that arrives after the tone has ended.
   */
  function start(settings, input) {
    if (active) return active.number;
    const t = now();
    const entry = {
      number: entries.length + 1,
      startedAt: wallNow().toISOString(),
      ear: settings.ear === 'right' ? 'Right' : 'Left',
      transducer: settings.mode === 'BC' ? 'Bone' : (settings.transducer === 'insertphone' ? 'Insert' : 'Headphone'),
      freq: settings.freq,
      level: settings.level,
      masking: settings.maskingOn ? settings.maskingLevel : 'OFF',
      durationMs: null,
      isiMs: previousEnd === null ? null : t - previousEnd,
      response: 'None',
      responseDelayMs: null,
      endReason: null,
      input,
      soundOn: settings.soundOn,
      placement: settings.placement,
      placementIssues: settings.placementIssues ?? [],
      // Raw values for the method review (not CSV columns).
      earKey: settings.ear,
      mode: settings.mode,
      maskerLevel: settings.maskingOn ? settings.maskingLevel : null,
    };
    entries.push(entry);
    active = entry;
    activeStart = t;
    startTimes.set(entry.number, t);
    emit();
    return entry.number;
  }

  function end(reason = 'Released') {
    if (!active) return;
    const t = now();
    active.durationMs = t - activeStart;
    active.endReason = reason;
    active = null;
    previousEnd = t;
    emit();
  }

  // The response light came on for presentation `number`.
  function markResponse(number) {
    const entry = entries[number - 1];
    if (!entry || entry.response !== 'None') return;
    entry.response = entry === active ? 'During tone' : 'After tone';
    entry.responseDelayMs = now() - startTimes.get(number);
    emit();
  }

  function reset() {
    entries = [];
    active = null;
    previousEnd = null;
    startTimes.clear();
    emit();
  }

  function toCsv() {
    const rows = [COLUMNS.map(([name]) => name)];
    entries.forEach((e) => rows.push(COLUMNS.map(([, get]) => get(e))));
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  return {
    start,
    end,
    markResponse,
    reset,
    toCsv,
    getEntries: () => entries,
    columns: COLUMNS,
    onChange: (fn) => listeners.push(fn),
  };
}
