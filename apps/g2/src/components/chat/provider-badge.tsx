import { useMemo } from 'react';

type Provider = 'claude' | 'codex' | 'gemini';

const providerColors: Record<Provider, string> = {
  claude: '#C4704B',
  codex: '#10A37F',
  gemini: '#4285F4',
};

const providerLetters: Record<Provider, string> = {
  claude: 'C',
  codex: 'X',
  gemini: 'G',
};

const providerIcons: Partial<Record<Provider, { light: string; dark: string }>> = {
  claude: {
    light: '/provider-icons/claude_light.png',
    dark: '/provider-icons/claude_dark.png',
  },
  codex: {
    light: '/provider-icons/openai_light.png',
    dark: '/provider-icons/openai_dark.png',
  },
};

interface ProviderBadgeProps {
  provider: Provider;
  size?: number;
  className?: string;
}

export function ProviderBadge({ provider, size = 32, className }: ProviderBadgeProps) {
  const color = providerColors[provider] ?? 'var(--color-text-dim)';
  const letter = providerLetters[provider] ?? provider.charAt(0).toUpperCase();
  const iconSet = providerIcons[provider];
  const backgroundColor = provider === 'codex' ? '#000000' : undefined;
  const iconSrc = useMemo(() => {
    if (!iconSet || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return iconSet?.light ?? null;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? iconSet.dark : iconSet.light;
  }, [iconSet]);

  return (
    <div
      className={`bg-surface-light rounded-full flex items-center justify-center shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size, backgroundColor }}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={provider}
          style={{
            width: Math.round(size * 0.62),
            height: Math.round(size * 0.62),
            borderRadius: Math.round(size * 0.31),
          }}
        />
      ) : (
        <span
          className="font-normal"
          style={{
            color,
            fontSize: size * 0.44,
            lineHeight: 1,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {letter}
        </span>
      )}
    </div>
  );
}
