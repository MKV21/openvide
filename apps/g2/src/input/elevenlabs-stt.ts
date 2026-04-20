import {
  MicrophoneSource,
  createAudioBuffer,
  createVAD,
  float32ToWav,
  resample,
  type AudioSource,
  type STTError,
  type STTState,
  type STTTranscript,
  sttLog,
} from 'even-toolkit/stt';

const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const TARGET_SAMPLE_RATE = 16000;
const MIN_AUDIO_SECONDS = 0.3;
const MAX_AUDIO_SECONDS = 120;
const MAX_CAPTURE_MS = 15000;
const GLASS_SAMPLE_RATE = 16000;

type ElevenLabsEngineConfig = {
  apiKey: string;
  languageCode?: string | null;
};

type ElevenLabsTranscriptResponse = {
  text?: unknown;
  language_code?: unknown;
  language_probability?: unknown;
  transcripts?: unknown;
  words?: unknown;
};

type ElevenLabsErrorResponse = {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
};

type AudioStats = {
  durationSeconds: number;
  peak: number;
  rms: number;
};

function resolveSource(): AudioSource {
  if (typeof window !== 'undefined' && (window as Window & { __evenBridge?: unknown }).__evenBridge) {
    return new NonBlockingGlassBridgeSource();
  }
  return new MicrophoneSource();
}

class NonBlockingGlassBridgeSource implements AudioSource {
  private listeners: Array<(pcm: Float32Array, sampleRate: number) => void> = [];
  private listening = false;
  private bridge: any = null;

  async start(): Promise<void> {
    if (this.listening) return;

    this.bridge = (window as any).__evenBridge ?? null;
    sttLog('elevenlabs glass source: bridge found:', !!this.bridge);
    if (!this.bridge) {
      throw new Error('Glasses bridge not available');
    }

    this.listening = true;
    this.bridge.onEvent((event: any) => {
      if (!this.listening) return;
      const audioPcm = toAudioBytes(event?.audioEvent?.audioPcm);
      if (!audioPcm || audioPcm.byteLength === 0) return;

      const float32 = pcm16BytesToFloat32(audioPcm);
      for (const cb of this.listeners) {
        cb(float32, GLASS_SAMPLE_RATE);
      }
    });

    void this.setAudioOpen(true);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    void this.setAudioOpen(false);
  }

  onAudioData(cb: (pcm: Float32Array, sampleRate: number) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== cb);
    };
  }

  dispose(): void {
    this.stop();
    this.listeners = [];
  }

  private async setAudioOpen(isOpen: boolean): Promise<void> {
    try {
      if (this.bridge?.rawBridge?.audioControl) {
        await this.bridge.rawBridge.audioControl(isOpen);
      } else if (this.bridge?.rawBridge?.callEvenApp) {
        await this.bridge.rawBridge.callEvenApp('audioControl', { isOpen });
      }
      sttLog('elevenlabs glass source: audioControl', isOpen ? 'open' : 'closed');
    } catch (error) {
      sttLog('elevenlabs glass source: audioControl error', error instanceof Error ? error.message : String(error));
    }
  }
}

function toAudioBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return new Uint8Array(value);
  return null;
}

function pcm16BytesToFloat32(bytes: Uint8Array): Float32Array {
  const samples = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(samples);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < samples; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

function normalizeLanguageCode(languageCode?: string | null): string | null {
  const value = languageCode?.trim();
  if (!value || value.toLowerCase() === 'auto') return null;
  return value.split('-')[0] ?? null;
}

function responseMessage(body: ElevenLabsErrorResponse): string {
  const detail = body.detail ?? body.message ?? body.error;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (typeof first?.msg === 'string') return first.msg;
  }
  return '';
}

function toSttError(message: string, code: STTError['code'] = 'network'): STTError {
  return {
    code,
    message,
    provider: 'elevenlabs',
  };
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractWordsText(words: unknown): string {
  if (!Array.isArray(words)) return '';
  return words
    .map((word) => {
      if (!word || typeof word !== 'object') return '';
      const record = word as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type : '';
      if (type && type !== 'word') return '';
      return readText(record.text);
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTranscriptText(json: ElevenLabsTranscriptResponse): string {
  const directText = readText(json.text);
  if (directText) return directText;

  const wordsText = extractWordsText(json.words);
  if (wordsText) return wordsText;

  const transcripts = json.transcripts;
  const transcriptValues = Array.isArray(transcripts)
    ? transcripts
    : transcripts && typeof transcripts === 'object'
      ? Object.values(transcripts as Record<string, unknown>)
      : [];

  for (const transcript of transcriptValues) {
    if (!transcript || typeof transcript !== 'object') continue;
    const record = transcript as ElevenLabsTranscriptResponse;
    const text = readText(record.text) || extractWordsText(record.words);
    if (text) return text;
  }

  return '';
}

function getAudioStats(audio: Float32Array): AudioStats {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < audio.length; i++) {
    const sample = Math.abs(audio[i]);
    peak = Math.max(peak, sample);
    sum += sample * sample;
  }
  return {
    durationSeconds: audio.length / TARGET_SAMPLE_RATE,
    peak,
    rms: audio.length > 0 ? Math.sqrt(sum / audio.length) : 0,
  };
}

function formatAudioStats(stats: AudioStats): string {
  return `${stats.durationSeconds.toFixed(1)}s, peak ${stats.peak.toFixed(3)}, rms ${stats.rms.toFixed(3)}`;
}

async function parseJsonResponse(response: Response): Promise<ElevenLabsTranscriptResponse> {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) as ElevenLabsTranscriptResponse : {};
  } catch {
    throw new Error(`ElevenLabs returned non-JSON response (${response.status})`);
  }
}

export class ElevenLabsBatchSttEngine {
  private config: ElevenLabsEngineConfig;
  private source: AudioSource | null = null;
  private sourceUnsub: (() => void) | null = null;
  private buffer: ReturnType<typeof createAudioBuffer> | null = null;
  private vad: ReturnType<typeof createVAD> | null = null;
  private abortController: AbortController | null = null;
  private maxCaptureTimer: ReturnType<typeof setTimeout> | null = null;
  private finishing = false;
  private stopped = false;
  private sawAudio = false;

  private transcriptListeners: Array<(t: STTTranscript) => void> = [];
  private stateListeners: Array<(s: STTState) => void> = [];
  private errorListeners: Array<(e: STTError) => void> = [];

  constructor(config: ElevenLabsEngineConfig) {
    this.config = config;
  }

  onTranscript(cb: (t: STTTranscript) => void): () => void {
    this.transcriptListeners.push(cb);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((listener) => listener !== cb);
    };
  }

  onStateChange(cb: (s: STTState) => void): () => void {
    this.stateListeners.push(cb);
    return () => {
      this.stateListeners = this.stateListeners.filter((listener) => listener !== cb);
    };
  }

  onError(cb: (e: STTError) => void): () => void {
    this.errorListeners.push(cb);
    return () => {
      this.errorListeners = this.errorListeners.filter((listener) => listener !== cb);
    };
  }

  async start(): Promise<void> {
    const apiKey = this.config.apiKey.trim();
    if (!apiKey) {
      const error = toSttError('ElevenLabs API key is required', 'not-allowed');
      this.emitError(error);
      throw new Error(error.message);
    }

    this.stopped = false;
    this.finishing = false;
    this.sawAudio = false;
    this.buffer = createAudioBuffer({ sampleRate: TARGET_SAMPLE_RATE, maxSeconds: MAX_AUDIO_SECONDS });
    this.vad = createVAD({ silenceThresholdMs: 1500, speechThresholdDb: -40 });
    this.source = resolveSource();
    sttLog('elevenlabs: start', 'source:', this.source.constructor.name);

    this.emitState('loading');
    await this.source.start();

    this.sourceUnsub = this.source.onAudioData((pcm, sampleRate) => {
      this.processAudio(pcm, sampleRate);
    });

    this.emitState('listening');
    this.maxCaptureTimer = setTimeout(() => {
      void this.finishCapture();
    }, MAX_CAPTURE_MS);
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
    this.cleanupAudio();
    this.emitState('idle');
  }

  finish(): void {
    void this.finishCapture();
  }

  abort(): void {
    this.stop();
    this.buffer?.clear();
  }

  dispose(): void {
    this.abort();
    this.transcriptListeners = [];
    this.stateListeners = [];
    this.errorListeners = [];
  }

  private processAudio(pcm: Float32Array, sampleRate: number): void {
    if (this.stopped || this.finishing) return;

    const samples = sampleRate !== TARGET_SAMPLE_RATE
      ? resample(pcm, sampleRate, TARGET_SAMPLE_RATE)
      : pcm;

    if (samples.length > 0) {
      this.sawAudio = true;
    }

    this.buffer?.append(samples);

    const vadResult = this.vad?.process(samples);
    if (vadResult?.speechEnded) {
      void this.finishCapture();
    }
  }

  private async finishCapture(): Promise<void> {
    if (this.finishing || this.stopped) return;
    this.finishing = true;
    this.cleanupAudio();

    const audio = this.buffer?.getAll() ?? new Float32Array();
    this.buffer?.clear();
    const audioStats = getAudioStats(audio);

    if (!this.sawAudio) {
      sttLog('elevenlabs: no audio chunks received');
      this.emitError(toSttError('No microphone audio received', 'no-speech'));
      this.emitState('idle');
      this.stopped = true;
      return;
    }

    if (audio.length < TARGET_SAMPLE_RATE * MIN_AUDIO_SECONDS) {
      sttLog('elevenlabs: audio too short', formatAudioStats(audioStats));
      this.emitError(toSttError('No speech detected', 'no-speech'));
      this.emitState('idle');
      this.stopped = true;
      return;
    }

    this.emitState('processing');
    this.abortController = new AbortController();
    sttLog('elevenlabs: transcribing', formatAudioStats(audioStats));

    try {
      const transcript = await this.transcribe(audio, this.abortController.signal);
      if (transcript.text.trim()) {
        this.emitTranscript(transcript);
      } else {
        this.emitError(toSttError('No speech detected', 'no-speech'));
      }
      this.emitState('idle');
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'ElevenLabs transcription failed';
      const isNoSpeech = message.startsWith('ElevenLabs returned no text');
      this.emitError(toSttError(isNoSpeech ? 'No speech detected' : message, isNoSpeech ? 'no-speech' : 'network'));
      this.emitState('error');
    } finally {
      this.abortController = null;
      this.stopped = true;
    }
  }

  private async transcribe(audio: Float32Array, signal: AbortSignal): Promise<STTTranscript> {
    const wavBlob = float32ToWav(audio, TARGET_SAMPLE_RATE);
    sttLog('elevenlabs: sending wav', `${(wavBlob.size / 1024).toFixed(0)}KB`);
    const formData = new FormData();
    formData.append('model_id', 'scribe_v2');
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('no_verbatim', 'true');
    formData.append('tag_audio_events', 'false');
    formData.append('timestamps_granularity', 'none');
    formData.append('diarize', 'false');

    const languageCode = normalizeLanguageCode(this.config.languageCode);
    if (languageCode) {
      formData.append('language_code', languageCode);
    }

    const response = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
      },
      body: formData,
      signal,
    });

    if (!response.ok) {
      let body: ElevenLabsErrorResponse = {};
      try {
        body = await response.json() as ElevenLabsErrorResponse;
      } catch {
        // Keep the status-only error below.
      }
      const detail = responseMessage(body);
      const suffix = detail ? `: ${detail}` : '';
      throw new Error(`ElevenLabs API error ${response.status}${suffix}`);
    }

    const json = await parseJsonResponse(response);
    const keys = Object.keys(json);
    const text = extractTranscriptText(json);
    const confidence = typeof json.language_probability === 'number' ? json.language_probability : 1;
    const language = typeof json.language_code === 'string' ? json.language_code : undefined;
    sttLog('elevenlabs: response', 'keys:', keys.join(','), 'textLength:', text.length, 'language:', language ?? 'unknown');
    if (!text) {
      throw new Error('ElevenLabs returned no text');
    }

    return {
      text,
      isFinal: true,
      confidence,
      language,
      timestamp: Date.now(),
    };
  }

  private cleanupAudio(): void {
    if (this.maxCaptureTimer) {
      clearTimeout(this.maxCaptureTimer);
      this.maxCaptureTimer = null;
    }
    this.sourceUnsub?.();
    this.sourceUnsub = null;
    this.source?.stop();
    this.source = null;
    this.vad?.reset();
  }

  private emitTranscript(t: STTTranscript): void {
    for (const cb of this.transcriptListeners) cb(t);
  }

  private emitState(s: STTState): void {
    for (const cb of this.stateListeners) cb(s);
  }

  private emitError(e: STTError): void {
    for (const cb of this.errorListeners) cb(e);
  }
}
