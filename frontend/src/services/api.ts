/// <reference types="vite/client" />
const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  status: string;
  durationMs: number;
  results: {
    source: string;
    target: string;
    latency: { min: number; avg: number; max: number; p50: number; p95: number; jitter: number; stddev: number; samples: number[] } | null;
    status: string;
    error?: string;
    timestamp: string;
  }[];
  summary: {
    regionsOk: number;
    regionsFailed: number;
    fastestPair: { source: string; target: string; avgMs: number } | null;
    slowestPair: { source: string; target: string; avgMs: number } | null;
    globalAvgMs: number;
  };
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
