import * as df from 'durable-functions';
import { InvocationContext } from '@azure/functions';
import { getRegions, RegionConfig } from '../regions';

interface AgentPingInput {
  sessionId: string;
  sourceRegion: string;
  sourceAgentUrl: string;
  targets: { regionId: string; url: string }[];
  samples: number;
  correlationId: string;
  apiKey: string;
}

/**
 * Activity: Get enabled regions list
 */
df.app.activity('getEnabledRegions', {
  handler: async (_input: unknown, _context: InvocationContext): Promise<RegionConfig[]> => {
    return getRegions().filter((r) => r.enabled);
  },
});

/**
 * Activity: Call a ping agent to measure latency to targets.
 * Makes an HTTP POST to the agent's /api/ping endpoint.
 */
df.app.activity('callPingAgent', {
  handler: async (input: AgentPingInput, context: InvocationContext) => {
    const url = `${input.sourceAgentUrl.replace(/\/$/, '')}/api/ping`;

    context.log(`Calling ping agent at ${url} for session ${input.sessionId}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': input.apiKey,
        },
        body: JSON.stringify({
          targets: input.targets,
          samples: input.samples,
          sessionId: input.sessionId,
          correlationId: input.correlationId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Agent ${input.sourceRegion} returned ${response.status}`);
      }

      return await response.json();
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : 'Unknown error';
      context.error(`Failed to call agent ${input.sourceRegion}: ${message}`);

      // Return error results for all targets so we don't lose them
      return {
        source: input.sourceRegion,
        sessionId: input.sessionId,
        results: input.targets.map((t) => ({
          source: input.sourceRegion,
          target: t.regionId,
          latency: null,
          status: 'error' as const,
          error: message,
          timestamp: new Date().toISOString(),
          correlationId: input.correlationId,
        })),
      };
    }
  },
});

/**
 * Activity: Send message via Azure SignalR Service
 */
df.app.activity('sendSignalR', {
  handler: async (message: Record<string, unknown>, context: InvocationContext) => {
    // In production, use the Azure SignalR output binding.
    // For now, log the message — the binding will be wired in host.json.
    context.log(`[SignalR] ${message.type}: ${JSON.stringify(message)}`);

    // TODO: Wire up SignalR output binding or use the REST API:
    // POST https://<signalr>.service.signalr.net/api/v1/hubs/ping/send
    // This will be replaced with proper binding once infra is deployed.

    return { sent: true };
  },
});

/**
 * Activity: Save results to Cosmos DB
 */
df.app.activity('saveResults', {
  handler: async (input: Record<string, unknown>, context: InvocationContext) => {
    // TODO: Wire up Cosmos DB output binding
    context.log(`[CosmosDB] Saving session ${input.sessionId} with ${(input.results as unknown[]).length} results`);

    // Will be replaced with Cosmos DB SDK calls:
    // const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
    // await client.database('azureregionping').container('sessions').items.create(...)

    return { saved: true };
  },
});
