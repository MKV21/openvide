// ── Session Types ──

export type Tool = 'claude' | 'codex' | 'gemini';

export type SessionStatus = 'idle' | 'running' | 'failed' | 'cancelled' | 'interrupted';

export interface SessionSummary {
  id: string;
  tool: Tool;
  status: SessionStatus;
  workingDirectory: string;
  model?: string;
  lastPrompt?: string;
  lastError?: string;
  updatedAt: string;
  outputLines: number;
}

// ── Action Result ──

export interface ActionResult {
  action: string;
  sessionId: string;
  success: boolean;
  message: string;
}

// ── Screen Types ──

export type Screen =
  | 'home'
  | 'session-list'
  | 'session-detail'
  | 'voice-input'
  | 'live-output'
  | 'action-result';

// ── App State ──

export interface AppState {
  screen: Screen;
  sessions: SessionSummary[];
  highlightedIndex: number;
  selectedSessionId: string | null;
  pendingResult: ActionResult | null;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  // Voice input
  voiceText: string | null;
  voiceListening: boolean;
  // Live output / chat
  outputLines: string[];
  outputScrollOffset: number;
  chatHighlight: number;          // highlighted row in chat (for scrolling)
  expandedThinking: number[];     // IDs of expanded thinking blocks
}
