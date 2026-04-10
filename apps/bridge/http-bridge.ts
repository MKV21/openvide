/**
 * HTTPS + WebSocket bridge for the OpenVide daemon.
 * Zero external dependencies — uses node:https, node:http, node:net, node:crypto.
 *
 * Provides:
 *   - TLS-encrypted WebSocket for RPC + live output streaming
 *   - HTTPS health endpoint (GET /api/host)
 *   - Auth token validation on all requests
 *
 * Usage:
 *   npx tsx bridge/http-bridge.ts
 *   npx tsx bridge/http-bridge.ts --no-tls   # plain HTTP for local dev
 *
 * Env:
 *   BRIDGE_PORT  — listen port (default 7842)
 *   SOCKET_PATH  — daemon socket (default ~/.openvide-daemon/daemon.sock)
 *   BRIDGE_TOKEN — override auth token (default: auto-generated)
 */

import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { ensureCerts, printConnectionInfo } from './certs.js';

const PORT = parseInt(process.env.BRIDGE_PORT ?? '7842', 10);
const SOCKET_PATH =
  process.env.SOCKET_PATH ??
  path.join(os.homedir(), '.openvide-daemon', 'daemon.sock');
const SESSIONS_DIR = path.join(os.homedir(), '.openvide-daemon', 'sessions');
const NO_TLS = process.argv.includes('--no-tls');

// ── Auth & TLS Setup ──

let AUTH_TOKEN: string;
let tlsOptions: { cert: string; key: string } | null = null;

if (NO_TLS) {
  AUTH_TOKEN = process.env.BRIDGE_TOKEN ?? '';
  console.log('[bridge] Running in plain HTTP mode (--no-tls)');
} else {
  const certs = ensureCerts();
  AUTH_TOKEN = process.env.BRIDGE_TOKEN ?? certs.token;
  tlsOptions = { cert: certs.cert, key: certs.key };
}

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
  if (!AUTH_TOKEN) return true;
  const auth = req.headers.authorization ?? '';
  return auth === `Bearer ${AUTH_TOKEN}`;
}

function checkTokenParam(url: URL): boolean {
  if (!AUTH_TOKEN) return true;
  return url.searchParams.get('token') === AUTH_TOKEN;
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

    sock.setTimeout(30_000, () => {
      sock.destroy();
      reject(new Error('Daemon socket timeout'));
    });
  });
}

// ── WebSocket Implementation (RFC 6455, zero deps) ──

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-5AB5BE86B57E';

interface WsClient {
  socket: net.Socket;
  id: string;
  subscriptions: Map<string, ReturnType<typeof setInterval>>;
  alive: boolean;
}

const clients = new Map<string, WsClient>();

function acceptWebSocket(
  req: http.IncomingMessage,
  socket: net.Socket,
  head: Buffer,
): WsClient | null {
  const wsKey = req.headers['sec-websocket-key'];
  if (!wsKey) return null;

  const acceptHash = crypto
    .createHash('sha1')
    .update(wsKey + WS_MAGIC)
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptHash}\r\n` +
    '\r\n',
  );

  const clientId = crypto.randomUUID();
  const client: WsClient = {
    socket,
    id: clientId,
    subscriptions: new Map(),
    alive: true,
  };

  clients.set(clientId, client);

  // Process any data in the head buffer
  if (head.length > 0) {
    handleWsData(client, head);
  }

  // Set up data handler
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    buffer = processWsFrames(client, buffer);
  });

  socket.on('close', () => cleanupClient(client));
  socket.on('error', () => cleanupClient(client));

  console.log(`[ws] Client connected: ${clientId}`);
  return client;
}

function processWsFrames(client: WsClient, buffer: Buffer): Buffer {
  while (buffer.length >= 2) {
    const firstByte = buffer[0];
    const secondByte = buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (buffer.length < 4) break;
      payloadLen = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (buffer.length < 10) break;
      payloadLen = Number(buffer.readBigUInt64BE(2));
      offset = 10;
    }

    const maskSize = masked ? 4 : 0;
    const totalLen = offset + maskSize + payloadLen;
    if (buffer.length < totalLen) break;

    let payload = buffer.subarray(offset + maskSize, totalLen);

    if (masked) {
      const mask = buffer.subarray(offset, offset + 4);
      payload = Buffer.from(payload); // copy so we can mutate
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    }

    buffer = buffer.subarray(totalLen);

    // Handle opcodes
    if (opcode === 0x08) {
      // Close frame
      sendWsFrame(client, Buffer.alloc(0), 0x08);
      client.socket.end();
      cleanupClient(client);
      return Buffer.alloc(0);
    } else if (opcode === 0x09) {
      // Ping → Pong
      sendWsFrame(client, payload, 0x0a);
    } else if (opcode === 0x0a) {
      // Pong
      client.alive = true;
    } else if (opcode === 0x01) {
      // Text frame
      handleWsMessage(client, payload.toString('utf-8'));
    }
  }

  return buffer;
}

function sendWsFrame(client: WsClient, data: Buffer | string, opcode = 0x01): void {
  const payload = typeof data === 'string' ? Buffer.from(data) : data;
  const len = payload.length;
  let header: Buffer;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode; // FIN + opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  try {
    client.socket.write(Buffer.concat([header, payload]));
  } catch {
    cleanupClient(client);
  }
}

function sendWsJson(client: WsClient, data: unknown): void {
  sendWsFrame(client, JSON.stringify(data));
}

function cleanupClient(client: WsClient): void {
  if (!clients.has(client.id)) return;
  for (const [, interval] of client.subscriptions) {
    clearInterval(interval);
  }
  client.subscriptions.clear();
  clients.delete(client.id);
  console.log(`[ws] Client disconnected: ${client.id}, remaining: ${clients.size}`);
}

// ── WebSocket Message Handling ──

async function handleWsMessage(client: WsClient, raw: string): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendWsJson(client, { error: 'Invalid JSON' });
    return;
  }

  const id = msg.id as number | undefined;
  const cmd = msg.cmd as string | undefined;

  if (!cmd) {
    sendWsJson(client, { id, ok: false, error: 'Missing "cmd"' });
    return;
  }

  // Subscribe to live output
  if (cmd === 'subscribe') {
    const sessionId = msg.sessionId as string;
    if (!sessionId) {
      sendWsJson(client, { id, ok: false, error: 'Missing sessionId' });
      return;
    }
    subscribeOutput(client, sessionId);
    sendWsJson(client, { id, ok: true });
    return;
  }

  // Unsubscribe from live output
  if (cmd === 'unsubscribe') {
    const sessionId = msg.sessionId as string;
    if (!sessionId) {
      sendWsJson(client, { id, ok: false, error: 'Missing sessionId' });
      return;
    }
    unsubscribeOutput(client, sessionId);
    sendWsJson(client, { id, ok: true });
    return;
  }

  // Regular RPC → forward to daemon
  try {
    const { cmd: _cmd, id: _id, ...params } = msg;
    const result = await sendToSocket({ cmd, ...params });
    sendWsJson(client, { id, ...(result as Record<string, unknown>) });
  } catch (err: any) {
    const errMsg = err?.code === 'ENOENT'
      ? 'Daemon not running (socket not found)'
      : err?.code === 'ECONNREFUSED'
        ? 'Daemon not accepting connections'
        : err?.message ?? 'Bridge error';
    sendWsJson(client, { id, ok: false, error: errMsg });
  }
}

function handleWsData(client: WsClient, data: Buffer): void {
  // Initial data from head buffer — process as frames
  processWsFrames(client, data);
}

// ── Output Subscription (file polling) ──

function subscribeOutput(client: WsClient, sessionId: string): void {
  // Clean up existing subscription for this session
  unsubscribeOutput(client, sessionId);

  const outputPath = path.join(SESSIONS_DIR, sessionId, 'output.jsonl');
  let byteOffset = 0;

  // Send existing lines first
  try {
    if (fs.existsSync(outputPath)) {
      const existing = fs.readFileSync(outputPath, 'utf-8');
      byteOffset = Buffer.byteLength(existing, 'utf-8');
      const lines = existing.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        sendWsJson(client, { type: 'output', sessionId, line });
      }
    }
  } catch {
    // File might not exist yet
  }

  // Poll for new lines (250ms)
  const interval = setInterval(() => {
    if (!clients.has(client.id)) {
      clearInterval(interval);
      return;
    }
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
          sendWsJson(client, { type: 'output', sessionId, line });
        }
      }
    } catch {
      // File may have been removed
    }
  }, 250);

  client.subscriptions.set(sessionId, interval);
  console.log(`[ws] Client ${client.id} subscribed to session ${sessionId}`);
}

function unsubscribeOutput(client: WsClient, sessionId: string): void {
  const existing = client.subscriptions.get(sessionId);
  if (existing) {
    clearInterval(existing);
    client.subscriptions.delete(sessionId);
    console.log(`[ws] Client ${client.id} unsubscribed from session ${sessionId}`);
  }
}

// ── Keepalive Ping ──

setInterval(() => {
  for (const [, client] of clients) {
    if (!client.alive) {
      client.socket.destroy();
      cleanupClient(client);
      continue;
    }
    client.alive = false;
    sendWsJson(client, { type: 'ping' });
  }
}, 30_000);

// ── HTTP(S) Server ──

const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Host info / health — check Bearer token or query param
  if (url.pathname === '/api/host' && req.method === 'GET') {
    if (!checkAuth(req) && !checkTokenParam(url)) {
      json(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    json(res, 200, {
      ok: true,
      name: os.hostname(),
      version: '2.0.0',
      tls: !NO_TLS,
      ws: true,
    });
    return;
  }

  // Legacy RPC endpoint (backward compatibility)
  if (url.pathname === '/api/rpc' && req.method === 'POST') {
    if (!checkAuth(req)) {
      json(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (!parsed.cmd) {
        json(res, 400, { ok: false, error: 'Missing "cmd" field' });
        return;
      }
      const { cmd, ...params } = parsed;
      const result = await sendToSocket({ cmd, ...params });
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

  // Legacy SSE stream (backward compatibility)
  const streamMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/stream$/);
  if (streamMatch && req.method === 'GET') {
    if (!checkAuth(req) && !checkTokenParam(url)) {
      json(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    streamSessionOutputSSE(streamMatch[1], res);
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
};

// Legacy SSE streaming (kept for backward compat)
function streamSessionOutputSSE(sessionId: string, res: http.ServerResponse): void {
  const outputPath = path.join(SESSIONS_DIR, sessionId, 'output.jsonl');

  cors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

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
  } catch { /* ignore */ }

  let watching = true;
  const pollInterval = setInterval(() => {
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
    } catch { /* ignore */ }
  }, 250);

  res.on('close', () => {
    watching = false;
    clearInterval(pollInterval);
  });
}

// ── WebSocket Upgrade Handler ──

function handleUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const from = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[ws] Upgrade request: ${url.pathname}${url.search} from ${from}`);

  if (url.pathname !== '/ws') {
    console.log(`[ws] Rejected: wrong path ${url.pathname}`);
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!checkTokenParam(url)) {
    console.log(`[ws] Rejected: bad token`);
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  console.log(`[ws] Accepting upgrade from ${from}, total clients: ${clients.size + 1}`);
  acceptWebSocket(req, socket, head);
}

// ── Start Server ──

let server: http.Server | https.Server;

if (NO_TLS) {
  server = http.createServer(requestHandler);
} else {
  server = https.createServer(
    { cert: tlsOptions!.cert, key: tlsOptions!.key },
    requestHandler,
  );
}

server.on('upgrade', handleUpgrade);

server.listen(PORT, '::', () => {
  const proto = NO_TLS ? 'HTTP' : 'HTTPS';
  console.log(`[bridge] ${proto}+WebSocket bridge listening on :${PORT}`);
  console.log(`[bridge] Socket: ${SOCKET_PATH}`);

  if (AUTH_TOKEN) {
    console.log(`[bridge] Auth: token required`);
    console.log(`[bridge] Token: ${AUTH_TOKEN}`);
  }

  if (!NO_TLS) {
    // Get local IP for connection info
    const ifaces = os.networkInterfaces();
    let localIp = 'localhost';
    for (const [, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          localIp = addr.address;
          break;
        }
      }
      if (localIp !== 'localhost') break;
    }
    printConnectionInfo(localIp, PORT, AUTH_TOKEN);
  }
});
