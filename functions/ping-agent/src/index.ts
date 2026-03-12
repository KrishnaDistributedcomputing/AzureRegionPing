import express from 'express';
import { measureLatency } from './ping';
import { validateApiKey } from './auth';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);
const REGION_ID = process.env.REGION_ID || 'unknown';

// ─── Health endpoint (ping target) ─────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ region: REGION_ID, status: 'healthy', timestamp: new Date().toISOString() });
});

app.head('/api/health', (_req, res) => {
  res.sendStatus(200);
});

// ─── Ping endpoint (called by orchestrator) ────────────────────────
app.post('/api/ping', async (req, res) => {
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
  }

  const { targets, samples = 5, sessionId, correlationId } = req.body;

  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: { code: 'MISSING_TARGETS', message: 'targets array is required' } });
  }

  const sampleCount = Math.min(Math.max(samples, 1), 20);

  const results = await Promise.all(
    targets.map(async (target: { regionId: string; url: string }) => {
      try {
        const stats = await measureLatency(target.url, sampleCount);
        return {
          source: REGION_ID,
          target: target.regionId,
          latency: stats,
          status: 'ok' as const,
          timestamp: new Date().toISOString(),
          correlationId,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`Failed to ping ${target.regionId}: ${message}`);
        return {
          source: REGION_ID,
          target: target.regionId,
          latency: null,
          status: 'error' as const,
          error: message,
          timestamp: new Date().toISOString(),
          correlationId,
        };
      }
    })
  );

  res.json({
    source: REGION_ID,
    sessionId,
    results,
    completedAt: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Ping agent [${REGION_ID}] listening on port ${PORT}`);
});
