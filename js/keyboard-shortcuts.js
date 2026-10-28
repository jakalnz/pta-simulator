export function wireKeyboardShortcuts({ engine, onStore, onDelete, onLevelChange, onPresentStart, onPresentEnd, onPlotMasking, onNoResponse, onUll, onHelp, onPatientView }) {
  function isTextInput(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  document.addEventListener('keyup', (e) => {
    if (isTextInput(document.activeElement)) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onPresentEnd?.();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (isTextInput(document.activeElement)) return;

    switch (e.key) {
      case 'm':
      case 'M':
        engine.toggleMasking();
        break;
      case 'ArrowUp':
        if (e.shiftKey) {
          engine.adjustMaskingLevel(5);
        } else {
          engine.adjustPresentedLevel(1);
          onLevelChange?.();
        }
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (e.shiftKey) {
          engine.adjustMaskingLevel(-5);
        } else {
          engine.adjustPresentedLevel(-1);
          onLevelChange?.();
        }
        e.preventDefault();
        break;
      case 'ArrowLeft':
        engine.stepFrequency(-1);
        break;
      case 'ArrowRight':
        engine.stepFrequency(1);
        break;
      case 's':
      case 'S':
        onStore?.();
        break;
      case 'p':
      case 'P':
        onPlotMasking?.();
        break;
      case 'l':
      case 'L':
        engine.setTestEar('left');
        break;
      case 'r':
      case 'R':
        engine.setTestEar('right');
        break;
      case 'b':
      case 'B':
        engine.setTestMode(engine.getState().testMode === 'AC' ? 'BC' : 'AC');
        break;
      case 'i':
      case 'I':
        engine.setTransducer(engine.getState().transducer === 'insertphone' ? 'headphone' : 'insertphone');
        break;
      case 'n':
      case 'N':
        onNoResponse?.();
        break;
      case 'd':
      case 'D':
        onDelete?.();
        break;
      case 'u':
      case 'U':
        onUll?.();
        break;
      case 'v':
      case 'V':
        onPatientView?.();
        break;
      case '?':
        onHelp?.();
        break;
      case 'Delete':
        e.preventDefault();
        onDelete?.();
        break;
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        if (!e.repeat) onPresentStart?.();
        break;
      default:
        break;
    }
  });
}
