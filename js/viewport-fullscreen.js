/**
 * Best-effort landscape+fullscreen for phones. Neither the Fullscreen nor
 * Screen Orientation Lock APIs can run without a user gesture, and iOS
 * Safari supports neither outside an installed PWA — so this is opportunistic
 * (Android Chrome et al. get real fullscreen+landscape on first tap) with a
 * dismissible rotate-hint banner as the fallback everywhere else.
 */
function isPhoneLikeViewport() {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 600;
  return coarsePointer && smallScreen;
}

async function tryFullscreenLandscape() {
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen request denied or unsupported — fall through to orientation lock attempt.
  }
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch {
    // Orientation lock unsupported (e.g. iOS Safari) or requires fullscreen first — ignore.
  }
}

export function initFullscreenLandscape() {
  if (!isPhoneLikeViewport()) return;
  window.addEventListener('pointerdown', function once() {
    window.removeEventListener('pointerdown', once);
    tryFullscreenLandscape();
  }, { once: true });
}

export function initRotateHint() {
  const hint = document.getElementById('rotate-hint');
  const dismissBtn = document.getElementById('rotate-hint-dismiss');
  if (!hint || !dismissBtn) return;
  dismissBtn.addEventListener('click', () => hint.classList.add('dismissed'));
}

async function exitFullscreenLandscape() {
  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch {
    // Ignore — nothing to unlock, or unsupported.
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Ignore — already left fullscreen, or unsupported.
  }
}

/**
 * The automatic first-tap attempt in initFullscreenLandscape is opportunistic
 * and easy to miss (or dismiss without noticing). This gives phone users an
 * explicit, always-available way to enter/exit fullscreen+landscape, and
 * keeps its own label in sync via the fullscreenchange event so it still
 * reads correctly if the user leaves fullscreen some other way (e.g. the
 * system back gesture) rather than by pressing the button again.
 */
export function initFullscreenButton() {
  const btn = document.getElementById('fullscreen-btn');
  if (!btn) return;

  function sync() {
    const isFullscreen = !!document.fullscreenElement;
    btn.textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
    btn.setAttribute('aria-pressed', String(isFullscreen));
  }

  btn.addEventListener('click', async () => {
    if (document.fullscreenElement) {
      await exitFullscreenLandscape();
    } else {
      await tryFullscreenLandscape();
    }
    sync();
  });

  document.addEventListener('fullscreenchange', sync);
  sync();
}
