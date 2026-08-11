// Bottom-anchored drawer for mobile landscape: relocates secondary controls
// (footer, chart view toggle) out of the always-visible HUD when the
// game-like landscape layout is active (see the matching media query in
// css/layout.css), and restores them to their original position when it
// isn't. The Symbol Key / Visual Cochlea Levels details stay put in the
// chart panel (below Store/No Response) — that panel scrolls independently
// of the drawer, so they don't need to be tucked away.
const LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 500px)';

export function initGutterDrawer({ timerDisplay }) {
  const drawer = document.getElementById('gutter-drawer');
  const tab = document.getElementById('gutter-drawer-tab');
  const panel = document.getElementById('gutter-drawer-panel');
  const tabTimer = document.getElementById('gutter-drawer-tab-timer');
  if (!drawer || !tab || !panel) return { close() {} };

  const relocated = [
    { el: document.querySelector('.app-footer'), parent: null, next: null },
    { el: document.querySelector('.chart-panel > .row:first-child'), parent: null, next: null },
  ].filter((item) => item.el);

  relocated.forEach((item) => {
    item.parent = item.el.parentNode;
    item.next = item.el.nextSibling;
  });

  function open() {
    drawer.classList.add('is-open');
    tab.setAttribute('aria-expanded', 'true');
  }

  function close() {
    drawer.classList.remove('is-open');
    tab.setAttribute('aria-expanded', 'false');
  }

  tab.addEventListener('click', () => {
    if (drawer.classList.contains('is-open')) close();
    else open();
  });

  document.addEventListener('pointerdown', (e) => {
    if (!drawer.classList.contains('is-open')) return;
    if (drawer.contains(e.target)) return;
    close();
  });

  function moveIn() {
    relocated.forEach((item) => panel.appendChild(item.el));
  }

  function moveOut() {
    close();
    relocated.forEach((item) => {
      if (item.next && item.next.parentNode === item.parent) {
        item.parent.insertBefore(item.el, item.next);
      } else {
        item.parent.appendChild(item.el);
      }
    });
  }

  const mql = window.matchMedia(LANDSCAPE_QUERY);
  function syncToBreakpoint(matches) {
    if (matches) moveIn();
    else moveOut();
  }
  syncToBreakpoint(mql.matches);
  mql.addEventListener('change', (e) => syncToBreakpoint(e.matches));

  if (timerDisplay && tabTimer) {
    const observer = new MutationObserver(() => {
      tabTimer.textContent = timerDisplay.textContent;
    });
    observer.observe(timerDisplay, { childList: true, characterData: true, subtree: true });
  }

  window.addEventListener('orientationchange', () => {
    if (!window.matchMedia(LANDSCAPE_QUERY).matches) close();
  });

  return { close };
}
