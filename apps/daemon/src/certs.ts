/**
 * TLS certificate generation for the bridge.
 * Self-signed ECDSA cert via openssl CLI.
 * Stored at ~/.openvide-daemon/bridge/
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { daemonDir, log } from "./utils.js";

const BRIDGE_DIR_NAME = "bridge";

function bridgeDir(): string {
  return path.join(daemonDir(), BRIDGE_DIR_NAME);
}

function certPath(): string {
  return path.join(bridgeDir(), "cert.pem");
}

function keyPath(): string {
  return path.join(bridgeDir(), "key.pem");
}

export interface BridgeTls {
  cert: string;
  key: string;
}

function buildSubjectAltName(): string {
  const entries = new Set<string>(["DNS:localhost", "IP:127.0.0.1"]);
  const hostname = os.hostname().trim();
  if (hostname) {
    entries.add(`DNS:${hostname}`);
    const shortHost = hostname.split(".")[0];
    if (shortHost) entries.add(`DNS:${shortHost}`);
  }

  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal || addr.family !== "IPv4") continue;
      entries.add(`IP:${addr.address}`);
    }
  }

  return Array.from(entries).join(",");
}

/**
 * Generate self-signed TLS cert + key using openssl CLI.
 */
function generateCert(): BridgeTls {
  const dir = bridgeDir();
  fs.mkdirSync(dir, { recursive: true });

  const tmpKey = path.join(dir, "key.tmp.pem");
  const tmpCert = path.join(dir, "cert.tmp.pem");

  try {
    execSync(
      `openssl ecparam -name prime256v1 -genkey -noout -out "${tmpKey}"`,
      { stdio: "pipe" },
    );

    const san = buildSubjectAltName();
    execSync(
      `openssl req -new -x509 -key "${tmpKey}" -out "${tmpCert}" -days 3650 -subj "/CN=openvide-bridge" -addext "subjectAltName=${san}"`,
      { stdio: "pipe" },
    );

    const cert = fs.readFileSync(tmpCert, "utf-8");
    const key = fs.readFileSync(tmpKey, "utf-8");

    fs.renameSync(tmpKey, keyPath());
    fs.renameSync(tmpCert, certPath());
    fs.chmodSync(keyPath(), 0o600);
    fs.chmodSync(certPath(), 0o644);

    return { cert, key };
  } catch (err) {
    try { fs.unlinkSync(tmpKey); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpCert); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Ensure TLS certs exist. Generate on first run.
 */
export function ensureBridgeTls(): BridgeTls {
  fs.mkdirSync(bridgeDir(), { recursive: true });

  const cp = certPath();
  const kp = keyPath();

  if (fs.existsSync(cp) && fs.existsSync(kp)) {
    return {
      cert: fs.readFileSync(cp, "utf-8"),
      key: fs.readFileSync(kp, "utf-8"),
    };
  }

  log("Generating self-signed TLS certificate for bridge...");
  const tls = generateCert();
  log("TLS certificate generated");
  return tls;
}
