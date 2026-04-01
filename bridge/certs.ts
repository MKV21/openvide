/**
 * TLS certificate and auth token generation for the bridge.
 * Self-signed ECDSA cert + 32-byte random token.
 * Stored at ~/.openvide-daemon/bridge/
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

const BRIDGE_DIR = path.join(os.homedir(), '.openvide-daemon', 'bridge');
const CERT_PATH = path.join(BRIDGE_DIR, 'cert.pem');
const KEY_PATH = path.join(BRIDGE_DIR, 'key.pem');
const TOKEN_PATH = path.join(BRIDGE_DIR, 'token.txt');

export interface BridgeCerts {
  cert: string;
  key: string;
  token: string;
}

/** Generate a 32-byte hex auth token. */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function buildSubjectAltName(): string {
  const entries = new Set<string>(['DNS:localhost', 'IP:127.0.0.1']);
  const hostname = os.hostname().trim();
  if (hostname) {
    entries.add(`DNS:${hostname}`);
    const shortHost = hostname.split('.')[0];
    if (shortHost) entries.add(`DNS:${shortHost}`);
  }

  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal || addr.family !== 'IPv4') continue;
      entries.add(`IP:${addr.address}`);
    }
  }

  return Array.from(entries).join(',');
}

/**
 * Generate self-signed TLS cert + key using openssl CLI.
 * Node's crypto module doesn't have a high-level X.509 cert builder,
 * so we shell out to openssl which is available on macOS/Linux.
 */
function generateCert(): { cert: string; key: string } {
  const tmpKey = path.join(BRIDGE_DIR, 'key.tmp.pem');
  const tmpCert = path.join(BRIDGE_DIR, 'cert.tmp.pem');

  try {
    // Generate ECDSA key
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out "${tmpKey}"`,
      { stdio: 'pipe' },
    );

    // Generate self-signed cert (valid 10 years)
    execSync(
      `openssl req -new -x509 -key "${tmpKey}" -out "${tmpCert}" -days 3650 -subj "/CN=openvide-bridge" -addext "subjectAltName=${buildSubjectAltName()}"`,
      { stdio: 'pipe' },
    );

    const cert = fs.readFileSync(tmpCert, 'utf-8');
    const key = fs.readFileSync(tmpKey, 'utf-8');

    // Move to final location
    fs.renameSync(tmpKey, KEY_PATH);
    fs.renameSync(tmpCert, CERT_PATH);
    fs.chmodSync(KEY_PATH, 0o600);
    fs.chmodSync(CERT_PATH, 0o644);

    return { cert, key };
  } catch (err) {
    // Clean up temp files on error
    try { fs.unlinkSync(tmpKey); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpCert); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Ensure TLS certs and auth token exist. Generate on first run.
 * Returns the cert, key, and token.
 */
export function ensureCerts(): BridgeCerts {
  fs.mkdirSync(BRIDGE_DIR, { recursive: true });

  // Generate token if missing
  let token: string;
  if (fs.existsSync(TOKEN_PATH)) {
    token = fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
  } else {
    token = generateToken();
    fs.writeFileSync(TOKEN_PATH, token + '\n', { mode: 0o600 });
    console.log('[certs] Generated new auth token');
  }

  // Generate cert if missing
  let cert: string;
  let key: string;
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    cert = fs.readFileSync(CERT_PATH, 'utf-8');
    key = fs.readFileSync(KEY_PATH, 'utf-8');
  } else {
    console.log('[certs] Generating self-signed TLS certificate...');
    const generated = generateCert();
    cert = generated.cert;
    key = generated.key;
    console.log('[certs] TLS certificate generated');
  }

  return { cert, key, token };
}

/**
 * Get the connection URL for this bridge instance.
 */
export function getConnectionUrl(host: string, port: number, token: string): string {
  return `openvide://${host}:${port}?token=${token}`;
}

/**
 * Print ASCII QR-style connection info to terminal.
 */
export function printConnectionInfo(host: string, port: number, token: string): void {
  const wsUrl = `wss://${host}:${port}/ws?token=${token}`;
  const connectUrl = getConnectionUrl(host, port, token);

  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       OpenVide Bridge Connection         ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ WSS: ${wsUrl}`);
  console.log(`║ URL: ${connectUrl}`);
  console.log(`║ Token: ${token.slice(0, 8)}...${token.slice(-8)}`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}
