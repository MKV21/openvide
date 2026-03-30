/**
 * OpenAI-compatible /v1/chat/completions handler.
 * Wraps daemon sessions in OpenAI format for Even AI custom host.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { routeCommand } from "./ipc.js";
import { readOutputLines } from "./outputStore.js";
import { createToolParseContext, parseToolLine } from "./normalizedParser.js";
import { daemonDir, log, logError } from "./utils.js";
import type { BridgeConfig, Tool } from "./types.js";

const SESSIONS_DIR = path.join(daemonDir(), "sessions");

// ── Session routing ──

async function resolveSession(
  tool: Tool,
  config: BridgeConfig,
): Promise<string> {
  const mode = config.evenAiMode ?? "last";
  const cwd = config.defaultCwd ?? os.homedir();

  if (mode === "pinned" && config.evenAiPinnedSessionId) {
    // Check if pinned session exists
    const getRes = await routeCommand({ cmd: "session.get", id: config.evenAiPinnedSessionId });
    if (getRes.ok && getRes.session?.tool === tool) {
      return config.evenAiPinnedSessionId;
    }
    // Pinned session gone, fall through to create new
  }

  if (mode === "last" && config.currentEvenAiSessionId) {
    // Check if last session exists
    const getRes = await routeCommand({ cmd: "session.get", id: config.currentEvenAiSessionId });
    if (getRes.ok && getRes.session?.tool === tool) {
      return config.currentEvenAiSessionId;
    }
    // Last session gone, fall through to create new
  }

  // Create new session
  const createRes = await routeCommand({
    cmd: "session.create",
    tool,
    cwd,
    autoAccept: true,
  });

  if (!createRes.ok || !createRes.session) {
    throw new Error(createRes.error ?? "Failed to create session");
  }

  return createRes.session.id;
}

async function persistCurrentEvenAiSession(
  config: BridgeConfig,
  sessionId: string,
): Promise<void> {
  config.currentEvenAiSessionId = sessionId;
  await routeCommand({ cmd: "bridge.config", currentEvenAiSessionId: sessionId });
}

/** Extract the last user message from OpenAI-format messages array. */
function extractPrompt(messages: unknown[]): string {
  // Walk messages in reverse to find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role === "user" && typeof msg.content === "string") {
      return msg.content;
    }
  }
  // Fallback: concatenate all user messages
  const userMessages = messages
    .filter((m) => (m as Record<string, unknown>).role === "user")
    .map((m) => (m as Record<string, unknown>).content as string)
    .filter((c) => typeof c === "string");
  return userMessages.join("\n");
}

/**
 * Extract text content from the LAST turn only.
 * Walks output.jsonl backwards from the last turn_start meta event.
 */
function extractTextFromLastTurn(sessionId: string, tool: Tool): string {
  const lines = readOutputLines(sessionId, 0);

  // Find the last turn_start to know where the current turn begins
  let lastTurnStartIdx = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]!);
      if (entry.t === "m" && entry.event === "turn_start") {
        lastTurnStartIdx = i;
        break;
      }
    } catch {
      continue;
    }
  }

  const context = createToolParseContext(tool);
  const textParts: string[] = [];

  // Only process lines from the last turn
  for (let i = lastTurnStartIdx; i < lines.length; i++) {
    let outputEntry: Record<string, unknown>;
    try {
      outputEntry = JSON.parse(lines[i]!);
    } catch {
      continue;
    }

    // Only process stdout lines
    if (outputEntry.t !== "o" || typeof outputEntry.line !== "string") continue;

    const events = parseToolLine(tool, outputEntry.line, context);
    for (const event of events) {
      if (
        event.type === "content_block" &&
        event.block &&
        event.block.type === "text" &&
        "text" in event.block
      ) {
        textParts.push(event.block.text);
      }
    }
  }

  return textParts.join("");
}

// ── Non-streaming handler ──

export async function handleCompletions(
  body: Record<string, unknown>,
  config: BridgeConfig,
  tool: Tool,
): Promise<Record<string, unknown>> {
  const messages = body.messages as unknown[];
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      error: { message: "messages array is required", type: "invalid_request_error" },
    };
  }
  const prompt = extractPrompt(messages);

  if (!prompt) {
    return {
      error: { message: "No user message found", type: "invalid_request_error" },
    };
  }

  const sessionId = await resolveSession(tool, config);

  // Update current session tracking
  await persistCurrentEvenAiSession(config, sessionId);

  // Send the prompt
  const sendRes = await routeCommand({ cmd: "session.send", id: sessionId, prompt });
  if (!sendRes.ok) {
    throw new Error(sendRes.error ?? "Failed to send prompt");
  }

  // Wait for completion (5 min timeout for complex coding tasks)
  const waitRes = await routeCommand({ cmd: "session.wait_idle", id: sessionId, timeoutMs: 300000 });
  if (!waitRes.ok && !waitRes.timedOut) {
    throw new Error(waitRes.error ?? "Session error");
  }

  // Extract text from output
  const content = extractTextFromLastTurn(sessionId, tool);
  const created = Math.floor(Date.now() / 1000);

  return {
    id: `chatcmpl-${sessionId}`,
    object: "chat.completion",
    created,
    model: body.model ?? tool,
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: waitRes.timedOut ? "length" : "stop",
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// ── Streaming handler ──

export async function handleCompletionsStreaming(
  body: Record<string, unknown>,
  config: BridgeConfig,
  res: http.ServerResponse,
  tool: Tool,
): Promise<void> {
  const messages = body.messages as unknown[];
  if (!Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: { message: "messages array is required", type: "invalid_request_error" },
    }));
    return;
  }
  const prompt = extractPrompt(messages);

  if (!prompt) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: { message: "No user message found", type: "invalid_request_error" },
    }));
    return;
  }

  const sessionId = await resolveSession(tool, config);
  await persistCurrentEvenAiSession(config, sessionId);

  // Send the prompt
  const sendRes = await routeCommand({ cmd: "session.send", id: sessionId, prompt });
  if (!sendRes.ok) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: sendRes.error ?? "Failed to send prompt" } }));
    return;
  }

  // Set up SSE headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const completionId = `chatcmpl-${sessionId}`;
  const created = Math.floor(Date.now() / 1000);
  const model = (body.model as string) ?? tool;

  // Send initial role chunk
  const roleChunk = {
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: { role: "assistant" },
      finish_reason: null,
    }],
  };
  res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

  // Tail the output file for streaming
  const outputPath = path.join(SESSIONS_DIR, sessionId, "output.jsonl");
  const context = createToolParseContext(tool);
  let byteOffset = 0;
  let done = false;
  let sentContent = false;

  const sendChunk = (content: string) => {
    const chunk = {
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{
        index: 0,
        delta: { content },
        finish_reason: null,
      }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    sentContent = true;
  };

  const sendDone = (reason: string) => {
    const stopChunk = {
      id: completionId,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: reason,
      }],
    };
    res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  };

  // Send SSE keepalive comment every 15s to prevent connection timeout
  const keepalive = setInterval(() => {
    if (!done) {
      res.write(": keepalive\n\n");
    }
  }, 15_000);

  const processNewLines = () => {
    try {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(outputPath);
      } catch {
        return;
      }

      if (stat.size <= byteOffset) return;

      const fd = fs.openSync(outputPath, "r");
      const buf = Buffer.alloc(stat.size - byteOffset);
      fs.readSync(fd, buf, 0, buf.length, byteOffset);
      fs.closeSync(fd);

      const chunk = buf.toString("utf-8");
      // Only consume complete lines
      const lastNewline = chunk.lastIndexOf("\n");
      if (lastNewline === -1) return;

      const consumed = chunk.slice(0, lastNewline + 1);
      byteOffset += Buffer.byteLength(consumed, "utf-8");

      const rawLines = consumed.split("\n").filter(Boolean);

      for (const rawLine of rawLines) {
        let outputEntry: Record<string, unknown>;
        try {
          outputEntry = JSON.parse(rawLine);
        } catch {
          continue;
        }

        // Check for turn_end meta event
        if (outputEntry.t === "m" && outputEntry.event === "turn_end") {
          done = true;
          return;
        }

        // Only process stdout lines
        if (outputEntry.t !== "o" || typeof outputEntry.line !== "string") continue;

        const events = parseToolLine(tool, outputEntry.line, context);
        for (const event of events) {
          if (event.type === "content_block" && event.block) {
            if (event.block.type === "text" && "text" in event.block && event.block.text) {
              sendChunk(event.block.text);
            } else if (event.block.type === "tool_use" && "toolName" in event.block) {
              // Stream tool activity so the connection stays alive and user sees progress
              sendChunk(`[${event.block.toolName}] `);
            }
          }
        }
      }
    } catch (err: unknown) {
      logError("[completions:stream] Error processing lines:", err);
    }
  };

  // Poll for new output
  const pollInterval = setInterval(() => {
    processNewLines();
    if (done) {
      clearInterval(pollInterval);
      clearInterval(keepalive);
      sendDone("stop");
    }
  }, 100);

  // Timeout after 5 minutes (long tasks need more time)
  const timeout = setTimeout(() => {
    if (!done) {
      clearInterval(pollInterval);
      clearInterval(keepalive);
      done = true;
      sendDone("length");
    }
  }, 300_000);

  // Cleanup on client disconnect
  res.on("close", () => {
    clearInterval(pollInterval);
    clearInterval(keepalive);
    clearTimeout(timeout);
    done = true;
  });
}
