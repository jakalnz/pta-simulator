import { createPatientModel, PRESETS } from './patient-model.js';
import { createAudiometerEngine } from './audiometer-engine.js';
import { wireUi } from './ui-controls.js';
import { buildThresholdEditor } from './threshold-editor.js';
import { exportJson, importJson } from './json-io.js';
import { buildShareUrl, readShareUrl, applyShareData } from './share-link.js';
import { exportPdf } from './pdf-export.js';
import { createTimer } from './timer.js';
import { wireKeyboardShortcuts } from './keyboard-shortcuts.js';
import { initFullscreenLandscape, initRotateHint, initFullscreenButton } from './fullscreen.js';
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

// Class Case Library: a supervisor-published set of cases (see
// js/case-library.js), listed as a second optgroup and applied via the
// full session schema (patient + storedPoints + locked) rather than
// patientModel.loadPreset(), which only sets physiology.
let libraryOptgroup = null;
let libraryCasesByValue = new Map();

function rebuildLibraryOptgroup(library) {
  if (libraryOptgroup) libraryOptgroup.remove();
  libraryCasesByValue = new Map();
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

dom.presetSelect.addEventListener('change', async () => {
  const value = dom.presetSelect.value;
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

const ui = wireUi({ engine, patientModel, dom });

const patientDialog = document.getElementById('patient-dialog');
const editor = buildThresholdEditor({
  patientModel,
  tbody: document.querySelector('#threshold-table tbody'),
  thead: document.getElementById('threshold-table-head'),
  onChange: () => ui.refreshChart(),
});

document.getElementById('edit-thresholds-btn').addEventListener('click', () => {
  editor.render();
  patientDialog.showModal();
});
document.getElementById('close-dialog-btn').addEventListener('click', () => patientDialog.close());

const shareDialog = document.getElementById('share-dialog');
document.getElementById('share-btn').addEventListener('click', () => shareDialog.showModal());
document.getElementById('close-share-dialog-btn').addEventListener('click', () => shareDialog.close());

const optionsDialog = document.getElementById('options-dialog');
document.getElementById('options-btn').addEventListener('click', () => optionsDialog.showModal());
document.getElementById('close-options-dialog-btn').addEventListener('click', () => optionsDialog.close());

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
  editThresholdsBtn.disabled = true;
  editThresholdsBtn.title = 'Thresholds are locked for this exam case';
  examModeToggle.checked = true;
  examModeToggle.disabled = true;
  ui.setExamMode(true);
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
  editor.render();
  ui.refreshChart();
  applyLockState(data.locked);
  e.target.value = '';
});

document.getElementById('share-link-btn').addEventListener('click', async () => {
  const url = buildShareUrl(buildSessionCtx());
  await navigator.clipboard.writeText(url);
});

const WILDING_UNLOCK_PASSWORD = '1234';
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
  if (sharedData.patientInfo) {
    patientInfo.name.value = sharedData.patientInfo.name ?? '';
    patientInfo.id.value = sharedData.patientInfo.id ?? '';
    patientInfo.dob.value = sharedData.patientInfo.dob ?? '';
  }
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
  onLevelChange: startTimerOnce,
  onPresentStart: () => {
    startTimerOnce();
    ui.startPresenting();
  },
  onPresentEnd: () => ui.stopPresenting(),
});

window.pta = { patientModel, engine, ui, editor, patientInfo, timer };
