/**
 * Optional audible preview of the stimulus tone for the instructor's benefit
 * (mirrors ptascript.js's sine-oscillator playback) — this is separate from,
 * and has no effect on, the simulated patient's response logic.
 */
export function createTonePlayer() {
  let ctx = null;
  let oscillator = null;
  let gainNode = null;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  function play(freq, durationSeconds) {
    stop();
    const audioCtx = ensureContext();
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();

    const stopAt = audioCtx.currentTime + durationSeconds;
    gainNode.gain.linearRampToValueAtTime(0, stopAt);
    oscillator.stop(stopAt + 0.02);
  }

  function stop() {
    if (oscillator) {
      try {
        oscillator.stop();
      } catch {
        // already stopped
      }
      oscillator = null;
    }
  }

  return { play, stop };
}
