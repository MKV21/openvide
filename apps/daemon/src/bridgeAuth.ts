import * as crypto from "node:crypto";
import type { BridgeClientSession, BridgeConfig } from "./types.js";
import type { JwtClaims } from "./jwt.js";
import { createJwt, verifyJwt } from "./jwt.js";
import { newId, nowISO } from "./utils.js";

export const BRIDGE_ACCESS_TOKEN_SECONDS = 15 * 60;
export const BRIDGE_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
const ACCESS_REFRESH_SKEW_MS = 60_000;

export interface BridgeAuthBundle {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface BridgeAuthMeta {
  ip?: string;
  userAgent?: string;
}

type AuthenticatedBridgeClaims =
  | { kind: "legacy" | "bootstrap"; claims: JwtClaims }
  | { kind: "access"; claims: JwtClaims; session: BridgeClientSession };

function nowMs(): number {
  return Date.now();
}

function isoFromEpochSeconds(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

function isExpired(iso: string): boolean {
  return Date.parse(iso) <= nowMs();
}

function getClientSessions(config: BridgeConfig): Record<string, BridgeClientSession> {
  if (!config.clientSessions) {
    config.clientSessions = {};
  }
  return config.clientSessions;
}

function hashSecret(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function encodeRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return null;
  return {
    sessionId: token.slice(0, dot),
    secret: token.slice(dot + 1),
  };
}

function nextRefreshSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function buildAccessToken(config: BridgeConfig, sessionId: string): { token: string; expiresAt: string } {
  const { token, claims } = createJwt(config.secretKey, {
    expireSeconds: BRIDGE_ACCESS_TOKEN_SECONDS,
    extraClaims: {
      kind: "access",
      sid: sessionId,
    },
  });
  return {
    token,
    expiresAt: isoFromEpochSeconds(claims.exp),
  };
}

function rotateRefreshSecret(session: BridgeClientSession): { token: string; expiresAt: string } {
  const secret = nextRefreshSecret();
  session.refreshTokenHash = hashSecret(secret).toString("hex");
  session.refreshExpiresAt = new Date(nowMs() + (BRIDGE_REFRESH_TOKEN_SECONDS * 1000)).toISOString();
  return {
    token: encodeRefreshToken(session.id, secret),
    expiresAt: session.refreshExpiresAt,
  };
}

export function accessTokenNeedsRefresh(expiresAt?: string | null): boolean {
  if (!expiresAt) return true;
  const epoch = Date.parse(expiresAt);
  if (!Number.isFinite(epoch)) return true;
  return epoch <= nowMs() + ACCESS_REFRESH_SKEW_MS;
}

export function purgeExpiredBridgeClientSessions(config: BridgeConfig): boolean {
  const sessions = getClientSessions(config);
  let changed = false;
  for (const [sessionId, session] of Object.entries(sessions)) {
    if (!session.refreshExpiresAt || isExpired(session.refreshExpiresAt)) {
      delete sessions[sessionId];
      changed = true;
    }
  }
  return changed;
}

export function createBridgeClientSession(
  config: BridgeConfig,
  meta?: BridgeAuthMeta,
): BridgeAuthBundle {
  purgeExpiredBridgeClientSessions(config);
  const sessionId = newId("bcs");
  const now = nowISO();
  const session: BridgeClientSession = {
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    refreshExpiresAt: now,
    refreshTokenHash: "",
    userAgent: meta?.userAgent,
    lastSeenAt: now,
    lastIp: meta?.ip,
  };
  const refresh = rotateRefreshSecret(session);
  getClientSessions(config)[sessionId] = session;
  const access = buildAccessToken(config, sessionId);
  return {
    sessionId,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export function refreshBridgeClientSession(
  config: BridgeConfig,
  refreshToken: string,
  meta?: BridgeAuthMeta,
): BridgeAuthBundle | null {
  purgeExpiredBridgeClientSessions(config);
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return null;
  const session = getClientSessions(config)[parsed.sessionId];
  if (!session) return null;
  if (!session.refreshExpiresAt || isExpired(session.refreshExpiresAt)) {
    delete getClientSessions(config)[parsed.sessionId];
    return null;
  }

  const expected = Buffer.from(session.refreshTokenHash, "hex");
  const actual = hashSecret(parsed.secret);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  session.updatedAt = nowISO();
  session.lastSeenAt = session.updatedAt;
  if (meta?.ip) session.lastIp = meta.ip;
  if (meta?.userAgent) session.userAgent = meta.userAgent;

  const refresh = rotateRefreshSecret(session);
  const access = buildAccessToken(config, session.id);
  return {
    sessionId: session.id,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

export function revokeBridgeClientSession(config: BridgeConfig, sessionId: string): boolean {
  const sessions = getClientSessions(config);
  if (!sessions[sessionId]) return false;
  delete sessions[sessionId];
  return true;
}

export function authenticateBridgeToken(
  config: BridgeConfig,
  token: string,
): AuthenticatedBridgeClaims | null {
  const claims = verifyJwt(config.secretKey, token, config.revokedTokens);
  if (!claims) return null;

  if (claims.kind === "access" && typeof claims.sid === "string" && claims.sid) {
    const session = getClientSessions(config)[claims.sid];
    if (!session) return null;
    if (!session.refreshExpiresAt || isExpired(session.refreshExpiresAt)) {
      delete getClientSessions(config)[claims.sid];
      return null;
    }
    return { kind: "access", claims, session };
  }

  if (claims.kind === "bootstrap") {
    return { kind: "bootstrap", claims };
  }

  return { kind: "legacy", claims };
}
