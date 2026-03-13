/**
 * Parses raw JSONL output from Claude/Codex/Gemini CLIs
 * into human-readable lines for the glasses display.
 *
 * Thinking blocks use special prefixes:
 *   §TH§<id>§<summary>   — thinking header (collapsible)
 *   §TB§<id>§<line>       — thinking body line
 */

let thinkingCounter = 0;

/** Reset thinking counter (e.g. when entering a new session). */
export function resetThinkingCounter(): void {
  thinkingCounter = 0;
}

// Prefix constants
export const THINK_HEADER = '§TH§';
export const THINK_BODY = '§TB§';

export function isThinkingHeader(line: string): boolean {
  return line.startsWith(THINK_HEADER);
}

export function isThinkingBody(line: string): boolean {
  return line.startsWith(THINK_BODY);
}

export function parseThinkingHeader(line: string): { id: number; summary: string } | null {
  if (!line.startsWith(THINK_HEADER)) return null;
  const rest = line.slice(THINK_HEADER.length);
  const sepIdx = rest.indexOf('§');
  if (sepIdx < 0) return null;
  return { id: parseInt(rest.slice(0, sepIdx), 10), summary: rest.slice(sepIdx + 1) };
}

export function parseThinkingBody(line: string): { id: number; text: string } | null {
  if (!line.startsWith(THINK_BODY)) return null;
  const rest = line.slice(THINK_BODY.length);
  const sepIdx = rest.indexOf('§');
  if (sepIdx < 0) return null;
  return { id: parseInt(rest.slice(0, sepIdx), 10), text: rest.slice(sepIdx + 1) };
}

/**
 * Parse a single SSE data line and return display lines.
 */
export function parseOutputLine(raw: string): string[] {
  try {
    const wrapper = JSON.parse(raw);
    return parseWrapper(wrapper);
  } catch {
    return raw.trim() ? [raw.trim()] : [];
  }
}

function parseWrapper(wrapper: any): string[] {
  if (!wrapper) return [];
  if (wrapper.t === 'm') return parseMeta(wrapper);
  if (wrapper.t === 'e') {
    const line = wrapper.line?.trim();
    return line ? [`! ${line}`] : [];
  }
  if (wrapper.t === 'o') return parseCliLine(wrapper.line);
  return [];
}

function parseMeta(wrapper: any): string[] {
  switch (wrapper.event) {
    case 'turn_start': {
      const prompt = wrapper.prompt;
      return prompt ? [`§P§${prompt}`] : [];
    }
    case 'turn_end':
      return [];
    case 'error':
      return [`! ${wrapper.error ?? 'Unknown error'}`];
    default:
      return [];
  }
}

function parseCliLine(lineStr: string): string[] {
  if (!lineStr) return [];
  try {
    const obj = JSON.parse(lineStr);
    return parseCliObject(obj);
  } catch {
    const trimmed = lineStr.trim();
    return trimmed ? [trimmed] : [];
  }
}

function parseCliObject(obj: any): string[] {
  if (!obj || !obj.type) return [];

  if (obj.type === 'system' && obj.subtype === 'init') {
    return [];
  }

  if (obj.type === 'assistant' && obj.message) {
    return parseAssistantMessage(obj.message);
  }

  if (obj.type === 'result') return [];
  if (obj.type === 'rate_limit_event') return [];

  // Codex
  if (obj.type === 'thread.started') return [];
  if (obj.type === 'turn.started') return [];

  if (obj.type === 'item.completed' && obj.item) {
    return parseCodexItem(obj.item);
  }

  if (obj.type === 'turn.completed') return [];

  // Gemini
  if (obj.type === 'text' && obj.text) {
    return splitIntoLines(obj.text);
  }

  return [];
}

function parseAssistantMessage(message: any): string[] {
  if (!message?.content || !Array.isArray(message.content)) return [];

  const lines: string[] = [];

  for (const block of message.content) {
    if (block.type === 'text' && block.text) {
      lines.push(...splitIntoLines(block.text));
    } else if (block.type === 'thinking' && block.thinking) {
      const id = thinkingCounter++;
      const thinkLines = splitIntoLines(block.thinking);
      // First line as summary for the header
      const summary = thinkLines[0] ?? 'Thinking...';
      lines.push(`${THINK_HEADER}${id}§${summary}`);
      for (let i = 1; i < thinkLines.length; i++) {
        lines.push(`${THINK_BODY}${id}§${thinkLines[i]}`);
      }
    } else if (block.type === 'tool_use') {
      const name = block.name ?? 'tool';
      const input = block.input;
      let detail = '';
      if (input?.file_path) detail = ` ${input.file_path}`;
      else if (input?.command) detail = ` ${input.command}`;
      else if (input?.pattern) detail = ` ${input.pattern}`;
      else if (input?.query) detail = ` ${input.query}`;
      lines.push(`>> ${name}${detail}`);
    }
  }

  return lines;
}

function parseCodexItem(item: any): string[] {
  if (item.type === 'agent_message' && item.text) {
    return splitIntoLines(item.text);
  }
  if (item.type === 'reasoning' && item.text) {
    const id = thinkingCounter++;
    const thinkLines = splitIntoLines(item.text);
    const summary = thinkLines[0] ?? 'Reasoning...';
    const result: string[] = [`${THINK_HEADER}${id}§${summary}`];
    for (let i = 1; i < thinkLines.length; i++) {
      result.push(`${THINK_BODY}${id}§${thinkLines[i]}`);
    }
    return result;
  }
  if (item.type === 'tool_call') {
    return [`>> ${item.name ?? 'tool'}`];
  }
  return [];
}

function splitIntoLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}
