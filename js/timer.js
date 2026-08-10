import { formatDuration } from './utils.js';

export function createTimer(displayEl) {
  let startTime = null;
  let elapsedBeforePause = 0;
  let intervalId = null;

  function render() {
    if (displayEl) displayEl.textContent = formatDuration(getElapsedSeconds());
  }

  function getElapsedSeconds() {
    const running = startTime !== null ? (performance.now() - startTime) / 1000 : 0;
    return elapsedBeforePause + running;
  }

  function start() {
    if (startTime !== null) return;
    startTime = performance.now();
    intervalId = setInterval(render, 1000);
  }

  function pause() {
    if (startTime === null) return;
    elapsedBeforePause += (performance.now() - startTime) / 1000;
    startTime = null;
    clearInterval(intervalId);
    intervalId = null;
    render();
  }

  function reset() {
    pause();
    elapsedBeforePause = 0;
    render();
  }

  render();

  return { start, pause, reset, getElapsedSeconds };
}
