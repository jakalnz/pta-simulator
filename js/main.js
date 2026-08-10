import { createPatientModel, PRESETS } from './patient-model.js';
import { createAudiometerEngine } from './audiometer-engine.js';
import { wireUi } from './ui-controls.js';
import { buildThresholdEditor } from './threshold-editor.js';
import { exportJson, importJson } from './json-io.js';
import { buildShareUrl, readShareUrl, applyShareData } from './share-link.js';
import { exportPdf } from './pdf-export.js';
import { createTimer } from './timer.js';
import { wireKeyboardShortcuts } from './keyboard-shortcuts.js';

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
  maskOnBtn: document.getElementById('mask-on-btn'),
  maskOffBtn: document.getElementById('mask-off-btn'),
  maskingRequiredFlag: document.getElementById('masking-required-flag'),
  levelUpBtn: document.getElementById('level-up'),
  levelDownBtn: document.getElementById('level-down'),
  freqPrevBtn: document.getElementById('freq-prev'),
  freqNextBtn: document.getElementById('freq-next'),
  maskUpBtn: document.getElementById('mask-up'),
  maskDownBtn: document.getElementById('mask-down'),
  noResponseBtn: document.getElementById('no-response-btn'),
  storeBtn: document.getElementById('store-btn'),
  presentBtn: document.getElementById('present-btn'),
  responseIndicator: document.getElementById('response-indicator'),
  canvasRight: document.getElementById('audiogram-canvas-right'),
  canvasLeft: document.getElementById('audiogram-canvas-left'),
  wrapLeft: document.getElementById('wrap-left'),
  canvasCombinedHidden: document.getElementById('audiogram-canvas-combined'),
  chartViewEl: document.getElementById('chart-view'),
  chartViewButtons: Array.from(document.querySelectorAll('[data-chartview]')),
  presetSelect: document.getElementById('preset-select'),
  soundSwitch: document.getElementById('sound-switch'),
  directionSwitch: document.getElementById('direction-switch'),
};

Object.entries(PRESETS).forEach(([key, preset]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = preset.label;
  dom.presetSelect.appendChild(opt);
});
dom.presetSelect.addEventListener('change', () => {
  patientModel.loadPreset(dom.presetSelect.value);
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

const timer = createTimer(document.getElementById('timer-display'));
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
  onPresent: () => {
    startTimerOnce();
    ui.presentTone();
  },
});

window.pta = { patientModel, engine, ui, editor, patientInfo, timer };
