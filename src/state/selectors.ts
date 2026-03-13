import type { AppState } from './types';
import { getSessionActions } from './reducer';
import {
  THINK_HEADER, THINK_BODY,
  isThinkingHeader, isThinkingBody,
  parseThinkingHeader,
} from '../domain/output-parser';

/** Visual style for a display line. */
export type LineStyle =
  | 'normal'      // green text on black
  | 'inverted'    // green bg + black text (highlight/button)
  | 'tool'        // rounded bordered box (tool use lines)
  | 'meta'        // dimmed text (status, separators)
  | 'prompt'      // user prompt highlight
  | 'separator'   // thin horizontal rule
  | 'thinking';   // dotted border box (thinking blocks)

/** A single line of display content. */
export interface DisplayLine {
  text: string;
  /** @deprecated use style instead */
  inverted: boolean;
  style: LineStyle;
  /** If this is a thinking header line, the thinking block ID (for toggle). */
  thinkingId?: number;
}

/** Structured display data for the canvas renderer. */
export interface DisplayData {
  lines: DisplayLine[];
}

function line(text: string, inverted = false, style?: LineStyle): DisplayLine {
  return { text, inverted, style: style ?? (inverted ? 'inverted' : 'normal') };
}

/**
 * Returns structured display data for the canvas renderer.
 */
export function getDisplayData(state: AppState): DisplayData {
  switch (state.screen) {
    case 'home':
      return homeData(state);
    case 'session-list':
      return sessionListData(state);
    case 'session-detail':
      return sessionDetailData(state);
    case 'voice-input':
      return voiceInputData(state);
    case 'live-output':
      return liveOutputData(state);
    case 'action-result':
      return actionResultData(state);
    default:
      return homeData(state);
  }
}

/**
 * Returns the thinking block ID at the current chat highlight position,
 * or null if the highlighted row is not a thinking header.
 */
export function getThinkingIdAtHighlight(state: AppState): number | null {
  if (state.screen !== 'live-output') return null;
  const data = getDisplayData(state);
  // Find the inverted (highlighted) row — thinkingId is preserved from header or body lines
  for (const dl of data.lines) {
    if (dl.inverted && dl.thinkingId !== undefined) {
      return dl.thinkingId;
    }
  }
  return null;
}

// ── Home ──

function homeData(state: AppState): DisplayData {
  const total = state.sessions.length;
  const connLabel =
    state.connectionStatus === 'connected' ? ''
    : state.connectionStatus === 'connecting' ? ' [connecting...]'
    : ' [disconnected]';

  if (total === 0) {
    return {
      lines: [
        line(`OPEN VIDE${connLabel}`),
        line(''),
        line('No sessions'),
        line(''),
        line('Start a session from'),
        line('the daemon CLI.'),
      ],
    };
  }

  const running = state.sessions.filter((s) => s.status === 'running').length;

  const lines: DisplayLine[] = [
    line(`OPEN VIDE${connLabel}`),
    line(''),
    line(`${total} session${total !== 1 ? 's' : ''}`),
    line(`${running} running`),
    line(''),
    line(' View Sessions', true),
  ];

  return { lines };
}

// ── Session List ──

function sessionListData(state: AppState): DisplayData {
  const hi = state.highlightedIndex;

  if (state.sessions.length === 0) {
    return { lines: [line('SESSIONS (0)'), line(''), line('No sessions')] };
  }

  const maxVisible = 5;
  let start = Math.max(0, hi - Math.floor(maxVisible / 2));
  const end = Math.min(state.sessions.length, start + maxVisible);
  start = Math.max(0, end - maxVisible);

  const lines: DisplayLine[] = [];
  lines.push(line(`SESSIONS (${state.sessions.length})`));
  lines.push(line(''));

  if (start > 0) lines.push(line('  ...'));

  for (let i = start; i < end; i++) {
    const s = state.sessions[i];
    const statusTag =
      s.status === 'running' ? 'run..'
      : s.status === 'failed' ? 'FAIL'
      : s.status === 'cancelled' ? 'canc'
      : s.status === 'interrupted' ? 'int!'
      : 'idle';
    const label = `${s.tool} ${statusTag}`;
    const maxLen = 34 - label.length;
    const dir = s.workingDirectory.split('/').pop() ?? '';
    const dirTrunc = dir.length > maxLen ? dir.slice(0, maxLen - 2) + '..' : dir;
    lines.push(line(` ${label} ${dirTrunc}`, i === hi));
  }

  if (end < state.sessions.length) lines.push(line('  ...'));

  return { lines };
}

// ── Session Detail ──

function sessionDetailData(state: AppState): DisplayData {
  const session = state.sessions.find((s) => s.id === state.selectedSessionId);
  if (!session) return { lines: [line('SESSION'), line(''), line('Not found')] };

  const statusBadge =
    session.status === 'running' ? '[RUNNING]'
    : session.status === 'failed' ? '[FAILED]'
    : session.status === 'cancelled' ? '[CANCELLED]'
    : session.status === 'interrupted' ? '[INTERRUPTED]'
    : '[IDLE]';

  const dir = session.workingDirectory.split('/').pop() ?? session.workingDirectory;
  const header = `${session.tool.toUpperCase()} ${statusBadge}`;

  const lines: DisplayLine[] = [
    line(header),
    line(`~/${dir}`),
    line('────────────────────'),
  ];

  if (session.lastPrompt) {
    const prompt = session.lastPrompt.length > 60 ? session.lastPrompt.slice(0, 59) + '..' : session.lastPrompt;
    lines.push(line(`"${prompt}"`));
  }
  if (session.lastError) {
    const err = session.lastError.length > 60 ? session.lastError.slice(0, 59) + '..' : session.lastError;
    lines.push(line(`! ${err}`));
  }
  lines.push(line(''));

  const actions = getSessionActions(state);
  const hi = state.highlightedIndex;
  actions.forEach((actionLabel, i) => {
    lines.push(line(` ${actionLabel}`, i === hi));
  });

  return { lines };
}

// ── Voice Input ──

function voiceInputData(state: AppState): DisplayData {
  const session = state.sessions.find((s) => s.id === state.selectedSessionId);
  const toolName = session ? session.tool.toUpperCase() : '';

  const lines: DisplayLine[] = [
    line(`${toolName} - VOICE INPUT`),
    line('────────────────────'),
    line(''),
  ];

  if (state.voiceListening) {
    lines.push(line('LISTENING...'));
  } else {
    lines.push(line('Processing...'));
  }

  lines.push(line(''));

  if (state.voiceText) {
    // Word-wrap transcription at ~30 chars
    const words = state.voiceText.split(' ');
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > 30) {
        lines.push(line(`"${current}`));
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(line(`"${current}"`));
  }

  return { lines };
}

// ── Live Output ──

function liveOutputData(state: AppState): DisplayData {
  const session = state.sessions.find((s) => s.id === state.selectedSessionId);
  const toolName = session ? session.tool.toUpperCase() : '';
  const statusTag = state.voiceListening ? ' [LISTENING...]'
    : session?.status === 'running' ? ' [LIVE]'
    : ' [DONE]';

  const headerLines: DisplayLine[] = [
    line(`${toolName}${statusTag}`, false, state.voiceListening ? 'inverted' : 'normal'),
    line('────────────────────'),
  ];

  // Show voice transcription above output when listening
  if (state.voiceListening || state.voiceText) {
    const voiceLabel = state.voiceText ? `"${state.voiceText}"` : 'Speak now...';
    headerLines.push(line(voiceLabel, false, 'prompt'));
    headerLines.push(line(''));
  }

  const maxChars = 44;
  const maxDisplayLines = 8;
  const total = state.outputLines.length;

  if (total === 0) {
    return { lines: [...headerLines, line(''), line('Waiting for output...')] };
  }

  // Build visible lines, handling thinking collapse/expand
  const wrapped: DisplayLine[] = [];
  let prevStyle: LineStyle | null = null;

  for (const text of state.outputLines) {
    // Thinking header: show collapsed or expanded
    if (isThinkingHeader(text)) {
      const parsed = parseThinkingHeader(text);
      if (parsed) {
        const expanded = state.expandedThinking.includes(parsed.id);
        const prefix = expanded ? 'v ' : '> ';
        const headerText = `${prefix}${parsed.summary}`;
        if (prevStyle !== null && prevStyle !== 'thinking') {
          wrapped.push(line('', false, 'normal'));
        }
        prevStyle = 'thinking';
        const dl = line(headerText, false, 'thinking');
        dl.thinkingId = parsed.id;
        if (headerText.length <= maxChars) {
          wrapped.push(dl);
        } else {
          wrapped.push({ ...dl, text: headerText.slice(0, maxChars) });
        }
      }
      continue;
    }

    // Thinking body: only show if expanded
    if (isThinkingBody(text)) {
      // Find the thinking ID from the prefix (§TB§ = 4 chars)
      const rest = text.slice(4);
      const sepIdx = rest.indexOf('§');
      if (sepIdx >= 0) {
        const id = parseInt(rest.slice(0, sepIdx), 10);
        if (!state.expandedThinking.includes(id)) continue; // collapsed — skip
        const bodyText = rest.slice(sepIdx + 1);
        // Don't add separator between thinking body lines
        prevStyle = 'thinking';
        if (bodyText.length <= maxChars) {
          const dl = line(`  ${bodyText}`, false, 'thinking');
          dl.thinkingId = id;
          wrapped.push(dl);
        } else {
          for (let i = 0; i < bodyText.length; i += maxChars - 2) {
            const dl = line(`  ${bodyText.slice(i, i + maxChars - 2)}`, false, 'thinking');
            dl.thinkingId = id;
            wrapped.push(dl);
          }
        }
      }
      continue;
    }

    // Prompt lines (§P§ prefix from parser)
    if (text.startsWith('§P§')) {
      const promptText = text.slice(3);
      if (prevStyle !== null && prevStyle !== 'prompt') {
        wrapped.push(line('', false, 'normal'));
      }
      prevStyle = 'prompt';
      if (promptText.length <= maxChars) {
        wrapped.push(line(promptText, false, 'prompt'));
      } else {
        for (let i = 0; i < promptText.length; i += maxChars) {
          wrapped.push(line(promptText.slice(i, i + maxChars), false, 'prompt'));
        }
      }
      continue;
    }

    // Regular lines
    const style = classifyOutputLine(text);
    if (prevStyle !== null && style !== prevStyle) {
      wrapped.push(line('', false, 'normal'));
    }
    prevStyle = style;
    if (text.length <= maxChars) {
      wrapped.push(line(text, false, style));
    } else {
      for (let i = 0; i < text.length; i += maxChars) {
        wrapped.push(line(text.slice(i, i + maxChars), false, style));
      }
    }
  }

  // Always leave 1 blank line at the end
  wrapped.push(line('', false, 'normal'));

  // outputScrollOffset = lines up from bottom (0 = at bottom, 1 = one up, etc.)
  const maxFromBottom = Math.max(0, wrapped.length - maxDisplayLines);
  const clampedFromBottom = Math.min(state.outputScrollOffset, maxFromBottom);
  const effectiveOffset = Math.max(0, wrapped.length - maxDisplayLines - clampedFromBottom);

  const start = Math.max(0, effectiveOffset);
  const end = Math.min(wrapped.length, start + maxDisplayLines);

  // chatHighlight is relative to the viewport (0 = first visible row)
  const visibleCount = end - start;
  const hi = Math.max(0, Math.min(state.chatHighlight, visibleCount - 1));

  const resultLines = [...headerLines];
  for (let i = start; i < end; i++) {
    const dl = wrapped[i];
    if (i - start === hi) {
      resultLines.push({ ...dl, inverted: true, style: 'inverted', thinkingId: dl.thinkingId });
    } else {
      resultLines.push(dl);
    }
  }

  return { lines: resultLines };
}

// ── Action Result ──

function actionResultData(state: AppState): DisplayData {
  const result = state.pendingResult;
  if (!result) {
    return { lines: [line('RESULT'), line(''), line('No result'), line(''), line(' Continue', true)] };
  }

  const icon = result.success ? '[OK]' : '[FAIL]';
  const status = result.success ? 'Action completed' : 'Action failed';

  return {
    lines: [
      line(`${icon} ${result.action.toUpperCase()}`),
      line(''),
      line(result.message),
      line('────────────────────'),
      line(status),
      line(''),
      line(' Continue', true),
    ],
  };
}

// ── Output line style classification ──

function classifyOutputLine(text: string): LineStyle {
  if (text.startsWith('>> ')) return 'tool';
  if (text.startsWith('--- ') || text.startsWith('[OK]') || text.startsWith('[FAIL]')) return 'meta';
  if (text.startsWith('(') && text.endsWith(')')) return 'meta'; // thinking
  if (text.startsWith('[') && text.includes('] Starting')) return 'meta'; // init
  if (text.startsWith('Thinking...')) return 'meta';
  if (text.startsWith('! ')) return 'meta'; // stderr
  return 'normal';
}
