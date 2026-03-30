/**
 * Zero-dependency JWT module using node:crypto.
 * HMAC-SHA256 signing, base64url encoding, timing-safe verification.
 */

import * as crypto from "node:crypto";

export interface JwtClaims {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  kind?: "bootstrap" | "access";
  sid?: string;
}

function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  return buf.toString("base64url");
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

/** Generate a 32-byte random secret for HMAC-SHA256 signing. */
export function generateSecret(): Buffer {
  return crypto.randomBytes(32);
}

/** Parse a duration string like "1h", "24h", "7d", "never" into seconds. Returns 0 for "never". */
export function parseDuration(str: string): number {
  if (str === "never") return 0;
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${str}`);
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default: throw new Error(`Invalid duration unit: ${match[2]}`);
  }
}

/** Create a JWT signed with HMAC-SHA256. */
export function createJwt(
  secret: Buffer | string,
  options?: { expireSeconds?: number; extraClaims?: Partial<Omit<JwtClaims, "sub" | "iat" | "exp" | "jti">> },
): { token: string; claims: JwtClaims } {
  const secretBuf = typeof secret === "string" ? Buffer.from(secret, "hex") : secret;
  const now = Math.floor(Date.now() / 1000);
  const expireSeconds = options?.expireSeconds ?? 0;

  const claims: JwtClaims = {
    sub: "openvide-daemon",
    iat: now,
    exp: expireSeconds > 0 ? now + expireSeconds : 0,
    jti: crypto.randomUUID(),
    ...(options?.extraClaims ?? {}),
  };

  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64urlEncode(JSON.stringify(claims));
  const sigInput = `${header}.${payload}`;

  const signature = crypto
    .createHmac("sha256", secretBuf)
    .update(sigInput)
    .digest();

  const token = `${sigInput}.${base64urlEncode(signature)}`;
  return { token, claims };
}

/** Verify a JWT. Returns claims on success, null on failure. */
export function verifyJwt(
  secret: Buffer | string,
  token: string,
  revokedJtis?: Set<string> | string[],
): JwtClaims | null {
  const secretBuf = typeof secret === "string" ? Buffer.from(secret, "hex") : secret;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;

  // Verify signature with timing-safe comparison
  const sigInput = `${header}.${payload}`;
  const expectedSig = crypto
    .createHmac("sha256", secretBuf)
    .update(sigInput)
    .digest();

  const actualSig = base64urlDecode(sig);
  if (expectedSig.length !== actualSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

  // Parse claims
  let claims: JwtClaims;
  try {
    claims = JSON.parse(base64urlDecode(payload).toString("utf-8")) as JwtClaims;
  } catch {
    return null;
  }

  // Check expiry (exp=0 means no expiry)
  if (claims.exp > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now > claims.exp) return null;
  }

  // Check revocation
  if (revokedJtis) {
    const revoked = revokedJtis instanceof Set ? revokedJtis : new Set(revokedJtis);
    if (revoked.has(claims.jti)) return null;
  }

  return claims;
}
