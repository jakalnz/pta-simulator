import { formatDb, formatFreq, OTHER_EAR } from './utils.js';
import { renderAudiogram } from './audiogram-chart.js';
import { isMaskingRequired } from './masking-logic.js';
import { createTonePlayer } from './tone-player.js';
import { createNoisePlayer } from './noise-player.js';

const RESPONSE_LIGHT_MS = 900;

export function wireUi({ engine, patientModel, dom }) {
  let chartView = 'combined';
  let soundOn = true;
  let hintsOn = false;
  let examLocked = false;
  let isPresenting = false;
  const tonePlayer = createTonePlayer();
  const noisePlayer = createNoisePlayer();

  // Masking noise is continuous while Masking is on (independent of tone
  // presentation) and follows frequency changes, matching real audiometric
  // practice. Idempotent so it can be called from any state-change handler.
  function syncMaskingNoise(s) {
    if (soundOn && s.maskingOn) {
      if (noisePlayer.isPlaying()) {
        noisePlayer.retune(s.freq);
      } else {
        noisePlayer.start(s.freq);
      }
    } else if (noisePlayer.isPlaying()) {
      noisePlayer.stop();
    }
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function refreshDisplayBar() {
    const s = engine.getState();
    dom.stimulusLevel.textContent = formatDb(s.presentedLevel);
    dom.freqReadout.textContent = formatFreq(s.freq);
    dom.freqHintReadout.textContent = formatFreq(s.freq);
    dom.maskingLevel.textContent = `[ ${formatDb(s.maskingLevel)} ]`;
    const transducerLabel = s.transducer === 'insertphone' ? 'Insert' : 'Headphone';
    const maskingStateLabel = s.maskingOn ? 'Masking On' : 'Masking Off';
    // Channel 1 (stimulus) route label reflects the actual test transducer —
    // "Bone" for BC (there is no headphone/insert path in that mode). Channel 2
    // (masking) noise is always delivered via the AC transducer regardless of
    // test mode, so it always names Headphone/Insert.
    const stimulusRouteLabel = s.testMode === 'BC' ? 'Bone' : transducerLabel;
    dom.stimulusLabel.textContent = `Stimulus Tone - ${stimulusRouteLabel} - ${cap(s.testEar)}`;
    dom.maskingLabel.textContent = `NBN - ${transducerLabel} - ${cap(OTHER_EAR[s.testEar])} Masking - ${maskingStateLabel}`;

    // Channel colour follows the test ear: test ear = red channel, contra ear = blue channel.
    // The masking (contra) channel is dimmed whenever masking is switched off.
    const testIsRight = s.testEar === 'right';
    dom.stimulusPanel.classList.toggle('channel-red', testIsRight);
    dom.stimulusPanel.classList.toggle('channel-blue', !testIsRight);
    dom.maskingPanel.classList.toggle('channel-red', !testIsRight);
    dom.maskingPanel.classList.toggle('channel-blue', testIsRight);
    dom.maskingPanel.classList.toggle('channel-dim', !s.maskingOn);

    dom.earButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.ear === s.testEar)));
    dom.modeButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.mode === s.testMode)));
    dom.transducerButtons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.transducer === s.transducer)));
    dom.maskOnBtn.setAttribute('aria-pressed', String(s.maskingOn));
    dom.maskOffBtn.setAttribute('aria-pressed', String(!s.maskingOn));

    const upIsLouder = s.toggleDirection === 'up-louder';
    dom.directionSwitch.textContent = upIsLouder ? 'Up = Louder' : 'Up = Quieter';
    dom.directionSwitch.setAttribute('aria-pressed', String(upIsLouder));

    const required = isMaskingRequired({
      testEar: s.testEar,
      testMode: s.testMode,
      freq: s.freq,
      presentedLevel: s.presentedLevel,
      transducer: s.transducer,
      patientModel,
    });
    dom.maskingRequiredFlag.classList.toggle('active', hintsOn && required);

    refreshVisualPanel();
    syncMaskingNoise(s);
  }

  function formatVisualLevel(v) {
    return v === null || v === undefined ? '—' : formatDb(v);
  }

  function refreshVisualPanel() {
    if (!hintsOn) {
      ['right', 'left'].forEach((ear) => {
        dom.visual[ear].tone.textContent = '—';
        dom.visual[ear].masker.textContent = '—';
        dom.visual[ear].threshold.textContent = '—';
        dom.visual[ear].response.textContent = '—';
        dom.visual[ear].last.textContent = '—';
      });
      return;
    }
    const v = engine.getVisualState();
    ['right', 'left'].forEach((ear) => {
      dom.visual[ear].tone.textContent = formatVisualLevel(v[ear].toneLevel);
      dom.visual[ear].masker.textContent = formatVisualLevel(v[ear].maskerLevel);
      dom.visual[ear].threshold.textContent = formatVisualLevel(v[ear].threshold);
      dom.visual[ear].response.textContent = v[ear].responded === null || v[ear].responded === undefined
        ? '—'
        : (v[ear].responded ? 'Heard' : 'No response');
      dom.visual[ear].last.textContent = formatVisualLevel(v[ear].lastLevel);
    });
  }

  function refreshChart() {
    const points = engine.getStoredPoints();
    renderAudiogram(dom.canvasCombinedHidden, points);
    if (chartView === 'split') {
      dom.wrapLeft.hidden = false;
      dom.chartViewEl.classList.add('split');
      renderAudiogram(dom.canvasRight, points.filter((p) => p.ear === 'right'));
      renderAudiogram(dom.canvasLeft, points.filter((p) => p.ear === 'left'));
    } else {
      dom.wrapLeft.hidden = true;
      dom.chartViewEl.classList.remove('split');
      renderAudiogram(dom.canvasRight, points);
    }
  }

  let responseLightTimer = null;

  function clearResponseLight() {
    if (responseLightTimer) {
      clearTimeout(responseLightTimer);
      responseLightTimer = null;
    }
    dom.freqPanel.classList.remove('responded');
  }

  function flashResponseLight() {
    clearResponseLight();
    dom.freqPanel.classList.add('responded');
    responseLightTimer = setTimeout(() => {
      dom.freqPanel.classList.remove('responded');
      responseLightTimer = null;
    }, RESPONSE_LIGHT_MS);
  }

  // Press-and-hold, mirroring the source simulator's Present Tone button
  // (update(1) on mousedown starts the oscillator and evaluates the
  // response immediately; update(0) on mouseup just ramps the tone back
  // down) — the tone plays for exactly as long as the button/spacebar is
  // held, rather than a fixed pulse duration.
  function startPresenting() {
    if (isPresenting) return null;
    isPresenting = true;
    const s = engine.getState();
    dom.presentBtn.classList.add('presenting');
    if (soundOn) {
      tonePlayer.start(s.freq);
    }

    const result = engine.presentTone();
    dom.responseIndicator.textContent = hintsOn
      ? (result.heard ? 'Response: HEARD' : 'Response: no response')
      : '';
    if (result.heard) {
      flashResponseLight();
    } else {
      clearResponseLight();
    }
    return result;
  }

  function stopPresenting() {
    if (!isPresenting) return;
    isPresenting = false;
    dom.presentBtn.classList.remove('presenting');
    tonePlayer.stop();
  }

  dom.earButtons.forEach((btn) => btn.addEventListener('click', () => { clearResponseLight(); engine.setTestEar(btn.dataset.ear); }));
  dom.modeButtons.forEach((btn) => btn.addEventListener('click', () => { clearResponseLight(); engine.setTestMode(btn.dataset.mode); }));
  dom.transducerButtons.forEach((btn) => btn.addEventListener('click', () => { clearResponseLight(); engine.setTransducer(btn.dataset.transducer); }));
  dom.directionSwitch.addEventListener('click', () => {
    const next = engine.getState().toggleDirection === 'up-louder' ? 'up-quieter' : 'up-louder';
    engine.setToggleDirection(next);
  });
  dom.maskOnBtn.addEventListener('click', () => {
    clearResponseLight();
    if (!engine.getState().maskingOn) engine.toggleMasking();
  });
  dom.maskOffBtn.addEventListener('click', () => {
    clearResponseLight();
    if (engine.getState().maskingOn) engine.toggleMasking();
  });
  dom.chartViewButtons.forEach((btn) => btn.addEventListener('click', () => {
    chartView = btn.dataset.chartview;
    btn.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    refreshChart();
  }));
  dom.levelUpBtn.addEventListener('click', () => { clearResponseLight(); engine.adjustPresentedLevel(1); });
  dom.levelDownBtn.addEventListener('click', () => { clearResponseLight(); engine.adjustPresentedLevel(-1); });
  dom.freqPrevBtn.addEventListener('click', () => { clearResponseLight(); engine.stepFrequency(-1); });
  dom.freqNextBtn.addEventListener('click', () => { clearResponseLight(); engine.stepFrequency(1); });
  dom.maskUpBtn.addEventListener('click', () => { clearResponseLight(); engine.adjustMaskingLevel(5); });
  dom.maskDownBtn.addEventListener('click', () => { clearResponseLight(); engine.adjustMaskingLevel(-5); });
  // No-response and Store are both clinician decisions made after one or more
  // presentations, not automatic consequences of the simulated patient's last
  // response — the clinician judges, then records, at the current dial settings.
  dom.noResponseBtn.addEventListener('click', () => {
    engine.storeThreshold(true);
    clearResponseLight();
    refreshChart();
  });
  dom.storeBtn.addEventListener('click', () => {
    engine.storeThreshold(false);
    refreshChart();
  });
  dom.presentBtn.addEventListener('pointerdown', startPresenting);
  dom.presentBtn.addEventListener('pointerup', stopPresenting);
  dom.presentBtn.addEventListener('pointerleave', stopPresenting);
  dom.presentBtn.addEventListener('pointercancel', stopPresenting);
  dom.soundSwitch.addEventListener('click', () => {
    soundOn = !soundOn;
    dom.soundSwitch.textContent = soundOn ? 'Tone: On' : 'Tone: Off';
    dom.soundSwitch.setAttribute('aria-pressed', String(soundOn));
    syncMaskingNoise(engine.getState());
  });
  function setHints(on) {
    hintsOn = on;
    dom.hintsSwitch.textContent = hintsOn ? 'Hints: On' : 'Hints: Off';
    dom.hintsSwitch.setAttribute('aria-pressed', String(hintsOn));
    refreshDisplayBar();
  }

  dom.hintsSwitch.addEventListener('click', () => {
    if (examLocked) return;
    setHints(!hintsOn);
  });

  // Hints (masking-required flag, heard/no-response readout) are answer-key
  // information a supervisor shouldn't hand to a student in an exam case, so
  // exam mode forces them off and disables the toggle for whoever opens it.
  function setExamMode(locked) {
    examLocked = locked;
    dom.hintsSwitch.disabled = locked;
    dom.visualDetails.hidden = locked;
    if (locked) setHints(false);
  }

  engine.onChange(refreshDisplayBar);
  refreshDisplayBar();
  refreshChart();

  return { refreshChart, refreshDisplayBar, startPresenting, stopPresenting, setExamMode };
}
