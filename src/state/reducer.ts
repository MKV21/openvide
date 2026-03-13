import type { AppState } from './types';
import type { Action } from './actions';

const MAX_OUTPUT_LINES = 50;

export const initialState: AppState = {
  screen: 'home',
  sessions: [],
  highlightedIndex: 0,
  selectedSessionId: null,
  pendingResult: null,
  connectionStatus: 'connecting',
  voiceText: null,
  voiceListening: false,
  outputLines: [],
  outputScrollOffset: 0,
  chatHighlight: 0,
  expandedThinking: [],
};

/** Actions available on session-detail screen. */
export function getSessionActions(state: AppState): string[] {
  const session = state.sessions.find((s) => s.id === state.selectedSessionId);
  if (!session) return [];
  const actions: string[] = [];
  if (session.status === 'idle' || session.status === 'failed' || session.status === 'cancelled' || session.status === 'interrupted') {
    actions.push('Send Prompt');
  }
  if (session.outputLines > 0 || session.status === 'running') {
    actions.push('Enter Chat');
  }
  if (session.status === 'running') {
    actions.push('Cancel');
  }
  actions.push('Dismiss');
  return actions;
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'APP_INIT':
      return state;

    case 'SESSIONS_UPDATED':
      return { ...state, sessions: action.sessions };

    case 'CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status };

    case 'NAVIGATE':
      return {
        ...state,
        screen: action.screen,
        highlightedIndex: 0,
        selectedSessionId: action.screen === 'home' ? null : state.selectedSessionId,
        pendingResult: null,
        voiceText: null,
        voiceListening: false,
        outputLines: action.screen === 'live-output' ? state.outputLines : [],
        outputScrollOffset: 0,   // 0 = at bottom
      };

    case 'HIGHLIGHT_MOVE': {
      let max: number;
      if (state.screen === 'session-detail') {
        max = getSessionActions(state).length - 1;
      } else if (state.screen === 'session-list') {
        max = state.sessions.length - 1;
      } else if (state.screen === 'live-output') {
        // Scroll moves both highlight and viewport
        return reduce(state, { type: 'CHAT_HIGHLIGHT_MOVE', direction: action.direction });
      } else {
        return state;
      }
      if (max < 0) return state;
      const idx =
        action.direction === 'down'
          ? Math.min(state.highlightedIndex + 1, max)
          : Math.max(state.highlightedIndex - 1, 0);
      return { ...state, highlightedIndex: idx };
    }

    case 'SELECT_HIGHLIGHTED': {
      const target = state.sessions[state.highlightedIndex];
      if (!target) return state;
      return {
        ...state,
        selectedSessionId: target.id,
        screen: 'session-detail',
        highlightedIndex: 0,
      };
    }

    case 'PRIMARY_ACTION': {
      if (state.screen === 'session-detail') {
        const actions = getSessionActions(state);
        const chosen = actions[state.highlightedIndex];
        if (!chosen) return state;

        if (chosen === 'Send Prompt') {
          return {
            ...state,
            screen: 'voice-input',
            voiceListening: true,
            voiceText: null,
          };
        }
        if (chosen === 'Enter Chat') {
          return {
            ...state,
            screen: 'live-output',
            outputLines: [],
            outputScrollOffset: 0,   // 0 = at bottom
            chatHighlight: 0,
            expandedThinking: [],
          };
        }
        // Cancel and Dismiss are handled by session-actions.ts dispatching ACTION_STARTED/COMPLETED
        // But we need to signal which action was chosen
        return state;
      }
      if (state.screen === 'action-result') {
        return reduce(state, { type: 'CLEAR_RESULT' });
      }
      return state;
    }

    case 'ACTION_STARTED':
      return state;

    case 'ACTION_COMPLETED':
      // Stay on live-output when sending from chat
      if (state.screen === 'live-output') return state;
      return {
        ...state,
        pendingResult: action.result,
        screen: 'action-result',
      };

    case 'GO_BACK': {
      if (state.screen === 'session-detail') {
        return { ...state, screen: 'session-list', selectedSessionId: null, highlightedIndex: 0 };
      }
      if (state.screen === 'session-list') {
        return { ...state, screen: 'home', highlightedIndex: 0 };
      }
      if (state.screen === 'voice-input') {
        return { ...state, screen: 'session-detail', voiceListening: false, voiceText: null, highlightedIndex: 0 };
      }
      if (state.screen === 'live-output') {
        return { ...state, screen: 'session-detail', outputLines: [], outputScrollOffset: 0, highlightedIndex: 0 };
      }
      if (state.screen === 'action-result') {
        return {
          ...state,
          pendingResult: null,
          screen: state.sessions.length > 0 ? 'session-list' : 'home',
          selectedSessionId: null,
          highlightedIndex: 0,
        };
      }
      return state;
    }

    case 'CLEAR_RESULT': {
      return {
        ...state,
        pendingResult: null,
        screen: state.sessions.length > 0 ? 'session-list' : 'home',
        selectedSessionId: null,
        highlightedIndex: 0,
      };
    }

    // Voice
    case 'VOICE_START':
      return { ...state, voiceListening: true, voiceText: null };

    case 'VOICE_INTERIM':
      return { ...state, voiceText: action.text };

    case 'VOICE_FINAL':
      return { ...state, voiceText: action.text, voiceListening: false };

    case 'VOICE_ERROR':
      return { ...state, voiceListening: false, voiceText: `Error: ${action.error}` };

    case 'VOICE_CANCEL':
      return { ...state, screen: 'session-detail', voiceListening: false, voiceText: null, highlightedIndex: 0 };

    case 'VOICE_CLEAR':
      return { ...state, voiceListening: false, voiceText: null };

    // Live output
    case 'OUTPUT_LINE': {
      const lines = [...state.outputLines, action.line].slice(-MAX_OUTPUT_LINES);
      return { ...state, outputLines: lines };
    }

    case 'OUTPUT_SCROLL': {
      // outputScrollOffset = lines up from bottom (0 = at bottom, 1 = one line up, etc.)
      if (action.direction === 'up') {
        return { ...state, outputScrollOffset: state.outputScrollOffset + 1 };
      } else {
        return { ...state, outputScrollOffset: Math.max(0, state.outputScrollOffset - 1) };
      }
    }

    // Chat highlight & thinking
    case 'CHAT_HIGHLIGHT_MOVE': {
      const visibleCount = 8;
      const hi = state.chatHighlight;

      if (action.direction === 'up') {
        if (hi > 0) {
          // Move highlight up within viewport
          return { ...state, chatHighlight: hi - 1 };
        }
        // At top of viewport — scroll viewport up
        return reduce(state, { type: 'OUTPUT_SCROLL', direction: 'up' });
      } else {
        if (hi < visibleCount - 1) {
          // Move highlight down within viewport
          return { ...state, chatHighlight: hi + 1 };
        }
        // At bottom of viewport — scroll viewport down
        return reduce(state, { type: 'OUTPUT_SCROLL', direction: 'down' });
      }
    }

    case 'CHAT_TAP':
      // Handled by bootstrap (checks if highlighted row is a thinking header)
      return state;

    case 'TOGGLE_THINKING': {
      const id = action.thinkingId;
      const expanded = state.expandedThinking.includes(id)
        ? state.expandedThinking.filter((x) => x !== id)
        : [...state.expandedThinking, id];
      return { ...state, expandedThinking: expanded };
    }

    default:
      return state;
  }
}
