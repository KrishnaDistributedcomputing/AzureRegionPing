import * as df from 'durable-functions';
import { OrchestrationContext, OrchestrationHandler, ActivityHandler } from 'durable-functions';
import { getRegions, RegionConfig } from '../regions';

interface OrchestratorInput {
  sessionId: string;
  mode: 'single' | 'mesh';
  sourceRegion?: string;
  samples: number;
  protocol: string;
}

interface AgentPingInput {
  sessionId: string;
  sourceRegion: string;
  sourceAgentUrl: string;
  targets: { regionId: string; url: string }[];
  samples: number;
  correlationId: string;
  apiKey: string;
}

interface PingResultItem {
  source: string;
  target: string;
  latency: {
    min: number; avg: number; max: number;
    p50: number; p95: number; jitter: number; stddev: number;
    samples: number[];
  } | null;
  status: 'ok' | 'timeout' | 'error';
  error?: string;
  timestamp: string;
  correlationId: string;
}

/**
 * Main orchestrator — fan-out/fan-in pattern.
 * For "single" mode: calls one source agent → pings all targets.
 * For "mesh" mode: calls ALL agents → each pings all other agents.
 */
const pingOrchestrator: OrchestrationHandler = function* (context: OrchestrationContext) {
  const input = context.df.getInput() as OrchestratorInput;
  const regions = yield context.df.callActivity('getEnabledRegions');
  const startTime = new Date().toISOString();

  // Notify client: ping started
  yield context.df.callActivity('sendSignalR', {
    type: 'ping-started',
    sessionId: input.sessionId,
    source: input.mode === 'mesh' ? 'all' : input.sourceRegion,
    targets: (regions as RegionConfig[]).map((r: RegionConfig) => r.id),
    timestamp: startTime,
  });

  let allResults: PingResultItem[] = [];

  if (input.mode === 'single') {
    // Single source → all targets
    const sourceRegion = (regions as RegionConfig[]).find((r: RegionConfig) => r.id === input.sourceRegion);
    if (!sourceRegion) {
      throw new Error(`Source region ${input.sourceRegion} not found`);
    }

    const targets = (regions as RegionConfig[])
      .filter((r: RegionConfig) => r.id !== input.sourceRegion)
      .map((r: RegionConfig) => ({ regionId: r.id, url: r.agentUrl }));

    // Notify: arcs launching
    for (const t of targets) {
      yield context.df.callActivity('sendSignalR', {
        type: 'ping-arc-launched',
        sessionId: input.sessionId,
        source: input.sourceRegion,
        target: t.regionId,
        estimatedMs: 100, // rough estimate
      });
    }

    const agentResult: { results: PingResultItem[] } = yield context.df.callActivity('callPingAgent', {
      sessionId: input.sessionId,
      sourceRegion: input.sourceRegion,
      sourceAgentUrl: sourceRegion.agentUrl,
      targets,
      samples: input.samples,
      correlationId: context.df.instanceId,
      apiKey: process.env.AGENT_API_KEY || '',
    } as AgentPingInput);

    allResults = agentResult.results;

  } else {
    // Mesh mode — fan out to ALL regions in parallel
    const parallelTasks = (regions as RegionConfig[]).map((sourceRegion: RegionConfig) => {
      const targets = (regions as RegionConfig[])
        .filter((r: RegionConfig) => r.id !== sourceRegion.id)
        .map((r: RegionConfig) => ({ regionId: r.id, url: r.agentUrl }));

      return context.df.callActivity('callPingAgent', {
        sessionId: input.sessionId,
        sourceRegion: sourceRegion.id,
        sourceAgentUrl: sourceRegion.agentUrl,
        targets,
        samples: input.samples,
        correlationId: `${context.df.instanceId}_${sourceRegion.id}`,
        apiKey: process.env.AGENT_API_KEY || '',
      } as AgentPingInput);
    });

    const results: { results: PingResultItem[] }[] = yield context.df.Task.all(parallelTasks);
    allResults = results.flatMap((r) => r.results);
  }

  // Send individual results via SignalR
  const okResults = allResults.filter((r) => r.status === 'ok' && r.latency);
  const sortedResults = [...okResults].sort((a, b) => (a.latency!.avg) - (b.latency!.avg));

  for (let i = 0; i < sortedResults.length; i++) {
    const r = sortedResults[i];
    yield context.df.callActivity('sendSignalR', {
      type: 'ping-result',
      sessionId: input.sessionId,
      source: r.source,
      target: r.target,
      latency: r.latency,
      status: r.status,
      rank: i + 1,
      timestamp: r.timestamp,
    });
  }

  // Send errors
  for (const r of allResults.filter((r) => r.status !== 'ok')) {
    yield context.df.callActivity('sendSignalR', {
      type: 'ping-error',
      sessionId: input.sessionId,
      source: r.source,
      target: r.target,
      error: r.status.toUpperCase(),
      message: r.error || 'Unknown error',
    });
  }

  // Compute summary
  const fastest = sortedResults[0];
  const slowest = sortedResults[sortedResults.length - 1];
  const globalAvg = okResults.length > 0
    ? Math.round(okResults.reduce((sum, r) => sum + r.latency!.avg, 0) / okResults.length * 100) / 100
    : 0;

  const summary = {
    regionsTotal: allResults.length,
    regionsOk: okResults.length,
    regionsFailed: allResults.length - okResults.length,
    fastestPair: fastest ? { source: fastest.source, target: fastest.target, avgMs: fastest.latency!.avg } : null,
    slowestPair: slowest ? { source: slowest.source, target: slowest.target, avgMs: slowest.latency!.avg } : null,
    globalAvgMs: globalAvg,
  };

  // Save to Cosmos DB
  yield context.df.callActivity('saveResults', {
    sessionId: input.sessionId,
    mode: input.mode,
    sourceRegion: input.sourceRegion,
    startedAt: startTime,
    results: allResults,
    summary,
  });

  // Send completion signal
  yield context.df.callActivity('sendSignalR', {
    type: 'ping-complete',
    sessionId: input.sessionId,
    totalDurationMs: Date.now() - new Date(startTime).getTime(),
    summary,
    shareUrl: `/r/${input.sessionId}`,
  });

  return { sessionId: input.sessionId, summary };
};

df.app.orchestration('pingOrchestrator', pingOrchestrator);
