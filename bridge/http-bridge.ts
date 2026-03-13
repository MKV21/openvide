/**
 * HTTP-to-IPC bridge for the OpenVide daemon.
 * Zero dependencies — uses only node:http and node:net.
 *
 * Proxies JSON-RPC requests from the G2 WebView to the daemon's Unix socket.
 * Also provides SSE streaming for live session output.
 *
 * Usage:
 *   npx tsx bridge/http-bridge.ts
 *   # or after compile: node bridge/http-bridge.js
 *
 * Env:
 *   BRIDGE_PORT  — HTTP port (default 7842)
 *   SOCKET_PATH  — daemon socket (default ~/.openvide-daemon/daemon.sock)
 *   BRIDGE_TOKEN — optional bearer token for auth
 */

import * as http from 'node:http';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';

const PORT = parseInt(process.env.BRIDGE_PORT ?? '7842', 10);
const SOCKET_PATH =
  process.env.SOCKET_PATH ??
  path.join(os.homedir(), '.openvide-daemon', 'daemon.sock');
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const SESSIONS_DIR = path.join(os.homedir(), '.openvide-daemon', 'sessions');

// ── Helpers ──

function cors(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function checkAuth(req: http.IncomingMessage): boolean {
  if (!TOKEN) return true;
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${TOKEN}`;
}

// ── Daemon IPC ──

function sendToSocket(payload: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(SOCKET_PATH, () => {
      sock.write(JSON.stringify(payload) + '\n');
    });

    let data = '';
    sock.on('data', (chunk) => {
      data += chunk.toString();
    });
    sock.on('end', () => {
      try {
        resolve(JSON.parse(data.trim()));
      } catch {
        reject(new Error('Invalid JSON from daemon'));
      }
    });
    sock.on('error', (err) => reject(err));

    // Timeout after 30s
    sock.setTimeout(30_000, () => {
      sock.destroy();
      reject(new Error('Daemon socket timeout'));
    });
  });
}

// ── SSE Stream for session output ──

function streamSessionOutput(
  sessionId: string,
  res: http.ServerResponse,
): void {
  const outputPath = path.join(SESSIONS_DIR, sessionId, 'output.jsonl');

  cors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send existing lines first
  let byteOffset = 0;
  try {
    if (fs.existsSync(outputPath)) {
      const existing = fs.readFileSync(outputPath, 'utf-8');
      byteOffset = Buffer.byteLength(existing, 'utf-8');
      const lines = existing.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        res.write(`data: ${line}\n\n`);
      }
    }
  } catch {
    // File might not exist yet
  }

  // Watch for new lines
  let watching = true;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const checkNewLines = (): void => {
    if (!watching) return;
    try {
      const stat = fs.statSync(outputPath);
      if (stat.size > byteOffset) {
        const fd = fs.openSync(outputPath, 'r');
        const buf = Buffer.alloc(stat.size - byteOffset);
        fs.readSync(fd, buf, 0, buf.length, byteOffset);
        fs.closeSync(fd);
        byteOffset = stat.size;

        const newData = buf.toString('utf-8');
        const lines = newData.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          res.write(`data: ${line}\n\n`);
        }
      }
    } catch {
      // File may have been removed
    }
  };

  // Use polling (250ms) — more reliable than fs.watch across platforms
  pollInterval = setInterval(checkNewLines, 250);

  res.on('close', () => {
    watching = false;
    if (pollInterval) clearInterval(pollInterval);
  });
}

// ── HTTP Server ──

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (!checkAuth(req)) {
    json(res, 401, { ok: false, error: 'Unauthorized' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // SSE stream endpoint: GET /api/sessions/:id/stream
  const streamMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/stream$/);
  if (streamMatch && req.method === 'GET') {
    streamSessionOutput(streamMatch[1], res);
    return;
  }

  // RPC endpoint: POST /api/rpc
  if (url.pathname === '/api/rpc' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);

      if (!parsed.cmd) {
        json(res, 400, { ok: false, error: 'Missing "cmd" field' });
        return;
      }

      // Build IPC payload — cmd becomes the command, rest are params
      const { cmd, ...params } = parsed;
      const ipcPayload = { cmd, ...params };

      const result = await sendToSocket(ipcPayload);
      json(res, 200, result);
    } catch (err: any) {
      const msg = err?.code === 'ENOENT'
        ? 'Daemon not running (socket not found)'
        : err?.code === 'ECONNREFUSED'
          ? 'Daemon not accepting connections'
          : err?.message ?? 'Bridge error';
      json(res, 502, { ok: false, error: msg });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[bridge] HTTP bridge listening on :${PORT}`);
  console.log(`[bridge] Socket: ${SOCKET_PATH}`);
  if (TOKEN) console.log(`[bridge] Auth: bearer token required`);
});
