const API_BASE = '/api';

export interface RegionResponse {
  regions: {
    id: string;
    displayName: string;
    lat: number;
    lng: number;
    agentUrl: string;
    status: string;
  }[];
  count: number;
}

export interface PingStartResponse {
  sessionId: string;
  orchestrationId: string;
  statusUrl: string;
  estimatedDurationMs: number;
}

export async function fetchRegions(): Promise<RegionResponse> {
  const res = await fetch(`${API_BASE}/regions`);
  if (!res.ok) throw new Error(`Failed to fetch regions: ${res.status}`);
  return res.json();
}

export async function startPingTest(params: {
  mode: 'single' | 'mesh';
  sourceRegion?: string;
  samples?: number;
}): Promise<PingStartResponse> {
  const res = await fetch(`${API_BASE}/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `Failed to start ping: ${res.status}`);
  }
  return res.json();
}

export async function fetchSessionResults(sessionId: string) {
  const res = await fetch(`${API_BASE}/results/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch results: ${res.status}`);
  return res.json();
}
