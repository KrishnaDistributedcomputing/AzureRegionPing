import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { measureLatency } from '../ping';
import { validateApiKey } from '../auth';

interface PingTargetRequest {
  targets: { regionId: string; url: string }[];
  samples: number;
  sessionId: string;
  correlationId: string;
}

/**
 * POST /api/ping
 * Called by the orchestrator. Pings a list of target agent endpoints
 * and returns latency stats for each.
 */
app.http('ping', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ping',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    if (!validateApiKey(request)) {
      return { status: 401, jsonBody: { error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } } };
    }

    const regionId = process.env.REGION_ID || 'unknown';
    context.log(`Ping agent [${regionId}] received ping request`);

    let body: PingTargetRequest;
    try {
      body = await request.json() as PingTargetRequest;
    } catch {
      return { status: 400, jsonBody: { error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } } };
    }

    if (!body.targets || !Array.isArray(body.targets) || body.targets.length === 0) {
      return { status: 400, jsonBody: { error: { code: 'MISSING_TARGETS', message: 'targets array is required' } } };
    }

    const samples = Math.min(Math.max(body.samples || 5, 1), 20);

    const results = await Promise.all(
      body.targets.map(async (target) => {
        try {
          const stats = await measureLatency(target.url, samples, context);
          return {
            source: regionId,
            target: target.regionId,
            latency: stats,
            status: 'ok' as const,
            timestamp: new Date().toISOString(),
            correlationId: body.correlationId,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          context.warn(`Failed to ping ${target.regionId}: ${message}`);
          return {
            source: regionId,
            target: target.regionId,
            latency: null,
            status: 'error' as const,
            error: message,
            timestamp: new Date().toISOString(),
            correlationId: body.correlationId,
          };
        }
      })
    );

    // Emit telemetry
    for (const result of results) {
      if (result.status === 'ok' && result.latency) {
        context.log(`[TELEMETRY] PingMeasurement: ${result.source} → ${result.target} avg=${result.latency.avg}ms`);
      }
    }

    return {
      status: 200,
      jsonBody: {
        source: regionId,
        sessionId: body.sessionId,
        results,
        completedAt: new Date().toISOString(),
      },
    };
  },
});
