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

export async function measureLatency(targetUrl: string, sampleCount: number): Promise<LatencyStats> {
  const healthUrl = targetUrl.replace(/\/$/, '') + '/api/health';
  const samples: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const start = process.hrtime.bigint();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(healthUrl, { method: 'HEAD', signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } });
      clearTimeout(timeout);
      const end = process.hrtime.bigint();
      samples.push(Math.round(Number(end - start) / 1_000_000 * 100) / 100);
    } catch (err: unknown) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : 'Unknown';
      if (msg.includes('abort')) { samples.push(-1); } else { throw err; }
    }
    if (i < sampleCount - 1) await new Promise((r) => setTimeout(r, 50));
  }

  const valid = samples.filter((s) => s >= 0);
  if (valid.length === 0) throw new Error(`All ${sampleCount} samples timed out`);

  const sorted = [...valid].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = Math.round((valid.reduce((a, b) => a + b, 0) / n) * 100) / 100;
  let jitterSum = 0;
  for (let i = 1; i < valid.length; i++) jitterSum += Math.abs(valid[i] - valid[i - 1]);
  const variance = valid.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / n;

  return {
    min: sorted[0], max: sorted[n - 1], avg,
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.min(Math.floor(n * 0.95), n - 1)],
    jitter: valid.length > 1 ? Math.round((jitterSum / (valid.length - 1)) * 100) / 100 : 0,
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
    samples: sorted,
  };
}
