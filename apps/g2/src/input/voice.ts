/**
 * Voice input using even-toolkit STTEngine with supported cloud providers only.
 */

import type { Store } from '../state/store';
import { ElevenLabsBatchSttEngine } from './elevenlabs-stt';
import { sttLog } from 'even-toolkit/stt';

let engine: any = null;
let activeStore: Store | null = null;
let committedTranscript = '';
let interimTranscript = '';

const VALID_PROVIDERS = ['soniox', 'whisper-api', 'deepgram', 'elevenlabs'] as const;
type SttProvider = typeof VALID_PROVIDERS[number];

function normalizeProvider(provider?: string | null): SttProvider {
  if (provider && (VALID_PROVIDERS as readonly string[]).includes(provider)) return provider as SttProvider;
  return 'soniox';
}

function readSettingString(settings: unknown, key: string): string {
  if (!settings || typeof settings !== 'object') return '';
  const value = (settings as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function resolveApiKey(settings: unknown, provider: SttProvider): string {
  const keyFieldByProvider: Record<SttProvider, string> = {
    soniox: 'sttApiKeySoniox',
    'whisper-api': 'sttApiKeyWhisper',
    deepgram: 'sttApiKeyDeepgram',
    elevenlabs: 'sttApiKeyElevenLabs',
  };
  return readSettingString(settings, keyFieldByProvider[provider]).trim()
    || readSettingString(settings, 'sttApiKey').trim();
}

function normalizeTranscriptText(text?: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function mergeTranscript(base: string, next: string): string {
  const normalizedBase = normalizeTranscriptText(base);
  const normalizedNext = normalizeTranscriptText(next);

  if (!normalizedBase) return normalizedNext;
  if (!normalizedNext) return normalizedBase;
  if (normalizedNext.startsWith(normalizedBase)) return normalizedNext;
  if (normalizedBase.endsWith(normalizedNext)) return normalizedBase;
  return `${normalizedBase} ${normalizedNext}`.trim();
}

/** Check if voice is available (always true — STTEngine handles provider availability). */
export function isVoiceAvailable(): boolean {
  return true;
}

export async function startVoiceCapture(store: Store): Promise<void> {
  if (engine) {
    stopVoiceCapture();
  }

  activeStore = store;
  committedTranscript = '';
  interimTranscript = '';
  const settings = store.getState().settings;
  const provider = normalizeProvider(settings.sttProvider);
  const apiKey = resolveApiKey(settings, provider);
  sttLog('voice: start capture', 'provider:', provider, 'hasKey:', apiKey.length > 0);

  store.dispatch({ type: 'VOICE_START' });

  if (!apiKey) {
    store.dispatch({ type: 'VOICE_ERROR', error: `${provider} API key missing` });
    return;
  }

  try {
    if (provider === 'elevenlabs') {
      engine = new ElevenLabsBatchSttEngine({
        apiKey,
        languageCode: 'auto',
      });
    } else {
      const { STTEngine } = await import('even-toolkit/stt');

      engine = new STTEngine({
        provider,
        source: 'microphone',
        language: settings.voiceLang ?? 'en-US',
        apiKey,
      });
    }

    engine.onTranscript((t: { text: string; isFinal: boolean }) => {
      if (!activeStore) return;
      const nextText = normalizeTranscriptText(t.text);
      sttLog('voice: transcript', t.isFinal ? 'final' : 'interim', 'length:', nextText.length);
      if (t.isFinal) {
        committedTranscript = mergeTranscript(committedTranscript, nextText);
        interimTranscript = '';
        activeStore.dispatch({ type: 'VOICE_FINAL', text: committedTranscript });
      } else {
        interimTranscript = nextText;
        activeStore.dispatch({
          type: 'VOICE_INTERIM',
          text: mergeTranscript(committedTranscript, interimTranscript),
        });
      }
    });

    engine.onError((err: { message: string }) => {
      sttLog('voice: error', err.message);
      activeStore?.dispatch({ type: 'VOICE_ERROR', error: err.message });
    });

    engine.onStateChange?.((state: string) => {
      sttLog('voice: state', state);
      activeStore?.dispatch({ type: 'VOICE_STATUS', status: state as any });
    });

    await engine.start();
  } catch (error) {
    engine = null;
    sttLog('voice: start failed', error instanceof Error ? error.message : 'unknown');
    activeStore?.dispatch({
      type: 'VOICE_ERROR',
      error: error instanceof Error ? error.message : 'Failed to start speech-to-text',
    });
  }
}

export function stopVoiceCapture(): void {
  if (engine) {
    try {
      if (typeof engine.abort === 'function') {
        engine.abort();
      } else {
        engine.stop();
      }
    } catch { /* ignore */ }
    engine = null;
  }
  activeStore = null;
  committedTranscript = '';
  interimTranscript = '';
}

export function finishVoiceCapture(): void {
  if (!engine) return;
  try {
    sttLog('voice: finish capture');
    if (typeof engine.finish === 'function') {
      engine.finish();
    } else {
      engine.stop();
    }
  } catch {
    stopVoiceCapture();
  }
}
