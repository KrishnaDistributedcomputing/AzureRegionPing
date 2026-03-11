import * as signalR from '@microsoft/signalr';
import { usePingStore, LatencyStats } from '../store/pingStore';

let connection: signalR.HubConnection | null = null;

export async function connectSignalR(sessionId: string): Promise<void> {
  const store = usePingStore.getState();

  connection = new signalR.HubConnectionBuilder()
    .withUrl('/api')
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build();

  // Arc launched — start the animation
  connection.on('ping-arc-launched', (msg: { source: string; target: string; estimatedMs: number }) => {
    const regions = store.regions;
    const sourceRegion = regions.find((r) => r.id === msg.source);
    const targetRegion = regions.find((r) => r.id === msg.target);

    if (sourceRegion && targetRegion) {
      usePingStore.getState().addArc({
        startLat: sourceRegion.lat,
        startLng: sourceRegion.lng,
        endLat: targetRegion.lat,
        endLng: targetRegion.lng,
        color: '#38bdf8', // accent blue while in flight
        source: msg.source,
        target: msg.target,
        animating: true,
      });
    }
  });

  // Result arrived — land the arc, add to leaderboard
  connection.on('ping-result', (msg: {
    source: string;
    target: string;
    latency: LatencyStats;
    status: 'ok' | 'timeout' | 'error';
    rank: number;
    timestamp: string;
  }) => {
    const color = latencyToColor(msg.latency.avg);

    usePingStore.getState().landArc(msg.source, msg.target, msg.latency.avg, color);
    usePingStore.getState().addResult({
      source: msg.source,
      target: msg.target,
      latency: msg.latency,
      status: msg.status,
      rank: msg.rank,
      timestamp: msg.timestamp,
    });
  });

  // All done
  connection.on('ping-complete', (msg: {
    totalDurationMs: number;
    summary: {
      fastestPair: { source: string; target: string; avgMs: number };
      slowestPair: { source: string; target: string; avgMs: number };
      globalAvgMs: number;
      regionsOk: number;
      regionsFailed: number;
    };
  }) => {
    usePingStore.getState().completePing(msg.summary);
  });

  // Error
  connection.on('ping-error', (msg: { source: string; target: string; error: string }) => {
    console.error(`Ping error: ${msg.source} → ${msg.target}: ${msg.error}`);
  });

  await connection.start();
  console.log(`SignalR connected for session ${sessionId}`);
}

export async function disconnectSignalR(): Promise<void> {
  if (connection) {
    await connection.stop();
    connection = null;
  }
}

function latencyToColor(ms: number): string {
  if (ms < 50) return '#22c55e';
  if (ms < 150) return '#eab308';
  if (ms < 250) return '#f97316';
  return '#ef4444';
}
