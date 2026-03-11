import { create } from 'zustand';

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
  latency: LatencyStats;
  status: 'ok' | 'timeout' | 'error';
  rank?: number;
  timestamp: string;
}

export interface RegionInfo {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  status: string;
}

export interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  source: string;
  target: string;
  latencyMs?: number;
  animating: boolean;
}

type PingStatus = 'idle' | 'testing' | 'complete' | 'error';

interface PingState {
  // Config
  sourceRegion: string;
  mode: 'single' | 'mesh';
  
  // State
  status: PingStatus;
  sessionId: string | null;
  regions: RegionInfo[];
  results: PingResult[];
  arcs: ArcData[];
  
  // Summary
  summary: {
    fastestPair?: { source: string; target: string; avgMs: number };
    slowestPair?: { source: string; target: string; avgMs: number };
    globalAvgMs: number;
    regionsOk: number;
    regionsFailed: number;
  } | null;

  // Actions
  setSourceRegion: (region: string) => void;
  setMode: (mode: 'single' | 'mesh') => void;
  setRegions: (regions: RegionInfo[]) => void;
  startPing: (sessionId: string) => void;
  addArc: (arc: ArcData) => void;
  addResult: (result: PingResult) => void;
  landArc: (source: string, target: string, latencyMs: number, color: string) => void;
  completePing: (summary: PingState['summary']) => void;
  setError: () => void;
  reset: () => void;
}

export const usePingStore = create<PingState>((set) => ({
  sourceRegion: 'eastus',
  mode: 'single',
  status: 'idle',
  sessionId: null,
  regions: [],
  results: [],
  arcs: [],
  summary: null,

  setSourceRegion: (region) => set({ sourceRegion: region }),
  setMode: (mode) => set({ mode }),
  setRegions: (regions) => set({ regions }),

  startPing: (sessionId) =>
    set({ status: 'testing', sessionId, results: [], arcs: [], summary: null }),

  addArc: (arc) =>
    set((state) => ({ arcs: [...state.arcs, arc] })),

  addResult: (result) =>
    set((state) => {
      const results = [...state.results, result].sort(
        (a, b) => (a.latency?.avg ?? Infinity) - (b.latency?.avg ?? Infinity)
      );
      return { results };
    }),

  landArc: (source, target, latencyMs, color) =>
    set((state) => ({
      arcs: state.arcs.map((arc) =>
        arc.source === source && arc.target === target
          ? { ...arc, animating: false, latencyMs, color }
          : arc
      ),
    })),

  completePing: (summary) => set({ status: 'complete', summary }),
  setError: () => set({ status: 'error' }),

  reset: () =>
    set({
      status: 'idle',
      sessionId: null,
      results: [],
      arcs: [],
      summary: null,
    }),
}));
