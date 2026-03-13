/**
 * Keep-alive — prevents JS throttling in Even Hub WebView.
 * Matches Solitaire's pattern: AudioContext + Web Locks.
 */

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let lockPromise: Promise<unknown> | null = null;

export function activateKeepAlive(): void {
  // 1. Inaudible audio oscillator (flags as "audio-playing")
  try {
    audioCtx = new AudioContext();
    oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = 1; // 1 Hz — inaudible
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001; // near-silent
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    console.log('[keep-alive] audio active');
  } catch (err) {
    console.warn('[keep-alive] audio failed:', err);
  }

  // 2. Web Locks (signals active work)
  if (navigator.locks) {
    lockPromise = navigator.locks.request('openvide_keep_alive', () => {
      return new Promise<void>(() => {
        // Never resolves — holds lock indefinitely
      });
    });
    console.log('[keep-alive] web lock acquired');
  }
}

export function deactivateKeepAlive(): void {
  oscillator?.stop();
  audioCtx?.close();
  oscillator = null;
  audioCtx = null;
  lockPromise = null;
}
