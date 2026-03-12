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

app.get('/api/regions', (_req, res) => {
  const regions = REGIONS.filter((r) => r.enabled).map((r) => ({
    id: r.id, displayName: r.displayName, lat: r.lat, lng: r.lng,
    agentUrl: getAgentUrl(r.id), status: 'healthy',
  }));
  res.json({ regions, count: regions.length, lastUpdated: new Date().toISOString() });
});

app.post('/api/ping', async (req, res) => {
  const { mode = 'single', sourceRegion, samples = 5 } = req.body;
  const sessionId = crypto.randomUUID();

  if (mode === 'single' && !sourceRegion) {
    return res.status(400).json({ error: { code: 'MISSING_SOURCE', message: 'sourceRegion required' } });
  }
  if (mode === 'single' && !getRegionById(sourceRegion)) {
    return res.status(400).json({ error: { code: 'INVALID_REGION', message: `Region '${sourceRegion}' not found` } });
  }

  const enabledRegions = REGIONS.filter((r) => r.enabled);
  const sources = mode === 'mesh' ? enabledRegions : enabledRegions.filter((r) => r.id === sourceRegion);
  const startTime = Date.now();

  interface PingResult {
    source: string; target: string;
    latency: { min: number; avg: number; max: number; p50: number; p95: number; jitter: number; stddev: number; samples: number[] } | null;
    status: string; error?: string; timestamp: string;
  }

  const agentResults = await Promise.all(
    sources.map(async (src) => {
      const targets = enabledRegions.filter((r) => r.id !== src.id).map((r) => ({ regionId: r.id, url: getAgentUrl(r.id) }));
      const agentUrl = getAgentUrl(src.id);
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30_000);
        const resp = await fetch(`${agentUrl}/api/ping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': AGENT_API_KEY },
          body: JSON.stringify({ targets, samples, sessionId, correlationId: `${sessionId}_${src.id}` }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (!resp.ok) throw new Error(`Agent ${src.id} returned ${resp.status}`);
        return ((await resp.json()) as { results: PingResult[] }).results;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        console.error(`Agent ${src.id} failed: ${msg}`);
        return targets.map((t): PingResult => ({ source: src.id, target: t.regionId, latency: null, status: 'error', error: msg, timestamp: new Date().toISOString() }));
      }
    })
  );

  const allResults = agentResults.flat();
  const okResults = allResults.filter((r) => r.status === 'ok' && r.latency);
  const sorted = [...okResults].sort((a, b) => a.latency!.avg - b.latency!.avg);
  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];
  const globalAvg = okResults.length > 0 ? Math.round(okResults.reduce((s, r) => s + r.latency!.avg, 0) / okResults.length * 100) / 100 : 0;

  console.log(`Session ${sessionId}: ${okResults.length}/${allResults.length} ok, avg ${globalAvg}ms in ${Date.now() - startTime}ms`);

  res.json({
    sessionId, status: 'completed', durationMs: Date.now() - startTime,
    results: allResults,
    summary: {
      regionsOk: okResults.length, regionsFailed: allResults.length - okResults.length,
      fastestPair: fastest ? { source: fastest.source, target: fastest.target, avgMs: fastest.latency!.avg } : null,
      slowestPair: slowest ? { source: slowest.source, target: slowest.target, avgMs: slowest.latency!.avg } : null,
      globalAvgMs: globalAvg,
    },
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ service: 'orchestrator', status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`Orchestrator listening on port ${PORT}`));
