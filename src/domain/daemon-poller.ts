/**
 * Polls daemon for session list and dispatches updates.
 * Replaces simulator-feed.
 */

import type { Store } from '../state/store';
import type { SessionSummary } from '../state/types';
import { rpc, health } from './daemon-client';

let pollTimer: ReturnType<typeof setInterval> | null = null;

function mapSessions(raw: unknown[]): SessionSummary[] {
  return raw
    .map((s: any) => ({
      id: s.id,
      tool: s.tool,
      status: s.status,
      workingDirectory: s.workingDirectory,
      model: s.model,
      lastPrompt: s.lastTurn?.prompt,
      lastError: s.lastTurn?.error,
      updatedAt: s.updatedAt,
      outputLines: s.outputLines ?? 0,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

async function poll(store: Store): Promise<void> {
  try {
    const res = await rpc('session.list');
    if (res.ok && Array.isArray(res.sessions)) {
      store.dispatch({
        type: 'SESSIONS_UPDATED',
        sessions: mapSessions(res.sessions),
      });
      if (store.getState().connectionStatus !== 'connected') {
        store.dispatch({ type: 'CONNECTION_STATUS', status: 'connected' });
      }
    } else {
      if (store.getState().connectionStatus !== 'disconnected') {
        store.dispatch({ type: 'CONNECTION_STATUS', status: 'disconnected' });
      }
    }
  } catch {
    if (store.getState().connectionStatus !== 'disconnected') {
      store.dispatch({ type: 'CONNECTION_STATUS', status: 'disconnected' });
    }
  }
}

export function startPolling(store: Store, intervalMs = 2500): void {
  if (pollTimer) return;
  console.log('[poller] Starting daemon polling every', intervalMs, 'ms');

  // Initial poll
  poll(store);

  pollTimer = setInterval(() => poll(store), intervalMs);
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log('[poller] Stopped');
  }
}
