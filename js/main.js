import { createPatientModel, PRESETS } from './patient-model.js';
import { createAudiometerEngine } from './audiometer-engine.js';
import { wireUi } from './ui-controls.js';
import { buildThresholdEditor } from './threshold-editor.js';
import { createPresentationLog } from './presentation-log.js';
import { checkAudiogram } from './audiogram-check.js';
import { reviewMethod } from './method-review.js';
import { exportJson, importJson } from './json-io.js';
import { buildShareUrl, readShareUrl, applyShareData } from './share-link.js';
import { exportPdf } from './pdf-export.js';
import { createTimer } from './timer.js';
import { wireKeyboardShortcuts } from './keyboard-shortcuts.js';
import { initFullscreenLandscape, initRotateHint, initFullscreenButton } from './viewport-fullscreen.js';
import { parseWildingLink } from './wilding-import.js';
import { initGutterDrawer } from './gutter-drawer.js';
import { resolveLibraryUrl, loadCaseFromUrl, saveLibraryConfig, loadLibraryConfig } from './case-library.js';
import { applySession } from './session-serializer.js';

initFullscreenLandscape();
initRotateHint();
initFullscreenButton();

const patientModel = createPatientModel();
const engine = createAudiometerEngine(patientModel);

const dom = {
  stimulusLevel: document.getElementById('stimulus-level'),
  stimulusLabel: document.getElementById('stimulus-label'),
  stimulusPanel: document.querySelector('.display-bar__stimulus'),
  maskingPanel: document.querySelector('.display-bar__masking'),
  freqReadout: document.getElementById('freq-readout'),
  freqPanel: document.getElementById('freq-panel'),
  freqHintReadout: document.getElementById('freq-hint-readout'),
  hintsSwitch: document.getElementById('hints-switch'),
  maskingLevel: document.getElementById('masking-level'),
  maskingLabel: document.getElementById('masking-label'),
  earButtons: Array.from(document.querySelectorAll('[data-ear]')),
  modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
  transducerButtons: Array.from(document.querySelectorAll('.transducer-toggle button')),
  transducerSwitch: document.getElementById('transducer-switch'),
  maskOnBtn: document.getElementById('mask-on-btn'),
  maskOffBtn: document.getElementById('mask-off-btn'),
  maskingRequiredFlag: document.getElementById('masking-required-flag'),
  hintsStatusFlag: document.getElementById('hints-status-flag'),
  soundStatusFlag: document.getElementById('sound-status-flag'),
  levelUpBtn: document.getElementById('level-up'),
  levelDownBtn: document.getElementById('level-down'),
  freqPrevBtn: document.getElementById('freq-prev'),
  freqNextBtn: document.getElementById('freq-next'),
  maskUpBtn: document.getElementById('mask-up'),
  maskDownBtn: document.getElementById('mask-down'),
  noResponseBtn: document.getElementById('no-response-btn'),
  storeBtn: document.getElementById('store-btn'),
  deletePointBtn: document.getElementById('delete-point-btn'),
  presentBtn: document.getElementById('present-btn'),
  canvasRight: document.getElementById('audiogram-canvas-right'),
  canvasLeft: document.getElementById('audiogram-canvas-left'),
  wrapLeft: document.getElementById('wrap-left'),
  canvasCombinedHidden: document.getElementById('audiogram-canvas-combined'),
  chartViewEl: document.getElementById('chart-view'),
  chartViewButtons: Array.from(document.querySelectorAll('[data-chartview]')),
  presetSelect: document.getElementById('preset-select'),
  soundSwitch: document.getElementById('sound-switch'),
  directionSwitch: document.getElementById('direction-switch'),
  visualDetails: document.getElementById('visual-details'),
  visual: {
    right: {
      tone: document.getElementById('visual-right-tone'),
      masker: document.getElementById('visual-right-masker'),
      threshold: document.getElementById('visual-right-threshold'),
      response: document.getElementById('visual-right-response'),
      last: document.getElementById('visual-right-last'),
    },
    left: {
      tone: document.getElementById('visual-left-tone'),
      masker: document.getElementById('visual-left-masker'),
      threshold: document.getElementById('visual-left-threshold'),
      response: document.getElementById('visual-left-response'),
      last: document.getElementById('visual-left-last'),
    },
  },
};

const builtInPresetsGroup = document.createElement('optgroup');
builtInPresetsGroup.label = 'Built-in Presets';
Object.entries(PRESETS).forEach(([key, preset]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = preset.label;
  builtInPresetsGroup.appendChild(opt);
});
dom.presetSelect.appendChild(builtInPresetsGroup);

// Manual on/off switch for the bundled OSCA practice cases below — flip to
// false to hide the group again once students shouldn't see it by default.
const SHOW_OSCA_PRACTICE_CASES = true;
const oscaPracticeCases = [
  { label: 'OSCA Practice Case 1', url: 'cases/osca-practice/case-1.json' },
  { label: 'OSCA Practice Case 2', url: 'cases/osca-practice/case-2.json' },
  { label: 'OSCA Practice Case 3', url: 'cases/osca-practice/case-3.json' },
  { label: 'OSCA Practice Case 4', url: 'cases/osca-practice/case-4.json' },
];

// Class Case Library: a supervisor-published set of cases (see
// js/case-library.js), listed as a second optgroup and applied via the
// full session schema (patient + storedPoints + locked) rather than
// patientModel.loadPreset(), which only sets physiology.
let libraryOptgroup = null;
let libraryCasesByValue = new Map();

function rebuildLibraryOptgroup(library) {
  if (libraryOptgroup) libraryOptgroup.remove();
  Array.from(libraryCasesByValue.keys())
    .filter((key) => key.startsWith('lib:'))
    .forEach((key) => libraryCasesByValue.delete(key));
  if (!library || !library.cases || library.cases.length === 0) return;
  libraryOptgroup = document.createElement('optgroup');
  libraryOptgroup.label = library.label || 'Class Cases';
  library.cases.forEach((c, i) => {
    const value = `lib:${i}`;
    libraryCasesByValue.set(value, c);
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = c.label;
    libraryOptgroup.appendChild(opt);
  });
  dom.presetSelect.appendChild(libraryOptgroup);
}

if (SHOW_OSCA_PRACTICE_CASES) {
  const oscaOptgroup = document.createElement('optgroup');
  oscaOptgroup.label = 'OSCA Practice Cases';
  oscaPracticeCases.forEach((c, i) => {
    const value = `osca:${i}`;
    libraryCasesByValue.set(value, c);
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = c.label;
    oscaOptgroup.appendChild(opt);
  });
  dom.presetSelect.appendChild(oscaOptgroup);
}

// A JSON import, share link, or Wilding import loads a patient that isn't
// any of the dropdown's own options — leaving the Preset field showing
// whatever built-in preset was last selected would be actively misleading
// about which patient is actually active. Instead we inject a one-off
// option carrying the loaded case's own name (or a generic fallback when
// none is available, e.g. Wilding links don't carry a patient name) and
// select it; it's removed again the moment the user picks a real preset
// or library case, so it never lingers as a dead entry in the list.
let loadedCaseOption = null;

function setActiveLoadedCase(label) {
  if (!loadedCaseOption) {
    loadedCaseOption = document.createElement('option');
    loadedCaseOption.value = 'loaded';
    dom.presetSelect.prepend(loadedCaseOption);
  }
  loadedCaseOption.textContent = label;
  dom.presetSelect.value = 'loaded';
}

function clearActiveLoadedCase() {
  if (loadedCaseOption) {
    loadedCaseOption.remove();
    loadedCaseOption = null;
  }
}

dom.presetSelect.addEventListener('change', async () => {
  const value = dom.presetSelect.value;
  clearActiveLoadedCase();
  const libraryCase = libraryCasesByValue.get(value);
  if (libraryCase) {
    caseLibraryStatus.textContent = `Loading "${libraryCase.label}"…`;
    caseLibraryStatus.classList.remove('error');
    try {
      const data = await loadCaseFromUrl(libraryCase.url);
      applySession(data, { patientModel, engine });
      ui.refreshChart();
      editor.render();
      applyLockState(data.locked);
      caseLibraryStatus.textContent = `Loaded "${libraryCase.label}".`;
    } catch (err) {
      caseLibraryStatus.textContent = err.message;
      caseLibraryStatus.classList.add('error');
    }
    return;
  }
  patientModel.loadPreset(value);
  engine.clearStoredPoints();
});

const presentationLog = createPresentationLog();
const ui = wireUi({ engine, patientModel, dom, presentationLog });

const patientDialog = document.getElementById('patient-dialog');
const editor = buildThresholdEditor({
  patientModel,
  tbody: document.querySelector('#threshold-table tbody'),
  thead: document.getElementById('threshold-table-head'),
  onChange: () => ui.refreshChart(),
});

const WILDING_UNLOCK_PASSWORD = '1234';
let thresholdsLocked = false;
let lockClickCount = 0;
let lockClickResetTimer = null;
const LOCK_CLICK_THRESHOLD = 5;
const LOCK_CLICK_WINDOW_MS = 2000;

document.getElementById('edit-thresholds-btn').addEventListener('click', () => {
  if (thresholdsLocked) {
    lockClickCount += 1;
    clearTimeout(lockClickResetTimer);
    lockClickResetTimer = setTimeout(() => { lockClickCount = 0; }, LOCK_CLICK_WINDOW_MS);
    if (lockClickCount >= LOCK_CLICK_THRESHOLD) {
      lockClickCount = 0;
      clearTimeout(lockClickResetTimer);
      const entered = window.prompt('Enter the password to unlock editing:');
      if (entered === WILDING_UNLOCK_PASSWORD) unlockThresholds();
    }
    return;
  }
  editor.render();
  renderLatency();
  patientDialog.showModal();
});

const latencyMin = document.getElementById('latency-min');
const latencyMax = document.getElementById('latency-max');
const latencyPreset = document.getElementById('latency-preset');
function renderLatency() {
  const { minMs, maxMs } = patientModel.getResponseLatency();
  latencyMin.value = minMs;
  latencyMax.value = maxMs;
  latencyPreset.value = '';
}
function applyLatency(minMs, maxMs) {
  patientModel.setResponseLatency(minMs, maxMs);
  renderLatency();
}
latencyMin.addEventListener('change', () => applyLatency(latencyMin.value, Math.max(latencyMin.value, latencyMax.value)));
latencyMax.addEventListener('change', () => applyLatency(Math.min(latencyMin.value, latencyMax.value), latencyMax.value));
latencyPreset.addEventListener('change', () => {
  if (!latencyPreset.value) return;
  const [minMs, maxMs] = latencyPreset.value.split(',').map(Number);
  applyLatency(minMs, maxMs);
});
document.getElementById('close-dialog-btn').addEventListener('click', () => patientDialog.close());
document.getElementById('occlusion-preset-btn').addEventListener('click', () => {
  const value = document.getElementById('occlusion-preset').value;
  patientModel.applyOcclusionPreset(/^\d+$/.test(value) ? Number(value) : value);
  editor.render();
});

const shareDialog = document.getElementById('share-dialog');
document.getElementById('share-btn').addEventListener('click', () => shareDialog.showModal());
document.getElementById('close-share-dialog-btn').addEventListener('click', () => shareDialog.close());

const logDialog = document.getElementById('log-dialog');
const logTableBody = document.querySelector('#log-table tbody');
const logTableHead = document.getElementById('log-table-head');
const logSummary = document.getElementById('log-summary');

function renderPresentationLog() {
  if (!logDialog.open) return;
  logTableHead.innerHTML = '';
  presentationLog.columns.forEach(([name]) => {
    const th = document.createElement('th');
    th.textContent = name;
    logTableHead.appendChild(th);
  });
  const entries = presentationLog.getEntries();
  logTableBody.innerHTML = '';
  entries.forEach((entry) => {
    const tr = document.createElement('tr');
    presentationLog.columns.forEach(([, get]) => {
      const td = document.createElement('td');
      td.textContent = get(entry);
      tr.appendChild(td);
    });
    logTableBody.appendChild(tr);
  });
  const responses = entries.filter((e) => e.response !== 'None').length;
  logSummary.textContent = entries.length
    ? `${entries.length} presentation${entries.length === 1 ? '' : 's'}, ${responses} with a response.`
    : 'No tones presented yet.';
}

presentationLog.onChange(renderPresentationLog);
document.getElementById('log-btn').addEventListener('click', () => {
  logDialog.showModal();
  renderPresentationLog();
});
document.getElementById('close-log-dialog-btn').addEventListener('click', () => logDialog.close());
document.getElementById('log-reset-btn').addEventListener('click', () => {
  if (presentationLog.getEntries().length && !window.confirm('Clear the presentation log? Download the CSV first if you need it.')) return;
  presentationLog.reset();
});
document.getElementById('log-download-btn').addEventListener('click', () => {
  const blob = new Blob([presentationLog.toCsv()], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = patientInfo.name.value.trim() || 'pta';
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}-presentation-log.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

const methodDialog = document.getElementById('method-dialog');
const methodCheckBtn = document.getElementById('method-check-btn');
methodCheckBtn.addEventListener('click', () => {
  const findings = reviewMethod(presentationLog.getEntries(), engine.getStoredPoints());
  const tbody = document.querySelector('#method-table tbody');
  tbody.innerHTML = '';
  findings.forEach((f) => {
    const tr = document.createElement('tr');
    [f.area, f.status, f.message].forEach((value, i) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (i === 1) td.className = `status-${f.status.toLowerCase()}`;
      if (i === 2) td.className = 'check-note';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  const count = (s) => findings.filter((f) => f.status === s).length;
  document.getElementById('method-summary').textContent =
    `${count('Pass')} pass, ${count('Review')} to review, ${count('Incomplete')} incomplete.`;
  methodDialog.showModal();
});
document.getElementById('close-method-dialog-btn').addEventListener('click', () => methodDialog.close());

const checkDialog = document.getElementById('check-dialog');
const checkBtn = document.getElementById('check-btn');
checkBtn.addEventListener('click', () => {
  const { rows, counts } = checkAudiogram({
    patientModel,
    points: engine.getStoredPoints(),
    transducer: engine.getState().transducer,
  });
  const tbody = document.querySelector('#check-table tbody');
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    [r.ear === 'either' ? 'Either' : r.ear[0].toUpperCase() + r.ear.slice(1), r.series, r.freq, r.yours, r.expected, r.status, r.note]
      .forEach((value, i) => {
        const td = document.createElement('td');
        td.textContent = value;
        if (i === 5) td.className = `status-${r.status.toLowerCase()}`;
        if (i === 6) td.className = 'check-note';
        tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });
  document.getElementById('check-summary').textContent =
    `${counts.Correct} correct, ${counts.Incorrect} incorrect, ${counts.Missing} missing` + (counts.Info ? `, ${counts.Info} for information.` : '.');
  checkDialog.showModal();
});
document.getElementById('close-check-dialog-btn').addEventListener('click', () => checkDialog.close());

const optionsDialog = document.getElementById('options-dialog');
document.getElementById('options-btn').addEventListener('click', () => optionsDialog.showModal());
document.getElementById('close-options-dialog-btn').addEventListener('click', () => optionsDialog.close());

const infoDialog = document.getElementById('info-dialog');
document.getElementById('info-btn').addEventListener('click', () => infoDialog.showModal());
document.getElementById('close-info-dialog-btn').addEventListener('click', () => infoDialog.close());

const patientInfo = {
  name: document.getElementById('patient-name'),
  id: document.getElementById('patient-id'),
  dob: document.getElementById('patient-dob'),
};

window.addEventListener('resize', () => ui.refreshChart());
window.addEventListener('orientationchange', () => ui.refreshChart());

const timerDisplayEl = document.getElementById('timer-display');
initGutterDrawer({
  timerDisplay: timerDisplayEl,
  soundSwitch: dom.soundSwitch,
  directionSwitch: dom.directionSwitch,
  hintsStatusFlag: dom.hintsStatusFlag,
});

const timer = createTimer(timerDisplayEl);
let timerStarted = false;
function startTimerOnce() {
  if (!timerStarted) {
    timerStarted = true;
    timer.start();
  }
}
['level-up', 'level-down', 'freq-prev', 'freq-next', 'mask-up', 'mask-down', 'present-btn'].forEach((id) => {
  document.getElementById(id).addEventListener('click', startTimerOnce);
});

function getPatientInfoValues() {
  return {
    name: patientInfo.name.value,
    id: patientInfo.id.value,
    dob: patientInfo.dob.value,
  };
}

const examModeToggle = document.getElementById('exam-mode-toggle');
const editThresholdsBtn = document.getElementById('edit-thresholds-btn');

function buildSessionCtx() {
  return {
    patientModel,
    engine,
    patientInfo: getPatientInfoValues(),
    timerSeconds: timer.getElapsedSeconds(),
    locked: examModeToggle.checked,
  };
}

// Mirrors the source simulator's "hidey" URL flag: a session loaded with
// locked:true can't open Edit Thresholds, so a shared exam case doesn't
// expose the answer key to the student opening it.
function applyLockState(locked) {
  if (!locked) return;
  thresholdsLocked = true;
  editThresholdsBtn.setAttribute('aria-disabled', 'true');
  editThresholdsBtn.title = 'Thresholds are locked for this exam case';
  examModeToggle.checked = true;
  examModeToggle.disabled = true;
  checkBtn.hidden = true; // the check reveals the answer key
  methodCheckBtn.hidden = true; // teaching feedback is off in exam mode, as in the source simulator
  ui.setExamMode(true);
}

function unlockThresholds() {
  thresholdsLocked = false;
  lockClickCount = 0;
  clearTimeout(lockClickResetTimer);
  editThresholdsBtn.removeAttribute('aria-disabled');
  editThresholdsBtn.removeAttribute('title');
  examModeToggle.checked = false;
  examModeToggle.disabled = false;
  checkBtn.hidden = false;
  methodCheckBtn.hidden = false;
  ui.setExamMode(false);
}

document.getElementById('export-pdf-btn').addEventListener('click', () => {
  exportPdf({
    canvasEl: dom.canvasCombinedHidden,
    patientInfo: getPatientInfoValues(),
    sessionState: engine.getState(),
    timerSeconds: timer.getElapsedSeconds(),
  });
});

document.getElementById('export-json-btn').addEventListener('click', () => {
  exportJson(buildSessionCtx());
});

document.getElementById('import-json-btn').addEventListener('click', () => {
  document.getElementById('import-json-input').click();
});
document.getElementById('import-json-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const data = await importJson(file, { patientModel, engine });
  const importedName = data.patientInfo?.name?.trim();
  patientInfo.name.value = importedName ?? '';
  patientInfo.id.value = data.patientInfo?.id ?? '';
  patientInfo.dob.value = data.patientInfo?.dob ?? '';
  setActiveLoadedCase(importedName || 'Imported case');
  editor.render();
  ui.refreshChart();
  applyLockState(data.locked);
  e.target.value = '';
});

document.getElementById('share-link-btn').addEventListener('click', async () => {
  const url = buildShareUrl(buildSessionCtx());
  await navigator.clipboard.writeText(url);
});

const wildingImportStatus = document.getElementById('wilding-import-status');

document.getElementById('wilding-import-btn').addEventListener('click', () => {
  const input = document.getElementById('wilding-import-input');
  wildingImportStatus.textContent = '';
  wildingImportStatus.classList.remove('error');
  let result;
  try {
    result = parseWildingLink(input.value);
  } catch (err) {
    wildingImportStatus.textContent = err.message;
    wildingImportStatus.classList.add('error');
    return;
  }

  // The source simulator's "hidey" flag hides its answer key from whoever
  // opens the link — mirrored here as our own exam-mode lock. Since the
  // person pasting the link in is presumably the instructor who made it,
  // a password unlocks editing instead of locking them out of their own case.
  let locked = result.locked;
  if (result.locked) {
    const entered = window.prompt('This is an exam-locked case. Enter the password to unlock editing (or Cancel to import it locked):');
    if (entered === WILDING_UNLOCK_PASSWORD) locked = false;
  }

  patientModel.loadPatient(result.patient);
  engine.clearStoredPoints();
  // The Wilding link format doesn't carry a patient name, unlike our own
  // JSON schema, so there's nothing more specific to show here.
  setActiveLoadedCase('Imported (Wilding)');
  ui.refreshChart();
  editor.render();
  applyLockState(locked);

  wildingImportStatus.textContent = locked
    ? 'Imported (locked — thresholds hidden, matching the source link\'s exam mode).'
    : 'Imported.';
  input.value = '';
});

const caseLibraryStatus = document.getElementById('case-library-status');
const caseLibraryInput = document.getElementById('case-library-input');

async function loadCaseLibrary(url, { silent } = {}) {
  if (!silent) {
    caseLibraryStatus.textContent = 'Loading library…';
    caseLibraryStatus.classList.remove('error');
  }
  try {
    const library = await resolveLibraryUrl(url);
    rebuildLibraryOptgroup(library);
    saveLibraryConfig(url, library);
    if (!silent) caseLibraryStatus.textContent = `Loaded ${library.cases.length} case(s) from "${library.label}".`;
  } catch (err) {
    // A silent background refresh failing just means the cached copy from
    // a previous visit (already shown) stays as-is — not worth alarming a
    // student over a transient network hiccup.
    if (!silent) {
      caseLibraryStatus.textContent = err.message;
      caseLibraryStatus.classList.add('error');
    }
  }
}

document.getElementById('case-library-load-btn').addEventListener('click', () => {
  const url = caseLibraryInput.value;
  loadCaseLibrary(url);
});

// Restore a previously-configured library immediately from localStorage
// (works offline / before the network round-trip completes), then quietly
// refresh in the background in case the supervisor has added cases since.
const cachedLibraryConfig = loadLibraryConfig();
if (cachedLibraryConfig && cachedLibraryConfig.sourceUrl) {
  caseLibraryInput.value = cachedLibraryConfig.sourceUrl;
  rebuildLibraryOptgroup(cachedLibraryConfig.library);
  loadCaseLibrary(cachedLibraryConfig.sourceUrl, { silent: true });
}

const sharedData = readShareUrl();
if (sharedData) {
  applyShareData(sharedData, { patientModel, engine });
  const sharedName = sharedData.patientInfo?.name?.trim();
  if (sharedData.patientInfo) {
    patientInfo.name.value = sharedName ?? '';
    patientInfo.id.value = sharedData.patientInfo.id ?? '';
    patientInfo.dob.value = sharedData.patientInfo.dob ?? '';
  }
  setActiveLoadedCase(sharedName || 'Shared case');
  ui.refreshChart();
  applyLockState(sharedData.locked);
}

wireKeyboardShortcuts({
  engine,
  onStore: () => {
    startTimerOnce();
    engine.storeThreshold();
    ui.refreshChart();
  },
  onDelete: () => {
    engine.deleteStoredPoint();
    ui.refreshChart();
  },
  onLevelChange: startTimerOnce,
  onPresentStart: () => {
    startTimerOnce();
    ui.startPresenting('Keyboard');
  },
  onPresentEnd: () => ui.stopPresenting(),
});

window.pta = { patientModel, engine, ui, editor, patientInfo, timer };
