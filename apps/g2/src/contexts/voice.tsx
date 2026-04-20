import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface VoiceContextValue {
  listening: boolean;
  text: string | null;
  status: 'loading' | 'listening' | 'processing' | 'idle' | 'error' | null;
  setListening: (listening: boolean) => void;
  setText: (text: string | null) => void;
  setStatus: (status: VoiceContextValue['status']) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<VoiceContextValue['status']>(null);
  const value = useMemo(
    () => ({ listening, text, status, setListening, setText, setStatus }),
    [listening, text, status],
  );
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    // Fallback values so the route still renders if provider is missing.
    return {
      listening: false,
      text: null,
      status: null,
      setListening: () => {},
      setText: () => {},
      setStatus: () => {},
    };
  }
  return ctx;
}
