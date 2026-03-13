/**
 * SSE/fetch streaming client for live session output.
 * Parses raw JSONL from Claude/Codex into human-readable lines.
 */

import type { Store } from '../state/store';
import { getStreamUrl } from './daemon-client';
import { parseOutputLine } from './output-parser';

let activeSource: EventSource | null = null;

export function startOutputStream(store: Store, sessionId: string): void {
  stopOutputStream();

  const url = getStreamUrl(sessionId);
  console.log('[output-stream] Connecting to', url);

  const source = new EventSource(url);
  activeSource = source;

  // Coalesce renders: batch lines arriving within 100ms
  let pending: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    const batch = pending;
    pending = [];
    flushTimer = null;
    for (const line of batch) {
      store.dispatch({ type: 'OUTPUT_LINE', line });
    }
  }

  function enqueue(lines: string[]): void {
    if (lines.length === 0) return;
    pending.push(...lines);
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 100);
    }
  }

  source.onmessage = (event) => {
    // Parse the raw JSONL into human-readable lines
    const readable = parseOutputLine(event.data);
    enqueue(readable);
  };

  source.onerror = () => {
    console.warn('[output-stream] Connection error, will retry');
  };
}

export function stopOutputStream(): void {
  if (activeSource) {
    activeSource.close();
    activeSource = null;
    console.log('[output-stream] Stopped');
  }
}
