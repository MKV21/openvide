/**
 * Keyboard bindings for browser testing.
 *
 * Enter/Space = Click (tap)
 * Escape      = Double Click (go back)
 * ArrowUp     = Scroll Up
 * ArrowDown   = Scroll Down
 */

import type { Store } from '../state/store';
import type { Action } from '../state/actions';

export function bindKeyboard(store: Store, handleAction: (action: Action) => void): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.repeat) return;

    const state = store.getState();

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        switch (state.screen) {
          case 'home':
            if (state.sessions.length > 0) handleAction({ type: 'NAVIGATE', screen: 'session-list' });
            break;
          case 'session-list':
            handleAction({ type: 'SELECT_HIGHLIGHTED' });
            break;
          case 'session-detail':
            handleAction({ type: 'PRIMARY_ACTION' });
            break;
          case 'action-result':
            handleAction({ type: 'CLEAR_RESULT' });
            break;
          case 'live-output':
            handleAction({ type: 'CHAT_TAP' });
            break;
        }
        break;

      case 'Escape':
        handleAction({ type: 'GO_BACK' });
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (state.screen === 'session-list' || state.screen === 'session-detail' || state.screen === 'live-output') {
          handleAction({ type: 'HIGHLIGHT_MOVE', direction: 'up' });
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (state.screen === 'session-list' || state.screen === 'session-detail' || state.screen === 'live-output') {
          handleAction({ type: 'HIGHLIGHT_MOVE', direction: 'down' });
        }
        break;
    }
  });
}
