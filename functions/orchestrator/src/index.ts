import express from 'express';
import { REGIONS, getRegionById } from './regions';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);
const AGENT_API_KEY = process.env.AGENT_API_KEY || '';
const AGENT_URL_PATTERN = process.env.AGENT_URL_PATTERN || 'http://localhost:3001';

function getAgentUrl(regionId: string): string {
  return AGENT_URL_PATTERN.replace('{region}', regionId);
}

// ─── GET /api/regions ──────────────────────────────────────────────
app.get('/api/regions', (_req, res) => {
  const regions = REGIONS.filter((r) => r.enabled).map((r) => ({
    id: r.id, displayName: r.displayName, lat: r.lat, lng: r.lng,
    agentUrl: getAgentUrl(r.id), status: 'healthy',
  }));
  res.json({ regions, count: regions.length, lastUpdated: new Date().toISOString() });
});

// ─── POST /api/ping — fan-out pings ────────────────────────────────
app.post('/api/ping', async (req, res) => {
  const { mode = 'single', sourceRegion, samples = 5 } = req.body;
  const sessionId = crypto.randomUUID();

  if (mode === 'single' && !sourceRegion) {
    return res.status(400).json({ error: { code: 'MISSING_SOURCE', message: 'sourceRegion required for single mode' } });
  }
  if (mode === 'single' && !getRegionById(sourceRegion)) {
    return res.status(400).json({ error: { code: 'INVALID_REGION', message: `Region '${sourceRegion}' not found` } });
  }

  const enabledRegions = REGIONS.filter((r) => r.enabled);
  const sources = mode === 'mesh' ? enabledRegions : enabledRegions.filter((r) => r.id === sourceRegion);

  // Fire-and-forget: run pings in background, respond immediately
  const resultPromise = runPingSession(sessionId, sources, enabledRegions, samples);

  // Store promise so /api/ping/:id/status can check it
  sessions.set(sessionId, { promise: resultPromise, status: 'running', results: [], startedAt: new Date() });

  res.status(202).json({
    sessionId,
    statusUrl: `/api/ping/${sessionId}/status`,
    estimatedDurationMs: mode === 'mesh' ? 25000 : 10000,
    message: 'Ping test initiated. Poll status endpoint for results.',
  });
});

// ─── GET /api/ping/:id/status ──────────────────────────────────────
app.get('/api/ping/:id/status', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });

  res.json({
    sessionId: req.params.id,
    status: session.status,
    progress: { total: session.totalTargets || 0, completed: session.results.length, failed: session.failedCount || 0 },
    results: session.results,
    summary: session.summary || null,
  });
});

// ─── GET /api/health ───────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ service: 'orchestrator', status: 'healthy', timestamp: new Date().toISOString() });
});

// ─── Session storage (in-memory for v1) ────────────────────────────
interface Session {
  promise: Promise<void>;
  status: 'running' | 'completed' | 'failed';
  results: PingResult[];
  startedAt: Date;
  totalTargets?: number;
  failedCount?: number;
  summary?: Record<string, unknown>;
}

interface PingResult {
  source: string;
  target: string;
  latency: { min: number; avg: number; max: number; p50: number; p95: number; jitter: number; stddev: number; samples: number[] } | null;
  status: 'ok' | 'timeout' | 'error';
  error?: string;
  timestamp: string;
}

const sessions = new Map<string, Session>();

// ─── Ping execution logic ──────────────────────────────────────────
async function runPingSession(
  sessionId: string,
  sources: typeof REGIONS,
  allRegions: typeof REGIONS,
  samples: number,
) {
  const session = sessions.get(sessionId)!;
  const allResults: PingResult[] = [];

  // Count total targets
  let totalTargets = 0;
  for (const src of sources) {
    totalTargets += allRegions.filter((r) => r.id !== src.id).length;
  }
  session.totalTargets = totalTargets;

  try {
    // Fan out: call each source agent in parallel
    const agentResults = await Promise.all(
      sources.map(async (src) => {
        const targets = allRegions.filter((r) => r.id !== src.id).map((r) => ({
          regionId: r.id,
          url: getAgentUrl(r.id),
        }));

        const agentUrl = getAgentUrl(src.id);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30_000);

          const resp = await fetch(`${agentUrl}/api/ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': AGENT_API_KEY },
            body: JSON.stringify({ targets, samples, sessionId, correlationId: `${sessionId}_${src.id}` }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!resp.ok) throw new Error(`Agent ${src.id} returned ${resp.status}`);
          const data = await resp.json() as { results: PingResult[] };
          return data.results;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`Agent ${src.id} failed: ${msg}`);
          return targets.map((t) => ({
            source: src.id, target: t.regionId, latency: null,
            status: 'error' as const, error: msg, timestamp: new Date().toISOString(),
          }));
        }
      })
    );

    for (const results of agentResults) {
      for (const r of results) {
        allResults.push(r);
        session.results = [...allResults];
      }
    }

    // Compute summary
    const okResults = allResults.filter((r) => r.status === 'ok' && r.latency);
    const sorted = [...okResults].sort((a, b) => a.latency!.avg - b.latency!.avg);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    const globalAvg = okResults.length > 0
      ? Math.round(okResults.reduce((sum, r) => sum + r.latency!.avg, 0) / okResults.length * 100) / 100
      : 0;

    session.summary = {
      regionsOk: okResults.length,
      regionsFailed: allResults.length - okResults.length,
      fastestPair: fastest ? { source: fastest.source, target: fastest.target, avgMs: fastest.latency!.avg } : null,
      slowestPair: slowest ? { source: slowest.source, target: slowest.target, avgMs: slowest.latency!.avg } : null,
      globalAvgMs: globalAvg,
      durationMs: Date.now() - session.startedAt.getTime(),
    };
    session.failedCount = allResults.length - okResults.length;
    session.status = 'completed';
    console.log(`Session ${sessionId} completed: ${okResults.length} ok, ${session.failedCount} failed, avg ${globalAvg}ms`);
  } catch (err) {
    session.status = 'failed';
    console.error(`Session ${sessionId} failed:`, err);
  }
}

app.listen(PORT, () => {
  console.log(`Orchestrator listening on port ${PORT}`);
});
