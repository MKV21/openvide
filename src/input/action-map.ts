/**
 * Maps Even Hub SDK events to app actions.
 * Follows Solitaire's proven pattern: direct eventType check with null→click fallback.
 */

import type {
  EvenHubEvent,
  List_ItemEvent,
  Text_ItemEvent,
  Sys_ItemEvent,
} from '@evenrealities/even_hub_sdk';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';
import type { AppState } from '../state/types';
import type { Action } from '../state/actions';
import { tryConsumeTap, isScrollSuppressed, isScrollDebounced } from './gestures';

export function mapEvenHubEvent(event: EvenHubEvent, state: AppState): Action | null {
  if (!event) return null;
  try {
    if (event.listEvent) return mapListEvent(event.listEvent, state);
    if (event.textEvent) return mapTextEvent(event.textEvent, state);
    if (event.sysEvent) return mapSysEvent(event.sysEvent, state);
    return null;
  } catch (err) {
    console.error('[action-map] Error processing event:', err);
    return null;
  }
}

// ── List event ──

function mapListEvent(event: List_ItemEvent, state: AppState): Action | null {
  const et = event.eventType;
  switch (et) {
    case OsEventTypeList.CLICK_EVENT:
      if (!tryConsumeTap('tap')) return null;
      return tapAction(state);
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      if (!tryConsumeTap('double')) return null;
      return doubleTapAction(state);
    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (isScrollDebounced('prev') || isScrollSuppressed()) return null;
      return scrollAction(state, 'prev');
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (isScrollDebounced('next') || isScrollSuppressed()) return null;
      return scrollAction(state, 'next');
    default:
      if (event.currentSelectItemIndex != null && (et === undefined || (et as number) === 0)) {
        if (!tryConsumeTap('tap')) return null;
        return tapAction(state);
      }
      return null;
  }
}

// ── Text event ──

function mapTextEvent(event: Text_ItemEvent, state: AppState): Action | null {
  const et = event.eventType;
  switch (et) {
    case OsEventTypeList.CLICK_EVENT:
      if (!tryConsumeTap('tap')) return null;
      return tapAction(state);
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      if (!tryConsumeTap('double')) return null;
      return doubleTapAction(state);
    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (isScrollDebounced('prev') || isScrollSuppressed()) return null;
      return scrollAction(state, 'prev');
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (isScrollDebounced('next') || isScrollSuppressed()) return null;
      return scrollAction(state, 'next');
    default:
      if (et == null) {
        if (!tryConsumeTap('tap')) return null;
        return tapAction(state);
      }
      return null;
  }
}

// ── System event ──

function mapSysEvent(event: Sys_ItemEvent, state: AppState): Action | null {
  const et = event.eventType;
  switch (et) {
    case OsEventTypeList.CLICK_EVENT:
      if (!tryConsumeTap('tap')) return null;
      return tapAction(state);
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      if (!tryConsumeTap('double')) return null;
      return doubleTapAction(state);
    case OsEventTypeList.SCROLL_TOP_EVENT:
      if (isScrollDebounced('prev') || isScrollSuppressed()) return null;
      return scrollAction(state, 'prev');
    case OsEventTypeList.SCROLL_BOTTOM_EVENT:
      if (isScrollDebounced('next') || isScrollSuppressed()) return null;
      return scrollAction(state, 'next');
    default:
      if (et == null) {
        if (!tryConsumeTap('tap')) return null;
        return tapAction(state);
      }
      return null;
  }
}

// ── Tap (single click) ──

function tapAction(state: AppState): Action | null {
  switch (state.screen) {
    case 'home':
      if (state.sessions.length > 0) return { type: 'NAVIGATE', screen: 'session-list' };
      return null;

    case 'session-list':
      return { type: 'SELECT_HIGHLIGHTED' };

    case 'session-detail':
      return { type: 'PRIMARY_ACTION' };

    case 'action-result':
      return { type: 'CLEAR_RESULT' };

    case 'live-output':
      return { type: 'CHAT_TAP' };

    // voice-input: no tap action (auto-listening, auto-sends)
    default:
      return null;
  }
}

// ── Double tap — go back ──

function doubleTapAction(_state: AppState): Action | null {
  return { type: 'GO_BACK' };
}

// ── Scroll ──

function scrollAction(state: AppState, direction: 'prev' | 'next'): Action | null {
  switch (state.screen) {
    case 'session-list':
    case 'session-detail':
    case 'live-output':
      return { type: 'HIGHLIGHT_MOVE', direction: direction === 'prev' ? 'up' : 'down' };

    default:
      return null;
  }
}
