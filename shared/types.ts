/** Shared type definitions for AzureRegionPing */

export interface AzureRegion {
  id: string;
  displayName: string;
  geography: string;
  location: string;
  lat: number;
  lng: number;
  agentUrl: string;
  enabled: boolean;
}

export interface LatencyStats {
  min: number;
  avg: number;
  max: number;
  p50: number;
  p95: number;
  jitter: number;
  stddev: number;
  samples: number[];
}

export interface PingResult {
  source: string;
  target: string;
  sourceCoords: { lat: number; lng: number };
  targetCoords: { lat: number; lng: number };
  latency: LatencyStats;
  status: 'ok' | 'timeout' | 'error';
  timestamp: string;
  correlationId: string;
}

export interface PingSession {
  id: string;
  mode: 'single' | 'mesh';
  sourceRegion?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  samples: number;
  protocol: 'http' | 'tcp';
  results: PingResult[];
  summary?: PingSessionSummary;
}

export interface PingSessionSummary {
  regionsTotal: number;
  regionsOk: number;
  regionsFailed: number;
  fastestPair: { source: string; target: string; avgMs: number };
  slowestPair: { source: string; target: string; avgMs: number };
  globalAvgMs: number;
}

// SignalR message types
export type SignalRMessageType =
  | 'ping-started'
  | 'ping-arc-launched'
  | 'ping-result'
  | 'ping-complete'
  | 'ping-error';

export interface SignalRMessage {
  type: SignalRMessageType;
  sessionId: string;
  timestamp: string;
}

export interface PingStartedMessage extends SignalRMessage {
  type: 'ping-started';
  source: string;
  targets: string[];
}

export interface PingArcLaunchedMessage extends SignalRMessage {
  type: 'ping-arc-launched';
  source: string;
  target: string;
  estimatedMs: number;
}

export interface PingResultMessage extends SignalRMessage {
  type: 'ping-result';
  source: string;
  target: string;
  latency: LatencyStats;
  status: 'ok' | 'timeout' | 'error';
  rank: number;
}

export interface PingCompleteMessage extends SignalRMessage {
  type: 'ping-complete';
  totalDurationMs: number;
  summary: PingSessionSummary;
  shareUrl: string;
}

export interface PingErrorMessage extends SignalRMessage {
  type: 'ping-error';
  source: string;
  target: string;
  error: string;
  message: string;
}

// API request/response types
export interface PingRequest {
  mode: 'single' | 'mesh';
  sourceRegion?: string;
  samples?: number;
  protocol?: 'http' | 'tcp';
}

export interface PingResponse {
  sessionId: string;
  orchestrationId: string;
  statusUrl: string;
  signalRNegotiateUrl: string;
  estimatedDurationMs: number;
}

// Latency color thresholds
export const LATENCY_THRESHOLDS = {
  fast: 50,       // < 50ms  → green
  medium: 150,    // < 150ms → yellow
  slow: 250,      // < 250ms → orange
                   // > 250ms → red
} as const;
