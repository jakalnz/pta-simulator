// Patient view: a slide-out picture of what is on the patient's head and
// where — headset (or inserts), each earphone over / above its ear, the bone
// conductor — and which transducer carries the tone and which the masker.
// Drawn from the engine's own placement (effectivePlacement / idealPlacement)
// so the picture always matches what the simulator is doing.

const SVG_NS = 'http://www.w3.org/2000/svg';
const RED = '#d21f1f';
const BLUE = '#1f5fd2';
const OTHER = { right: 'left', left: 'right' };
const EAR_NAME = { right: 'right', left: 'left' };
const SHORT = { right: 'R', left: 'L' };

// Front view, patient facing you: their right ear is on your left.
const EAR = {
  right: { x: 86, y: 150, side: -1 },
  left: { x: 214, y: 150, side: 1 },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function headSvg() {
  return `
    <path d="M96 238 Q150 262 204 238 L230 260 L70 260 Z" fill="#e9d6c4" stroke="#b89a80" />
    <rect x="128" y="205" width="44" height="40" fill="#efdccb" stroke="none" />
    <ellipse cx="150" cy="140" rx="62" ry="80" fill="#f3e2d2" stroke="#b89a80" stroke-width="1.5" />
    ${['right', 'left'].map((e) => {
      const { x, y, side } = EAR[e];
      return `<path d="M${x + side * -2} ${y - 20} q${side * 14} 2 ${side * 12} 20 q${side * -2} 18 ${side * -12} 20"
        fill="#efd6c0" stroke="#b89a80" stroke-width="1.5" />
        <circle cx="${x + side * 2}" cy="${y}" r="2.5" fill="#8a6a50" />`;
    }).join('')}
    <path d="M90 108 Q100 52 150 56 Q200 52 210 108 Q196 72 150 74 Q104 72 90 108 Z" fill="#7a5a43" opacity="0.85" />
    <circle cx="128" cy="138" r="3" fill="#4a3a30" />
    <circle cx="172" cy="138" r="3" fill="#4a3a30" />
    <path d="M150 145 l-6 22 h10" fill="none" stroke="#b89a80" stroke-width="1.5" />
    <path d="M136 188 Q150 196 164 188" fill="none" stroke="#b07060" stroke-width="2" />`;
}

// Supra-aural headphone cup for one ear. `over` false = resting above the ear.
function cupPos(ear, over) {
  const { x, y, side } = EAR[ear];
  return over ? { x: x + side * 10, y } : { x: x + side * 4, y: y - 54 };
}

function headphonesSvg(p, earColor) {
  const l = cupPos('right', p.cover.right === 'over');
  const r = cupPos('left', p.cover.left === 'over');
  const band = `<path d="M${l.x} ${l.y - 22} C${l.x - 6} ${20} ${r.x + 6} ${20} ${r.x} ${r.y - 22}"
    fill="none" stroke="#555" stroke-width="6" stroke-linecap="round" />`;
  const cup = (ear, pos) => `
    <rect x="${pos.x - 11}" y="${pos.y - 24}" width="22" height="48" rx="10"
      fill="${earColor[ear]}" stroke="#222" stroke-width="1.5" />`;
  return band + cup('right', l) + cup('left', r);
}

function insertsSvg(p, earColor) {
  return ['right', 'left'].map((ear) => {
    const { x, y, side } = EAR[ear];
    const inEar = p.cover[ear] === 'over';
    const tip = inEar ? { x: x + side * 2, y } : { x: x + side * 22, y: y + 40 };
    const box = { x: x + side * 30, y: 236 };
    return `
      <path d="M${tip.x} ${tip.y + 4} Q${tip.x + side * 18} ${tip.y + 40} ${box.x} ${box.y - 8}"
        fill="none" stroke="#666" stroke-width="2.5" />
      <rect x="${box.x - 9}" y="${box.y - 8}" width="18" height="16" rx="3" fill="${earColor[ear]}" stroke="#222" />
      <ellipse cx="${tip.x}" cy="${tip.y}" rx="6" ry="5" fill="#f2c94c" stroke="${earColor[ear]}" stroke-width="2.5" />`;
  }).join('');
}

// Headset off: drawn on the bench beside the patient.
function headsetOffSvg(transducer) {
  const x = 262;
  const y = 236;
  if (transducer === 'insertphone') {
    return `<g opacity="0.75">
      <rect x="${x - 22}" y="${y - 6}" width="14" height="12" rx="3" fill="${RED}" stroke="#222" />
      <rect x="${x + 4}" y="${y - 6}" width="14" height="12" rx="3" fill="${BLUE}" stroke="#222" />
    </g>`;
  }
  return `<g opacity="0.75">
    <path d="M${x - 16} ${y - 6} Q${x} ${y - 34} ${x + 16} ${y - 6}" fill="none" stroke="#555" stroke-width="4" />
    <rect x="${x - 24}" y="${y - 10}" width="14" height="22" rx="6" fill="${RED}" stroke="#222" />
    <rect x="${x + 10}" y="${y - 10}" width="14" height="22" rx="6" fill="${BLUE}" stroke="#222" />
  </g>`;
}

function bcPos(ear) {
  const { x, y, side } = EAR[ear];
  return { x: x + side * 6, y: y + 34 };
}

function boneConductorSvg(p) {
  if (p.bc === 'off') {
    return `<g opacity="0.75"><rect x="20" y="228" width="22" height="14" rx="4" fill="#888" stroke="#222" /></g>`;
  }
  const at = bcPos(p.bc);
  const far = bcPos(OTHER[p.bc]);
  // Spring band runs over the head to the opposite side.
  return `
    <path d="M${at.x} ${at.y - 6} C${at.x - 20 * EAR[p.bc].side} ${-6} ${far.x + 20 * EAR[p.bc].side} ${-6} ${far.x - 4 * EAR[p.bc].side} ${far.y - 26}"
      fill="none" stroke="#999" stroke-width="3" stroke-dasharray="5 3" />
    <rect x="${at.x - 11}" y="${at.y - 8}" width="22" height="16" rx="4" fill="#888" stroke="#222" stroke-width="1.5" />`;
}

// Pill label centred under a transducer, kept inside the picture.
function badge(x, y, text, color) {
  const w = text.length * 6.2 + 12;
  const bx = Math.min(Math.max(x - w / 2, 2), 298 - w);
  return `<g>
    <rect x="${bx}" y="${y - 10}" width="${w}" height="20" rx="10" fill="#fff" stroke="${color}" stroke-width="2" />
    <text x="${bx + w / 2}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${color}">${esc(text)}</text>
  </g>`;
}

// Where a channel's sound comes from on the picture (null if not on the patient).
function earphoneSpot(ear, p, transducer) {
  if (p.headset === 'off') return { x: 252, y: 214, off: true };
  const over = p.cover[ear] === 'over';
  if (transducer === 'insertphone') {
    const { x, y, side } = EAR[ear];
    return over ? { x: x + side * 2, y } : { x: x + side * 22, y: y + 40 };
  }
  return cupPos(ear, over);
}

function describeIdeal(ideal, s) {
  const t = SHORT[s.testEar];
  const o = SHORT[OTHER[s.testEar]];
  const insert = s.transducer === 'insertphone';
  const phone = insert ? 'insert' : 'earphone';
  if (s.testMode === 'AC') {
    return `AC: ${insert ? 'inserts' : 'headphones'} on both ears, red on the right and blue on the left. `
      + `The tone goes through the ${t} ${phone}${s.maskingOn ? `; the masking noise through the ${o} ${phone}` : ''}.`;
  }
  return `BC: bone conductor on the ${EAR_NAME[ideal.bc]} mastoid. The ${t} ear is left uncovered, so there is no occlusion effect in the test ear. `
    + (s.maskingOn
      ? `The ${o} ${phone} is on the non-test ear to deliver the masking noise (expect the occlusion effect there).`
      : `The ${o} ${phone} stays off the ear too until you mask.`);
}

export function createPatientView({ engine, isExamMode = () => false }) {
  const root = document.getElementById('patient-view');
  const tab = document.getElementById('patient-view-tab');
  const closeBtn = document.getElementById('patient-view-close');
  const figure = document.getElementById('patient-view-figure');
  const caption = document.getElementById('patient-view-caption');
  const footerBtn = document.getElementById('patient-view-btn');
  if (!root) return { toggle() {}, refresh() {} };

  function render() {
    if (!root.classList.contains('is-open')) return;
    const s = engine.getState();
    const p = engine.effectivePlacement();
    const ideal = engine.idealPlacement();
    const swapped = p.headset === 'swapped';
    // Colour of the earphone physically on each ear.
    const earColor = swapped ? { right: BLUE, left: RED } : { right: RED, left: BLUE };
    // Which ear each channel's earphone is physically on.
    const physical = (channelEar) => (swapped ? OTHER[channelEar] : channelEar);
    const testColor = s.testEar === 'right' ? RED : BLUE;
    const maskColor = s.testEar === 'right' ? BLUE : RED;

    let transducers = '';
    if (s.testMode === 'BC' || p.bc !== 'off' || s.placementMode === 'manual') transducers += boneConductorSvg(p);
    if (p.headset === 'off') transducers += headsetOffSvg(s.transducer);
    else transducers += s.transducer === 'insertphone' ? insertsSvg(p, earColor) : headphonesSvg(p, earColor);

    let badges = '';
    const toneSpot = s.testMode === 'BC'
      ? (p.bc === 'off' ? { x: 31, y: 228 } : bcPos(p.bc))
      : earphoneSpot(physical(s.testEar), p, s.transducer);
    badges += badge(toneSpot.x, toneSpot.y + (s.testMode === 'BC' ? 22 : -38), `Tone ${s.presentedLevel} dB`, testColor);
    if (s.maskingOn) {
      const m = earphoneSpot(physical(OTHER[s.testEar]), p, s.transducer);
      badges += badge(m.x, m.y - (m.off ? 34 : 38), `Masker ${s.maskingLevel} dB`, maskColor);
    }

    figure.innerHTML = `<svg xmlns="${SVG_NS}" viewBox="0 0 300 268" role="img"
        aria-label="Patient's head showing where the transducers are">
      <text x="150" y="14" text-anchor="middle" font-size="10" fill="#666">Patient facing you</text>
      ${headSvg()}
      ${transducers}
      <text x="${EAR.right.x - 34}" y="${EAR.right.y + 4}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">R</text>
      <text x="${EAR.left.x + 34}" y="${EAR.left.y + 4}" text-anchor="middle" font-size="15" font-weight="700" fill="${BLUE}">L</text>
      ${badges}
    </svg>`;

    const lines = [];
    const mode = s.placementMode === 'manual' ? 'Manual placement' : 'Automatic (ideal placement)';
    const test = `${s.testMode} ${EAR_NAME[s.testEar]} ear, ${s.transducer === 'insertphone' ? 'inserts' : 'headphones'}, masking ${s.maskingOn ? 'on' : 'off'}`;
    lines.push(`<p class="patient-view__mode"><strong>${mode}</strong> · ${esc(test)}</p>`);
    if (s.placementMode === 'auto') {
      lines.push(`<p>${esc(describeIdeal(ideal, s))}</p>`);
    } else {
      lines.push(`<p>${esc(engine.describePlacement())}.</p>`);
      if (!isExamMode()) {
        const issues = engine.placementIssues();
        lines.push(issues.length
          ? `<ul class="patient-view__issues">${issues.map((i) => `<li>${esc(i[0].toUpperCase() + i.slice(1))}</li>`).join('')}</ul>`
          : '<p class="patient-view__ok">Placement is right for this test.</p>');
        lines.push(`<p class="patient-view__ideal"><strong>Automatic would:</strong> ${esc(describeIdeal(ideal, s))}</p>`);
      }
    }
    caption.innerHTML = lines.join('');
  }

  function setOpen(open) {
    root.classList.toggle('is-open', open);
    tab.setAttribute('aria-expanded', String(open));
    footerBtn?.setAttribute('aria-pressed', String(open));
    try { localStorage.setItem('pta-patient-view-open', open ? '1' : '0'); } catch { /* ignore */ }
    render();
  }

  function toggle() {
    setOpen(!root.classList.contains('is-open'));
  }

  tab.addEventListener('click', toggle);
  closeBtn?.addEventListener('click', () => setOpen(false));
  footerBtn?.addEventListener('click', toggle);
  engine.onChange(render);

  let saved = null;
  try { saved = localStorage.getItem('pta-patient-view-open'); } catch { /* ignore */ }
  setOpen(saved === '1');

  return { toggle, refresh: render };
}
