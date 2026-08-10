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
