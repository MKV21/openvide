import type { SessionSummary, ActionResult, Screen } from './types';

export type Action =
  | { type: 'APP_INIT' }
  | { type: 'SESSIONS_UPDATED'; sessions: SessionSummary[] }
  | { type: 'CONNECTION_STATUS'; status: 'connected' | 'connecting' | 'disconnected' }
  | { type: 'NAVIGATE'; screen: Screen }
  | { type: 'HIGHLIGHT_MOVE'; direction: 'up' | 'down' }
  | { type: 'SELECT_HIGHLIGHTED' }
  | { type: 'PRIMARY_ACTION' }
  | { type: 'ACTION_STARTED'; action: string; sessionId: string }
  | { type: 'ACTION_COMPLETED'; result: ActionResult }
  | { type: 'GO_BACK' }
  | { type: 'CLEAR_RESULT' }
  | { type: 'VOICE_START' }
  | { type: 'VOICE_INTERIM'; text: string }
  | { type: 'VOICE_FINAL'; text: string }
  | { type: 'VOICE_ERROR'; error: string }
  | { type: 'VOICE_CANCEL' }
  | { type: 'VOICE_CLEAR' }
  | { type: 'OUTPUT_LINE'; line: string }
  | { type: 'OUTPUT_SCROLL'; direction: 'up' | 'down' }
  | { type: 'TOGGLE_THINKING'; thinkingId: number }
  | { type: 'CHAT_HIGHLIGHT_MOVE'; direction: 'up' | 'down' }
  | { type: 'CHAT_TAP' };
