import { FREQUENCIES, clampLevel } from './utils.js';

/**
 * Rows mirror the source simulator's underlying patient parameter table
 * (see patient-model.js) so a supervisor builds a patient the same way
 * Wilding's tool does, plus the extra Insertphone cross row required by
 * Claude.MD (the flat 40dB headphone IAA and the frequency-dependent
 * insertphone IAA are genuinely different cross-hearing paths and must be
 * editable independently).
 */
const ROWS = [
  { label: 'Right Cochlear Thresholds', get: (pm, f) => pm.getParam('right', 'cochlear', f), set: (pm, f, v) => pm.setParam('right', 'cochlear', f, v) },
  { label: 'Left Cochlear Thresholds', get: (pm, f) => pm.getParam('left', 'cochlear', f), set: (pm, f, v) => pm.setParam('left', 'cochlear', f, v) },
  { label: 'Right Headphone to cochlea Ipsi (conductive)', get: (pm, f) => pm.getParam('right', 'ipsiConductive', f), set: (pm, f, v) => pm.setParam('right', 'ipsiConductive', f, v) },
  { label: 'Left Headphone to Cochlea Ipsi (conductive)', get: (pm, f) => pm.getParam('left', 'ipsiConductive', f), set: (pm, f, v) => pm.setParam('left', 'ipsiConductive', f, v) },
  { label: 'Right BC transmission loss (dB, e.g. Carhart notch)', title: 'BC transmission loss: dB taken off a bone-conducted tone before it reaches this cochlea. It makes BC thresholds worse without changing the cochlear threshold or AC (AC = cochlear + conductive). Ideal ear-specific BC = cochlear threshold + this value. Use it for a Carhart notch (e.g. 15 dB at 2 kHz with a conductive loss). Leave at 0 for most patients.', get: (pm, f) => pm.getParam('right', 'bcAttenuation', f), set: (pm, f, v) => pm.setParam('right', 'bcAttenuation', f, v) },
  { label: 'Left BC transmission loss (dB, e.g. Carhart notch)', title: 'BC transmission loss: dB taken off a bone-conducted tone before it reaches this cochlea. It makes BC thresholds worse without changing the cochlear threshold or AC (AC = cochlear + conductive). Ideal ear-specific BC = cochlear threshold + this value. Use it for a Carhart notch (e.g. 15 dB at 2 kHz with a conductive loss). Leave at 0 for most patients.', get: (pm, f) => pm.getParam('left', 'bcAttenuation', f), set: (pm, f, v) => pm.setParam('left', 'bcAttenuation', f, v) },
  { label: 'Headphone to cochlea Contra (cross)', get: (pm, f) => pm.getCrossIAA('headphone', f), set: (pm, f, v) => pm.setCrossIAA('headphone', f, v) },
  { label: 'Insertphone to cochlea Contra (cross)', get: (pm, f) => pm.getCrossIAA('insertphone', f), set: (pm, f, v) => pm.setCrossIAA('insertphone', f, v) },
  { label: 'BC occlusion effect, Headphone (dB)', title: 'dB added to a bone-conducted tone at the cochlea of the ear covered by the masking earphone (headphones) while masking is on. Not-masked BC is tested with ears uncovered, so it has no occlusion.', get: (pm, f) => pm.getOcclusion('headphone', f), set: (pm, f, v) => pm.setOcclusion('headphone', f, v) },
  { label: 'BC occlusion effect, Insertphone (dB)', title: 'As above, when the masking earphone is an insert.', get: (pm, f) => pm.getOcclusion('insertphone', f), set: (pm, f, v) => pm.setOcclusion('insertphone', f, v) },
  { label: 'Right Ascending/descending diff (dB)', get: (pm, f) => pm.getParam('right', 'ascDescDiff', f), set: (pm, f, v) => pm.setParam('right', 'ascDescDiff', f, v) },
  { label: 'Left Ascending/descending diff (dB)', get: (pm, f) => pm.getParam('left', 'ascDescDiff', f), set: (pm, f, v) => pm.setParam('left', 'ascDescDiff', f, v) },
  { label: 'Right Psychometric Function width (dB)', get: (pm, f) => pm.getParam('right', 'psychWidth', f), set: (pm, f, v) => pm.setParam('right', 'psychWidth', f, v) },
  { label: 'Left Psychometric Function width (dB)', get: (pm, f) => pm.getParam('left', 'psychWidth', f), set: (pm, f, v) => pm.setParam('left', 'psychWidth', f, v) },
];

export function buildThresholdEditor({ patientModel, tbody, thead, onChange }) {
  function renderHead() {
    if (!thead) return;
    thead.innerHTML = '';
    const labelTh = document.createElement('th');
    labelTh.textContent = 'Parameter';
    thead.appendChild(labelTh);
    FREQUENCIES.forEach((freq) => {
      const th = document.createElement('th');
      th.textContent = freq;
      thead.appendChild(th);
    });
  }

  function render() {
    renderHead();
    tbody.innerHTML = '';
    ROWS.forEach((row) => {
      const tr = document.createElement('tr');
      const labelCell = document.createElement('td');
      labelCell.textContent = row.label;
      labelCell.className = 'row-label';
      if (row.title) labelCell.title = row.title;
      tr.appendChild(labelCell);

      FREQUENCIES.forEach((freq) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 1;
        input.min = -10;
        input.max = 120;
        input.value = row.get(patientModel, freq);
        input.addEventListener('change', () => {
          row.set(patientModel, freq, clampLevel(Number(input.value)));
          input.value = row.get(patientModel, freq);
          onChange?.();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  return { render };
}
