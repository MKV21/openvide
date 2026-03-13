/**
 * Fetch wrapper for the HTTP bridge API.
 */

let bridgeUrl = 'http://localhost:7842';

export function setBridgeUrl(url: string): void {
  bridgeUrl = url.replace(/\/$/, '');
  console.log('[daemon-client] bridge URL:', bridgeUrl);
}

export interface RpcResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function rpc(cmd: string, params?: Record<string, unknown>): Promise<RpcResponse> {
  const res = await fetch(`${bridgeUrl}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd, ...params }),
  });
  return res.json() as Promise<RpcResponse>;
}

export function getStreamUrl(sessionId: string): string {
  return `${bridgeUrl}/api/sessions/${sessionId}/stream`;
}

export async function health(): Promise<boolean> {
  try {
    const res = await rpc('health');
    return res.ok === true;
  } catch {
    return false;
  }
}
