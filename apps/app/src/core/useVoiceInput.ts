import { useCallback, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "@jamsch/expo-speech-recognition";

const MAX_RETRIES = 3;
const QUICK_END_THRESHOLD_MS = 600;

/**
 * Voice-to-text hook. Calls `onTranscript` with the full recognized text
 * so far (replaces, not appends) on each interim/final result.
 * When recognition ends, the last transcript stays in place.
 *
 * iOS speech recognition sometimes starts and immediately ends without
 * producing results (audio engine not ready). This hook auto-retries
 * transparently so the user only needs to tap once.
 */
export function useVoiceInput(
  onTranscript: (text: string) => void,
  lang: string = "en-US",
) {
  const [isListening, setIsListening] = useState(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const stoppedRef = useRef(false);
  const startedAtRef = useRef(0);
  const retriesRef = useRef(0);
  const gotResultRef = useRef(false);
  const activeRef = useRef(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  const fireStart = useCallback(() => {
    startedAtRef.current = Date.now();
    gotResultRef.current = false;
    activeRef.current = true;
    ExpoSpeechRecognitionModule.start({
      lang: langRef.current,
      interimResults: true,
    });
  }, []);

  const start = useCallback(async () => {
    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) return;

    stoppedRef.current = false;
    retriesRef.current = 0;

    // If already active, stop first and wait a beat
    if (activeRef.current) {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
      activeRef.current = false;
      await new Promise<void>((r) => setTimeout(r, 200));
      if (stoppedRef.current) return;
    }

    setIsListening(true);
    fireStart();
  }, [fireStart]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    retriesRef.current = MAX_RETRIES;
    activeRef.current = false;
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
    setIsListening(false);
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    if (stoppedRef.current) return;
    gotResultRef.current = true;
    const transcript = event.results[0]?.transcript;
    if (transcript) onTranscriptRef.current(transcript);
  });

  useSpeechRecognitionEvent("error", () => {
    // "end" event always fires after "error" — let "end" handle retry logic.
  });

  useSpeechRecognitionEvent("end", () => {
    activeRef.current = false;

    if (stoppedRef.current) {
      setIsListening(false);
      return;
    }

    const elapsed = Date.now() - startedAtRef.current;

    // If recognition ended very quickly without producing any results,
    // the iOS audio engine wasn't ready. Retry transparently.
    if (elapsed < QUICK_END_THRESHOLD_MS && !gotResultRef.current && retriesRef.current < MAX_RETRIES) {
      retriesRef.current++;
      const delay = 150 + retriesRef.current * 150;
      setTimeout(() => {
        if (stoppedRef.current) {
          setIsListening(false);
          return;
        }
        fireStart();
      }, delay);
      return;
    }

    // Normal end — user finished speaking or max retries exhausted
    setIsListening(false);
  });

  return { isListening, start, stop };
}
