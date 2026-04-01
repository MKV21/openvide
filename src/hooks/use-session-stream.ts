import { useState, useEffect, useRef } from 'react';
import { subscribe } from '@/domain/daemon-client';
import { parseOutputLine } from '@/domain/output-parser';
import { useBridge } from '../contexts/bridge';
import type { ChatMessage, WebSession } from '../types';

function canReuseTimestamp(previous: ChatMessage | undefined, next: ChatMessage): boolean {
  if (!previous || previous.role !== next.role) return false;
  const previousThinking = previous.thinking ?? '';
  const nextThinking = next.thinking ?? '';
  return (
    (next.content === previous.content || next.content.startsWith(previous.content))
    && (nextThinking === previousThinking || nextThinking.startsWith(previousThinking))
  );
}

function sameMessages(current: ChatMessage[], next: ChatMessage[]): boolean {
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    const left = current[i];
    const right = next[i];
    if (!left || !right) return false;
    if (
      left.role !== right.role
      || left.content !== right.content
      || left.thinking !== right.thinking
      || left.isStreaming !== right.isStreaming
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Subscribes to a session's output stream and builds chat messages.
 *
 * The bridge sends ALL existing output lines on subscribe (full replay),
 * then tails new lines. To prevent duplicates:
 * - We batch incoming lines with a 100ms debounce
 * - On each batch, we rebuild messages from ALL accumulated raw lines
 * - This means re-subscribes just re-deliver the same lines → same result
 */
export function useSessionStream(sessionId: string | undefined, sessions?: WebSession[]) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { ensureBridgeForSession } = useBridge();
  const allRawLinesRef = useRef<string[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestMessagesRef = useRef<ChatMessage[]>([]);

  // Ensure bridge is set for this session's host
  useEffect(() => {
    if (sessionId && sessions) ensureBridgeForSession(sessionId, sessions);
  }, [sessionId, sessions, ensureBridgeForSession]);

  // Subscribe to output stream
  useEffect(() => {
    if (!sessionId) return;

    setMessages([]);
    latestMessagesRef.current = [];
    allRawLinesRef.current = [];

    function rebuildMessages() {
      const allParsed: string[] = [];
      for (const raw of allRawLinesRef.current) {
        const lines = parseOutputLine(raw);
        allParsed.push(...lines);
      }

      const built: ChatMessage[] = [];

      for (const line of allParsed) {
        if (line.startsWith('\u00a7P\u00a7')) {
          built.push({ role: 'user', content: line.slice(3), timestamp: Date.now() });
          continue;
        }

        if (line.startsWith('\u00a7TH\u00a7')) {
          const rest = line.slice(4);
          const sepIdx = rest.indexOf('\u00a7');
          const summary = sepIdx >= 0 ? rest.slice(sepIdx + 1) : rest;
          const last = built[built.length - 1];
          if (last && last.role === 'assistant' && !last.content) {
            last.thinking = (last.thinking ? last.thinking + '\n' : '') + summary;
          } else {
            built.push({ role: 'assistant', content: '', timestamp: Date.now(), thinking: summary });
          }
          continue;
        }

        if (line.startsWith('\u00a7TB\u00a7')) {
          const rest = line.slice(4);
          const sepIdx = rest.indexOf('\u00a7');
          const bodyText = sepIdx >= 0 ? rest.slice(sepIdx + 1) : rest;
          const last = built[built.length - 1];
          if (last && last.role === 'assistant') {
            last.thinking = (last.thinking ? last.thinking + '\n' : '') + bodyText;
          } else {
            built.push({ role: 'assistant', content: '', timestamp: Date.now(), thinking: bodyText });
          }
          continue;
        }

        if (line.startsWith('>> ')) {
          const last = built[built.length - 1];
          if (last && last.role === 'assistant') {
            last.content += '\n' + line;
          } else {
            built.push({ role: 'assistant', content: line, timestamp: Date.now() });
          }
          continue;
        }

        const last = built[built.length - 1];
        if (last && last.role === 'assistant') {
          last.content += '\n' + line;
        } else {
          built.push({ role: 'assistant', content: line, timestamp: Date.now(), isStreaming: true });
        }
      }

      const previousMessages = latestMessagesRef.current;
      const stabilized = built.map((message, index) => {
        const previous = previousMessages[index];
        if (canReuseTimestamp(previous, message)) {
          return { ...message, timestamp: previous.timestamp };
        }
        return message;
      });

      if (sameMessages(previousMessages, stabilized)) return;

      latestMessagesRef.current = stabilized;
      setMessages(stabilized);
    }

    // Deduplicate: track raw lines by content to handle replays
    const seenLines = new Set<string>();

    const unsub = subscribe(sessionId, (rawLine: string) => {
      // Skip exact duplicate raw lines (replay protection)
      if (seenLines.has(rawLine)) return;
      seenLines.add(rawLine);

      allRawLinesRef.current.push(rawLine);

      // Debounce rebuild — batch lines arriving within 100ms
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      batchTimerRef.current = setTimeout(rebuildMessages, 100);
    });

    return () => {
      unsub();
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return messages;
}
