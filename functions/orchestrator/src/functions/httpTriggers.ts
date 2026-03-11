import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { getRegions, getRegionById } from '../regions';

/**
 * GET /api/regions
 * Returns all available Azure regions with their agent status.
 */
app.http('getRegions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'regions',
  handler: async (_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const regions = getRegions().filter((r) => r.enabled);
    return {
      status: 200,
      jsonBody: {
        regions: regions.map((r) => ({
          id: r.id,
          displayName: r.displayName,
          lat: r.lat,
          lng: r.lng,
          agentUrl: r.agentUrl,
          status: 'healthy', // TODO: check actual health
        })),
        count: regions.length,
        lastUpdated: new Date().toISOString(),
      },
    };
  },
});

/**
 * POST /api/ping
 * Starts a ping test. Kicks off a Durable Functions orchestration.
 */
app.http('startPing', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ping',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    let body: { mode?: string; sourceRegion?: string; samples?: number; protocol?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return { status: 400, jsonBody: { error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } } };
    }

    const mode = body.mode === 'mesh' ? 'mesh' : 'single';
    const samples = Math.min(Math.max(body.samples || 5, 1), 20);
    const protocol = body.protocol === 'tcp' ? 'tcp' : 'http';

    if (mode === 'single') {
      if (!body.sourceRegion) {
        return { status: 400, jsonBody: { error: { code: 'MISSING_SOURCE', message: 'sourceRegion is required for single mode' } } };
      }
      const region = getRegionById(body.sourceRegion);
      if (!region) {
        return { status: 400, jsonBody: { error: { code: 'INVALID_REGION', message: `Region '${body.sourceRegion}' is not valid` } } };
      }
    }

    const sessionId = crypto.randomUUID();

    // Start the durable orchestration
    const client = df.getClient(context);
    const orchestrationId = await client.startNew('pingOrchestrator', {
      input: { sessionId, mode, sourceRegion: body.sourceRegion, samples, protocol },
    });

    context.log(`Started orchestration ${orchestrationId} for session ${sessionId}`);

    return {
      status: 202,
      jsonBody: {
        sessionId,
        orchestrationId,
        statusUrl: `/api/ping/${sessionId}/status`,
        signalRNegotiateUrl: '/api/negotiate',
        estimatedDurationMs: mode === 'mesh' ? 25000 : 10000,
        message: 'Ping test initiated. Connect to SignalR for real-time results.',
      },
    };
  },
  extraInputs: [df.input.durableClient()],
});

/**
 * SignalR negotiate endpoint
 */
app.http('negotiate', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  route: 'negotiate',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    // In production, this is handled by the Azure SignalR binding.
    // For local dev, return a placeholder.
    return {
      status: 200,
      jsonBody: {
        url: process.env.AzureSignalRConnectionString ? undefined : 'ws://localhost:7071/ws',
        accessToken: '',
      },
    };
  },
});
