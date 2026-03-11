import { app, HttpRequest, HttpResponseInit } from '@azure/functions';

/**
 * GET /api/health
 * Health check endpoint. Other agents (or the orchestrator) ping this to measure latency.
 * Returns immediately with minimal payload — the speed of this response IS the measurement.
 */
app.http('health', {
  methods: ['GET', 'HEAD'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async (_request: HttpRequest): Promise<HttpResponseInit> => {
    const regionId = process.env.REGION_ID || 'unknown';
    return {
      status: 200,
      jsonBody: {
        region: regionId,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    };
  },
});
