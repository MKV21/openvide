/**
 * Web Speech API wrapper for voice prompt input.
 *
 * Provides start/stop/onResult/onError lifecycle for SpeechRecognition.
 * The G2 mic is used via the WebView's standard media access.
 */

import type { Store } from '../state/store';

let recognition: any = null;
let activeStore: Store | null = null;

/** Check if Web Speech API exists in this environment. */
export function isVoiceAvailable(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export function startVoiceCapture(store: Store): void {
  if (recognition) {
    stopVoiceCapture();
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.error('[voice] SpeechRecognition not available');
    store.dispatch({ type: 'VOICE_ERROR', error: 'Speech not available' });
    return;
  }

  activeStore = store;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event: any) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    if (final) {
      store.dispatch({ type: 'VOICE_FINAL', text: final.trim() });
    } else if (interim) {
      store.dispatch({ type: 'VOICE_INTERIM', text: interim.trim() });
    }
  };

  recognition.onerror = (event: any) => {
    console.error('[voice] Recognition error:', event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      console.warn('[voice] Permission denied');
      store.dispatch({ type: 'VOICE_ERROR', error: 'not-allowed' });
    } else if (event.error === 'no-speech' || event.error === 'aborted') {
      store.dispatch({ type: 'VOICE_ERROR', error: 'No speech detected' });
    } else {
      store.dispatch({ type: 'VOICE_ERROR', error: event.error });
    }
  };

  recognition.onend = () => {
    console.log('[voice] Recognition ended');
    recognition = null;
  };

  console.log('[voice] Starting recognition');
  store.dispatch({ type: 'VOICE_START' });
  recognition.start();
}

export function stopVoiceCapture(): void {
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Already stopped
    }
    recognition = null;
  }
  activeStore = null;
}
