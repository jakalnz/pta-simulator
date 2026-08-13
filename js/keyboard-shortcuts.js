export function wireKeyboardShortcuts({ engine, onStore, onDelete, onLevelChange, onPresentStart, onPresentEnd }) {
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
